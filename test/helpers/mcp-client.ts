import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { MCPServer } from "mcp-use";

/** An MCP SDK client connected in-process to an mcp-use server, through the server's fetch handler. */
export async function connectClient(server: MCPServer, name = "test"): Promise<Client> {
  const client = new Client({ name, version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
    fetch: (url, init) => server.fetch(new Request(url, init)),
  });
  await client.connect(transport);
  return client;
}
