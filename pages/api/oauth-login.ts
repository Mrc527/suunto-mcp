import { NextApiRequest, NextApiResponse } from 'next';

const clientId = process.env.SUUNTO_CLIENT_ID!;
const redirectUri = process.env.SUUNTO_REDIRECT_URI!;

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const authorizeUrl = `https://cloudapi-oauth.suunto.com/oauth/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  res.redirect(authorizeUrl);
}
