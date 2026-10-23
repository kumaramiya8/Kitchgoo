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

async function request(path, { method = 'GET', body, tenant, headers: customHeaders } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(customHeaders || {}) };
  if (tenant) headers['x-kitchgoo-tenant'] = tenant;

  const res = await fetch(path, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 304) {
    return { notModified: true };
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON response (e.g. HTML from a misrouted dev server)
  }

  if (!res.ok) {
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  }
  const etag = res.headers.get('ETag');
  if (etag && data && typeof data === 'object') {
    data._etag = etag;
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

/**
 * Resize and compress an image file client-side before upload.
 * Reduces 3-8MB camera photos down to 30-50KB WebP images,
 * eliminating 98%+ of media bandwidth and avoiding database bloat.
 */
export function compressImage(file, maxWidth = 800, quality = 0.75) {
  return new Promise((resolve) => {
    if (!file || !file.type?.startsWith('image/')) {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        try {
          const webp = canvas.toDataURL('image/webp', quality);
          resolve(webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', quality));
        } catch {
          resolve(e.target.result);
        }
      };
      img.onerror = () => resolve(e.target.result);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

