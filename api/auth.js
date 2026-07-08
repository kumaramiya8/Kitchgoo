/**
 * Auth API — login / session / logout / register.
 * Passwords are scrypt-hashed; legacy simpleHash rows are verified once and
 * transparently rehashed on successful login.
 */
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import {
  getAdminClient,
  hashPassword,
  verifyPassword,
  sessionClaims,
  signSession,
  setAuthCookie,
  readSession,
  ensureAccount,
  isPlatformAdmin,
  AUTH_COOKIE,
} from './_lib/core.js';

const app = express();

app.use(cors({ origin: process.env.NODE_ENV === 'production' ? true : 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Trust proxy for rate limiter (required for Vercel)
app.set('trust proxy', 1);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many login attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many registration attempts, please try again later' },
});

const resetPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Too many password reset requests, please try again later' },
});

// POST /api/login
app.post('/api/login', loginLimiter, async (req, res) => {
  const { accountName, email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password required' });
  }
  const db = getAdminClient();
  if (!db) {
    return res.status(500).json({ success: false, error: 'Database not configured on the server' });
  }

  try {
    // Case-insensitive account + email match, scoped in SQL — never load all users
    const { data: candidates, error } = await db
      .from('users')
      .select('*')
      .ilike('account_id', (accountName || '').trim())
      .ilike('email', email.trim());
    if (error) throw error;

    const found = (candidates || [])[0];
    const check = found ? verifyPassword(password, found.password) : { ok: false };
    if (!found || !check.ok) {
      return res.status(401).json({ success: false, error: 'Invalid Account Name, Email, or Password.' });
    }

    // Migrate legacy simpleHash rows to scrypt on first successful login
    if (check.needsRehash) {
      const { error: rehashErr } = await db
        .from('users')
        .update({ password: hashPassword(password) })
        .eq('id', found.id);
      if (rehashErr) console.warn('[Auth] Failed to rehash legacy password:', rehashErr.message);
    }

    const user = sessionClaims(found);
    setAuthCookie(res, signSession(found));
    return res.json({ success: true, user });
  } catch (err) {
    console.error('[Auth] login error:', err);
    return res.status(500).json({ success: false, error: 'Login failed. Please try again.' });
  }
});

// POST /api/register — creates the account (tenant) if needed + the user.
// Unauthenticated: public signup, starts a session for the new user.
// Authenticated: team-member/account creation — the caller's session is kept,
// and non-platform-admins may only create users inside their own tenant.
app.post('/api/register', registerLimiter, async (req, res) => {
  const { restaurantName, name, email, password, phone, role } = req.body || {};
  const session = readSession(req);
  const targetTenant = restaurantName || session?.accountId;
  if (!targetTenant || !name || !email || !password) {
    return res.status(400).json({ success: false, error: 'Restaurant name, your name, email and password are required' });
  }
  if (session && targetTenant !== session.accountId && !isPlatformAdmin(session)) {
    return res.status(403).json({ success: false, error: 'Cannot create users in another account' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
  }
  const db = getAdminClient();
  if (!db) {
    return res.status(500).json({ success: false, error: 'Database not configured on the server' });
  }

  try {
    const tenant = String(targetTenant).trim();

    const { data: existing, error: existErr } = await db
      .from('users').select('id').ilike('email', email.trim()).limit(1);
    if (existErr) throw existErr;
    if (existing && existing.length > 0) {
      return res.status(409).json({ success: false, error: 'An account with this email already exists.' });
    }

    await ensureAccount(tenant);

    const { data: tenantUsers } = await db
      .from('users').select('id').eq('account_id', tenant).limit(1);
    const isFirstUser = !tenantUsers || tenantUsers.length === 0;

    const userRow = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      account_id: tenant,
      name: String(name).trim(),
      email: email.trim(),
      password: hashPassword(password),
      role: isFirstUser ? 'Owner' : (role || 'Cashier'),
      avatar: String(name).trim().charAt(0).toUpperCase(),
      phone: phone || '',
      created_at: new Date().toISOString(),
    };
    const { error: insertErr } = await db.from('users').insert(userRow);
    if (insertErr) throw insertErr;

    const user = sessionClaims(userRow);
    // Only start a session for self-signup — never clobber an admin's session
    if (!session) {
      setAuthCookie(res, signSession(userRow));
    }
    return res.json({ success: true, user });
  } catch (err) {
    console.error('[Auth] register error:', err);
    return res.status(500).json({ success: false, error: 'Registration failed. Please try again.' });
  }
});

// GET /api/session
app.get('/api/session', (req, res) => {
  const session = readSession(req);
  if (!session) {
    res.clearCookie(AUTH_COOKIE, { path: '/' });
    return res.status(401).json({ success: false, error: 'No active session' });
  }
  return res.json({ success: true, user: session });
});

// POST /api/logout
app.post('/api/logout', (req, res) => {
  res.clearCookie(AUTH_COOKIE, { path: '/' });
  return res.json({ success: true });
});

// POST /api/reset-password
app.post('/api/reset-password', resetPasswordLimiter, async (req, res) => {
  return res.json({ success: true, message: 'Password reset instructions have been sent (if implemented)' });
});

// Export the Express app for Vercel Serverless
export default app;
