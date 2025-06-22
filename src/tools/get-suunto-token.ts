import { User, syncDb } from '../db';

export const getSuuntoTokenTool = (server: any, toolRegistry?: Record<string, Function>) => {
  console.log('Registering get-suunto-token tool');
  const handler = async (_input: any, context: any) => {
    const mcpToken = context?.authorization?.replace('Bearer ', '');
    if (!mcpToken) return { content: [{ type: 'text', text: 'Missing MCP token' }] };
    await syncDb();
    const user = await User.findOne({ where: { mcpToken } });
    if (!user) return { content: [{ type: 'text', text: 'Invalid MCP token' }] };
    return { content: [{ type: 'text', text: user.suuntoToken }] };
  };
  server.tool('get-suunto-token', 'Get the user Suunto access token', {}, handler);
  if (toolRegistry) toolRegistry['get-suunto-token'] = handler;
};
