/**
 * Realtime-only Supabase client.
 *
 * The browser no longer queries tables with this client — all data access
 * goes through the backend API (/api/data, /api/public). This client exists
 * solely to subscribe to broadcast channels for live sync signals; the anon
 * key is safe to ship because RLS denies it all table access
 * (see supabase-rls.sql).
 */
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const isDemo = typeof window !== 'undefined' && window.localStorage.getItem('kitchgoo_demo_mode') === 'true'

export const isConfigured = Boolean((supabaseUrl && supabaseAnonKey) || isDemo)

// Only create the client when credentials are present — createClient throws on empty strings
export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null
