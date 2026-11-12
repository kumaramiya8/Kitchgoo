import React, { useState } from 'react';
import { useAuth } from '../db/AuthContext';
import { ChefHat, Eye, EyeOff, ArrowRight, Loader, AlertCircle } from 'lucide-react';

const Login = () => {
  const { login } = useAuth();
  const [form, setForm] = useState({ accountName: 'Kitchgoo', email: 'admin@kitchgoo.in', password: 'admin123' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.accountName || !form.email || !form.password) {
      setError('Please fill in all fields.');
      return;
    }
    setLoading(true);
    setError('');
    // Small delay for UX
    setTimeout(async () => {
      const result = await login(form.accountName, form.email, form.password);
      setLoading(false);
      if (!result.success) setError(result.error);
    }, 600);
  };

  const inputStyle = {
    width: '100%', padding: '12px 14px', borderRadius: '9px',
    border: '1px solid var(--border, #e2e6e0)',
    background: '#ffffff',
    fontSize: '0.9rem', color: '#1c2420',
    outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s',
    fontFamily: 'inherit',
  };

  const labelStyle = {
    display: 'block', fontSize: '0.8rem', fontWeight: 600,
    color: '#1c2420', marginBottom: '6px',
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f1f3ef',
      fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
      padding: '20px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Animated brand-tuned bubble backdrop (pine / brass / porcelain) */}
      <div className="bubble-bg" aria-hidden="true">
        <span /><span /><span /><span />
      </div>

      {/* The rail */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: '3px',
        background: 'linear-gradient(90deg, #1e5e4a 0%, #1e5e4a 62%, #b77e23 100%)',
        zIndex: 2,
      }} />

      <div style={{
        zIndex: 1,
        width: '100%', maxWidth: '410px',
        background: '#ffffff',
        borderRadius: '16px',
        border: '1px solid #e2e6e0',
        boxShadow: '0 12px 32px rgba(28,36,32,0.1)',
        padding: '36px 32px 32px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Brass clip on the card, like a chit on the rail */}
        <div style={{
          position: 'absolute', top: 0, left: '32px', width: '28px', height: '3px',
          borderRadius: '0 0 3px 3px', background: '#b77e23',
        }} />

        {/* Brand */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '28px' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '12px',
            background: '#1e5e4a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: '14px',
          }}>
            <ChefHat size={28} color="white" />
          </div>
          <h1 style={{ fontFamily: "'Young Serif', Georgia, serif", fontSize: '1.5rem', fontWeight: 400, color: '#1c2420' }}>
            Kitchgoo
          </h1>
          <p style={{ fontSize: '0.84rem', color: '#87938c', marginTop: '4px' }}>
            Sign in to run your restaurant
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Account Name */}
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Account Name</label>
            <input
              type="text"
              value={form.accountName}
              onChange={e => setForm(f => ({ ...f, accountName: e.target.value }))}
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = '#1e5e4a'; e.target.style.boxShadow = '0 0 0 3px rgba(30,94,74,0.1)'; }}
              onBlur={e => { e.target.style.borderColor = '#e2e6e0'; e.target.style.boxShadow = 'none'; }}
              placeholder="e.g. Kitchgoo, Kiko Cafe"
              autoFocus
            />
          </div>

          {/* Email */}
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Email Address</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = '#1e5e4a'; e.target.style.boxShadow = '0 0 0 3px rgba(30,94,74,0.1)'; }}
              onBlur={e => { e.target.style.borderColor = '#e2e6e0'; e.target.style.boxShadow = 'none'; }}
              placeholder="you@restaurant.com"
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                style={{ ...inputStyle, paddingRight: '44px' }}
                onFocus={e => { e.target.style.borderColor = '#1e5e4a'; e.target.style.boxShadow = '0 0 0 3px rgba(30,94,74,0.1)'; }}
                onBlur={e => { e.target.style.borderColor = '#e2e6e0'; e.target.style.boxShadow = 'none'; }}
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#87938c' }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '9px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.82rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={15} style={{ flexShrink: 0 }} /> {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '13px', borderRadius: '9px', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              background: '#1e5e4a',
              color: 'white', fontWeight: 700, fontSize: '0.95rem', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              opacity: loading ? 0.8 : 1, transition: 'background 0.2s, opacity 0.2s',
            }}
            onMouseOver={e => { if (!loading) e.currentTarget.style.background = '#174b3b'; }}
            onMouseOut={e => { e.currentTarget.style.background = '#1e5e4a'; }}
          >
            {loading ? <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <>Sign in <ArrowRight size={18} /></>}
          </button>
        </form>

      </div>
    </div>
  );
};

export default Login;
