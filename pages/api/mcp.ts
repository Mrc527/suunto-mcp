import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NextApiRequest, NextApiResponse } from 'next';
import { registerAllTools, toolRegistry } from '../../src/tools';

const server = new McpServer({
  name: 'suunto-mcp',
  version: '1.0.0',
  capabilities: { tools: {}, resources: {} },
});

registerAllTools(server);

// Custom handler for MCP HTTP API
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const { tool, input } = req.body;
  const authHeader = req.headers['authorization'] || '';
  if (!tool || typeof tool !== 'string') return res.status(400).json({ error: 'Missing tool name' });
  const toolFn = toolRegistry[tool];
  if (!toolFn) {
    console.error('Available tools:', Object.keys(toolRegistry || {}));
    return res.status(404).json({ error: 'Tool not found' });
  }
  try {
    const result = await toolFn(input || {}, { authorization: authHeader });
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
}
