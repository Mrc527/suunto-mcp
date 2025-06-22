import { z } from 'zod';
import { User, syncDb } from '../db';

const SUBSCRIPTION_KEY = process.env.SUUNTO_SUBSCRIPTION_KEY!;

export const getWorkoutV3Tool = (server: any, toolRegistry?: Record<string, Function>) => {
  const handler = async ({ workoutKey, extensions }: any, context: any) => {
    const mcpToken = context?.authorization?.replace('Bearer ', '');
    if (!mcpToken) return { content: [{ type: 'text', text: 'Missing MCP token' }] };
    await syncDb();
    const user = await User.findOne({ where: { mcpToken } });
    if (!user) return { content: [{ type: 'text', text: 'Invalid MCP token' }] };
    let url = `https://cloudapi.suunto.com/v3/workouts/${encodeURIComponent(workoutKey)}`;
    if (extensions) url += `?extensions=${encodeURIComponent(extensions)}`;
    const suuntoRes = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${user.suuntoToken}`,
        'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
      },
    });
    if (!suuntoRes.ok) {
      return { content: [{ type: 'text', text: `Failed to fetch workout: ${suuntoRes.statusText}` }] };
    }
    const w = (await suuntoRes.json()) as any;
    const summary = `Type: ${w.sport}\nStart: ${w.startTime}\nDuration: ${w.duration}\nDistance: ${w.distance}m\nCalories: ${w.calories}\nAvg HR: ${w.avgHr}`;
    return { content: [{ type: 'text', text: summary }] };
  };
  server.tool(
    'get-workout-v3',
    'Get details for a specific workout (v3, with extensions)',
    {
      workoutKey: z.string().describe('Workout key (string)'),
      extensions: z.string().optional().describe('Comma-separated list of extensions to include'),
    },
    handler
  );
  if (toolRegistry) toolRegistry['get-workout-v3'] = handler;
};
