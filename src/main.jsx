import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AppProvider } from './db/AppContext.jsx'
import { AuthProvider } from './db/AuthContext.jsx'
import { initDB } from './db/database.js'
import { isConfigured } from './lib/supabase.js'
import './index.css'

// ── Setup screen shown when .env credentials are missing ──────
const SetupScreen = () => (
  <div style={{
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg, #f8f0ff 0%, #ede9fe 50%, #dbeafe 100%)',
    fontFamily: "'Inter', sans-serif", padding: '24px',
  }}>
    <div style={{
      maxWidth: 520, width: '100%', background: 'white', borderRadius: 24,
      padding: '36px 32px', boxShadow: '0 20px 60px rgba(124,58,237,0.12)',
      border: '1.5px solid rgba(124,58,237,0.15)',
    }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🗄️</div>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e1b4b', marginBottom: 8 }}>
        Database setup required
      </h1>
      <p style={{ fontSize: '0.88rem', color: '#6b7280', marginBottom: 24, lineHeight: 1.6 }}>
        Kitchgoo needs a Supabase database to store data across devices.
        Follow these steps to connect it:
      </p>
      <ol style={{ paddingLeft: 20, fontSize: '0.88rem', color: '#374151', lineHeight: 2 }}>
        <li>Go to <strong>supabase.com</strong> and create a free project</li>
        <li>Open <strong>SQL Editor</strong> and run the contents of <code style={{ background: '#f3f4f6', padding: '1px 6px', borderRadius: 4 }}>supabase-schema.sql</code></li>
        <li>Go to <strong>Project Settings → API</strong> and copy your URL &amp; anon key</li>
        <li>Create a <code style={{ background: '#f3f4f6', padding: '1px 6px', borderRadius: 4 }}>.env</code> file in the project root:</li>
      </ol>
      <pre style={{
        background: '#1e1b4b', color: '#c4b5fd', borderRadius: 12, padding: '14px 18px',
        fontSize: '0.8rem', margin: '16px 0', overflowX: 'auto', lineHeight: 1.8,
      }}>{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here`}</pre>
      <p style={{ fontSize: '0.82rem', color: '#6b7280' }}>
        Then restart the dev server with <code style={{ background: '#f3f4f6', padding: '1px 6px', borderRadius: 4 }}>npm run dev</code>.
      </p>
    </div>
  </div>
)

// ── Boot ──────────────────────────────────────────────────────
if (!isConfigured) {
  // Show setup screen immediately — no DB calls needed
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode><SetupScreen /></React.StrictMode>
  )
} else {
  // Load all data from Supabase into the in-memory cache before rendering
  initDB()
    .catch(err => console.error('[Kitchgoo] Database init failed:', err))
    .finally(() => {
      ReactDOM.createRoot(document.getElementById('root')).render(
        <React.StrictMode>
          <BrowserRouter>
            <AuthProvider>
              <AppProvider>
                <App />
              </AppProvider>
            </AuthProvider>
          </BrowserRouter>
        </React.StrictMode>,
      )
    })
}
