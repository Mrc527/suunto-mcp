import { z } from 'zod';
import { User, syncDb } from '../db';

export const getDailyActivitySamples247Tool = (server: any, toolRegistry?: Record<string, Function>) => {
  const handler = async ({ from, to }: any, context: any) => {
    const mcpToken = context?.authorization?.replace('Bearer ', '');
    if (!mcpToken) return { content: [{ type: 'text', text: 'Missing MCP token' }] };
    await syncDb();
    const user = await User.findOne({ where: { mcpToken } });
    if (!user) return { content: [{ type: 'text', text: 'Invalid MCP token' }] };
    const url = `https://cloudapi.suunto.com/247samples/activity?from=${from}&to=${to}`;
    const suuntoRes = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${user.suuntoToken}`,
        'Content-Type': 'application/json',
      },
    });
    if (!suuntoRes.ok) {
      return { content: [{ type: 'text', text: `Failed to fetch daily activity samples: ${suuntoRes.statusText}` }] };
    }
    const data = await suuntoRes.json();
    if (!Array.isArray(data) || data.length === 0) {
      return { content: [{ type: 'text', text: 'No daily activity samples found.' }] };
    }
    const summary = data.map((item: any) => {
      const t = item.timestamp;
      const d = item.entryData;
      return `${t}: Steps=${d.StepCount ?? 'N/A'}, Energy=${d.EnergyConsumption ?? 'N/A'}, HR=${d.HR ?? 'N/A'}, SpO2=${d.SpO2 ?? 'N/A'}`;
    }).join('\n');
    return { content: [{ type: 'text', text: summary }] };
  };
  server.tool(
    'get-daily-activity-samples-247',
    'Get daily activity samples (steps, energy, HR, SpO2, etc.) from 24/7 API',
    {
      from: z.number().describe('Start time in EPOCH milliseconds'),
      to: z.number().describe('End time in EPOCH milliseconds'),
    },
    handler
  );
  if (toolRegistry) toolRegistry['get-daily-activity-samples-247'] = handler;
};
