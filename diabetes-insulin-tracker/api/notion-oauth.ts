import type { VercelRequest, VercelResponse } from '@vercel/node';

const NOTION_OAUTH_CLIENT_ID = process.env.NOTION_OAUTH_CLIENT_ID || '';
const NOTION_OAUTH_CLIENT_SECRET = process.env.NOTION_OAUTH_CLIENT_SECRET || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, redirectUri } = req.body || {};

  if (!code || !redirectUri) {
    return res.status(400).json({ error: 'Missing code or redirectUri' });
  }

  if (!NOTION_OAUTH_CLIENT_ID || !NOTION_OAUTH_CLIENT_SECRET) {
    return res.status(500).json({ error: 'OAuth not configured on server' });
  }

  try {
    const credentials = Buffer.from(`${NOTION_OAUTH_CLIENT_ID}:${NOTION_OAUTH_CLIENT_SECRET}`).toString('base64');

    const tokenRes = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenRes.json();

    res.setHeader('Cache-Control', 'no-store');
    return res.status(tokenRes.status).json(tokenData);
  } catch (error: any) {
    console.error('[Notion OAuth Error]', error);
    return res.status(500).json({ error: error.message });
  }
}
