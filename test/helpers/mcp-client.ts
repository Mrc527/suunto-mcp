import { Client, InMemoryTransport, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler, type McpServer, type McpServerFactory } from "@modelcontextprotocol/server";

/** An MCP client connected in memory to one server instance (a 2025-era connection, as AI apps use today). */
export async function connectClient(server: McpServer, name = "test"): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name, version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

/**
 * An MCP client on the 2026-07-28 protocol, served in-process by the SDK's HTTP handler from a
 * server factory (a fresh server per request, as in production).
 */
export async function connectModernClient(factory: McpServerFactory, name = "test"): Promise<{ client: Client; close: () => Promise<void> }> {
  const handler = createMcpHandler(factory, { responseMode: "json" });
  const client = new Client({ name, version: "1.0.0" }, { versionNegotiation: { mode: "auto" } });
  await client.connect(new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), { fetch: (url, init) => handler.fetch(new Request(url, init)) }));
  return {
    client,
    close: async () => {
      await client.close();
      await handler.close();
    },
  };
}

/** The JSON-RPC messages of an HTTP answer (a JSON body or an SSE stream). */
export async function messagesOf(response: Response): Promise<unknown[]> {
  const text = await response.text();
  if (!text.trim()) return [];
  if (!(response.headers.get("content-type") ?? "").includes("text/event-stream")) return [JSON.parse(text) as unknown];
  const messages: unknown[] = [];
  for (const event of text.replace(/\r\n?/g, "\n").split("\n\n")) {
    const data = event
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""));
    if (data.length > 0) messages.push(JSON.parse(data.join("\n")));
  }
  return messages;
}
