import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

const app = express();

// Supabase client (Server Side)
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY; 
let supabase;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_kitchgoo_key_replace_in_prod';

// Middleware
app.use(cors({ origin: process.env.NODE_ENV === 'production' ? true : 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Simple hash function
const simpleHash = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash.toString(16);
};

// Trust proxy for rate limiter (required for Vercel)
app.set('trust proxy', 1);

// Rate Limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many login attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

const resetPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Too many password reset requests, please try again later' },
});

// Helper: Fetch all users from Supabase or Fallback
async function fetchAllUsers() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.from('users').select('*');
    if (error) {
      console.error('[Server] Error fetching users from Supabase:', error);
      return [];
    }
    // Return users mapped to camelCase since the frontend expects camelCase 
    // for password checking, or keep it snake_case? 
    // Wait, the client-side legacy checked `u.restaurantName` and `u.password`.
    // The table has `restaurant_name` (or wait, it has `account_id` which becomes `restaurantName` in frontend).
    // Let's return the raw data and map account_id to restaurantName.
    return data.map(row => ({ ...row, restaurantName: row.account_id })) || [];
  } catch (err) {
    console.error('[Server] Exception fetching users:', err);
    return [];
  }
}

// ── Endpoints ──

// POST /api/login
app.post('/api/login', loginLimiter, async (req, res) => {
  const { accountName, email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password required' });
  }

  const users = await fetchAllUsers();
  const hashedPassword = simpleHash(password);

  const foundUser = users.find(u =>
    (u.restaurantName || '').toLowerCase() === (accountName || '').trim().toLowerCase() &&
    u.email.toLowerCase() === email.toLowerCase() &&
    u.password === hashedPassword
  );

  if (!foundUser) {
    return res.status(401).json({ success: false, error: 'Invalid Account Name, Email, or Password.' });
  }

  const sessionUser = { ...foundUser };
  delete sessionUser.password;

  const token = jwt.sign(sessionUser, JWT_SECRET, { expiresIn: '7d' });

  res.cookie('kitchgoo_auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });

  return res.json({ success: true, user: sessionUser });
});

// GET /api/session
app.get('/api/session', (req, res) => {
  const token = req.cookies.kitchgoo_auth_token;
  if (!token) {
    return res.status(401).json({ success: false, error: 'No active session' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return res.json({ success: true, user: decoded });
  } catch (err) {
    res.clearCookie('kitchgoo_auth_token', { path: '/' });
    return res.status(401).json({ success: false, error: 'Session expired' });
  }
});

// POST /api/logout
app.post('/api/logout', (req, res) => {
  res.clearCookie('kitchgoo_auth_token', { path: '/' });
  return res.json({ success: true });
});

// POST /api/reset-password
app.post('/api/reset-password', resetPasswordLimiter, async (req, res) => {
  return res.json({ success: true, message: 'Password reset instructions have been sent (if implemented)' });
});

// Export the Express app for Vercel Serverless
export default app;
