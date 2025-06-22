import { NextApiRequest, NextApiResponse } from 'next';
import { User, syncDb } from '../../src/db';
import { randomBytes } from 'crypto';

// This is a mock. Replace with real Suunto API call.
async function fetchSuuntoToken(username: string, password: string): Promise<string | null> {
  // TODO: Implement real Suunto OAuth2 flow
  if (username && password) return 'suunto-access-token-' + username;
  return null;
}

// This endpoint is now deprecated. Use /api/oauth-login for Suunto OAuth2 login.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await syncDb();
  if (req.method !== 'POST') return res.status(405).end();
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

  // Get or create user
  let user = await User.findOne({ where: { suuntoUsername: username } });
  if (!user) {
    const suuntoToken = await fetchSuuntoToken(username, password);
    if (!suuntoToken) return res.status(401).json({ error: 'Invalid Suunto credentials' });
    const mcpToken = randomBytes(32).toString('hex');
    user = await User.create({ suuntoUsername: username, suuntoToken, mcpToken });
  }
  res.status(200).json({ mcpToken: user.mcpToken });
}
