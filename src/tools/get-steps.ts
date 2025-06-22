import { z } from 'zod';
import { User, syncDb } from '../db';

const SUBSCRIPTION_KEY = process.env.SUUNTO_SUBSCRIPTION_KEY!;

function getYesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export const getStepsTool = (server: any, toolRegistry?: Record<string, Function>) => {
  const handler = async ({ date }: any, context: any) => {
    const mcpToken = context?.authorization?.replace('Bearer ', '');
    if (!mcpToken) return { content: [{ type: 'text', text: 'Missing MCP token' }] };
    await syncDb();
    const user = await User.findOne({ where: { mcpToken } });
    if (!user) return { content: [{ type: 'text', text: 'Invalid MCP token' }] };
    const day = date || getYesterdayISO();
    const url = `https://cloudapi.suunto.com/v2/daily-activity?start=${day}&end=${day}`;
    const suuntoRes = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${user.suuntoToken}`,
        'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
      },
    });
    if (!suuntoRes.ok) {
      return { content: [{ type: 'text', text: `Failed to fetch steps: ${suuntoRes.statusText}` }] };
    }
    const data = await suuntoRes.json();
    const steps = data?.items?.[0]?.steps ?? 'unknown';
    return { content: [{ type: 'text', text: `Steps for ${day}: ${steps}` }] };
  };
  server.tool(
    'get-steps',
    'Get the number of steps for a given date (default: yesterday)',
    {
      date: z.string().optional().describe('Date in YYYY-MM-DD format (default: yesterday)'),
    },
    handler
  );
  if (toolRegistry) toolRegistry['get-steps'] = handler;
};
