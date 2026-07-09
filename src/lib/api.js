/**
 * API client — the only way the browser reaches the backend.
 * Sessions ride on the HttpOnly cookie; the acting tenant is sent as a
 * header and enforced server-side (only the platform admin may differ).
 */

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, tenant } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (tenant) headers['x-kitchgoo-tenant'] = tenant;

  const res = await fetch(path, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON response (e.g. HTML from a misrouted dev server)
  }

  if (!res.ok) {
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  }
  return data;
}

export const api = {
  get: (path, opts) => request(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
  patch: (path, body, opts) => request(path, { ...opts, method: 'PATCH', body }),
  delete: (path, opts) => request(path, { ...opts, method: 'DELETE' }),
};

/**
 * Upload a base64 image data URL to Storage and return its public URL.
 * Used by the menu-photo and logo pickers so image bytes never get saved
 * inside DB rows (which would re-ship on every sync). Returns null on
 * failure — callers keep the local data URL as a still-working fallback.
 * Demo mode has no backend, so the data URL is used as-is.
 */
export async function uploadImage(dataUrl, kind, tenant) {
  const isDemo = typeof window !== 'undefined' && window.localStorage.getItem('kitchgoo_demo_mode') === 'true';
  if (isDemo || !dataUrl || !dataUrl.startsWith('data:image/')) return null;
  try {
    const res = await request('/api/data/upload-image', { method: 'POST', body: { dataUrl, kind }, tenant });
    return res?.url || null;
  } catch (err) {
    console.error('[api] image upload failed, keeping local copy:', err);
    return null;
  }
}
