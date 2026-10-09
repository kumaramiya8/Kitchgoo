import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Monitor, Clock, CheckCircle, AlertTriangle, Bell, RotateCcw,
  ChefHat, Flame, X, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, ArrowRightLeft,
  CornerDownLeft, Eye, BarChart3, ListChecks, Grid3X3, Utensils,
  Wine, IceCream, Salad, BookOpen, Keyboard, ChevronDown, ChevronUp,
  Timer, TrendingUp, Hash, Zap, User
} from 'lucide-react';
import { useApp } from '../db/AppContext';
import { todayLocalStr, localDayStr } from '../../shared/dates';

/* ── helpers ───────────────────────────────────────────── */
const STATIONS = ['All', 'Grill', 'Main Kitchen', 'Tandoor', 'Bar', 'Dessert', 'Pantry'];
const STATION_ICONS = {
  All: Grid3X3, Grill: Flame, 'Main Kitchen': ChefHat, Tandoor: Flame,
  Bar: Wine, Dessert: IceCream, Pantry: Salad,
};
const VIEW_MODES = [
  { key: 'tickets', label: 'Tickets View', icon: Grid3X3 },
  { key: 'expo', label: 'Expo Console', icon: ListChecks },
  { key: 'allday', label: 'All-Day Display', icon: BarChart3 },
];

const elapsed = (iso) => {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
};

const fmtTime = (secs) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const timeAgo = (iso) => {
  if (!iso) return '—';
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
};

const timerColor = (secs) => {
  if (secs < 300) return 'var(--success)';
  if (secs < 600) return 'var(--warning)';
  return 'var(--danger)';
};

const borderColor = (secs, prepTime = 600) => {
  const ratio = secs / prepTime;
  if (ratio < 0.7) return 'var(--success)';
  if (ratio < 1.0) return 'var(--warning)';
  return 'var(--danger)';
};

const ORDER_TYPE_COLORS = {
  'dine-in': { bg: 'rgba(30, 94, 74,0.18)', text: '#1e5e4a' },
  'takeaway': { bg: 'rgba(59,130,246,0.18)', text: '#3b82f6' },
  'delivery': { bg: 'rgba(245,158,11,0.18)', text: '#f59e0b' },
  'online': { bg: 'rgba(34,197,94,0.18)', text: '#22c55e' },
};

/* ── Flashing allergen keyframes (injected once) ─────── */
const STYLE_ID = 'kds-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes kds-flash { 0%,100%{opacity:1} 50%{opacity:0.3} }
    @keyframes kds-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.5)} 50%{box-shadow:0 0 16px 4px rgba(239,68,68,0.35)} }
    @keyframes kds-bell-shake { 0%{transform:rotate(0)} 15%{transform:rotate(12deg)} 30%{transform:rotate(-10deg)} 45%{transform:rotate(6deg)} 60%{transform:rotate(-4deg)} 75%{transform:rotate(2deg)} 100%{transform:rotate(0)} }
  `;
  document.head.appendChild(style);
}

/* ── Shared inline style fragments ─────────────────────── */
const s = {
  page: (mob) => ({
    padding: mob ? '0 0 24px 0' : '8px 12px', minHeight: mob ? 'auto' : '100%',
    width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box', overflowX: 'hidden',
  }),
  statsBar: (mob) => mob ? {
    display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6,
    marginBottom: 10, width: '100%', boxSizing: 'border-box',
  } : {
    display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap',
  },
  statBox: (mob) => mob ? {
    background: 'var(--card-bg)', borderRadius: 'var(--r-md)',
    padding: '7px 4px', boxShadow: 'var(--shadow-card)', border: '1px solid var(--border-subtle)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 2,
    minWidth: 0, boxSizing: 'border-box',
  } : {
    flex: '1 1 160px', background: 'var(--card-bg)',
    borderRadius: 'var(--r-lg)', padding: '14px 18px', boxShadow: 'var(--shadow-card)',
    border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12,
  },
  statIcon: (mob) => ({
    width: mob ? 24 : 42, height: mob ? 24 : 42, borderRadius: 'var(--r-md)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  }),
  tabs: (scroll) => scroll ? {
    display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none',
    WebkitOverflowScrolling: 'touch', flexShrink: 0,
  } : {
    display: 'flex', gap: 6, flexWrap: 'wrap',
  },
  tab: (active) => ({
    padding: '8px 16px', borderRadius: 'var(--r-md)', cursor: 'pointer',
    fontWeight: 600, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6,
    background: active ? 'var(--primary)' : 'var(--card-bg)',
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
    border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
    transition: 'all .15s', flexShrink: 0,
  }),
  viewTab: (active, mob) => ({
    padding: mob ? '8px 10px' : '8px 18px', borderRadius: 'var(--r-md)', cursor: 'pointer',
    fontWeight: 600, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 5,
    background: active ? 'var(--accent-blue)' : 'var(--card-bg)',
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
    border: active ? '1px solid var(--accent-blue)' : '1px solid var(--border)',
    transition: 'all .15s', flexShrink: 0,
  }),
  grid: (mob) => ({
    display: 'grid',
    gridTemplateColumns: mob ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: mob ? 12 : 16, marginTop: mob ? 8 : 16,
    width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box'
  }),
  card: (borderCol, overdue, mob) => ({
    background: 'var(--card-bg)', borderRadius: 'var(--r-xl)',
    border: '1px solid var(--border)', borderTop: `4px solid ${borderCol}`,
    padding: 0, overflow: 'hidden', color: 'var(--text-primary)',
    boxShadow: 'var(--shadow-card)',
    animation: overdue ? 'kds-pulse 1.5s infinite' : 'none',
    transition: 'border-color .3s, box-shadow .3s, transform var(--t-fast)',
    width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box',
  }),
  cardHeader: (mob) => ({
    padding: mob ? '10px 12px' : '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    borderBottom: '1px solid var(--border-subtle)',
    boxSizing: 'border-box',
  }),
  cardBody: (mob) => ({
    padding: mob ? '8px 12px 12px' : '10px 16px 14px',
    boxSizing: 'border-box',
  }),
  itemRow: (mob) => ({
    display: 'flex', alignItems: 'center', gap: 10,
    padding: mob ? '10px 4px' : '6px 0',
    borderBottom: '1px solid var(--border-subtle)',
    fontSize: mob ? '0.92rem' : '0.95rem',
    minHeight: mob ? 44 : 34,
    boxSizing: 'border-box',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  }),
  checkbox: (checked, mob) => ({
    width: mob ? 24 : 22, height: mob ? 24 : 22, borderRadius: 6,
    border: `2px solid ${checked ? 'var(--success)' : 'var(--border)'}`,
    background: checked ? 'var(--success)' : 'transparent', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .1s',
  }),
  bumpBtn: (mob) => ({
    width: '100%', padding: mob ? '13px 16px' : '12px', minHeight: mob ? 48 : 42,
    border: 'none', borderRadius: '0 0 var(--r-xl) var(--r-xl)',
    background: 'var(--success)', color: '#fff', fontWeight: 800,
    fontSize: mob ? '0.98rem' : '1.05rem',
    cursor: 'pointer', letterSpacing: '0.06em', transition: 'background .15s',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    boxSizing: 'border-box',
  }),
  allergenBanner: {
    background: 'var(--danger-light)', color: '#dc2626', padding: '6px 14px',
    fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6,
    animation: 'kds-flash 1s infinite', borderBottom: '1px solid rgba(239,68,68,0.25)',
  },
  badge: (bg, text) => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 'var(--r-sm)',
    fontSize: '0.72rem', fontWeight: 700, background: bg, color: text, letterSpacing: '0.03em',
  }),
  modal: {
    position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(17, 22, 19, 0.45)',
  },
  modalContent: {
    background: 'var(--modal-bg)', borderRadius: 'var(--r-2xl)', padding: '24px 28px',
    maxWidth: 520, width: '90%', color: 'var(--text-primary)', border: '1px solid var(--border)',
    boxShadow: 'var(--shadow-lg)', maxHeight: '80vh', overflowY: 'auto',
    transformOrigin: 'top center', animation: 'dialogIn 0.32s var(--ease-spring) forwards',
  },
  kbd: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '2px 7px', borderRadius: 4, background: 'var(--primary-light)',
    border: '1px solid var(--border)', fontSize: '0.72rem', fontWeight: 600,
    color: 'var(--text-secondary)', minWidth: 22, fontFamily: 'var(--font-mono)',
  },
};

/* ── Recipe Modal ──────────────────────────────────────── */
const RecipeModal = ({ item, recipes, menu, onClose, isMobile }) => {
  const menuItem = menu.find(m => m.name === item?.name);
  const recipe = recipes.find(r => r.menuItemId === menuItem?.id || r.name === item?.name);

  return (
    <div style={s.modal} onClick={onClose}>
      <div style={{ ...s.modalContent, width: isMobile ? '95%' : '90%', padding: isMobile ? '16px 14px' : '24px 28px' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>
            <BookOpen size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            {item?.name}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>
        {recipe ? (
          <>
            {recipe.prepTime && (
              <div style={{ marginBottom: 12, fontSize: '0.85rem', color: 'var(--warning)' }}>
                <Timer size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Prep: {recipe.prepTime} min
              </div>
            )}
            <div style={{ marginBottom: 14 }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '0.9rem', color: 'var(--accent-blue)' }}>Ingredients</h4>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.85rem', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                {(recipe.ingredients || []).map((ing, i) => (
                  <li key={i}>{typeof ing === 'string' ? ing : `${ing.name} - ${ing.qty} ${ing.unit || ''}`}</li>
                ))}
                {(!recipe.ingredients || recipe.ingredients.length === 0) && <li>No ingredients listed</li>}
              </ul>
            </div>
            <div style={{ marginBottom: 14 }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '0.9rem', color: 'var(--success)' }}>Instructions</h4>
              <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.7, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                {recipe.instructions || recipe.steps || 'No instructions available.'}
              </p>
            </div>
            {recipe.plating && (
              <div>
                <h4 style={{ margin: '0 0 8px', fontSize: '0.9rem', color: 'var(--primary)' }}>Plating</h4>
                <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.7, color: 'var(--text-secondary)' }}>{recipe.plating}</p>
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
            <Utensils size={36} style={{ marginBottom: 10, opacity: 0.4 }} />
            <p style={{ margin: 0, fontSize: '0.9rem' }}>No recipe found for this item.</p>
            {menuItem?.category && <p style={{ margin: '6px 0 0', fontSize: '0.8rem' }}>Category: {menuItem.category}</p>}
          </div>
        )}
        {item?.allergens?.length > 0 && (
          <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 'var(--r-md)', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#dc2626' }}>
              <AlertTriangle size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              ALLERGENS: {item.allergens.join(', ')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Recall Panel ──────────────────────────────────────── */
const RecallPanel = ({ tickets, onRecall, onClose, getTicketGuestName, isMobile }) => {
  const completed = tickets
    .filter(t => t.status === 'completed')
    .sort((a, b) => new Date(b.firedAt) - new Date(a.firedAt))
    .slice(0, 10);

  return (
    <div style={s.modal} onClick={onClose}>
      <div style={{ ...s.modalContent, maxWidth: 600, width: isMobile ? '95%' : '90%', padding: isMobile ? '16px 14px' : '24px 28px' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
            <RotateCcw size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Recall Completed Tickets
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>
        {completed.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>No completed tickets to recall.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {completed.map(t => {
              const ot = ORDER_TYPE_COLORS[t.orderType] || ORDER_TYPE_COLORS['dine-in'];
              const guestName = getTicketGuestName ? getTicketGuestName(t) : (t.guestName && t.guestName !== 'Walk-in Guest' ? t.guestName : null);
              // When was it bumped? Use the latest item bump time, else fired time.
              const bumpTimes = (t.items || []).map(i => i.bumpedAt).filter(Boolean);
              const doneAt = bumpTimes.length ? new Date(Math.max(...bumpTimes.map(x => new Date(x)))) : null;
              const prepSecs = doneAt && t.firedAt ? Math.floor((doneAt - new Date(t.firedAt)) / 1000) : null;
              return (
                <div key={t.id} style={{
                  padding: '12px 14px', borderRadius: 'var(--r-md)',
                  background: 'var(--card-bg)', border: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
                      <span style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                        <Hash size={13} style={{ verticalAlign: 'middle' }} />{t.orderId}
                      </span>
                      <span style={s.badge(ot.bg, ot.text)}>{(t.orderType || 'dine-in').toUpperCase()}</span>
                      {t.tableId && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Table {t.tableId}</span>}
                      {guestName && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          fontSize: '0.78rem', color: 'var(--accent-blue)', fontWeight: 700,
                          background: 'rgba(59,130,246,0.12)', padding: '1px 6px', borderRadius: 4,
                          border: '1px solid rgba(59, 130, 246, 0.25)',
                        }} title={`Guest: ${guestName}`}>
                          <User size={11} style={{ flexShrink: 0 }} /> {guestName}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => onRecall(t.id)}
                      style={{
                        padding: '6px 14px', borderRadius: 'var(--r-sm)', border: 'none',
                        background: 'var(--warning)', color: '#1a1a2e', fontWeight: 700,
                        fontSize: '0.78rem', cursor: 'pointer', letterSpacing: '0.04em', flexShrink: 0,
                      }}
                    >
                      RECALL
                    </button>
                  </div>
                  {/* Items that were made */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {(t.items || []).map((item, i) => (
                      <span key={i} style={{
                        fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--r-sm)',
                        background: 'var(--border-subtle)', color: 'var(--text-secondary)',
                      }}>
                        {item.name} <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>×{item.qty || 1}</span>
                      </span>
                    ))}
                  </div>
                  {/* Timing */}
                  <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    <span><Timer size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />Fired {timeAgo(t.firedAt)}</span>
                    {prepSecs != null && (
                      <span><CheckCircle size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />Done in {fmtTime(prepSecs)}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Main KDS Component ────────────────────────────────── */
export default function KDS() {
  const { kdsTickets, orders, menu, settings, recipes, bumpKDSItemAction, bumpKDSTicketAction, recallKDSTicketAction, posTables, posSavedOrders, reload } = useApp();

  const [station, setStation] = useState('All');
  const [viewMode, setViewMode] = useState('tickets');
  const [tick, setTick] = useState(0);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [showRecall, setShowRecall] = useState(false);
  const [recipeItem, setRecipeItem] = useState(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [newTicketCount, setNewTicketCount] = useState(0);
  const prevTicketCountRef = useRef(0);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Reload on new order — sound + toast handled globally by Layout
  useEffect(() => {
    const handler = () => reload(true);
    window.addEventListener('kitchgoo_order_created', handler);
    return () => window.removeEventListener('kitchgoo_order_created', handler);
  }, [reload]);

  // Auto-refresh every second
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // No longer polling every 60 seconds since we have realtime websockets
  // The database triggers postgres_changes and broadcast events.

  // Track new tickets
  useEffect(() => {
    const activeCount = kdsTickets.filter(t => t.status === 'active').length;
    if (activeCount > prevTicketCountRef.current) {
      setNewTicketCount(c => c + (activeCount - prevTicketCountRef.current));
    }
    prevTicketCountRef.current = activeCount;
  }, [kdsTickets]);

  const isPaymentPending = (ticket) => {
    if (ticket.isPaid) return false;
    if (ticket.tableId && String(ticket.tableId).startsWith('tab_')) {
      // Unassigned floating tab: pending if tab is still open in posSavedOrders
      return Boolean(posSavedOrders && posSavedOrders[ticket.tableId]);
    }
    if (ticket.tableId && (!ticket.orderType || ticket.orderType === 'dine-in')) {
      const table = (posTables || []).find(t => String(t.id) === String(ticket.tableId) || String(t.number) === String(ticket.tableId));
      if (table && table.status !== 'available') {
        return true;
      }
    }
    return false;
  };

  const ticketMatchesStation = useCallback((t) => {
    if (station === 'All') return true;
    const tStation = (t.station || 'all').toLowerCase();
    return tStation === 'all' || tStation === station.toLowerCase() ||
      (t.items || []).some(i => (i.station || '').toLowerCase() === station.toLowerCase());
  }, [station]);

  // Filter tickets
  const activeTickets = useMemo(() => {
    return (kdsTickets || [])
      .filter(t => t.status === 'active')
      .filter(ticketMatchesStation)
      .sort((a, b) => new Date(a.firedAt || a.createdAt) - new Date(b.firedAt || b.createdAt));
  }, [kdsTickets, ticketMatchesStation]);

  const orderMap = useMemo(() => {
    const map = new Map();
    (orders || []).forEach(o => {
      if (o.id) map.set(o.id, o);
      if (o.billNo) map.set(o.billNo, o);
    });
    return map;
  }, [orders]);

  // Helper to resolve guest name for a ticket across ticket, order, table, or tab
  const getTicketGuestName = useCallback((ticket) => {
    if (!ticket) return null;
    const candidates = [
      ticket.guestName,
      ticket.customerName,
      ticket.guest?.name,
      ticket.orderId ? orderMap.get(ticket.orderId)?.customerName : null,
      ticket.orderId ? orderMap.get(ticket.orderId)?.guestName : null,
      ticket.orderId ? orderMap.get(ticket.orderId)?.customer_name : null,
      ticket.orderId ? orderMap.get(ticket.orderId)?.guest_name : null,
      ticket.orderId ? orderMap.get(ticket.orderId)?.customer : null,
    ];

    if (ticket.tableId && (!ticket.orderType || ticket.orderType === 'dine-in')) {
      const table = (posTables || []).find(t => String(t.id) === String(ticket.tableId) || String(t.number) === String(ticket.tableId));
      if (table) {
        candidates.push(table.guestName, table.customerName, table.guest?.name);
      }
    }

    if (ticket.tableId && posSavedOrders && posSavedOrders[ticket.tableId]) {
      const tab = posSavedOrders[ticket.tableId];
      candidates.push(tab.guestName, tab.customerName, tab.guest?.name);
    }

    for (const name of candidates) {
      if (name && typeof name === 'string' && name.trim()) {
        const clean = name.trim();
        if (clean.toLowerCase() !== 'walk-in' && clean.toLowerCase() !== 'walk-in guest') {
          return clean;
        }
      }
    }
    return null;
  }, [orderMap, posTables, posSavedOrders]);

  // Helper to extract preparation time (in seconds) for a ticket
  const getTicketPrepSeconds = useCallback((t) => {
    const linkedOrder = (t.orderId && orderMap.get(t.orderId)) || null;
    const startIso = t.firedAt || t.createdAt || linkedOrder?.ticketPrintedAt || linkedOrder?.orderPlacedAt || linkedOrder?.createdAt;
    if (!startIso) return null;
    const startTime = new Date(startIso).getTime();
    if (isNaN(startTime)) return null;

    let endTime = null;
    if (t.bumpedAt) {
      endTime = new Date(t.bumpedAt).getTime();
    } else if (t.completedAt) {
      endTime = new Date(t.completedAt).getTime();
    } else if (t.items && t.items.length > 0) {
      const itemBumps = t.items.map(i => i.bumpedAt ? new Date(i.bumpedAt).getTime() : 0).filter(Boolean);
      if (itemBumps.length > 0) {
        endTime = Math.max(...itemBumps);
      }
    }
    if (!endTime && linkedOrder?.foodBumpedAt) {
      endTime = new Date(linkedOrder.foodBumpedAt).getTime();
    }
    if (!endTime && linkedOrder?.timestamps?.foodBumped) {
      endTime = new Date(linkedOrder.timestamps.foodBumped).getTime();
    }
    if (!endTime && t.status === 'completed' && t.updatedAt) {
      endTime = new Date(t.updatedAt).getTime();
    }
    if (!endTime && t.settledAt) {
      endTime = new Date(t.settledAt).getTime();
    }

    if (endTime && !isNaN(endTime) && endTime >= startTime) {
      const diffSec = Math.round((endTime - startTime) / 1000);
      if (diffSec >= 0 && diffSec < 86400) {
        return diffSec;
      }
    }
    return null;
  }, [orderMap]);

  // Stats for the day
  const stats = useMemo(() => {
    const today = todayLocalStr();

    // Tickets matching current station view
    const stationTickets = (kdsTickets || []).filter(ticketMatchesStation);

    // Active tickets currently cooking in kitchen
    const active = stationTickets.filter(t => t.status === 'active');
    const activeTimes = active.map(t => elapsed(t.firedAt || t.createdAt)).filter(s => s >= 0);
    const overdue = activeTimes.filter(t => t > 600).length;

    // Bumped/completed tickets for the entire local day
    const bumpedTodayTickets = stationTickets.filter(t => {
      const isCompleted = t.status === 'completed' || Boolean(t.bumpedAt) || Boolean(t.completedAt) ||
        (t.items && t.items.length > 0 && t.items.every(i => i.status === 'bumped'));
      if (!isCompleted || t.status === 'active') return false;

      const bumpDate = t.bumpedAt || t.completedAt || t.updatedAt || t.settledAt || t.firedAt || t.createdAt;
      return Boolean(bumpDate && localDayStr(bumpDate) === today);
    });

    // Preparation duration of all completed orders of the day
    const completedTimes = [];
    bumpedTodayTickets.forEach(t => {
      const prepSec = getTicketPrepSeconds(t);
      if (prepSec !== null) completedTimes.push(prepSec);
    });

    // Average order fulfillment time of the day:
    // If completed orders exist today, show their average prep/fulfillment time.
    // If no orders have been completed yet today, show the average elapsed wait time of active tickets.
    let avgTime = 0;
    if (completedTimes.length > 0) {
      avgTime = Math.round(completedTimes.reduce((a, b) => a + b, 0) / completedTimes.length);
    } else if (activeTimes.length > 0) {
      avgTime = Math.round(activeTimes.reduce((a, b) => a + b, 0) / activeTimes.length);
    }

    return {
      active: active.length,
      avgTime,
      overdue,
      bumpedToday: bumpedTodayTickets.length,
    };
  }, [kdsTickets, ticketMatchesStation, getTicketPrepSeconds, tick]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e) => {
      if (showRecall || recipeItem) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIdx(i => Math.min(i + 1, activeTickets.length - 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIdx(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const ticket = activeTickets[highlightIdx];
        if (ticket) {
          bumpKDSTicketAction(ticket.id);
        }
      } else if (e.key === 'Escape') {
        setShowRecall(false);
        setRecipeItem(null);
        setShowShortcuts(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTickets, highlightIdx, showRecall, recipeItem, bumpKDSTicketAction]);

  // Clamp highlight index
  useEffect(() => {
    if (highlightIdx >= activeTickets.length) setHighlightIdx(Math.max(0, activeTickets.length - 1));
  }, [activeTickets.length, highlightIdx]);

  const handleBumpItem = useCallback((ticketId, idx) => {
    bumpKDSItemAction(ticketId, idx);
  }, [bumpKDSItemAction]);

  const handleBumpTicket = useCallback((ticketId) => {
    bumpKDSTicketAction(ticketId);
  }, [bumpKDSTicketAction]);

  const handleRecall = useCallback((ticketId) => {
    recallKDSTicketAction(ticketId);
    setShowRecall(false);
  }, [recallKDSTicketAction]);

  /* ── All-day summary ──────────────────────────────────── */
  const allDaySummary = useMemo(() => {
    const counts = {};
    kdsTickets
      .filter(t => t.status === 'active')
      .forEach(t => {
        (t.items || []).forEach(item => {
          if (item.status !== 'bumped') {
            const key = item.name;
            if (!counts[key]) counts[key] = { name: key, count: 0, station: item.station || 'Main Kitchen' };
            counts[key].count += item.qty || 1;
          }
        });
      });
    return Object.values(counts).sort((a, b) => b.count - a.count);
  }, [kdsTickets]);

  const prepTime = settings?.kdsPrepTime || 600;

  return (
    <div style={s.page(isMobile)}>
      {/* Header */}
      <div className="page-title-row" style={{
        marginBottom: isMobile ? 10 : 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        width: '100%',
        boxSizing: 'border-box'
      }}>
        <h1 className="page-title" style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: isMobile ? '1.2rem' : '1.5rem',
          margin: 0
        }}>
          <Monitor size={isMobile ? 22 : 26} /> Kitchen Display
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 10, flexShrink: 0 }}>
          {/* Keyboard shortcut hint - Desktop only */}
          {!isMobile && (
            <button
              onClick={() => setShowShortcuts(!showShortcuts)}
              style={{
                ...s.tab(false), gap: 4, fontSize: '0.76rem', padding: '6px 10px',
                background: 'rgba(255,255,255,0.45)',
              }}
            >
              <Keyboard size={14} /> Shortcuts
            </button>
          )}
          {/* Bell icon with badge */}
          <div style={{ position: 'relative', cursor: 'pointer', padding: 4 }} onClick={() => setNewTicketCount(0)}>
            <Bell
              size={isMobile ? 20 : 22}
              style={{
                color: newTicketCount > 0 ? 'var(--warning)' : 'var(--text-muted)',
                animation: newTicketCount > 0 ? 'kds-bell-shake 0.6s ease' : 'none',
              }}
            />
            {newTicketCount > 0 && (
              <span style={{
                position: 'absolute', top: -3, right: -3, background: 'var(--danger)',
                color: '#fff', borderRadius: '50%', width: 17, height: 17, fontSize: '0.62rem',
                fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {newTicketCount}
              </span>
            )}
          </div>
          {/* Recall button */}
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowRecall(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: isMobile ? '5px 10px' : '6px 12px',
              fontSize: isMobile ? '0.78rem' : '0.85rem'
            }}
          >
            <RotateCcw size={13} /> Recall
          </button>
        </div>
      </div>

      {/* Shortcuts tooltip - Desktop only */}
      {!isMobile && showShortcuts && (
        <div className="card animate-fade-up" style={{ marginBottom: 14, padding: '12px 18px', display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <span><span style={s.kbd}><ArrowLeft size={10} /></span> <span style={s.kbd}><ArrowRight size={10} /></span> Navigate tickets</span>
          <span><span style={s.kbd}>Enter</span> Bump highlighted ticket</span>
          <span><span style={s.kbd}>Esc</span> Close modals</span>
        </div>
      )}

      {/* Stats bar */}
      <div style={s.statsBar(isMobile)}>
        {[
          { label: isMobile ? 'Active' : 'Active', value: stats.active, icon: <Flame size={isMobile ? 12 : 20} color="var(--primary)" />, bg: 'var(--primary-light)', col: 'var(--text-primary)' },
          { label: isMobile ? 'Avg' : 'Avg Time', value: fmtTime(stats.avgTime), icon: <Clock size={isMobile ? 12 : 20} color="var(--accent-blue)" />, bg: 'rgba(59,130,246,0.12)', col: 'var(--text-primary)' },
          { label: isMobile ? 'Late' : 'Overdue', value: stats.overdue, icon: <AlertTriangle size={isMobile ? 12 : 20} color="var(--danger)" />, bg: 'rgba(239,68,68,0.12)', col: stats.overdue > 0 ? 'var(--danger)' : 'var(--text-primary)' },
          { label: isMobile ? 'Done' : 'Bumped', value: stats.bumpedToday, icon: <CheckCircle size={isMobile ? 12 : 20} color="var(--success)" />, bg: 'rgba(34,197,94,0.12)', col: 'var(--text-primary)' },
        ].map(({ label, value, icon, bg, col }) => (
          <div key={label} className="animate-fade-up" style={s.statBox(isMobile)}>
            <div style={{ ...s.statIcon(isMobile), background: bg }}>{icon}</div>
            <div>
              <div style={{ fontSize: isMobile ? '0.58rem' : '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
              <div style={{ fontSize: isMobile ? '0.88rem' : '1.4rem', fontWeight: 800, color: col, fontFamily: 'var(--font-mono)' }}>{value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Station filter + View mode tabs */}
      {isMobile ? (
        <div style={{ width: '100%', marginBottom: 8, boxSizing: 'border-box' }}>
          {/* Mobile 3-tab segmented control for view modes */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 4,
            background: 'rgba(0,0,0,0.04)',
            padding: 3,
            borderRadius: 'var(--r-md)',
            marginBottom: 8,
            width: '100%',
            boxSizing: 'border-box'
          }}>
            {VIEW_MODES.map(vm => {
              const active = viewMode === vm.key;
              return (
                <button
                  key={vm.key}
                  onClick={() => setViewMode(vm.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    padding: '7px 4px',
                    borderRadius: 'var(--r-sm)',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    background: active ? 'var(--primary)' : 'transparent',
                    color: active ? '#fff' : 'var(--text-secondary)',
                    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s'
                  }}
                >
                  <vm.icon size={13} />
                  <span>{vm.label}</span>
                </button>
              );
            })}
          </div>

          {/* Mobile horizontal scroll pill bar for stations */}
          <div style={{
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
            scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch',
            paddingBottom: 4,
            width: '100%',
            boxSizing: 'border-box'
          }}>
            {STATIONS.map(st => {
              const Icon = STATION_ICONS[st] || Grid3X3;
              const active = station === st;
              return (
                <button
                  key={st}
                  onClick={() => setStation(st)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '5px 12px',
                    borderRadius: 20,
                    border: active ? '1.5px solid var(--primary)' : '1px solid var(--border-subtle)',
                    background: active ? 'rgba(30, 94, 74, 0.1)' : 'var(--card-bg)',
                    color: active ? 'var(--primary)' : 'var(--text-secondary)',
                    fontWeight: active ? 700 : 600,
                    fontSize: '0.74rem',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    cursor: 'pointer'
                  }}
                >
                  <Icon size={12} />
                  <span>{st}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4, overflow: 'hidden' }}>
          <div style={s.tabs(true)}>
            {STATIONS.map(st => {
              const Icon = STATION_ICONS[st] || Grid3X3;
              return (
                <button key={st} style={s.tab(station === st)} onClick={() => setStation(st)}>
                  <Icon size={14} /> {st}
                </button>
              );
            })}
          </div>
          <div style={s.tabs(true)}>
            {VIEW_MODES.map(vm => (
              <button key={vm.key} style={s.viewTab(viewMode === vm.key, false)} onClick={() => setViewMode(vm.key)} title={vm.label}>
                <vm.icon size={14} /><span>{vm.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── TICKETS VIEW ──────────────────────────────────── */}
      {viewMode === 'tickets' && (
        <div style={s.grid(isMobile)}>
          {activeTickets.length === 0 && (
            <div style={{
              gridColumn: '1 / -1', textAlign: 'center', padding: '64px 0', color: 'var(--text-muted)',
            }}>
              <ChefHat size={48} style={{ opacity: 0.25, marginBottom: 12 }} />
              <p style={{ margin: 0, fontSize: '1rem' }}>No active tickets{station !== 'All' ? ` for ${station}` : ''}</p>
            </div>
          )}
          {activeTickets.map((ticket, tIdx) => {
            const secs = elapsed(ticket.firedAt);
            const bc = borderColor(secs, prepTime);
            const overdue = secs > prepTime;
            const isHighlighted = tIdx === highlightIdx;
            const ot = ORDER_TYPE_COLORS[ticket.orderType] || ORDER_TYPE_COLORS['dine-in'];
            const guestName = getTicketGuestName(ticket);
            const tableLabel = (() => {
              if (!ticket.tableId || String(ticket.tableId).startsWith('tab_')) {
                return ticket.tokenNumber ? `Token #${ticket.tokenNumber}` : 'Waiting Table';
              }
              const tableMatch = (posTables || []).find(t => String(t.id) === String(ticket.tableId) || String(t.number) === String(ticket.tableId));
              const label = tableMatch ? (tableMatch.number || tableMatch.name || tableMatch.id) : ticket.tableId;
              const str = String(label).trim();
              if (/^(table|tbl|token|t\d)/i.test(str)) return str.replace(/^tbl_/i, 'Table ');
              return `Table ${str}`;
            })();

            return (
              <div
                key={ticket.id}
                className="animate-fade-up"
                style={{
                  ...s.card(bc, overdue, isMobile),
                  outline: isHighlighted ? '2px solid var(--accent-blue)' : 'none',
                  outlineOffset: 2,
                }}
                onClick={() => setHighlightIdx(tIdx)}
              >
                {/* Allergen banner */}
                {ticket.allergyAlert && ticket.allergens?.length > 0 && (
                  <div style={s.allergenBanner}>
                    <AlertTriangle size={13} />
                    ALLERGEN: {[...new Set(ticket.allergens)].join(', ').toUpperCase()}
                  </div>
                )}

                {/* Header */}
                <div style={s.cardHeader(isMobile)}>
                  {/* Row 1: Order # + Table + Live Timer */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{ fontWeight: 800, fontSize: isMobile ? '1rem' : '1.05rem', color: 'var(--text-primary)' }}>
                        <Hash size={14} style={{ verticalAlign: 'middle', marginRight: 2 }} />
                        {ticket.orderId}
                      </span>
                      <span style={{
                        fontSize: '0.8rem',
                        fontWeight: 800,
                        color: (!ticket.tableId || String(ticket.tableId).startsWith('tab_') || ticket.tokenNumber) ? '#b45309' : 'var(--primary)',
                        background: (!ticket.tableId || String(ticket.tableId).startsWith('tab_') || ticket.tokenNumber) ? 'rgba(245, 158, 11, 0.12)' : 'rgba(30, 94, 74, 0.1)',
                        padding: '2px 8px',
                        borderRadius: '4px',
                      }}>
                        {tableLabel}
                      </span>
                    </div>

                    <div style={{
                      fontWeight: 800,
                      fontSize: isMobile ? '1.05rem' : '1.15rem',
                      fontFamily: 'monospace',
                      color: timerColor(secs),
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      flexShrink: 0
                    }}>
                      <Clock size={13} style={{ opacity: 0.8 }} />
                      {fmtTime(secs)}
                    </div>
                  </div>

                  {/* Row 2: Badges: Type + Guest + Shifted + Paid/Pending */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <span style={s.badge(ot.bg, ot.text)}>{ticket.orderType?.toUpperCase()}</span>
                    {guestName && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          background: 'rgba(59, 130, 246, 0.12)',
                          color: 'var(--accent-blue)',
                          border: '1px solid rgba(59, 130, 246, 0.25)',
                          maxWidth: isMobile ? 120 : 160,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={`Guest: ${guestName}`}
                      >
                        <User size={10} style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{guestName}</span>
                      </span>
                    )}
                    {ticket.tableShiftedFrom && (
                      <span
                        title={`Moved from ${ticket.tableShiftedFrom} at ${ticket.shiftedAt ? new Date(ticket.shiftedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}`}
                        style={{
                          background: 'rgba(239, 68, 68, 0.15)',
                          color: '#dc2626',
                          border: '1px solid rgba(239, 68, 68, 0.35)',
                          borderRadius: '4px',
                          padding: '1px 5px',
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                        }}
                      >
                        <ArrowRightLeft size={10} /> {String(ticket.tableShiftedFrom).startsWith('Token') ? ticket.tableShiftedFrom : `T${ticket.tableShiftedFrom}`} ➔ {String(ticket.tableShiftedTo || ticket.tableId).startsWith('Token') ? (ticket.tableShiftedTo || ticket.tableId) : `T${ticket.tableShiftedTo || ticket.tableId}`}
                      </span>
                    )}
                    {isPaymentPending(ticket) ? (
                      <span style={s.badge('rgba(245,158,11,0.15)', '#f59e0b')}>PENDING</span>
                    ) : (
                      <span style={s.badge('rgba(34,197,94,0.15)', '#22c55e')}>PAID</span>
                    )}
                  </div>
                </div>

                {/* Items */}
                <div style={s.cardBody(isMobile)}>
                  {(ticket.items || []).map((item, iIdx) => {
                    const bumped = item.status === 'bumped';
                    return (
                      <div
                        key={iIdx}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!bumped) handleBumpItem(ticket.id, iIdx, ticket.items.length);
                        }}
                        style={{
                          ...s.itemRow(isMobile),
                          opacity: bumped ? 0.45 : 1,
                        }}
                      >
                        <div style={s.checkbox(bumped, isMobile)}>
                          {bumped && <CheckCircle size={14} color="#fff" />}
                        </div>
                        <span
                          style={{
                            flex: 1, textDecoration: bumped ? 'line-through' : 'none',
                            fontWeight: 600, color: bumped ? 'var(--text-muted)' : 'var(--text-primary)',
                            lineHeight: 1.3
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setRecipeItem(item);
                          }}
                        >
                          {item.name}
                        </span>
                        <span style={{ fontSize: isMobile ? '0.9rem' : '0.85rem', color: 'var(--text-primary)', fontWeight: 700, padding: '2px 6px', background: 'rgba(0,0,0,0.04)', borderRadius: 4 }}>
                          x{item.qty || 1}
                        </span>
                        {item.modifiers?.length > 0 && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--warning)', fontWeight: 700, background: 'rgba(245,158,11,0.1)', padding: '2px 5px', borderRadius: 4 }}>
                            MOD
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {(ticket.notes || ticket.items?.some(i => i.notes)) && (
                    <div style={{ marginTop: 6, fontSize: '0.78rem', color: '#ea580c', background: 'rgba(234, 88, 12, 0.08)', padding: '6px 10px', borderRadius: 6, fontStyle: 'italic' }}>
                      {ticket.notes && <div style={{ fontWeight: 600 }}>📝 Note: {ticket.notes}</div>}
                      {ticket.items?.filter(i => i.notes).map((i, idx) => (
                        <div key={idx}>{i.name}: {i.notes}</div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bump button */}
                <button
                  style={s.bumpBtn(isMobile)}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBumpTicket(ticket.id, (ticket.items || []).length);
                  }}
                  onMouseEnter={e => e.target.style.background = '#16a34a'}
                  onMouseLeave={e => e.target.style.background = 'var(--success)'}
                >
                  <CheckCircle size={18} /> BUMP ORDER
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── EXPO CONSOLE ─────────────────────────────────── */}
      {viewMode === 'expo' && (
        <div style={{ marginTop: isMobile ? 10 : 16 }}>
          {activeTickets.length === 0 && (
            <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-muted)' }}>
              <Eye size={48} style={{ opacity: 0.25, marginBottom: 12 }} />
              <p style={{ margin: 0 }}>No active tickets to expedite</p>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {activeTickets.map(ticket => {
              const total = (ticket.items || []).length;
              const done = (ticket.items || []).filter(i => i.status === 'bumped').length;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              const secs = elapsed(ticket.firedAt);
              const bc = borderColor(secs, prepTime);
              const ot = ORDER_TYPE_COLORS[ticket.orderType] || ORDER_TYPE_COLORS['dine-in'];
              const guestName = getTicketGuestName(ticket);

              return (
                <div key={ticket.id} className="animate-fade-up" style={{
                  background: 'var(--card-bg)', borderRadius: 'var(--r-lg)',
                  border: `2px solid ${bc}`, padding: isMobile ? '12px 14px' : '14px 20px',
                  boxShadow: 'var(--shadow-card)', color: 'var(--text-primary)',
                  display: 'flex', flexDirection: isMobile ? 'column' : 'row',
                  alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 10 : 16,
                  width: '100%', boxSizing: 'border-box'
                }}>
                  {/* Top row in mobile: Order info + Timer */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    width: isMobile ? '100%' : 'auto', minWidth: isMobile ? 0 : 120
                  }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                        #{ticket.orderId}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                        <span style={{
                          fontWeight: (!ticket.tableId || String(ticket.tableId).startsWith('tab_') || ticket.tokenNumber) ? 800 : 600,
                          color: (!ticket.tableId || String(ticket.tableId).startsWith('tab_') || ticket.tokenNumber) ? '#d97706' : 'var(--text-muted)',
                        }}>
                          {(!ticket.tableId || String(ticket.tableId).startsWith('tab_'))
                            ? (ticket.tokenNumber ? `Token #${ticket.tokenNumber}` : 'Waiting Table')
                            : `Table ${ticket.tableId}`}
                        </span>
                        <span style={s.badge(ot.bg, ot.text)}>{ticket.orderType?.toUpperCase()}</span>
                        {guestName && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            padding: '1px 5px', borderRadius: 4, fontSize: '0.72rem',
                            fontWeight: 700, background: 'rgba(59, 130, 246, 0.12)',
                            color: 'var(--accent-blue)', border: '1px solid rgba(59, 130, 246, 0.25)',
                          }}>
                            <User size={10} style={{ flexShrink: 0 }} />
                            <span>{guestName}</span>
                          </span>
                        )}
                        {ticket.tableShiftedFrom && (
                          <span style={{
                            background: 'rgba(239, 68, 68, 0.15)', color: '#dc2626',
                            border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: 4,
                            padding: '1px 5px', fontSize: '0.68rem', fontWeight: 800,
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                          }}>
                            <ArrowRightLeft size={9} /> Moved
                          </span>
                        )}
                        {isPaymentPending(ticket) ? (
                          <span style={s.badge('rgba(245,158,11,0.15)', '#f59e0b')}>PENDING</span>
                        ) : (
                          <span style={s.badge('rgba(34,197,94,0.15)', '#22c55e')}>PAID</span>
                        )}
                      </div>
                    </div>

                    {isMobile && (
                      <span style={{
                        fontFamily: 'monospace', fontWeight: 800, fontSize: '1.1rem',
                        color: timerColor(secs), flexShrink: 0
                      }}>
                        {fmtTime(secs)}
                      </span>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div style={{ flex: 1, minWidth: isMobile ? 0 : 200, width: isMobile ? '100%' : 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.78rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{done}/{total} items</span>
                      <span style={{ fontWeight: 700, color: pct === 100 ? 'var(--success)' : 'var(--text-primary)' }}>{pct}%</span>
                    </div>
                    <div style={{
                      height: 8, borderRadius: 4, background: 'var(--border)', overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%', borderRadius: 4, width: `${pct}%`,
                        background: pct === 100 ? 'var(--success)' : pct > 50 ? 'var(--accent-blue)' : 'var(--warning)',
                        transition: 'width .3s',
                      }} />
                    </div>
                  </div>

                  {/* Items */}
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1, minWidth: isMobile ? 0 : 200, width: isMobile ? '100%' : 'auto' }}>
                    {(ticket.items || []).map((item, idx) => (
                      <span key={idx} style={{
                        padding: '3px 8px', borderRadius: 'var(--r-sm)', fontSize: '0.75rem', fontWeight: 600,
                        background: item.status === 'bumped' ? 'rgba(34,197,94,0.2)' : 'var(--border-subtle)',
                        color: item.status === 'bumped' ? 'var(--success)' : 'var(--text-secondary)',
                        textDecoration: item.status === 'bumped' ? 'line-through' : 'none',
                      }}>
                        {item.name} x{item.qty || 1}
                      </span>
                    ))}
                  </div>

                  {/* Bottom Action in mobile / Desktop timer + button */}
                  <div style={{
                    display: 'flex', alignItems: 'center',
                    justifyContent: isMobile ? 'stretch' : 'flex-end',
                    gap: 12, width: isMobile ? '100%' : 'auto'
                  }}>
                    {!isMobile && (
                      <span style={{
                        fontFamily: 'monospace', fontWeight: 800, fontSize: '1.1rem',
                        color: timerColor(secs),
                      }}>
                        {fmtTime(secs)}
                      </span>
                    )}
                    {pct < 100 && (
                      <button
                        onClick={() => handleBumpTicket(ticket.id, (ticket.items || []).length)}
                        style={{
                          padding: isMobile ? '10px 16px' : '8px 18px',
                          borderRadius: 'var(--r-md)', border: 'none',
                          background: 'var(--success)', color: '#fff', fontWeight: 800,
                          fontSize: '0.84rem', cursor: 'pointer', letterSpacing: '0.06em',
                          width: isMobile ? '100%' : 'auto', textAlign: 'center'
                        }}
                      >
                        BUMP ALL
                      </button>
                    )}
                    {pct === 100 && (
                      <div style={{
                        fontSize: '0.82rem', fontWeight: 800, color: 'var(--success)',
                        width: isMobile ? '100%' : 'auto', textAlign: 'center',
                        padding: isMobile ? '8px' : 0, background: isMobile ? 'rgba(34,197,94,0.1)' : 'transparent',
                        borderRadius: 6
                      }}>
                        READY FOR EXPEDITION
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ALL-DAY DISPLAY ──────────────────────────────── */}
      {viewMode === 'allday' && (
        <div style={{ marginTop: isMobile ? 10 : 16 }}>
          {allDaySummary.length === 0 && (
            <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-muted)' }}>
              <BarChart3 size={48} style={{ opacity: 0.25, marginBottom: 12 }} />
              <p style={{ margin: 0 }}>No pending items to display</p>
            </div>
          )}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: isMobile ? 8 : 14,
            width: '100%',
            boxSizing: 'border-box'
          }}>
            {allDaySummary.map(item => (
              <div key={item.name} className="animate-fade-up" style={{
                background: 'var(--card-bg)', borderRadius: 'var(--r-lg)',
                padding: isMobile ? '14px 10px' : '20px 22px', border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-card)', textAlign: 'center',
                boxSizing: 'border-box'
              }}>
                <div style={{
                  fontSize: isMobile ? '1.8rem' : '2.4rem', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1,
                  marginBottom: 6,
                }}>
                  {item.count}
                </div>
                <div style={{
                  fontSize: isMobile ? '0.85rem' : '0.95rem', fontWeight: 700, color: 'var(--text-primary)',
                  marginBottom: 4, lineHeight: 1.3
                }}>
                  {item.name}
                </div>
                <div style={{
                  fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  {item.station}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────── */}
      {showRecall && (
        <RecallPanel tickets={kdsTickets} onRecall={handleRecall} onClose={() => setShowRecall(false)} getTicketGuestName={getTicketGuestName} isMobile={isMobile} />
      )}
      {recipeItem && (
        <RecipeModal item={recipeItem} recipes={recipes || []} menu={menu} onClose={() => setRecipeItem(null)} isMobile={isMobile} />
      )}
    </div>
  );
}
