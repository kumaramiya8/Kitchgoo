/**
 * One-time migration: move base64 data: image URLs out of DB rows into
 * Supabase Storage, replacing each with a public URL.
 *
 * Scans `menu.image` and every `settings` section (deep) across ALL tenants.
 * Safe to re-run — rows already holding a URL are skipped.
 *
 *   node migrate-images.mjs           # apply
 *   node migrate-images.mjs --dry     # report only, no writes
 *
 * Requires VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry');
const BUCKET = 'kitchgoo-media';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
// Prefer the service-role key (needed to create the bucket and bypass
// Storage RLS). Falls back to the anon key so a --dry read-only report can
// run without it, but a real migration REQUIRES the service-role key.
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL and a Supabase key in .env');
  process.exit(1);
}
if (!DRY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('A real migration needs SUPABASE_SERVICE_ROLE_KEY (to write to Storage). Set it in .env, or run with --dry to preview.');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const isDataUrl = (v) => typeof v === 'string' && v.startsWith('data:image/');
let uploaded = 0;

async function ensureBucket() {
  if (DRY) return;
  try {
    const { data } = await db.storage.getBucket(BUCKET);
    if (!data) await db.storage.createBucket(BUCKET, { public: true, fileSizeLimit: '5MB' });
  } catch {
    try { await db.storage.createBucket(BUCKET, { public: true, fileSizeLimit: '5MB' }); } catch { /* exists */ }
  }
}

async function uploadDataUrl(tenant, kind, dataUrl) {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return null;
  const mime = m[1];
  const buf = Buffer.from(m[2], 'base64');
  const ext = mime.split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg');
  const safeTenant = String(tenant).replace(/[^a-zA-Z0-9]/g, '_');
  const path = `${safeTenant}/${kind}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  if (DRY) { uploaded++; return `DRY://${path}`; }
  const { error } = await db.storage.from(BUCKET).upload(path, buf, { contentType: mime, upsert: false });
  if (error) throw error;
  uploaded++;
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// Recursively replace any data: image string inside an object/array
async function deepReplace(tenant, kind, value) {
  if (isDataUrl(value)) return { changed: true, value: await uploadDataUrl(tenant, kind, value) };
  if (Array.isArray(value)) {
    let changed = false;
    const out = [];
    for (const v of value) { const r = await deepReplace(tenant, kind, v); changed = changed || r.changed; out.push(r.value); }
    return { changed, value: out };
  }
  if (value && typeof value === 'object') {
    let changed = false;
    const out = {};
    for (const [k, v] of Object.entries(value)) { const r = await deepReplace(tenant, kind, v); changed = changed || r.changed; out[k] = r.value; }
    return { changed, value: out };
  }
  return { changed: false, value };
}

async function run() {
  await ensureBucket();

  // 1. Menu rows
  const { data: menu, error: menuErr } = await db.from('menu').select('id, account_id, image');
  if (menuErr) throw menuErr;
  const menuHits = (menu || []).filter(r => isDataUrl(r.image));
  console.log(`menu: ${menuHits.length} row(s) with embedded images`);
  for (const row of menuHits) {
    const newUrl = await uploadDataUrl(row.account_id, 'menu', row.image);
    if (!DRY && newUrl) {
      const { error } = await db.from('menu').update({ image: newUrl }).eq('id', row.id);
      if (error) throw error;
    }
    console.log(`  menu ${row.id} (${row.account_id}) -> ${DRY ? 'would upload' : newUrl}`);
  }

  // 2. Settings sections (deep scan)
  const { data: settings, error: setErr } = await db.from('settings').select('account_id, section_name, value');
  if (setErr) throw setErr;
  let settingsChanged = 0;
  for (const row of (settings || [])) {
    const { changed, value } = await deepReplace(row.account_id, 'settings', row.value);
    if (changed) {
      settingsChanged++;
      if (!DRY) {
        const { error } = await db.from('settings')
          .update({ value }).eq('account_id', row.account_id).eq('section_name', row.section_name);
        if (error) throw error;
      }
      console.log(`  settings ${row.account_id}/${row.section_name} -> images replaced`);
    }
  }
  console.log(`settings: ${settingsChanged} section(s) updated`);

  console.log(`\n${DRY ? '[DRY RUN] ' : ''}Done. ${uploaded} image(s) ${DRY ? 'would be' : 'were'} moved to Storage.`);
}

run().catch(err => { console.error('Migration failed:', err); process.exit(1); });
