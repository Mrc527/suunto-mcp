import { z } from 'zod';
import { User, initDb } from '../db';

export const getRecoveryData247Tool = (server: any, toolRegistry?: Record<string, Function>) => {
  const handler = async ({ from, to }: any, context: any) => {
    const mcpToken = context?.authorization?.replace('Bearer ', '');
    if (!mcpToken) return { content: [{ type: 'text', text: 'Missing MCP token' }] };
    await initDb();
    const user = await User.findOne({ where: { mcpToken } });
    if (!user) return { content: [{ type: 'text', text: 'Invalid MCP token' }] };
    const url = `https://cloudapi.suunto.com/247samples/recovery?from=${from}&to=${to}`;
    const suuntoRes = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${user.suuntoToken}`,
        'Content-Type': 'application/json',
      },
    });
    if (!suuntoRes.ok) {
      return { content: [{ type: 'text', text: `Failed to fetch recovery data: ${suuntoRes.statusText}` }] };
    }
    const data = await suuntoRes.json();
    if (!Array.isArray(data) || data.length === 0) {
      return { content: [{ type: 'text', text: 'No recovery data found.' }] };
    }
    const summary = data.map((item: any) => {
      const t = item.timestamp;
      const d = item.entryData;
      return `${t}: Balance=${d.Balance ?? 'N/A'}, StressState=${d.StressState ?? 'N/A'}`;
    }).join('\n');
    return { content: [{ type: 'text', text: summary }] };
  };
  server.tool(
    'get-recovery-data-247',
    'Get recovery data from 24/7 API',
    {
      from: z.number().describe('Start time in EPOCH milliseconds'),
      to: z.number().describe('End time in EPOCH milliseconds'),
    },
    handler
  );
  if (toolRegistry) toolRegistry['get-recovery-data-247'] = handler;
};
