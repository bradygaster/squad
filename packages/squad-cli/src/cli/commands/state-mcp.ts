import { stdout, stderr } from 'node:process';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { resolveSquadState } from '@bradygaster/squad-sdk';
import { ToolRegistry } from '@bradygaster/squad-sdk/tools';

export type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

const SERVER_INFO = {
  name: 'squad-state',
  version: '0.1.0',
};

const MCP_TOOL_ALIASES: Record<string, string> = {
  squad_decide: 'squad_decide',
  squad_state_read: 'squad_state_read',
  squad_state_write: 'squad_state_write',
  squad_state_append: 'squad_state_append',
  squad_state_delete: 'squad_state_delete',
  squad_state_list: 'squad_state_list',
  squad_state_health: 'squad_state_health',
  'memory.classify': 'memory.classify',
  'memory.write': 'memory.write',
  'memory.search': 'memory.search',
  'memory.promote': 'memory.promote',
  'memory.delete': 'memory.delete',
  'memory.audit': 'memory.audit',
};

function parseObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function encodeMessage(message: JsonRpcResponse | Record<string, unknown>): string {
  const body = JSON.stringify(message);
  const length = Buffer.byteLength(body, 'utf8');
  return `Content-Length: ${length}\r\n\r\n${body}`;
}

function writeMessage(message: JsonRpcResponse | Record<string, unknown>): void {
  stdout.write(encodeMessage(message));
}

function success(id: JsonRpcRequest['id'], result: unknown): void {
  writeMessage({ jsonrpc: '2.0', id: id ?? null, result });
}

function failure(id: JsonRpcRequest['id'], code: number, message: string, data?: unknown): void {
  writeMessage({ jsonrpc: '2.0', id: id ?? null, error: { code, message, data } });
}

export function createStateMcpToolRegistry(startDir: string): ToolRegistry {
  const context = resolveSquadState(startDir);
  if (!context) {
    throw new Error(`No .squad directory found from ${startDir}`);
  }
  return new ToolRegistry(context.paths.teamDir, undefined, context.storage);
}

function normalizeToolResult(result: unknown): { content: Array<{ type: 'text'; text: string }>; isError?: boolean } {
  if (typeof result === 'string') {
    return { content: [{ type: 'text', text: result }] };
  }

  const record = parseObject(result);
  const resultType = typeof record['resultType'] === 'string' ? record['resultType'] : undefined;
  const text = typeof record['textResultForLlm'] === 'string'
    ? record['textResultForLlm']
    : JSON.stringify(result);

  return {
    content: [{ type: 'text', text }],
    isError: resultType === 'failure' || resultType === 'denied' || resultType === 'rejected',
  };
}

export function createStateMcpSession(
  startDir = process.cwd(),
  write: (message: JsonRpcResponse | Record<string, unknown>) => void = writeMessage,
): { handleRequest(request: JsonRpcRequest): Promise<void> } {
  const registry = createStateMcpToolRegistry(startDir);
  const runtimeTools = new Map(registry.getTools().map(tool => [tool.name, tool]));
  const tools = Object.entries(MCP_TOOL_ALIASES).map(([mcpName, runtimeName]) => {
    const tool = runtimeTools.get(runtimeName);
    if (!tool) throw new Error(`Missing Squad runtime state tool: ${runtimeName}`);
    return { mcpName, runtimeName, tool };
  });
  const toolMap = new Map(tools.map(entry => [entry.mcpName, entry]));

  async function handleRequest(request: JsonRpcRequest): Promise<void> {
    try {
      switch (request.method) {
        case 'initialize':
          write({ jsonrpc: '2.0', id: request.id ?? null, result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: SERVER_INFO,
          } });
          break;

        case 'notifications/initialized':
          break;

        case 'tools/list':
          write({ jsonrpc: '2.0', id: request.id ?? null, result: {
            tools: tools.map(tool => ({
              name: tool.mcpName,
              description: tool.tool.description,
              inputSchema: tool.tool.parameters,
            })),
          } });
          break;

        case 'tools/call': {
          const params = parseObject(request.params);
          const name = typeof params['name'] === 'string' ? params['name'] : '';
          const entry = toolMap.get(name);
          if (!entry) {
            write({ jsonrpc: '2.0', id: request.id ?? null, error: { code: -32602, message: `Unknown Squad state tool: ${name}` } });
            break;
          }
          const args = parseObject(params['arguments']);
          const result = await entry.tool.handler(args, {
            toolName: entry.runtimeName,
            toolCallId: `${entry.mcpName}-${Date.now()}`,
            arguments: args,
            sessionId: 'mcp',
          });
          write({ jsonrpc: '2.0', id: request.id ?? null, result: normalizeToolResult(result) });
          break;
        }

        default:
          if (request.id !== undefined && request.id !== null) {
            write({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: `Method not found: ${request.method ?? '(missing)'}` } });
          }
          break;
      }
    } catch (error) {
      write({ jsonrpc: '2.0', id: request.id ?? null, error: { code: -32603, message: error instanceof Error ? error.message : String(error) } });
    }
  }

  return { handleRequest };
}

export async function runStateMcp(startDir = process.cwd()): Promise<void> {
  const registry = createStateMcpToolRegistry(startDir);
  const runtimeTools = new Map(registry.getTools().map(tool => [tool.name, tool]));
  const tools = Object.entries(MCP_TOOL_ALIASES).map(([mcpName, runtimeName]) => {
    const tool = runtimeTools.get(runtimeName);
    if (!tool) throw new Error(`Missing Squad runtime state tool: ${runtimeName}`);
    return { mcpName, runtimeName, tool };
  });
  const toolMap = new Map(tools.map(entry => [entry.mcpName, entry]));
  const server = new Server(SERVER_INFO, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.map(tool => ({
      name: tool.mcpName,
      description: tool.tool.description,
      inputSchema: tool.tool.parameters as {
        type: 'object';
        properties?: Record<string, object>;
        required?: string[];
      },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async request => {
    const entry = toolMap.get(request.params.name);
    if (!entry) {
      throw new Error(`Unknown Squad state tool: ${request.params.name}`);
    }
    const args = parseObject(request.params.arguments);
    const result = await entry.tool.handler(args, {
      toolName: entry.runtimeName,
      toolCallId: `${entry.mcpName}-${Date.now()}`,
      arguments: args,
      sessionId: 'mcp',
    });
    return normalizeToolResult(result);
  });

  await server.connect(new StdioServerTransport());
}

export function printStateMcpHelp(): void {
  stderr.write([
    'squad state-mcp — MCP bridge for Squad runtime state tools',
    '',
    'Usage: squad state-mcp',
    '',
    'This command is intended to be launched by GitHub Copilot CLI through',
    '.copilot/mcp-config.json. It exposes squad_decide and state.* tools',
    'backed by the configured Squad state backend.',
    '',
  ].join('\n'));
}
