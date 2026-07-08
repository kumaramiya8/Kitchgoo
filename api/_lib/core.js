/**
 * Server core — shared by all API functions.
 * Files under api/_lib are not exposed as routes by Vercel.
 *
 * Everything here runs server-side only: the Supabase client uses the
 * service-role key (falling back to the anon key for older setups), so
 * Row Level Security can deny the browser's anon key entirely.
 */
import jwt from 'jsonwebtoken';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { SEEDS, FLEX_COLLECTIONS } from '../../shared/seeds.js';

// ── Env ─────────────────────────────────────────────────────
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY;

const DEFAULT_JWT_SECRET = 'super_secret_kitchgoo_key_replace_in_prod';
export const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;

if (process.env.NODE_ENV === 'production' && JWT_SECRET === DEFAULT_JWT_SECRET) {
  console.error('[Server] FATAL: JWT_SECRET is not set. Refusing to sign sessions with the default secret in production.');
}

export function assertProductionSecrets() {
  if (process.env.NODE_ENV === 'production' && JWT_SECRET === DEFAULT_JWT_SECRET) {
    const err = new Error('Server misconfigured: JWT_SECRET must be set in production');
    err.statusCode = 500;
    throw err;
  }
}

let _admin = null;
export function getAdminClient() {
  if (!_admin && SUPABASE_URL && SERVICE_KEY) {
    _admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}

// ── Password hashing ────────────────────────────────────────
// Format: scrypt$<salt-hex>$<hash-hex>. Legacy rows hold a simpleHash hex
// string; verifyPassword accepts both so old accounts keep working, and
// callers rehash-on-login to migrate them.
export function hashPassword(plain) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(plain), salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function legacySimpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash.toString(16);
}

export function verifyPassword(plain, stored) {
  if (!stored) return { ok: false, needsRehash: false };
  if (stored.startsWith('scrypt$')) {
    const [, salt, hash] = stored.split('$');
    if (!salt || !hash) return { ok: false, needsRehash: false };
    const candidate = scryptSync(String(plain), salt, 32);
    const expected = Buffer.from(hash, 'hex');
    const ok = candidate.length === expected.length && timingSafeEqual(candidate, expected);
    return { ok, needsRehash: false };
  }
  // Legacy simpleHash row
  const ok = legacySimpleHash(String(plain)) === stored;
  return { ok, needsRehash: ok };
}

// ── Sessions ────────────────────────────────────────────────
export const AUTH_COOKIE = 'kitchgoo_auth_token';

export function sessionClaims(userRow) {
  // Keep the JWT small and free of secrets. account_id is the tenant.
  const accountId = userRow.account_id || userRow.accountId || 'Kitchgoo';
  return {
    id: userRow.id,
    name: userRow.name,
    email: userRow.email,
    role: userRow.role,
    avatar: userRow.avatar,
    accountId,
    restaurantName: accountId, // legacy field the frontend expects
  };
}

export function signSession(userRow) {
  assertProductionSecrets();
  return jwt.sign(sessionClaims(userRow), JWT_SECRET, { expiresIn: '7d' });
}

export function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function readSession(req) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// Express middleware: attach req.user or reject
export function requireAuth(req, res, next) {
  const session = readSession(req);
  if (!session) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }
  req.user = session;
  next();
}

export function isPlatformAdmin(user) {
  return (user?.accountId || '').toLowerCase() === 'kitchgoo';
}

/**
 * The tenant a request operates on. Regular users are pinned to their own
 * account; the Kitchgoo platform admin may act on another tenant via the
 * x-kitchgoo-tenant header (impersonation).
 */
export function resolveTenant(req) {
  const own = req.user.accountId;
  const requested = req.headers['x-kitchgoo-tenant'];
  if (requested && requested !== own) {
    if (!isPlatformAdmin(req.user)) {
      const err = new Error('Not allowed to act on another account');
      err.statusCode = 403;
      throw err;
    }
    return String(requested);
  }
  return own;
}

// ── Change signal ───────────────────────────────────────────
// Fire-and-forget realtime broadcast so other devices resync. Carries no
// data — clients call GET /api/data/sync when they hear it.
export async function broadcastChange(tenant, table) {
  if (!SUPABASE_URL || !SERVICE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        messages: [{
          topic: `kitchgoo_changes_${tenant}`,
          event: 'db_changed',
          payload: { table, at: Date.now() },
          private: false,
        }],
      }),
    });
  } catch (err) {
    console.warn('[Server] broadcastChange failed (non-fatal):', err.message);
  }
}

// ── Tenant bootstrap helpers ────────────────────────────────
export async function ensureAccount(tenant) {
  const db = getAdminClient();
  const { data } = await db.from('accounts').select('id').eq('id', tenant);
  if (!data || data.length === 0) {
    await db.from('accounts').insert({ id: tenant, name: tenant, status: 'active', plan: 'pro' });
    return false; // did not exist
  }
  return true;
}

export async function seedTenantIfNew(tenant) {
  const db = getAdminClient();
  const { data: existingSettings } = await db
    .from('settings').select('section_name').eq('account_id', tenant).limit(1);
  if (existingSettings && existingSettings.length > 0) return false;

  console.log(`[Server] Seeding new tenant: ${tenant}`);
  const settingsObj = {
    ...SEEDS.settings,
    restaurant: {
      ...SEEDS.settings.restaurant,
      name: tenant,
      email: `contact@${tenant.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
    },
  };

  await Promise.all(
    Object.entries(settingsObj).map(([section, val]) =>
      db.from('settings').insert({ account_id: tenant, section_name: section, value: val })
    )
  );

  const flexToSeed = ['staff', 'suppliers', 'recipes', 'floor_plans', 'modifiers', 'tip_pools', 'loyalty', 'campaigns', 'cash_drawer', 'register_closures'];
  await Promise.all(
    flexToSeed.map(col =>
      db.from('tenant_data').insert({ account_id: tenant, collection_name: col, value: SEEDS[col] })
    )
  );
  return true;
}

// Orders shipped in the default payload are bounded — a busy restaurant
// accumulates 100k+ rows a year and shipping all of them to every device
// on every sync is the app's memory ceiling. Older ranges are fetched on
// demand via GET /api/data/orders.
export const ORDERS_WINDOW_DAYS = 60;
export const ORDERS_WINDOW_LIMIT = 3000;

export function ordersWindowStart() {
  const d = new Date(Date.now() - ORDERS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

/**
 * Everything the frontend cache needs for one tenant, in one round trip.
 */
export async function loadTenantPayload(tenant) {
  const db = getAdminClient();
  const ordersFrom = ordersWindowStart();
  const [menuRes, inventoryRes, ordersRes, settingsRes, flexRes, usersRes] = await Promise.all([
    db.from('menu').select('*').eq('account_id', tenant),
    db.from('inventory').select('*').eq('account_id', tenant),
    db.from('orders').select('*').eq('account_id', tenant)
      .gte('created_at', ordersFrom)
      .order('created_at', { ascending: false })
      .limit(ORDERS_WINDOW_LIMIT),
    db.from('settings').select('*').eq('account_id', tenant),
    db.from('tenant_data').select('*').eq('account_id', tenant),
    db.from('users').select('id, account_id, name, email, role, avatar, phone, created_at').eq('account_id', tenant),
  ]);

  const settingsObj = JSON.parse(JSON.stringify(SEEDS.settings));
  (settingsRes.data || []).forEach(row => {
    settingsObj[row.section_name] = row.value;
  });

  const collections = {};
  FLEX_COLLECTIONS.forEach(col => {
    collections[col] = SEEDS[col] !== undefined ? JSON.parse(JSON.stringify(SEEDS[col])) : [];
  });
  (flexRes.data || []).forEach(row => {
    collections[row.collection_name] = row.value;
  });

  return {
    menu: menuRes.data || [],
    inventory: inventoryRes.data || [],
    orders: ordersRes.data || [],
    ordersFrom, // clients fetch older ranges on demand
    settings: settingsObj,
    users: usersRes.data || [],
    collections,
  };
}
