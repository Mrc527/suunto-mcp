import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NextApiRequest, NextApiResponse } from 'next';
import { registerAllTools, toolRegistry } from '../../src/tools';
import fetch from 'node-fetch';

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
  // Extract client IP address for Matomo tracking
  let clientIp = '';
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string') {
    clientIp = xff.split(',')[0].trim();
  } else if (Array.isArray(xff) && xff.length > 0) {
    clientIp = xff[0];
  } else if (req.socket?.remoteAddress) {
    clientIp = req.socket.remoteAddress;
  }
  // Matomo server-side tracking (non-blocking)
  (async () => {
    try {
      await fetch('https://track.visin.ch/matomo.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          idsite: '14',
          rec: '1',
          action_name: `API: ${tool}`,
          url: req.headers['referer'] || '',
          ua: req.headers['user-agent'] || '',
          cip: clientIp,
          // Optionally add more fields, but avoid sending sensitive data
        }).toString(),
      });
    } catch (err) {
      // Silently ignore tracking errors
    }
  })();
  try {
    const result = await toolFn(input || {}, { authorization: authHeader });
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
}
