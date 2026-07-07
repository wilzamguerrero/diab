// Cloudflare Pages Function: upload a photo to Notion via File Uploads API.
//
// Route: POST /api/upload-photo
// Accepts multipart/form-data with a "file" field.
// Uses the caller's OAuth token (from X-Notion-Token header) to upload.
// Returns { success: true, fileUploadId: string }

interface Env {
  // No secrets needed — uses the caller's OAuth token
}

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_FILE_UPLOADS_VERSION = '2026-03-11';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Notion-Token',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request } = context;

  // CORS preflight.
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const token = request.headers.get('x-notion-token') || '';
  if (!token) {
    return json({ error: 'Missing X-Notion-Token header' }, 401);
  }

  // Read the file from multipart form data.
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: 'No se pudo leer el formulario.' }, 400);
  }

  const file = formData.get('file') as File | null;
  if (!file) {
    return json({ error: 'No se proporcionó ningún archivo.' }, 400);
  }

  try {
    // Step 1: Create a file upload object.
    const createRes = await fetch(`${NOTION_API_BASE}/file_uploads`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': NOTION_FILE_UPLOADS_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename: file.name,
        content_type: file.type || 'image/jpeg',
      }),
    });

    const upload = (await createRes.json()) as any;
    if (!upload.id) {
      const msg = upload.message || upload.code || `HTTP ${createRes.status}`;
      return json({ error: `Error al crear upload en Notion: ${msg}` }, createRes.status || 500);
    }

    // Step 2: Send the file content to the upload URL.
    const fileBuffer = await file.arrayBuffer();
    const fileBlob = new Blob([fileBuffer], { type: file.type || 'image/jpeg' });

    const sendForm = new FormData();
    sendForm.append('file', fileBlob, file.name);

    const sendUrl = upload.upload_url || `${NOTION_API_BASE}/file_uploads/${upload.id}/send`;

    const sendRes = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': NOTION_FILE_UPLOADS_VERSION,
      },
      body: sendForm,
    });

    const sent = (await sendRes.json()) as any;
    if (sent.status !== 'uploaded' && sent.status !== 'complete') {
      const msg = sent.message || sent.code || `HTTP ${sendRes.status}`;
      return json({ error: `Error al enviar archivo a Notion: ${msg}` }, sendRes.status || 500);
    }

    return json({ success: true, fileUploadId: upload.id });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return json({ error: message }, 500);
  }
};
