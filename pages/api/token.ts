import { NextApiRequest, NextApiResponse } from 'next';
import { User, syncDb } from '../../src/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await syncDb();
  const { mcpToken } = req.query;
  if (!mcpToken || typeof mcpToken !== 'string') return res.status(400).json({ error: 'Missing MCP token' });
  const user = await User.findOne({ where: { mcpToken } });
  if (!user) return res.status(401).json({ error: 'Invalid MCP token' });
  res.status(200).json({ suuntoToken: user.suuntoToken });
}
