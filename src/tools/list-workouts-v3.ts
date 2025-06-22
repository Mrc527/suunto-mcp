import { z } from 'zod';
import { User, initDb } from '../db';

const SUBSCRIPTION_KEY = process.env.SUUNTO_SUBSCRIPTION_KEY!;

export const listWorkoutsV3Tool = (server: any, toolRegistry?: Record<string, Function>) => {
  const handler = async (input: any, context: any) => {
    const mcpToken = context?.authorization?.replace('Bearer ', '');
    if (!mcpToken) return { content: [{ type: 'text', text: 'Missing MCP token' }] };
    await initDb();
    const user = await User.findOne({ where: { mcpToken } });
    if (!user) return { content: [{ type: 'text', text: 'Invalid MCP token' }] };
    let url = 'https://cloudapi.suunto.com/v3/workouts';
    const params = [];
    if (input.since) params.push(`since=${encodeURIComponent(input.since)}`);
    if (input.until) params.push(`until=${encodeURIComponent(input.until)}`);
    if (input.limit !== undefined) params.push(`limit=${input.limit}`);
    if (input.offset !== undefined) params.push(`offset=${input.offset}`);
    if (input['filter-by-modification-time']) params.push('filter-by-modification-time=true');
    if (input.extensions) params.push(`extensions=${encodeURIComponent(input.extensions)}`);
    if (params.length) url += '?' + params.join('&');
    const suuntoRes = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${user.suuntoToken}`,
        'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
      },
    });
    if (!suuntoRes.ok) {
      return { content: [{ type: 'text', text: `Failed to fetch workouts: ${suuntoRes.statusText}` }] };
    }
    const data = (await suuntoRes.json()) as { items?: any[] };
    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      return { content: [{ type: 'text', text: 'No workouts found.' }] };
    }
    const summary = data.items.map((w: any) => `Key: ${w.key}\nType: ${w.sport} | Start: ${w.startTime} | Duration: ${w.duration} | Distance: ${w.distance}m`).join('\n---\n');
    return { content: [{ type: 'text', text: summary }] };
  };
  server.tool(
    'list-workouts-v3',
    'List user workouts (v3) with full parameter support',
    {
      since: z.string().optional().describe('Start date/time (ISO8601, e.g. 2023-01-01T00:00:00Z)'),
      until: z.string().optional().describe('End date/time (ISO8601, e.g. 2023-01-31T23:59:59Z)'),
      limit: z.number().optional().describe('Max number of workouts to return'),
      offset: z.number().optional().describe('Offset for pagination'),
      'filter-by-modification-time': z.boolean().optional().describe('If true, filter by modification time instead of start time'),
      extensions: z.string().optional().describe('Comma-separated list of extensions to include'),
    },
    handler
  );
  if (toolRegistry) toolRegistry['list-workouts-v3'] = handler;
};
