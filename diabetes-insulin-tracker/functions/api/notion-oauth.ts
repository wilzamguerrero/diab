// Cloudflare Pages Function: Notion OAuth authorization_code exchange.
//
// Route: /api/notion-oauth  (POST { code, redirectUri })
//
// Performs the server-side token exchange using HTTP Basic auth with the
// integration's client id/secret, which are provided as environment bindings
// (`.dev.vars` locally, or Pages project secrets in production). The client
// secret never reaches the browser.

interface Env {
  NOTION_OAUTH_CLIENT_ID?: string;
  NOTION_OAUTH_CLIENT_SECRET?: string;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const payload = (await request.json().catch(() => ({}))) as {
    code?: string;
    redirectUri?: string;
  };
  const { code, redirectUri } = payload;

  if (!code || !redirectUri) {
    return json({ error: 'Missing code or redirectUri' }, 400);
  }

  const clientId = env.NOTION_OAUTH_CLIENT_ID;
  const clientSecret = env.NOTION_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return json({ error: 'OAuth not configured on server' }, 500);
  }

  try {
    const credentials = btoa(`${clientId}:${clientSecret}`);
    const tokenRes = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    const data = await tokenRes.text();
    return new Response(data, {
      status: tokenRes.status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OAuth exchange error';
    return json({ error: message }, 500);
  }
};
