import { CopilotProcess } from './copilot-process';

let commandCounter = 0;

export function generateId(): string {
  const timestamp = Date.now();
  const counter = ++commandCounter;
  return `cmd-${timestamp}-${counter}`;
}

export class Protocol {
  constructor(private copilotProcess: CopilotProcess) {}

  generateCommandId(): string {
    return generateId();
  }

  sendCommand(text: string, targetAgentId?: string): void {
    // Format command for CLI
    let message: string;
    if (targetAgentId) {
      message = `@${targetAgentId} ${text}`;
    } else {
      message = text;
    }
    this.copilotProcess.send(message);
  }

  addAgent(name: string, role: string, emoji: string): void {
    const message = `agent:add ${name} ${role} ${emoji}`;
    this.copilotProcess.send(message);
  }

  removeAgent(agentId: string): void {
    const message = `agent:remove ${agentId}`;
    this.copilotProcess.send(message);
  }

  cancelCommand(commandId: string): void {
    const message = `queue:cancel ${commandId}`;
    this.copilotProcess.send(message);
  }
}
