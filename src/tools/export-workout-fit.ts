import { z } from 'zod';
import { User, initDb } from '../db';

const SUBSCRIPTION_KEY = process.env.SUUNTO_SUBSCRIPTION_KEY!;

export const exportWorkoutFitTool = (server: any, toolRegistry?: Record<string, Function>) => {
  const handler = async ({ workoutIdOrKey }: any, context: any) => {
    const mcpToken = context?.authorization?.replace('Bearer ', '');
    if (!mcpToken) return { content: [{ type: 'text', text: 'Missing MCP token' }] };
    await initDb();
    const user = await User.findOne({ where: { mcpToken } });
    if (!user) return { content: [{ type: 'text', text: 'Invalid MCP token' }] };
    const url = `https://cloudapi.suunto.com/v3/workouts/${encodeURIComponent(workoutIdOrKey)}/fit`;
    const suuntoRes = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${user.suuntoToken}`,
        'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
      },
    });
    if (!suuntoRes.ok) {
      return { content: [{ type: 'text', text: `Failed to export FIT: ${suuntoRes.statusText}` }] };
    }
    // FIT is a binary file. Return as MCP 'resource' type (base64 blob)
    const buffer = await suuntoRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return {
      content: [
        {
          type: 'resource',
          resource: {
            uri: `workout-${workoutIdOrKey}.fit`,
            blob: base64,
            mimeType: 'application/octet-stream',
          },
        },
        { type: 'text', text: 'FIT file exported. Download and import into your preferred app.' },
      ],
    };
  };
  server.tool(
    'export-workout-fit',
    'Export a workout in FIT format (v3)',
    {
      workoutIdOrKey: z.string().describe('Workout ID or key (string)'),
    },
    handler
  );
  if (toolRegistry) toolRegistry['export-workout-fit'] = handler;
};
