/**
 * @caime/mcp (R78): Caime as tools for an AI agent someone runs. A Model Context Protocol
 * server over `@caime/sdk`'s person methods, spoken over stdio, with a personal access token
 * (docs/API.md, "Acting as yourself"): the agent reads the person's inbox, actions and
 * conversations and acts within the token's permissions, every call the token's and audited
 * as such. Nothing here widens what a token may do: the server decides that.
 */
export { createServer, type McpServer, PROTOCOL_VERSIONS, type ToolResult } from './server';
export { serveStdio } from './stdio';
export { TOOLS, type ToolDefinition } from './tools';
