/**
 * Upload a photo file to Notion via the /api/upload-photo proxy function.
 * Returns the Notion file upload ID.
 */
export async function uploadPhoto(file: File, notionToken: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/upload-photo', {
    method: 'POST',
    headers: { 'X-Notion-Token': notionToken },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error || 'Error al subir la foto');
  }

  const data = await response.json();
  return data.fileUploadId;
}
