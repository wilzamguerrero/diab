// Cloudflare Pages Function: generic Notion REST proxy.
//
// Route: /api/notion?endpoint=<notion-path>&method=<GET|POST|PATCH|DELETE>
//
// Mirrors the reused proxy behavior: injects `Notion-Version: 2022-06-28`, uses
// the caller's per-request token (`X-Notion-Token` header) or falls back to the
// server-side `NOTION_PORTFOLIO_KEY` binding, and never caches responses.
//
// The client (`NotionService.notionFetch`) always issues the HTTP request as
// GET (no body) or POST (with body), carrying the intended Notion verb in the
// `method` query parameter — so we forward using that verb.

interface Env {
  NOTION_PORTFOLIO_KEY?: string;
}

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Notion-Token',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // CORS preflight.
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const endpoint = url.searchParams.get('endpoint');
  const method = (url.searchParams.get('method') || 'GET').toUpperCase();

  if (!endpoint) {
    return json({ error: 'Missing endpoint parameter' }, 400);
  }

  const clientToken = request.headers.get('x-notion-token') || '';
  const effectiveKey = clientToken || env.NOTION_PORTFOLIO_KEY || '';

  const fetchOptions: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${effectiveKey}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
  };

  // Forward the request body for verbs that carry one.
  if (method === 'POST' || method === 'PATCH' || method === 'DELETE') {
    try {
      const body = await request.text();
      if (body) fetchOptions.body = body;
    } catch {
      // No body available — fine for some requests.
    }
  }

  try {
    const response = await fetch(`${NOTION_API_BASE}${endpoint}`, fetchOptions);
    const data = await response.text();
    return new Response(data, {
      status: response.status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Notion proxy error';
    return json({ error: message }, 500);
  }
};
