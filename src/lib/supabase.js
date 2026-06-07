import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const isDemo = typeof window !== 'undefined' && window.localStorage.getItem('kitchgoo_demo_mode') === 'true'

export const isConfigured = Boolean((supabaseUrl && supabaseAnonKey) || isDemo)

// Only create the client when credentials are present — createClient throws on empty strings
export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null
