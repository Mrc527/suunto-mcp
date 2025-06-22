import { NextApiRequest, NextApiResponse } from 'next';
import { User, syncDb } from '../../src/db';
import fetch from 'node-fetch';

const clientId = process.env.SUUNTO_CLIENT_ID!;
const clientSecret = process.env.SUUNTO_CLIENT_SECRET!;
const redirectUri = process.env.SUUNTO_REDIRECT_URI!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const code = req.query.code as string;
  if (!code) return res.status(400).send('Missing code');

  // Exchange code for token
  const tokenRes = await fetch('https://cloudapi-oauth.suunto.com/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) return res.status(401).json(tokenData);

  // Parse JWT to get username
  const jwt = tokenData.access_token.split('.')[1];
  const payload = JSON.parse(Buffer.from(jwt, 'base64').toString());
  const suuntoUsername = payload.user;

  await syncDb();
  let user = await User.findOne({ where: { suuntoUsername } });
  if (!user) {
    const mcpToken = Buffer.from(suuntoUsername + Date.now()).toString('hex');
    user = await User.create({
      suuntoUsername,
      suuntoToken: tokenData.access_token,
      suuntoRefreshToken: tokenData.refresh_token,
      suuntoTokenExpires: Date.now() + (tokenData.expires_in * 1000),
      mcpToken,
    });
  } else {
    user.suuntoToken = tokenData.access_token;
    user.suuntoRefreshToken = tokenData.refresh_token;
    user.suuntoTokenExpires = Date.now() + (tokenData.expires_in * 1000);
    await user.save();
  }
  res.redirect(`/login-success?mcpToken=${user.mcpToken}`);
}
