import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from './channels';
import {
  Agent,
  AgentStatus,
  Command,
  QueueItem,
  QueueStatus,
} from '../../shared/models';
import {
  AgentAddArgs,
  AgentRemoveArgs,
  CommandSendArgs,
  CommandSendResult,
  QueueReorderArgs,
  QueueCancelArgs,
  AgentUpdatedPayload,
  AgentAddedPayload,
  AgentRemovedPayload,
  CommandStartedPayload,
  CommandCompletedPayload,
  QueueUpdatedPayload,
  CliOutputPayload,
  CliStatusPayload,
} from '../../shared/ipc-types';
import { Protocol } from '../cli/protocol';
import { StreamParser, ParsedEvent } from '../cli/stream-parser';
import { CommandProcessor } from '../cli/command-processor';

export class IPCHandlers {
  private agents: Map<string, Agent> = new Map();
  private commandQueue: QueueItem[] = [];
  private mainWindow: BrowserWindow | null = null;
  private cliConnected: boolean = false;
  private cliError: string | undefined;
  private commandProcessor: CommandProcessor;

  constructor(
    private protocol: Protocol,
    private streamParser: StreamParser
  ) {
    this.commandProcessor = new CommandProcessor();
    this.wireCommandProcessor();
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  registerHandlers(): void {
    // Agent handlers
    ipcMain.handle(IPC_CHANNELS.AGENT_LIST, async (): Promise<Agent[]> => {
      return Array.from(this.agents.values());
    });

    ipcMain.handle(
      IPC_CHANNELS.AGENT_ADD,
      async (_event, args: AgentAddArgs): Promise<Agent> => {
        const agent: Agent = {
          id: args.name.toLowerCase().replace(/\s+/g, '-'),
          name: args.name,
          role: args.role,
          emoji: args.emoji,
          status: AgentStatus.Idle,
          output: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        this.agents.set(agent.id, agent);
        this.streamParser.updateAgents(this.agents);
        this.commandProcessor.updateAgents(this.agents);
        this.protocol.addAgent(args.name, args.role, args.emoji);

        this.sendToRenderer(IPC_CHANNELS.AGENT_ADDED, { agent });
        return agent;
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.AGENT_REMOVE,
      async (_event, args: AgentRemoveArgs): Promise<void> => {
        const { agentId } = args;
        if (this.agents.has(agentId)) {
          this.agents.delete(agentId);
          this.streamParser.updateAgents(this.agents);
          this.commandProcessor.updateAgents(this.agents);
          this.protocol.removeAgent(agentId);
          this.sendToRenderer(IPC_CHANNELS.AGENT_REMOVED, { agentId });
        }
      }
    );

    // Command handlers
    ipcMain.handle(
      IPC_CHANNELS.COMMAND_SEND,
      async (_event, args: CommandSendArgs): Promise<CommandSendResult> => {
        const commandId = this.protocol.generateCommandId();

        const command: Command = {
          id: commandId,
          text: args.command,
          targetAgentId: args.targetAgentId,
          createdAt: Date.now(),
        };

        const queueItem: QueueItem = {
          id: commandId,
          command,
          status: QueueStatus.Pending,
          assignedAgentId: args.targetAgentId,
        };

        this.commandQueue.push(queueItem);
        this.sendQueueUpdate();

        // Send to CLI if connected, otherwise process locally
        if (this.cliConnected) {
          this.protocol.sendCommand(args.command, args.targetAgentId);
        } else {
          this.commandProcessor.processItem(queueItem);
        }

        return { commandId };
      }
    );

    // Queue handlers
    ipcMain.handle(IPC_CHANNELS.QUEUE_LIST, async (): Promise<QueueItem[]> => {
      return this.commandQueue;
    });

    ipcMain.handle(
      IPC_CHANNELS.QUEUE_REORDER,
      async (_event, args: QueueReorderArgs): Promise<void> => {
        const { commandId, newPosition } = args;
        const currentIndex = this.commandQueue.findIndex(
          (item) => item.id === commandId
        );

        if (currentIndex !== -1) {
          const [item] = this.commandQueue.splice(currentIndex, 1);
          this.commandQueue.splice(newPosition, 0, item);
          this.sendQueueUpdate();
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.QUEUE_CANCEL,
      async (_event, args: QueueCancelArgs): Promise<void> => {
        const { commandId } = args;
        const item = this.commandQueue.find((item) => item.id === commandId);

        if (item && item.status === QueueStatus.Pending) {
          item.status = QueueStatus.Cancelled;
          if (this.cliConnected) {
            this.protocol.cancelCommand(commandId);
          }
          this.sendQueueUpdate();
        }
      }
    );

    // CLI status handler
    ipcMain.handle(
      IPC_CHANNELS.CLI_STATUS,
      async (): Promise<CliStatusPayload> => {
        return { connected: this.cliConnected, error: this.cliError };
      }
    );
  }

  private wireCommandProcessor(): void {
    this.commandProcessor.on('started', (commandId: string, agentId: string) => {
      const item = this.commandQueue.find((i) => i.id === commandId);
      if (item) {
        item.status = QueueStatus.Running;
        item.assignedAgentId = agentId;
        item.startedAt = Date.now();
        this.sendQueueUpdate();
      }
      this.sendToRenderer(IPC_CHANNELS.COMMAND_STARTED, { commandId, agentId });
    });

    this.commandProcessor.on('completed', (commandId: string, result: string) => {
      const item = this.commandQueue.find((i) => i.id === commandId);
      if (item) {
        item.status = QueueStatus.Done;
        item.completedAt = Date.now();
        item.result = result;
        this.sendQueueUpdate();
      }
      this.sendToRenderer(IPC_CHANNELS.COMMAND_COMPLETED, { commandId, result });
    });

    this.commandProcessor.on('output', (commandId: string, line: string) => {
      // Find the agent assigned to this command and append output
      const item = this.commandQueue.find((i) => i.id === commandId);
      const agentId = item?.assignedAgentId;
      if (agentId) {
        const agent = this.agents.get(agentId);
        if (agent) {
          agent.output.push(line);
          if (agent.output.length > 50) agent.output = agent.output.slice(-50);
          agent.updatedAt = Date.now();
          this.sendToRenderer(IPC_CHANNELS.AGENT_UPDATED, { agent });
        }
      }
      this.sendToRenderer(IPC_CHANNELS.CLI_OUTPUT, { line, timestamp: Date.now() });
    });

    this.commandProcessor.on('agent-status', (agentId: string, status: AgentStatus, task?: string) => {
      const agent = this.agents.get(agentId);
      if (agent) {
        agent.status = status;
        agent.currentTask = task;
        agent.updatedAt = Date.now();
        this.sendToRenderer(IPC_CHANNELS.AGENT_UPDATED, { agent });
      }
    });
  }

  handleParsedEvent(event: ParsedEvent): void {
    switch (event.type) {
      case 'agent':
        this.handleAgentEvent(event);
        break;
      case 'command':
        this.handleCommandEvent(event);
        break;
      case 'raw':
        this.handleRawOutput(event);
        break;
    }
  }

  private handleAgentEvent(event: any): void {
    const agent = this.agents.get(event.agentId);
    if (!agent) return;

    let updated = false;

    if (event.status && agent.status !== event.status) {
      agent.status = event.status;
      updated = true;
    }

    if (event.task && agent.currentTask !== event.task) {
      agent.currentTask = event.task;
      updated = true;
    }

    if (event.output) {
      agent.output.push(event.output);
      if (agent.output.length > 50) {
        agent.output = agent.output.slice(-50);
      }
      updated = true;
    }

    if (updated) {
      agent.updatedAt = Date.now();
      this.sendToRenderer(IPC_CHANNELS.AGENT_UPDATED, { agent });
    }
  }

  private handleCommandEvent(event: any): void {
    if (event.event === 'started' && event.commandId && event.agentId) {
      const queueItem = this.commandQueue.find(
        (item) => item.id === event.commandId
      );
      if (queueItem) {
        queueItem.status = QueueStatus.Running;
        queueItem.assignedAgentId = event.agentId;
        queueItem.startedAt = Date.now();
        this.sendQueueUpdate();
      }

      this.sendToRenderer(IPC_CHANNELS.COMMAND_STARTED, {
        commandId: event.commandId,
        agentId: event.agentId,
      });
    } else if (event.event === 'completed' && event.commandId) {
      const queueItem = this.commandQueue.find(
        (item) => item.id === event.commandId
      );
      if (queueItem) {
        queueItem.status = QueueStatus.Done;
        queueItem.completedAt = Date.now();
        queueItem.result = event.result;
        this.sendQueueUpdate();
      }

      this.sendToRenderer(IPC_CHANNELS.COMMAND_COMPLETED, {
        commandId: event.commandId,
        result: event.result || '',
      });
    }
  }

  private handleRawOutput(event: any): void {
    if (event.agentId) {
      const agent = this.agents.get(event.agentId);
      if (agent) {
        agent.output.push(event.text);
        if (agent.output.length > 50) {
          agent.output = agent.output.slice(-50);
        }
        agent.updatedAt = Date.now();
        this.sendToRenderer(IPC_CHANNELS.AGENT_UPDATED, { agent });
      }
    }

    this.sendToRenderer(IPC_CHANNELS.CLI_OUTPUT, {
      line: event.text,
      timestamp: Date.now(),
    });
  }

  private sendQueueUpdate(): void {
    this.sendToRenderer(IPC_CHANNELS.QUEUE_UPDATED, {
      queue: this.commandQueue,
    });
  }

  private sendToRenderer(channel: string, payload: any): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, payload);
    }
  }

  setCliConnected(connected: boolean, error?: string): void {
    this.cliConnected = connected;
    this.cliError = error;
    this.sendToRenderer(IPC_CHANNELS.CLI_STATUS_CHANGED, {
      connected,
      error,
    } as CliStatusPayload);

    // Flush pending commands when CLI connects
    if (connected) {
      this.flushPendingCommands();
    }
  }

  private flushPendingCommands(): void {
    for (const item of this.commandQueue) {
      if (item.status === QueueStatus.Pending) {
        this.protocol.sendCommand(
          item.command.text,
          item.command.targetAgentId
        );
      }
    }
  }

  // Initialize with sample agents for testing
  initializeSampleAgents(): void {
    const sampleAgents: Agent[] = [
      {
        id: 'cobb',
        name: 'Cobb',
        role: 'Lead / Architect',
        emoji: '🏗️',
        status: AgentStatus.Idle,
        output: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'ariadne',
        name: 'Ariadne',
        role: 'Frontend Dev',
        emoji: '🎨',
        status: AgentStatus.Idle,
        output: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'eames',
        name: 'Eames',
        role: 'Systems Dev',
        emoji: '⚙️',
        status: AgentStatus.Idle,
        output: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    for (const agent of sampleAgents) {
      this.agents.set(agent.id, agent);
    }

    this.streamParser.updateAgents(this.agents);
    this.commandProcessor.updateAgents(this.agents);
  }
}
