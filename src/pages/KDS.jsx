import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Monitor, Clock, CheckCircle, AlertTriangle, Bell, RotateCcw,
  ChefHat, Flame, X, ArrowLeft, ArrowRight, ArrowUp, ArrowDown,
  CornerDownLeft, Eye, BarChart3, ListChecks, Grid3X3, Utensils,
  Wine, IceCream, Salad, BookOpen, Keyboard, ChevronDown, ChevronUp,
  Timer, TrendingUp, Hash, Zap
} from 'lucide-react';
import { useApp } from '../db/AppContext';

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
  'dine-in': { bg: 'rgba(124,58,237,0.18)', text: '#7c3aed' },
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
  page: {
    padding: '24px 28px', minHeight: '100vh',
  },
  statsBar: {
    display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap',
  },
  statBox: {
    flex: '1 1 160px', background: 'rgba(255,255,255,0.68)', backdropFilter: 'blur(12px)',
    borderRadius: 'var(--r-lg)', padding: '14px 18px',
    border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 12,
  },
  statIcon: {
    width: 42, height: 42, borderRadius: 'var(--r-md)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  tabs: {
    display: 'flex', gap: 6, flexWrap: 'wrap',
  },
  tab: (active) => ({
    padding: '8px 16px', borderRadius: 'var(--r-md)', border: 'none', cursor: 'pointer',
    fontWeight: 600, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6,
    background: active ? 'var(--primary)' : 'rgba(255,255,255,0.55)',
    color: active ? '#fff' : 'var(--text-secondary)',
    transition: 'all .15s',
    backdropFilter: 'blur(8px)',
  }),
  viewTab: (active) => ({
    padding: '8px 18px', borderRadius: 'var(--r-md)', border: 'none', cursor: 'pointer',
    fontWeight: 600, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6,
    background: active ? 'var(--accent-blue)' : 'rgba(255,255,255,0.55)',
    color: active ? '#fff' : 'var(--text-secondary)',
    transition: 'all .15s', backdropFilter: 'blur(8px)',
  }),
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: 16, marginTop: 16,
  },
  card: (borderCol, overdue) => ({
    background: 'rgba(26,26,46,0.92)', borderRadius: 'var(--r-xl)',
    border: `3px solid ${borderCol}`, padding: 0, overflow: 'hidden',
    backdropFilter: 'blur(14px)', color: '#e2e8f0',
    animation: overdue ? 'kds-pulse 1.5s infinite' : 'none',
    transition: 'border-color .3s, box-shadow .3s',
  }),
  cardHeader: {
    padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  cardBody: { padding: '10px 16px 14px' },
  itemRow: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
    borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.95rem',
  },
  checkbox: (checked) => ({
    width: 22, height: 22, borderRadius: 4, border: `2px solid ${checked ? 'var(--success)' : 'rgba(255,255,255,0.3)'}`,
    background: checked ? 'var(--success)' : 'transparent', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s',
  }),
  bumpBtn: {
    width: '100%', padding: '12px', border: 'none', borderRadius: '0 0 var(--r-xl) var(--r-xl)',
    background: 'var(--success)', color: '#fff', fontWeight: 800, fontSize: '1.05rem',
    cursor: 'pointer', letterSpacing: '0.08em', transition: 'background .15s',
  },
  allergenBanner: {
    background: 'rgba(239,68,68,0.2)', color: '#fca5a5', padding: '6px 14px',
    fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6,
    animation: 'kds-flash 1s infinite', borderBottom: '1px solid rgba(239,68,68,0.3)',
  },
  badge: (bg, text) => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 'var(--r-sm)',
    fontSize: '0.72rem', fontWeight: 700, background: bg, color: text, letterSpacing: '0.03em',
  }),
  modal: {
    position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
  },
  modalContent: {
    background: 'rgba(26,26,46,0.96)', borderRadius: 'var(--r-xl)', padding: '28px 32px',
    maxWidth: 520, width: '90%', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)',
    maxHeight: '80vh', overflowY: 'auto',
  },
  kbd: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '2px 7px', borderRadius: 4, background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.15)', fontSize: '0.72rem', fontWeight: 600,
    color: 'rgba(255,255,255,0.6)', minWidth: 22,
  },
};

/* ── Recipe Modal ──────────────────────────────────────── */
const RecipeModal = ({ item, recipes, menu, onClose }) => {
  const menuItem = menu.find(m => m.name === item?.name);
  const recipe = recipes.find(r => r.menuItemId === menuItem?.id || r.name === item?.name);

  return (
    <div style={s.modal} onClick={onClose}>
      <div style={s.modalContent} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#fff' }}>
            <BookOpen size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            {item?.name}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
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
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.85rem', lineHeight: 1.7, color: '#cbd5e1' }}>
                {(recipe.ingredients || []).map((ing, i) => (
                  <li key={i}>{typeof ing === 'string' ? ing : `${ing.name} - ${ing.qty} ${ing.unit || ''}`}</li>
                ))}
                {(!recipe.ingredients || recipe.ingredients.length === 0) && <li>No ingredients listed</li>}
              </ul>
            </div>
            <div style={{ marginBottom: 14 }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '0.9rem', color: 'var(--success)' }}>Instructions</h4>
              <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.7, color: '#cbd5e1', whiteSpace: 'pre-wrap' }}>
                {recipe.instructions || recipe.steps || 'No instructions available.'}
              </p>
            </div>
            {recipe.plating && (
              <div>
                <h4 style={{ margin: '0 0 8px', fontSize: '0.9rem', color: '#c084fc' }}>Plating</h4>
                <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.7, color: '#cbd5e1' }}>{recipe.plating}</p>
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#64748b' }}>
            <Utensils size={36} style={{ marginBottom: 10, opacity: 0.4 }} />
            <p style={{ margin: 0, fontSize: '0.9rem' }}>No recipe found for this item.</p>
            {menuItem?.category && <p style={{ margin: '6px 0 0', fontSize: '0.8rem' }}>Category: {menuItem.category}</p>}
          </div>
        )}
        {item?.allergens?.length > 0 && (
          <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 'var(--r-md)', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fca5a5' }}>
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
const RecallPanel = ({ tickets, onRecall, onClose }) => {
  const completed = tickets
    .filter(t => t.status === 'completed')
    .sort((a, b) => new Date(b.firedAt) - new Date(a.firedAt))
    .slice(0, 10);

  return (
    <div style={s.modal} onClick={onClose}>
      <div style={{ ...s.modalContent, maxWidth: 600 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#fff' }}>
            <RotateCcw size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Recall Completed Tickets
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>
        {completed.length === 0 ? (
          <p style={{ color: '#64748b', textAlign: 'center', padding: '24px 0' }}>No completed tickets to recall.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {completed.map(t => (
              <div key={t.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', borderRadius: 'var(--r-md)',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
              }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff' }}>#{t.orderId}</span>
                  <span style={{ margin: '0 8px', color: '#64748b' }}>|</span>
                  <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                    Table {t.tableId} - {t.items.length} items
                  </span>
                </div>
                <button
                  onClick={() => onRecall(t.id)}
                  style={{
                    padding: '6px 14px', borderRadius: 'var(--r-sm)', border: 'none',
                    background: 'var(--warning)', color: '#1a1a2e', fontWeight: 700,
                    fontSize: '0.78rem', cursor: 'pointer', letterSpacing: '0.04em',
                  }}
                >
                  RECALL
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Main KDS Component ────────────────────────────────── */
export default function KDS() {
  const { kdsTickets, menu, settings, recipes, bumpKDSItemAction, bumpKDSTicketAction, recallKDSTicketAction } = useApp();

  const [station, setStation] = useState('All');
  const [viewMode, setViewMode] = useState('tickets');
  const [, setTick] = useState(0);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [showRecall, setShowRecall] = useState(false);
  const [recipeItem, setRecipeItem] = useState(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [newTicketCount, setNewTicketCount] = useState(0);
  const prevTicketCountRef = useRef(0);
  const [bumpedToday, setBumpedToday] = useState(0);

  // Auto-refresh every second
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Track new tickets
  useEffect(() => {
    const activeCount = kdsTickets.filter(t => t.status === 'active').length;
    if (activeCount > prevTicketCountRef.current) {
      setNewTicketCount(c => c + (activeCount - prevTicketCountRef.current));
    }
    prevTicketCountRef.current = activeCount;
  }, [kdsTickets]);

  // Filter tickets
  const activeTickets = useMemo(() => {
    return kdsTickets
      .filter(t => t.status === 'active')
      .filter(t => station === 'All' || (t.station || '').toLowerCase() === station.toLowerCase() ||
        (t.items || []).some(i => (i.station || '').toLowerCase() === station.toLowerCase()))
      .sort((a, b) => new Date(a.firedAt) - new Date(b.firedAt));
  }, [kdsTickets, station]);

  // Stats
  const stats = useMemo(() => {
    const active = kdsTickets.filter(t => t.status === 'active');
    const times = active.map(t => elapsed(t.firedAt));
    const avgTime = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
    const overdue = times.filter(t => t > 600).length;
    return { active: active.length, avgTime, overdue, bumpedToday };
  }, [kdsTickets, bumpedToday]);

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
          setBumpedToday(b => b + (ticket.items || []).length);
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

  const handleBumpItem = useCallback((ticketId, idx, itemCount) => {
    bumpKDSItemAction(ticketId, idx);
    setBumpedToday(b => b + 1);
  }, [bumpKDSItemAction]);

  const handleBumpTicket = useCallback((ticketId, itemCount) => {
    bumpKDSTicketAction(ticketId);
    setBumpedToday(b => b + itemCount);
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
    <div style={s.page}>
      {/* Header */}
      <div className="page-title-row" style={{ marginBottom: 16 }}>
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Monitor size={26} /> Kitchen Display
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Keyboard shortcut hint */}
          <button
            onClick={() => setShowShortcuts(!showShortcuts)}
            style={{
              ...s.tab(false), gap: 4, fontSize: '0.76rem', padding: '6px 10px',
              background: 'rgba(255,255,255,0.45)',
            }}
          >
            <Keyboard size={14} /> Shortcuts
          </button>
          {/* Bell icon with badge */}
          <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => setNewTicketCount(0)}>
            <Bell
              size={22}
              style={{
                color: newTicketCount > 0 ? 'var(--warning)' : 'var(--text-muted)',
                animation: newTicketCount > 0 ? 'kds-bell-shake 0.6s ease' : 'none',
              }}
            />
            {newTicketCount > 0 && (
              <span style={{
                position: 'absolute', top: -6, right: -8, background: 'var(--danger)',
                color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: '0.65rem',
                fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {newTicketCount}
              </span>
            )}
          </div>
          {/* Recall button */}
          <button className="btn btn-secondary btn-sm" onClick={() => setShowRecall(true)} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <RotateCcw size={14} /> Recall
          </button>
        </div>
      </div>

      {/* Shortcuts tooltip */}
      {showShortcuts && (
        <div className="card animate-fade-up" style={{ marginBottom: 14, padding: '12px 18px', display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <span><span style={s.kbd}><ArrowLeft size={10} /></span> <span style={s.kbd}><ArrowRight size={10} /></span> Navigate tickets</span>
          <span><span style={s.kbd}>Enter</span> Bump highlighted ticket</span>
          <span><span style={s.kbd}>Esc</span> Close modals</span>
        </div>
      )}

      {/* Stats bar */}
      <div style={s.statsBar}>
        <div className="animate-fade-up" style={s.statBox}>
          <div style={{ ...s.statIcon, background: 'var(--primary-light)' }}>
            <Flame size={20} color="var(--primary)" />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>{stats.active}</div>
          </div>
        </div>
        <div className="animate-fade-up" style={s.statBox}>
          <div style={{ ...s.statIcon, background: 'rgba(59,130,246,0.12)' }}>
            <Clock size={20} color="var(--accent-blue)" />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Avg Time</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>{fmtTime(stats.avgTime)}</div>
          </div>
        </div>
        <div className="animate-fade-up" style={s.statBox}>
          <div style={{ ...s.statIcon, background: 'rgba(239,68,68,0.12)' }}>
            <AlertTriangle size={20} color="var(--danger)" />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Overdue</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: stats.overdue > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>{stats.overdue}</div>
          </div>
        </div>
        <div className="animate-fade-up" style={s.statBox}>
          <div style={{ ...s.statIcon, background: 'rgba(34,197,94,0.12)' }}>
            <CheckCircle size={20} color="var(--success)" />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Bumped Today</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>{stats.bumpedToday}</div>
          </div>
        </div>
      </div>

      {/* Station filter + View mode tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 4 }}>
        <div style={s.tabs}>
          {STATIONS.map(st => {
            const Icon = STATION_ICONS[st] || Grid3X3;
            return (
              <button key={st} style={s.tab(station === st)} onClick={() => setStation(st)}>
                <Icon size={14} /> {st}
              </button>
            );
          })}
        </div>
        <div style={s.tabs}>
          {VIEW_MODES.map(vm => (
            <button key={vm.key} style={s.viewTab(viewMode === vm.key)} onClick={() => setViewMode(vm.key)}>
              <vm.icon size={14} /> {vm.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── TICKETS VIEW ──────────────────────────────────── */}
      {viewMode === 'tickets' && (
        <div style={s.grid}>
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

            return (
              <div
                key={ticket.id}
                className="animate-fade-up"
                style={{
                  ...s.card(bc, overdue),
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
                <div style={s.cardHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: '1.05rem', color: '#fff' }}>
                      <Hash size={14} style={{ verticalAlign: 'middle', marginRight: 2 }} />
                      {ticket.orderId}
                    </span>
                    <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>T{ticket.tableId}</span>
                    <span style={s.badge(ot.bg, ot.text)}>{ticket.orderType?.toUpperCase()}</span>
                  </div>
                  <div style={{
                    fontWeight: 800, fontSize: '1.15rem', fontFamily: 'monospace',
                    color: timerColor(secs),
                  }}>
                    {fmtTime(secs)}
                  </div>
                </div>

                {/* Items */}
                <div style={s.cardBody}>
                  {(ticket.items || []).map((item, iIdx) => {
                    const bumped = item.status === 'bumped';
                    return (
                      <div key={iIdx} style={{ ...s.itemRow, opacity: bumped ? 0.45 : 1 }}>
                        <div
                          style={s.checkbox(bumped)}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!bumped) handleBumpItem(ticket.id, iIdx, ticket.items.length);
                          }}
                        >
                          {bumped && <CheckCircle size={14} color="#fff" />}
                        </div>
                        <span
                          style={{
                            flex: 1, cursor: 'pointer', textDecoration: bumped ? 'line-through' : 'none',
                            fontWeight: 600, color: bumped ? '#64748b' : '#e2e8f0',
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setRecipeItem(item);
                          }}
                        >
                          {item.name}
                        </span>
                        <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>
                          x{item.qty || 1}
                        </span>
                        {item.modifiers?.length > 0 && (
                          <span style={{ fontSize: '0.72rem', color: 'var(--warning)', fontWeight: 600 }}>MOD</span>
                        )}
                      </div>
                    );
                  })}
                  {ticket.items?.some(i => i.notes) && (
                    <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--warning)', fontStyle: 'italic' }}>
                      {ticket.items.filter(i => i.notes).map((i, idx) => (
                        <div key={idx}>{i.name}: {i.notes}</div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bump button */}
                <button
                  style={s.bumpBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBumpTicket(ticket.id, (ticket.items || []).length);
                  }}
                  onMouseEnter={e => e.target.style.background = '#16a34a'}
                  onMouseLeave={e => e.target.style.background = 'var(--success)'}
                >
                  BUMP ORDER
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── EXPO CONSOLE ─────────────────────────────────── */}
      {viewMode === 'expo' && (
        <div style={{ marginTop: 16 }}>
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

              return (
                <div key={ticket.id} className="animate-fade-up" style={{
                  background: 'rgba(26,26,46,0.88)', borderRadius: 'var(--r-lg)',
                  border: `2px solid ${bc}`, padding: '14px 20px',
                  backdropFilter: 'blur(14px)', color: '#e2e8f0',
                  display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
                }}>
                  {/* Order info */}
                  <div style={{ minWidth: 120 }}>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#fff' }}>
                      #{ticket.orderId}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 2 }}>
                      Table {ticket.tableId} <span style={s.badge(ot.bg, ot.text)}>{ticket.orderType?.toUpperCase()}</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.78rem' }}>
                      <span style={{ color: '#94a3b8' }}>{done}/{total} items</span>
                      <span style={{ fontWeight: 700, color: pct === 100 ? 'var(--success)' : '#fff' }}>{pct}%</span>
                    </div>
                    <div style={{
                      height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.1)', overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%', borderRadius: 4, width: `${pct}%`,
                        background: pct === 100 ? 'var(--success)' : pct > 50 ? 'var(--accent-blue)' : 'var(--warning)',
                        transition: 'width .3s',
                      }} />
                    </div>
                  </div>

                  {/* Items */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 200 }}>
                    {(ticket.items || []).map((item, idx) => (
                      <span key={idx} style={{
                        padding: '3px 8px', borderRadius: 'var(--r-sm)', fontSize: '0.75rem', fontWeight: 600,
                        background: item.status === 'bumped' ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.08)',
                        color: item.status === 'bumped' ? 'var(--success)' : '#cbd5e1',
                        textDecoration: item.status === 'bumped' ? 'line-through' : 'none',
                      }}>
                        {item.name} x{item.qty || 1}
                      </span>
                    ))}
                  </div>

                  {/* Timer + Bump */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{
                      fontFamily: 'monospace', fontWeight: 800, fontSize: '1.1rem',
                      color: timerColor(secs),
                    }}>
                      {fmtTime(secs)}
                    </span>
                    {pct < 100 && (
                      <button
                        onClick={() => handleBumpTicket(ticket.id, (ticket.items || []).length)}
                        style={{
                          padding: '8px 18px', borderRadius: 'var(--r-md)', border: 'none',
                          background: 'var(--success)', color: '#fff', fontWeight: 800,
                          fontSize: '0.82rem', cursor: 'pointer', letterSpacing: '0.06em',
                        }}
                      >
                        BUMP ALL
                      </button>
                    )}
                    {pct === 100 && (
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--success)' }}>READY</span>
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
        <div style={{ marginTop: 16 }}>
          {allDaySummary.length === 0 && (
            <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-muted)' }}>
              <BarChart3 size={48} style={{ opacity: 0.25, marginBottom: 12 }} />
              <p style={{ margin: 0 }}>No pending items to display</p>
            </div>
          )}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14,
          }}>
            {allDaySummary.map(item => (
              <div key={item.name} className="animate-fade-up" style={{
                background: 'rgba(26,26,46,0.9)', borderRadius: 'var(--r-lg)',
                padding: '20px 22px', border: '1px solid rgba(255,255,255,0.08)',
                backdropFilter: 'blur(14px)', textAlign: 'center',
              }}>
                <div style={{
                  fontSize: '2.4rem', fontWeight: 900, color: '#fff', lineHeight: 1,
                  marginBottom: 6,
                }}>
                  {item.count}
                </div>
                <div style={{
                  fontSize: '0.95rem', fontWeight: 700, color: '#e2e8f0',
                  marginBottom: 4,
                }}>
                  {item.name}
                </div>
                <div style={{
                  fontSize: '0.72rem', fontWeight: 600, color: '#64748b',
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
        <RecallPanel tickets={kdsTickets} onRecall={handleRecall} onClose={() => setShowRecall(false)} />
      )}
      {recipeItem && (
        <RecipeModal item={recipeItem} recipes={recipes || []} menu={menu} onClose={() => setRecipeItem(null)} />
      )}
    </div>
  );
}
