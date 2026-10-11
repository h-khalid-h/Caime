/**
 * The protocol: JSON-RPC 2.0, one message in, one answer out (or none for a notification), the
 * handshake and the two tool methods, written by hand since that is all of MCP a tools-only
 * server speaks. A refusal from Caime is a tool result with `isError` and the server's code
 * and words, so the agent reads why; a message the protocol can't take is a JSON-RPC error.
 */
import type { Caime } from '@caime/sdk';
import { CaimeError } from '@caime/sdk';
import { checkArguments, TOOLS, type ToolDefinition } from './tools';

/** Newest first: a client's version is kept when it's one of these, else the newest is offered. */
export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: unknown;
}
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

export interface McpServer {
  /** One message, parsed; the answer, or null when none is owed (a notification). */
  handle(message: unknown): Promise<JsonRpcResponse | null>;
  /** A line of input as the transport read it: parsed here, so a bad one answers with -32700. */
  handleText(line: string): Promise<JsonRpcResponse | null>;
}

export function createServer(opts: {
  client: Caime;
  version?: string;
  tools?: readonly ToolDefinition[];
}): McpServer {
  const tools = opts.tools ?? TOOLS;
  const version = opts.version ?? '0.1.0';
  const byName = new Map(tools.map((t) => [t.name, t]));

  const reply = (id: JsonRpcResponse['id'], result: unknown): JsonRpcResponse => ({
    jsonrpc: '2.0',
    id,
    result,
  });
  const refuse = (id: JsonRpcResponse['id'], code: number, message: string): JsonRpcResponse => ({
    jsonrpc: '2.0',
    id,
    error: { code, message },
  });

  async function callTool(params: unknown): Promise<ToolResult | string> {
    const p = params as { name?: unknown; arguments?: unknown } | null;
    if (!p || typeof p.name !== 'string') return 'params.name is required';
    const tool = byName.get(p.name);
    if (!tool) return `no tool named ${p.name}`;
    const args = p.arguments ?? {};
    const problem = checkArguments(tool.inputSchema, args);
    if (problem) return problem;
    try {
      const value = await tool.run(opts.client, args as Record<string, unknown>);
      return { content: [{ type: 'text', text: JSON.stringify(value) }] };
    } catch (err) {
      if (err instanceof CaimeError)
        return {
          isError: true,
          content: [{ type: 'text', text: `${err.code}: ${err.message}` }],
        };
      return {
        isError: true,
        content: [{ type: 'text', text: `Caime could not be reached: ${(err as Error).message}` }],
      };
    }
  }

  async function handle(message: unknown): Promise<JsonRpcResponse | null> {
    if (
      !message ||
      typeof message !== 'object' ||
      Array.isArray(message) ||
      (message as JsonRpcRequest).jsonrpc !== '2.0' ||
      typeof (message as JsonRpcRequest).method !== 'string'
    )
      return refuse(null, INVALID_REQUEST, 'not a JSON-RPC 2.0 request');
    const req = message as JsonRpcRequest;
    const id = req.id ?? null;
    const notification = req.id === undefined;
    switch (req.method) {
      case 'initialize': {
        const asked = (req.params as { protocolVersion?: unknown } | undefined)?.protocolVersion;
        const protocolVersion = (PROTOCOL_VERSIONS as readonly string[]).includes(String(asked))
          ? String(asked)
          : PROTOCOL_VERSIONS[0];
        return reply(id, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'caime', version },
          instructions:
            'Caime is a messaging product built on relationships. These tools act as one person with a personal token: read their inbox, actions and conversations, search as they would, add or change actions, and send a message where they are. Each tool names the permission its token needs; a refusal says which was missing. Never send on their behalf what they did not ask for.',
        });
      }
      case 'ping':
        return reply(id, {});
      case 'tools/list':
        return reply(id, {
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        });
      case 'tools/call': {
        const out = await callTool(req.params);
        return typeof out === 'string' ? refuse(id, INVALID_PARAMS, out) : reply(id, out);
      }
      default:
        if (notification) return null;
        return refuse(id, METHOD_NOT_FOUND, `no method ${req.method}`);
    }
  }

  return {
    handle: (message) =>
      handle(message).catch((err) =>
        refuse(null, INTERNAL_ERROR, (err as Error).message ?? 'internal error'),
      ),
    async handleText(line) {
      let message: unknown;
      try {
        message = JSON.parse(line);
      } catch {
        return refuse(null, PARSE_ERROR, 'not JSON');
      }
      return handle(message).catch((err) =>
        refuse(null, INTERNAL_ERROR, (err as Error).message ?? 'internal error'),
      );
    },
  };
}
