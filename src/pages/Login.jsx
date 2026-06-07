import React, { useState } from 'react';
import { useAuth } from '../db/AuthContext';
import { ChefHat, Eye, EyeOff, ArrowRight, Loader } from 'lucide-react';

const Login = () => {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: 'admin@kitchgoo.in', password: 'admin123' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      setError('Please fill in all fields.');
      return;
    }
    setLoading(true);
    setError('');
    // Small delay for UX
    setTimeout(() => {
      const result = login(form.email, form.password);
      setLoading(false);
      if (!result.success) setError(result.error);
    }, 600);
  };

  const inputStyle = {
    width: '100%', padding: '12px 14px', borderRadius: '12px',
    border: '1.5px solid rgba(255,255,255,0.6)',
    background: 'rgba(255,255,255,0.55)', backdropFilter: 'blur(10px)',
    fontSize: '0.9rem', color: 'var(--text-primary)',
    outline: 'none', transition: 'border-color 0.2s',
    fontFamily: 'inherit',
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 20% 50%, rgba(216,180,254,0.35) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(196,181,253,0.3) 0%, transparent 55%), radial-gradient(ellipse at 60% 80%, rgba(147,197,253,0.25) 0%, transparent 50%), linear-gradient(135deg, #f8f0ff 0%, #ede9fe 50%, #dbeafe 100%)',
      fontFamily: "'Inter', sans-serif",
      padding: '20px',
    }}>
      <div style={{
        width: '100%', maxWidth: '420px',
        background: 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(32px)',
        borderRadius: '28px',
        border: '1.5px solid rgba(255,255,255,0.85)',
        boxShadow: '0 20px 80px rgba(124,58,237,0.12), 0 4px 24px rgba(0,0,0,0.06)',
        padding: '36px 32px 32px',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '28px' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '18px',
            background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(124,58,237,0.4)',
            marginBottom: '12px',
          }}>
            <ChefHat size={28} color="white" />
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Kitchgoo
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Sign in to your restaurant dashboard
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Email */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Email Address
            </label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              style={inputStyle}
              placeholder="you@restaurant.com"
              autoFocus
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                style={{ ...inputStyle, paddingRight: '44px' }}
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.82rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ⚠ {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '13px', borderRadius: '14px', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
              color: 'white', fontWeight: 700, fontSize: '0.95rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              boxShadow: '0 4px 16px rgba(124,58,237,0.35)',
              opacity: loading ? 0.8 : 1, transition: 'all 0.2s',
            }}
          >
            {loading ? <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <>Sign In <ArrowRight size={18} /></>}
          </button>
        </form>

        {/* Demo credentials hint */}
        <div style={{ marginTop: '20px', padding: '12px 14px', background: 'rgba(124,58,237,0.06)', borderRadius: '12px', border: '1px dashed rgba(124,58,237,0.25)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px' }}>DEMO CREDENTIALS</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Email: <strong>admin@kitchgoo.in</strong></div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Password: <strong>admin123</strong></div>
        </div>
      </div>
    </div>
  );
};

export default Login;
