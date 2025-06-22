import { z } from 'zod';
import { User, initDb } from '../db';

export const getDailyActivityStatistics247Tool = (server: any, toolRegistry?: Record<string, Function>) => {
  const handler = async ({ startdate, enddate }: any, context: any) => {
    const mcpToken = context?.authorization?.replace('Bearer ', '');
    if (!mcpToken) return { content: [{ type: 'text', text: 'Missing MCP token' }] };
    await initDb();
    const user = await User.findOne({ where: { mcpToken } });
    if (!user) return { content: [{ type: 'text', text: 'Invalid MCP token' }] };
    const url = `https://cloudapi.suunto.com/247samples/daily-activity-statistics?startdate=${encodeURIComponent(startdate)}&enddate=${encodeURIComponent(enddate)}`;
    const suuntoRes = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${user.suuntoToken}`,
      },
    });
    if (!suuntoRes.ok) {
      return { content: [{ type: 'text', text: `Failed to fetch daily activity statistics: ${suuntoRes.statusText}` }] };
    }
    const data = await suuntoRes.json();
    if (!Array.isArray(data) || data.length === 0) {
      return { content: [{ type: 'text', text: 'No daily activity statistics found.' }] };
    }
    const summary = data.map((item: any) => {
      const name = item.Name;
      const agg = item.Aggregation;
      const samples = (item.Sources?.[0]?.Samples || []).map((s: any) => `${s.TimeISO8601}: ${s.Value ?? 'N/A'}`).join('\n');
      return `${name} (${agg}):\n${samples}`;
    }).join('\n---\n');
    return { content: [{ type: 'text', text: summary }] };
  };
  server.tool(
    'get-daily-activity-statistics-247',
    'Get aggregated daily steps and energy consumption (24/7 API)',
    {
      startdate: z.string().describe('Start date/time in ISO-8601 format (e.g. 2024-06-01T00:00:00Z)'),
      enddate: z.string().describe('End date/time in ISO-8601 format (e.g. 2024-06-07T23:59:59Z)'),
    },
    handler
  );
  if (toolRegistry) toolRegistry['get-daily-activity-statistics-247'] = handler;
};
