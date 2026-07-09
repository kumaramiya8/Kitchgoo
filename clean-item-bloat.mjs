/**
 * One-time cleanup: strip heavy line-item fields (base64 `image`, menu
 * definitions) out of ALREADY-STORED orders and KDS/saved-order snapshots.
 *
 * The server already strips these on read, so egress is fixed regardless —
 * but the DB rows themselves still hold the old base64 images. That bloats
 * storage and, worse, the kds_tickets / pos_saved_orders blobs get read and
 * rewritten whole on every atomic update. This shrinks them at the source.
 *
 *   node clean-item-bloat.mjs --dry   # report only
 *   node clean-item-bloat.mjs         # apply
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY in .env.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { stripItems, stripCollectionItems } from './shared/items.js';

const DRY = process.argv.includes('--dry');
const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Need VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const kb = (o) => (JSON.stringify(o).length / 1024);

async function run() {
  let savedKB = 0;

  // 1. orders (row table) — items is a JSONB array
  const { data: orders, error: oErr } = await db.from('orders').select('id, account_id, items');
  if (oErr) throw oErr;
  let orderHits = 0;
  for (const row of (orders || [])) {
    if (!Array.isArray(row.items)) continue;
    const before = kb(row.items);
    const lean = stripItems(row.items);
    const after = kb(lean);
    if (after < before - 0.01) {
      orderHits++; savedKB += before - after;
      if (!DRY) {
        const { error } = await db.from('orders').update({ items: lean }).eq('id', row.id);
        if (error) throw error;
      }
    }
  }
  console.log(`orders: ${orderHits} row(s) trimmed`);

  // 2. tenant_data collections that hold item snapshots
  const { data: td, error: tErr } = await db
    .from('tenant_data').select('account_id, collection_name, value')
    .in('collection_name', ['kds_tickets', 'pos_saved_orders']);
  if (tErr) throw tErr;
  let colHits = 0;
  for (const row of (td || [])) {
    const before = kb(row.value);
    const lean = stripCollectionItems(row.collection_name, row.value);
    const after = kb(lean);
    if (after < before - 0.01) {
      colHits++; savedKB += before - after;
      console.log(`  ${row.account_id}/${row.collection_name}: ${before.toFixed(0)}KB -> ${after.toFixed(0)}KB`);
      if (!DRY) {
        const { error } = await db.from('tenant_data')
          .update({ value: lean }).eq('account_id', row.account_id).eq('collection_name', row.collection_name);
        if (error) throw error;
      }
    }
  }
  console.log(`tenant_data: ${colHits} collection blob(s) trimmed`);

  console.log(`\n${DRY ? '[DRY RUN] ' : ''}Done. ~${savedKB.toFixed(0)} KB of item bloat ${DRY ? 'would be' : ''} removed from stored rows.`);
}

run().catch(err => { console.error('Cleanup failed:', err); process.exit(1); });
