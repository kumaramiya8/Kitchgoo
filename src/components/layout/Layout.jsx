import React, { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import BottomNav from './BottomNav';
import { useAuth } from '../../db/AuthContext';
import { useApp } from '../../db/AppContext';
import { useNavigate } from 'react-router-dom';
import { Eye, LogOut, ChefHat, X } from 'lucide-react';

/* ── Inject keyframes once ──────────────────────────────── */
const LAYOUT_STYLE_ID = 'layout-order-toast-kf';
if (typeof document !== 'undefined' && !document.getElementById(LAYOUT_STYLE_ID)) {
  const s = document.createElement('style');
  s.id = LAYOUT_STYLE_ID;
  s.textContent = `
    @keyframes toastSlideIn  { from { opacity:0; transform:translateX(110%) } to { opacity:1; transform:translateX(0) } }
    @keyframes toastSlideOut { from { opacity:1; transform:translateX(0) }   to { opacity:0; transform:translateX(110%) } }
  `;
  document.head.appendChild(s);
}

/* ── Synthesised chime — no external network request ───── */
let _audioCtx = null;
function playOrderChime() {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    const ctx = _audioCtx;
    const t = ctx.currentTime;
    [[880, 0], [1100, 0.18], [1320, 0.36]].forEach(([freq, delay]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.35, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.55);
      osc.start(t + delay); osc.stop(t + delay + 0.6);
    });
  } catch { /* audio blocked — silent fail */ }
}

const Layout = ({ children, title }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orderToast, setOrderToast] = useState(null); // { tableId, orderId, leaving }
  const toastTimerRef = useRef(null);
  const { user, stopImpersonating } = useAuth();
  const { reload } = useApp();
  const navigate = useNavigate();

  const dismissToast = useCallback(() => {
    setOrderToast(t => t ? { ...t, leaving: true } : null);
    setTimeout(() => setOrderToast(null), 320);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      playOrderChime();
      const detail = e.detail || {};
      setOrderToast({ tableId: detail.tableId, orderId: detail.kdsOrderId, leaving: false });
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(dismissToast, 5000);
    };
    window.addEventListener('kitchgoo_order_created', handler);
    return () => {
      window.removeEventListener('kitchgoo_order_created', handler);
      clearTimeout(toastTimerRef.current);
    };
  }, [dismissToast]);

  // Create AudioContext on first user gesture so subsequent chimes play instantly
  useEffect(() => {
    const warmCtx = () => {
      try { if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
    };
    window.addEventListener('pointerdown', warmCtx, { once: true });
    return () => window.removeEventListener('pointerdown', warmCtx);
  }, []);

  const handleExitImpersonation = () => {
    stopImpersonating();
    reload();
    navigate('/');
  };

  const isImpersonated = user?.isImpersonated === true;

  return (
    <div className="app-container" style={isImpersonated ? { paddingTop: '44px' } : {}}>
      {isImpersonated && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '44px',
          background: 'linear-gradient(90deg, #1e5e4a, #2e7d5b)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          zIndex: 10000,
          fontSize: '0.84rem',
          fontWeight: 600,
          boxShadow: '0 4px 12px rgba(30, 94, 74,0.25)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Eye size={16} />
            <span>Currently managing <strong style={{ textDecoration: 'underline' }}>{user.restaurantName}</strong> as Platform Admin</span>
          </div>
          <button 
            onClick={handleExitImpersonation}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: '1.5px solid rgba(255, 255, 255, 0.4)',
              borderRadius: '8px',
              padding: '4px 12px',
              color: 'white',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s',
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.35)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
          >
            <LogOut size={13} /> Exit Account
          </button>
        </div>
      )}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {sidebarOpen && (
        <div 
          className="sidebar-backdrop" 
          onClick={() => setSidebarOpen(false)} 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(4px)',
            zIndex: 998,
            transition: 'opacity 0.2s ease',
          }}
        />
      )}
      <main className="main-content">
        <Header title={title} onMenuClick={() => setSidebarOpen(true)} />
        <div className="page-body">
          {children}
        </div>
      </main>
      <BottomNav onMoreClick={() => setSidebarOpen(true)} />

      {/* ── Global order-arrival toast ──────────────────── */}
      {orderToast && (
        <div
          onClick={dismissToast}
          style={{
            position: 'fixed', bottom: 80, right: 18, zIndex: 99999,
            background: '#1e5e4a', color: '#fff',
            borderRadius: 14, padding: '13px 16px 13px 14px',
            display: 'flex', alignItems: 'center', gap: 11,
            boxShadow: '0 8px 32px rgba(30,94,74,0.45)',
            border: '1.5px solid rgba(201,168,76,0.5)',
            minWidth: 230, maxWidth: 300, cursor: 'pointer',
            animation: `${orderToast.leaving ? 'toastSlideOut' : 'toastSlideIn'} 0.32s ease forwards`,
          }}
        >
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: 'rgba(201,168,76,0.2)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <ChefHat size={18} color="#c9a84c" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', lineHeight: 1.2 }}>New Order!</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.75, marginTop: 2 }}>
              {orderToast.tableId ? `Table ${orderToast.tableId} • ` : ''}Sent to kitchen
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); dismissToast(); }}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: 2 }}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

export default Layout;
