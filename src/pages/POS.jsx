import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import {
  ShoppingCart, Printer, Split, Bookmark, X, CheckCircle,
  ChevronLeft, User, Clock, Phone, Search, Star, History,
  UtensilsCrossed, Truck, Package, MapPin, CreditCard, Wallet,
  DollarSign, Ban, Percent, Lock, Wifi, WifiOff, ArrowRightLeft,
  RotateCcw, Flame, Pause, Play, Hash, Users, CircleDot,
  Square, Circle, Minus, Plus, ChevronDown, ChevronRight,
  AlertTriangle, Timer, Banknote, BadgeCheck, Armchair,
  GripVertical, Coffee, ReceiptText
} from 'lucide-react';
import { useApp } from '../db/AppContext';
import { getAll, insert, update, getById } from '../db/database';
import { printReceipt } from '../utils/printReceipt';

// ─── Constants ──────────────────────────────────────────────────────────────
const ORDER_TYPES = [
  { key: 'dine-in', label: 'Dine-in', icon: UtensilsCrossed },
  { key: 'takeout', label: 'Takeout', icon: Package },
  { key: 'delivery', label: 'Delivery', icon: Truck },
];

const TABLE_STATUS_COLORS = {
  available: '#22c55e',
  seated: '#3b82f6',
  ordered: '#f97316',
  eating: '#eab308',
  paying: '#a855f7',
  'needs-bussing': '#94a3b8',
  reserved: '#ec4899',
};

const TABLE_STATUS_LABELS = {
  available: 'Available',
  seated: 'Seated',
  ordered: 'Ordered',
  eating: 'Eating',
  paying: 'Paying',
  'needs-bussing': 'Bussing',
  reserved: 'Reserved',
};

const SPLIT_MODES = [
  { key: 'even', label: 'Split Evenly' },
  { key: 'item', label: 'By Items' },
  { key: 'seat', label: 'By Seat' },
  { key: 'custom', label: 'Custom Amount' },
];

const COMP_REASONS = [
  'Manager Comp', 'Kitchen Error', 'Wrong Order', 'Customer Complaint',
  'Quality Issue', 'Long Wait', 'Spill/Accident', 'Employee Meal',
  'Marketing / PR', 'Other',
];

const VOID_REASONS = [
  'Customer Changed Mind', 'Wrong Item Entered', 'Item 86\'d',
  'Duplicate Entry', 'Kitchen Unable', 'Other',
];

const DISCOUNT_REASONS = [
  'Happy Hour', 'Loyalty Reward', 'Senior Discount', 'Military Discount',
  'Staff Discount', 'Promo Code', 'Birthday Special', 'Other',
];


// ─── Portal Modal ───────────────────────────────────────────────────────────
const Modal = ({ title, onClose, children, wide, extraWide }) =>
  ReactDOM.createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal animate-fade-up"
        style={extraWide ? { maxWidth: '820px', width: '95%' } : wide ? { maxWidth: '640px', width: '95%' } : {}}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );


// ─── Success Toast ──────────────────────────────────────────────────────────
const Toast = ({ message }) => {
  if (!message) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 10000,
      background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: 'white',
      padding: '12px 20px', borderRadius: 'var(--r-lg)',
      display: 'flex', alignItems: 'center', gap: '8px',
      fontWeight: 600, boxShadow: '0 8px 24px rgba(34,197,94,0.35)',
      fontSize: '0.88rem', animation: 'fade-up 0.3s ease',
    }}>
      <CheckCircle size={17} /> {message}
    </div>
  );
};


// ─── Offline Banner ─────────────────────────────────────────────────────────
const OfflineBanner = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    const interval = setInterval(() => {
      setQueueCount(window.__offlineQueueCount || 0);
    }, 2000);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      clearInterval(interval);
    };
  }, []);

  if (isOnline) return null;
  return (
    <div style={{
      background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white',
      padding: '8px 16px', borderRadius: 'var(--r-md)', marginBottom: 12,
      display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', fontWeight: 600,
    }}>
      <WifiOff size={16} />
      <span>Offline Mode - Orders are being queued locally</span>
      {queueCount > 0 && (
        <span style={{
          background: 'rgba(255,255,255,0.25)', borderRadius: 20, padding: '2px 10px',
          fontSize: '0.75rem',
        }}>
          {queueCount} pending
        </span>
      )}
    </div>
  );
};


// ─── Turn Time Timer ────────────────────────────────────────────────────────
const TurnTimer = ({ seatedAt }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!seatedAt) return;
    const calc = () => Math.floor((Date.now() - new Date(seatedAt).getTime()) / 60000);
    setElapsed(calc());
    const t = setInterval(() => setElapsed(calc()), 30000);
    return () => clearInterval(t);
  }, [seatedAt]);

  if (!seatedAt) return null;
  const hrs = Math.floor(elapsed / 60);
  const mins = elapsed % 60;
  const color = elapsed > 90 ? '#ef4444' : elapsed > 60 ? '#f59e0b' : '#64748b';

  return (
    <span style={{ fontSize: '0.65rem', color, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 2 }}>
      <Timer size={9} />
      {hrs > 0 ? `${hrs}h ` : ''}{mins}m
    </span>
  );
};


// ─── Guest Check-in Modal ───────────────────────────────────────────────────
const GuestModal = ({ tableId, onConfirm, onClose }) => {
  const [tab, setTab] = useState('search');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });

  const allGuests = getAll('guests') || [];
  const filteredGuests = query.trim()
    ? allGuests.filter(g =>
        g.name?.toLowerCase().includes(query.toLowerCase()) ||
        (g.phone || '').includes(query)
      )
    : allGuests.slice(-10).reverse();

  const getGuestHistory = (guestId) => {
    return (getAll('orders') || []).filter(o => o.guestId === guestId).reverse();
  };

  const handleWalkIn = () => onConfirm({ name: 'Walk-in Guest', isWalkIn: true });

  const handleConfirmGuest = () => {
    if (selected) onConfirm({ ...selected, isExisting: true });
  };

  const handleCreateNew = async () => {
    if (!form.name.trim()) return;
    const newGuest = await insert('guests', {
      name: form.name, phone: form.phone, email: form.email,
      notes: form.notes, visitCount: 0, totalSpend: 0,
    });
    onConfirm({ ...newGuest, isNew: true });
  };

  const history = selected ? getGuestHistory(selected.id) : [];

  return (
    <Modal title={`Guest Check-in${tableId ? ` - Table ${tableId}` : ''}`} onClose={onClose} wide>
      <div style={{ display: 'flex', gap: '4px', padding: '0 20px', borderBottom: '1px solid var(--border-subtle)' }}>
        {['search', 'new'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: tab === t ? 700 : 500, fontSize: '0.85rem',
            color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: '-1px',
          }}>
            {t === 'search' ? 'Find Guest' : '+ New Guest'}
          </button>
        ))}
      </div>

      <div className="modal-body">
        {tab === 'search' ? (
          <div style={{ display: selected ? 'grid' : 'block', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <div style={{ position: 'relative', marginBottom: '12px' }}>
                <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input
                  className="input-field" style={{ paddingLeft: 36 }}
                  placeholder="Search by name or phone..."
                  value={query} onChange={e => { setQuery(e.target.value); setSelected(null); }}
                  autoFocus
                />
              </div>
              <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {filteredGuests.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem', padding: '20px 0' }}>No guests found. Try "New Guest" tab.</p>
                ) : filteredGuests.map(g => (
                  <button key={g.id} onClick={() => setSelected(g)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px',
                      borderRadius: 'var(--r-lg)', border: `1.5px solid ${selected?.id === g.id ? 'rgba(124,58,237,0.4)' : 'var(--border-subtle)'}`,
                      background: selected?.id === g.id ? 'rgba(124,58,237,0.06)' : 'rgba(255,255,255,0.5)',
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                    }}>
                    <div style={{ width: 36, height: 36, borderRadius: 'var(--r-md)', background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.9rem', flexShrink: 0 }}>
                      {g.name?.charAt(0) || '?'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{g.name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {g.phone && `${g.phone} | `}{g.visitCount || 0} visits
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            {selected && (
              <div style={{ borderLeft: '1px solid var(--border-subtle)', paddingLeft: '16px' }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '10px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <History size={16} /> {selected.name}'s History
                </div>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ flex: 1, padding: '10px', background: 'rgba(124,58,237,0.06)', borderRadius: 'var(--r-md)', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--primary)' }}>{selected.visitCount || 0}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Visits</div>
                  </div>
                  <div style={{ flex: 1, padding: '10px', background: 'rgba(34,197,94,0.06)', borderRadius: 'var(--r-md)', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--success)' }}>
                      {(selected.totalSpend || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Spent</div>
                  </div>
                </div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Past Orders</div>
                <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {history.length === 0 ? (
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No past orders found.</p>
                  ) : history.slice(0, 6).map(o => (
                    <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.5)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                      <div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 600 }}>{o.billNo}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{new Date(o.createdAt).toLocaleDateString('en-IN')}</div>
                      </div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--primary)' }}>
                        {(o.total || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  ))}
                </div>
                {selected.notes && (
                  <div style={{ marginTop: '10px', padding: '8px 10px', background: 'rgba(245,158,11,0.06)', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.2)', fontSize: '0.75rem', color: '#92400e' }}>
                    Note: {selected.notes}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="input-group" style={{ gridColumn: '1/-1' }}>
              <label className="input-label">Full Name *</label>
              <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Rahul Sharma" autoFocus />
            </div>
            <div className="input-group">
              <label className="input-label">Phone</label>
              <input className="input-field" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 XXXXX XXXXX" type="tel" />
            </div>
            <div className="input-group">
              <label className="input-label">Email</label>
              <input className="input-field" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="guest@email.com" type="email" />
            </div>
            <div className="input-group" style={{ gridColumn: '1/-1' }}>
              <label className="input-label">Notes / Preferences</label>
              <input className="input-field" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Nut allergy, window seat..." />
            </div>
          </div>
        )}
      </div>

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={handleWalkIn}>Walk-in (No Profile)</button>
        {tab === 'search' && selected && (
          <button className="btn btn-primary" onClick={handleConfirmGuest}>
            <CheckCircle size={15} /> Check In {selected.name}
          </button>
        )}
        {tab === 'new' && (
          <button className="btn btn-primary" onClick={handleCreateNew} disabled={!form.name.trim()}>
            <User size={15} /> Create & Check In
          </button>
        )}
      </div>
    </Modal>
  );
};


// ─── Modifier Selection Modal ───────────────────────────────────────────────
const ModifierModal = ({ item, modifierGroups, onConfirm, onClose }) => {
  const [selections, setSelections] = useState({});
  const [currentGroupIdx, setCurrentGroupIdx] = useState(0);
  const [specialInstructions, setSpecialInstructions] = useState('');

  const groups = (item.modifierGroups || []).map(gId => modifierGroups.find(g => g.id === gId)).filter(Boolean);

  if (groups.length === 0) {
    // No modifier groups, just confirm
    return (
      <Modal title={`Add ${item.name}`} onClose={onClose}>
        <div className="modal-body">
          <div className="input-group">
            <label className="input-label">Special Instructions</label>
            <input className="input-field" value={specialInstructions} onChange={e => setSpecialInstructions(e.target.value)} placeholder="e.g. Extra spicy, no onions..." />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onConfirm({ modifiers: [], specialInstructions })}>
            <Plus size={15} /> Add to Order
          </button>
        </div>
      </Modal>
    );
  }

  const currentGroup = groups[currentGroupIdx];
  const isLast = currentGroupIdx === groups.length - 1;
  const isFirst = currentGroupIdx === 0;

  const toggleModifier = (groupId, option) => {
    setSelections(prev => {
      const current = prev[groupId] || [];
      const group = groups.find(g => g.id === groupId);
      const maxSelections = group?.maxSelections || 1;

      if (current.some(s => s.name === option.name)) {
        return { ...prev, [groupId]: current.filter(s => s.name !== option.name) };
      }
      if (maxSelections === 1) {
        return { ...prev, [groupId]: [option] };
      }
      if (current.length >= maxSelections) return prev;
      return { ...prev, [groupId]: [...current, option] };
    });
  };

  const isSelected = (groupId, option) => (selections[groupId] || []).some(s => s.name === option.name);

  const handleConfirm = () => {
    const allMods = Object.entries(selections).flatMap(([, opts]) => opts);
    onConfirm({ modifiers: allMods, specialInstructions });
  };

  const canProceed = () => {
    if (!currentGroup) return true;
    const min = currentGroup.minSelections || 0;
    return (selections[currentGroup.id] || []).length >= min;
  };

  return (
    <Modal title={`Customize ${item.name}`} onClose={onClose} wide>
      {/* Progress dots */}
      {groups.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '8px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          {groups.map((g, idx) => (
            <div key={g.id} style={{
              width: 8, height: 8, borderRadius: '50%',
              background: idx === currentGroupIdx ? 'var(--primary)' : idx < currentGroupIdx ? 'var(--success)' : 'var(--border-subtle)',
              transition: 'all 0.2s',
            }} />
          ))}
        </div>
      )}

      <div className="modal-body">
        {currentGroup && (
          <>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: 4 }}>
                {currentGroup.name}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {currentGroup.minSelections > 0 ? `Required - ` : 'Optional - '}
                {currentGroup.maxSelections === 1 ? 'Choose one' : `Choose up to ${currentGroup.maxSelections}`}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
              {(currentGroup.options || []).map(opt => {
                const sel = isSelected(currentGroup.id, opt);
                return (
                  <button key={opt.name} onClick={() => toggleModifier(currentGroup.id, opt)}
                    style={{
                      padding: '10px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer',
                      border: `1.5px solid ${sel ? 'rgba(124,58,237,0.4)' : 'var(--border-subtle)'}`,
                      background: sel ? 'rgba(124,58,237,0.06)' : 'rgba(255,255,255,0.5)',
                      textAlign: 'left', transition: 'all 0.15s',
                    }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{opt.name}</div>
                    {opt.price > 0 && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 700 }}>+{opt.price.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</div>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {isLast && (
          <div className="input-group" style={{ marginTop: 16 }}>
            <label className="input-label">Special Instructions</label>
            <input className="input-field" value={specialInstructions} onChange={e => setSpecialInstructions(e.target.value)} placeholder="e.g. Extra spicy, no onions..." />
          </div>
        )}
      </div>

      <div className="modal-footer">
        {!isFirst && (
          <button className="btn btn-secondary" onClick={() => setCurrentGroupIdx(i => i - 1)}>
            <ChevronLeft size={15} /> Back
          </button>
        )}
        <div style={{ flex: 1 }} />
        {isLast ? (
          <button className="btn btn-primary" onClick={handleConfirm} disabled={!canProceed()}>
            <Plus size={15} /> Add to Order
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => setCurrentGroupIdx(i => i + 1)} disabled={!canProceed()}>
            Next <ChevronRight size={15} />
          </button>
        )}
      </div>
    </Modal>
  );
};


// ─── Advanced Split Bill Modal ──────────────────────────────────────────────
const SplitBillModal = ({ cart, grandTotal, gstRate, onClose, onApply }) => {
  const [mode, setMode] = useState('even');
  const [splitCount, setSplitCount] = useState(2);
  const [itemAssignments, setItemAssignments] = useState(() => {
    const a = {};
    cart.forEach(item => { a[item.id] = 'A'; });
    return a;
  });
  const [seatAssignments, setSeatAssignments] = useState(() => {
    const a = {};
    cart.forEach(item => { a[item.id] = item.seat || 1; });
    return a;
  });
  const [customAmounts, setCustomAmounts] = useState(['', '']);

  const perPerson = grandTotal / splitCount;

  const getItemSplitTotals = () => {
    const totals = {};
    cart.forEach(item => {
      const person = itemAssignments[item.id] || 'A';
      const lineTotal = item.price * item.qty * (1 + gstRate / 100);
      totals[person] = (totals[person] || 0) + lineTotal;
    });
    return totals;
  };

  const getSeatSplitTotals = () => {
    const totals = {};
    cart.forEach(item => {
      const seat = seatAssignments[item.id] || 1;
      const lineTotal = item.price * item.qty * (1 + gstRate / 100);
      totals[seat] = (totals[seat] || 0) + lineTotal;
    });
    return totals;
  };

  const persons = ['A', 'B', 'C', 'D', 'E'];

  return (
    <Modal title="Split Bill" onClose={onClose} wide>
      {/* Mode Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 20px', borderBottom: '1px solid var(--border-subtle)' }}>
        {SPLIT_MODES.map(m => (
          <button key={m.key} onClick={() => setMode(m.key)} style={{
            padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: mode === m.key ? 700 : 500, fontSize: '0.82rem',
            color: mode === m.key ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: mode === m.key ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: -1, whiteSpace: 'nowrap',
          }}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="modal-body">
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 12 }}>
          Total: <strong style={{ color: 'var(--primary)' }}>{grandTotal.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</strong>
        </div>

        {mode === 'even' && (
          <>
            <div className="input-group">
              <label className="input-label">Number of People</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setSplitCount(c => Math.max(2, c - 1))} style={{ width: 36, padding: '6px' }}><Minus size={14} /></button>
                <span style={{ fontWeight: 800, fontSize: '1.2rem', width: 36, textAlign: 'center' }}>{splitCount}</span>
                <button className="btn btn-secondary btn-sm" onClick={() => setSplitCount(c => Math.min(12, c + 1))} style={{ width: 36, padding: '6px' }}><Plus size={14} /></button>
              </div>
            </div>
            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: `repeat(${Math.min(splitCount, 4)}, 1fr)`, gap: 8 }}>
              {Array.from({ length: splitCount }, (_, i) => (
                <div key={i} style={{
                  padding: 14, borderRadius: 'var(--r-md)', textAlign: 'center',
                  background: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.15)',
                }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Person {i + 1}</div>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--primary)' }}>
                    {perPerson.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {mode === 'item' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {persons.slice(0, 3).map(p => (
                <span key={p} style={{
                  padding: '4px 10px', borderRadius: 'var(--r-sm)', fontSize: '0.75rem', fontWeight: 700,
                  background: p === 'A' ? 'rgba(124,58,237,0.1)' : p === 'B' ? 'rgba(59,130,246,0.1)' : 'rgba(34,197,94,0.1)',
                  color: p === 'A' ? 'var(--primary)' : p === 'B' ? 'var(--accent-blue)' : 'var(--success)',
                }}>
                  Person {p}
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {cart.map(item => (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  borderRadius: 'var(--r-md)', background: 'rgba(255,255,255,0.5)',
                  border: '1px solid var(--border-subtle)',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{item.name} x{item.qty}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {(item.price * item.qty).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {persons.slice(0, 3).map(p => (
                      <button key={p} onClick={() => setItemAssignments(prev => ({ ...prev, [item.id]: p }))}
                        style={{
                          width: 30, height: 30, borderRadius: 'var(--r-sm)', border: 'none', cursor: 'pointer',
                          fontWeight: 700, fontSize: '0.78rem',
                          background: itemAssignments[item.id] === p
                            ? (p === 'A' ? 'var(--primary)' : p === 'B' ? 'var(--accent-blue)' : 'var(--success)')
                            : 'var(--border-subtle)',
                          color: itemAssignments[item.id] === p ? 'white' : 'var(--text-muted)',
                        }}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              {Object.entries(getItemSplitTotals()).map(([person, total]) => (
                <div key={person} style={{
                  flex: 1, padding: 10, borderRadius: 'var(--r-md)', textAlign: 'center',
                  background: person === 'A' ? 'rgba(124,58,237,0.06)' : person === 'B' ? 'rgba(59,130,246,0.06)' : 'rgba(34,197,94,0.06)',
                  border: '1px solid var(--border-subtle)',
                }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Person {person}</div>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                    {total.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {mode === 'seat' && (
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {cart.map(item => (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  borderRadius: 'var(--r-md)', background: 'rgba(255,255,255,0.5)',
                  border: '1px solid var(--border-subtle)',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{item.name} x{item.qty}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Armchair size={13} style={{ color: 'var(--text-muted)' }} />
                    <select value={seatAssignments[item.id] || 1}
                      onChange={e => setSeatAssignments(prev => ({ ...prev, [item.id]: parseInt(e.target.value) }))}
                      className="input-field" style={{ width: 70, padding: '4px 8px', fontSize: '0.78rem' }}
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8].map(s => <option key={s} value={s}>Seat {s}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(getSeatSplitTotals()).map(([seat, total]) => (
                <div key={seat} style={{
                  padding: 10, borderRadius: 'var(--r-md)', textAlign: 'center', minWidth: 80,
                  background: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.15)',
                }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Seat {seat}</div>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--primary)' }}>
                    {total.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {mode === 'custom' && (
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {customAmounts.map((amt, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, width: 70 }}>Person {idx + 1}</span>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.82rem' }}>INR</span>
                    <input className="input-field" type="number" style={{ paddingLeft: 44 }}
                      value={amt} onChange={e => {
                        const next = [...customAmounts];
                        next[idx] = e.target.value;
                        setCustomAmounts(next);
                      }}
                      placeholder="0.00"
                    />
                  </div>
                  {idx >= 2 && (
                    <button className="btn btn-secondary btn-sm" style={{ padding: '6px' }}
                      onClick={() => setCustomAmounts(prev => prev.filter((_, i) => i !== idx))}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }}
              onClick={() => setCustomAmounts(prev => [...prev, ''])}
            >
              <Plus size={14} /> Add Person
            </button>
            {(() => {
              const sum = customAmounts.reduce((s, a) => s + (parseFloat(a) || 0), 0);
              const diff = grandTotal - sum;
              return (
                <div style={{
                  marginTop: 12, padding: 10, borderRadius: 'var(--r-md)', fontSize: '0.82rem',
                  background: Math.abs(diff) < 0.01 ? 'rgba(34,197,94,0.06)' : 'rgba(245,158,11,0.06)',
                  border: `1px solid ${Math.abs(diff) < 0.01 ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)'}`,
                  color: Math.abs(diff) < 0.01 ? '#15803d' : '#92400e',
                  fontWeight: 600,
                }}>
                  {Math.abs(diff) < 0.01 ? 'Amounts match total' : `Remaining: ${diff.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}`}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
        <button className="btn btn-primary" onClick={() => { onApply(mode); onClose(); }}>
          <CheckCircle size={15} /> Apply Split
        </button>
      </div>
    </Modal>
  );
};


// ─── Manager PIN Modal ──────────────────────────────────────────────────────
const ManagerPinModal = ({ title, reasons, onConfirm, onClose, showAmount }) => {
  const [pin, setPin] = useState('');
  const [reason, setReason] = useState(reasons[0]);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    // Accept any 4-digit PIN for demo (in production, validate against staff PINs)
    if (pin.length < 4) {
      setError('Enter a valid 4-digit PIN');
      return;
    }
    if (showAmount && (!amount || parseFloat(amount) <= 0)) {
      setError('Enter a valid amount');
      return;
    }
    onConfirm({ pin, reason, amount: parseFloat(amount) || 0 });
  };

  return (
    <Modal title={title} onClose={onClose}>
      <div className="modal-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '10px 14px', background: 'rgba(245,158,11,0.06)', borderRadius: 'var(--r-md)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <Lock size={16} style={{ color: '#d97706' }} />
          <span style={{ fontSize: '0.82rem', color: '#92400e', fontWeight: 600 }}>Manager authorization required</span>
        </div>

        <div className="input-group">
          <label className="input-label">Manager PIN</label>
          <input className="input-field" type="password" maxLength={6} value={pin}
            onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setError(''); }}
            placeholder="Enter PIN" autoFocus
            style={{ letterSpacing: '0.3em', fontWeight: 700, fontSize: '1.1rem', textAlign: 'center' }}
          />
        </div>

        <div className="input-group">
          <label className="input-label">Reason</label>
          <select className="input-field" value={reason} onChange={e => setReason(e.target.value)}>
            {reasons.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {showAmount && (
          <div className="input-group">
            <label className="input-label">Amount</label>
            <input className="input-field" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
          </div>
        )}

        {error && <div style={{ fontSize: '0.78rem', color: 'var(--danger)', fontWeight: 600, marginTop: 8 }}>{error}</div>}
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSubmit}>
          <Lock size={15} /> Authorize
        </button>
      </div>
    </Modal>
  );
};


// ─── Check Merge Modal ──────────────────────────────────────────────────────
const MergeModal = ({ currentTableId, tables, savedOrders, onMerge, onClose }) => {
  const [selectedTable, setSelectedTable] = useState(null);
  const occupiedTables = tables.filter(t =>
    t.status !== 'available' && t.id !== currentTableId && savedOrders[t.id]?.length > 0
  );

  return (
    <Modal title="Merge Another Tab" onClose={onClose}>
      <div className="modal-body">
        {occupiedTables.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '20px 0' }}>
            No other open tabs to merge.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {occupiedTables.map(t => (
              <button key={t.id} onClick={() => setSelectedTable(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer',
                  border: `1.5px solid ${selectedTable === t.id ? 'rgba(124,58,237,0.4)' : 'var(--border-subtle)'}`,
                  background: selectedTable === t.id ? 'rgba(124,58,237,0.06)' : 'rgba(255,255,255,0.5)',
                }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>Table {t.id}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {t.guestName || 'Guest'} - {savedOrders[t.id]?.length || 0} items
                  </div>
                </div>
                <div style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '0.9rem' }}>
                  {(savedOrders[t.id] || []).reduce((s, i) => s + i.price * i.qty, 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => { if (selectedTable) { onMerge(selectedTable); onClose(); } }} disabled={!selectedTable}>
          <ArrowRightLeft size={15} /> Merge Tab
        </button>
      </div>
    </Modal>
  );
};


// ─── Cash Drawer Panel ──────────────────────────────────────────────────────
const CashDrawerPanel = ({ cashDrawer, onBlindDrop, onClose }) => {
  const [dropAmount, setDropAmount] = useState('');

  const balance = (cashDrawer?.openingBalance || 0) +
    (cashDrawer?.cashIn || 0) -
    (cashDrawer?.cashOut || 0) -
    (cashDrawer?.drops || []).reduce((s, d) => s + d.amount, 0);

  return (
    <Modal title="Cash Drawer" onClose={onClose}>
      <div className="modal-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div style={{ padding: 12, borderRadius: 'var(--r-md)', background: 'rgba(124,58,237,0.05)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Opening</div>
            <div style={{ fontWeight: 800, color: 'var(--primary)' }}>
              {(cashDrawer?.openingBalance || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
            </div>
          </div>
          <div style={{ padding: 12, borderRadius: 'var(--r-md)', background: 'rgba(34,197,94,0.05)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Cash In</div>
            <div style={{ fontWeight: 800, color: 'var(--success)' }}>
              {(cashDrawer?.cashIn || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
            </div>
          </div>
          <div style={{ padding: 12, borderRadius: 'var(--r-md)', background: 'rgba(239,68,68,0.05)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Cash Out</div>
            <div style={{ fontWeight: 800, color: 'var(--danger)' }}>
              {(cashDrawer?.cashOut || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
            </div>
          </div>
          <div style={{ padding: 12, borderRadius: 'var(--r-md)', background: 'rgba(59,130,246,0.05)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Shift Balance</div>
            <div style={{ fontWeight: 800, color: 'var(--accent-blue)' }}>
              {balance.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
          <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 10 }}>Blind Drop</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input-field" type="number" value={dropAmount} onChange={e => setDropAmount(e.target.value)} placeholder="Amount" style={{ flex: 1 }} />
            <button className="btn btn-primary" onClick={() => {
              const amt = parseFloat(dropAmount);
              if (amt > 0) { onBlindDrop(amt); setDropAmount(''); }
            }} disabled={!dropAmount || parseFloat(dropAmount) <= 0}>
              <Banknote size={15} /> Drop
            </button>
          </div>
        </div>

        {(cashDrawer?.drops || []).length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Drop History</div>
            <div style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(cashDrawer.drops || []).slice().reverse().map((d, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.5)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border-subtle)', fontSize: '0.78rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{d.time ? new Date(d.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</span>
                  <span style={{ fontWeight: 700 }}>{d.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
};


// ─── Payment Modal ──────────────────────────────────────────────────────────
const PaymentModal = ({
  cart, cartTotal, tax, gstRate, grandTotal, serviceCharge, autoGratuity,
  discount, activeTable, currentGuest, onConfirm, onClose
}) => {
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [tipAmount, setTipAmount] = useState('');
  const [cashTendered, setCashTendered] = useState('');

  const tipValue = parseFloat(tipAmount) || 0;
  const finalTotal = grandTotal - discount + autoGratuity + tipValue;
  const cashChange = paymentMethod === 'Cash' ? Math.max(0, (parseFloat(cashTendered) || 0) - finalTotal) : 0;

  const payMethods = [
    { key: 'Cash', icon: Banknote, color: '#22c55e' },
    { key: 'UPI', icon: Phone, color: '#7c3aed' },
    { key: 'Card', icon: CreditCard, color: '#3b82f6' },
    { key: 'Wallet', icon: Wallet, color: '#f59e0b' },
  ];

  return (
    <Modal title="Settle Bill" onClose={onClose} wide>
      <div className="modal-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Left: Summary */}
          <div>
            <div style={{
              background: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.15)',
              borderRadius: 'var(--r-lg)', padding: 14,
            }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 10, color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{activeTable ? `Table ${activeTable.id}` : 'Order'}{currentGuest ? ` - ${currentGuest}` : ''}</span>
              </div>
              <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                {cart.map(item => (
                  <div key={item.id + (item._cartKey || '')} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 3 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {item.name} x{item.qty}
                      {item.modifiers?.length > 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}> (+mods)</span>}
                    </span>
                    <span style={{ fontWeight: 600 }}>
                      {((item.price + (item.modifiers || []).reduce((s, m) => s + (m.price || 0), 0)) * item.qty).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ borderTop: '1px dashed var(--border-subtle)', marginTop: 8, paddingTop: 8, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Subtotal</span>
                  <span>{cartTotal.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>GST ({gstRate}%)</span>
                  <span>{tax.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
                </div>
                {serviceCharge > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Service Charge</span>
                    <span>{serviceCharge.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
                  </div>
                )}
                {discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--success)' }}>
                    <span>Discount</span>
                    <span>-{discount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
                  </div>
                )}
                {autoGratuity > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#a855f7' }}>
                    <span>Auto-Gratuity</span>
                    <span>{autoGratuity.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
                  </div>
                )}
                {tipValue > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#d97706' }}>
                    <span>Tip</span>
                    <span>{tipValue.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
                  </div>
                )}
              </div>

              <div style={{
                display: 'flex', justifyContent: 'space-between', fontWeight: 800,
                fontSize: '1.05rem', paddingTop: 8, borderTop: '1.5px solid var(--border-subtle)', marginTop: 6,
              }}>
                <span>TOTAL</span>
                <span style={{ color: 'var(--primary)' }}>{finalTotal.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
              </div>
            </div>
          </div>

          {/* Right: Payment */}
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 10 }}>Payment Method</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              {payMethods.map(pm => {
                const Icon = pm.icon;
                const active = paymentMethod === pm.key;
                return (
                  <button key={pm.key} onClick={() => setPaymentMethod(pm.key)}
                    style={{
                      padding: '14px 12px', borderRadius: 'var(--r-md)', cursor: 'pointer',
                      border: `2px solid ${active ? pm.color : 'var(--border-subtle)'}`,
                      background: active ? `${pm.color}10` : 'rgba(255,255,255,0.5)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                      transition: 'all 0.15s',
                    }}>
                    <Icon size={22} style={{ color: active ? pm.color : 'var(--text-muted)' }} />
                    <span style={{ fontWeight: active ? 700 : 500, fontSize: '0.82rem', color: active ? pm.color : 'var(--text-secondary)' }}>{pm.key}</span>
                  </button>
                );
              })}
            </div>

            <div className="input-group">
              <label className="input-label">Add Tip</label>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {[10, 15, 20].map(pct => (
                  <button key={pct} className="btn btn-secondary btn-sm" style={{ flex: 1 }}
                    onClick={() => setTipAmount(((cartTotal * pct) / 100).toFixed(0))}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
              <input className="input-field" type="number" value={tipAmount} onChange={e => setTipAmount(e.target.value)} placeholder="Custom tip amount" />
            </div>

            {paymentMethod === 'Cash' && (
              <div className="input-group">
                <label className="input-label">Cash Tendered</label>
                <input className="input-field" type="number" value={cashTendered} onChange={e => setCashTendered(e.target.value)}
                  placeholder={finalTotal.toFixed(2)}
                />
                {cashChange > 0 && (
                  <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: 'var(--r-sm)', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', fontSize: '0.82rem', fontWeight: 700, color: '#15803d' }}>
                    Change: {cashChange.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-success" onClick={() => onConfirm(paymentMethod, tipValue, finalTotal)} style={{ minWidth: 200 }}>
          <Printer size={15} /> Settle {finalTotal.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
        </button>
      </div>
    </Modal>
  );
};


// ═══════════════════════════════════════════════════════════════════════════
// ─── Main POS Component ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

const POS = () => {
  const {
    menu, settings, floorPlans, staff, guests, modifiers, cashDrawer,
    placeOrder, fireToKDS, updateCashDrawer, addAuditEntry,
  } = useApp();

  // ── State ─────────────────────────────────────────────────
  const [orderType, setOrderType] = useState('dine-in');
  const [view, setView] = useState('floor'); // 'floor' | 'order'
  const [tables, setTables] = useState([]);
  const [activeTable, setActiveTable] = useState(null);
  const [cart, setCart] = useState([]);
  const [savedOrders, setSavedOrders] = useState({});
  const [activeCategory, setActiveCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Takeout / Delivery fields
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [pickupTime, setPickupTime] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [driverInstructions, setDriverInstructions] = useState('');

  // Modals
  const [guestModal, setGuestModal] = useState(null);
  const [modifierModal, setModifierModal] = useState(null);
  const [splitModal, setSplitModal] = useState(false);
  const [paymentModal, setPaymentModal] = useState(false);
  const [mergeModal, setMergeModal] = useState(false);
  const [cashDrawerModal, setCashDrawerModal] = useState(false);
  const [compModal, setCompModal] = useState(null);    // 'comp' | 'void' | 'discount'
  const [managerPinModal, setManagerPinModal] = useState(null);

  // Course firing & hold
  const [courseFiring, setCourseFiring] = useState({}); // { itemId: courseNumber }
  const [firedCourses, setFiredCourses] = useState(new Set([1]));
  const [holdTimer, setHoldTimer] = useState(0); // minutes
  const [isHeld, setIsHeld] = useState(false);

  // Tab pre-auth
  const [hasCardOnFile, setHasCardOnFile] = useState(false);

  // Discount state
  const [discountAmount, setDiscountAmount] = useState(0);

  // Party size for auto-gratuity
  const [partySize, setPartySize] = useState(1);

  // ── Derived data ──────────────────────────────────────────
  const menuItems = useMemo(() => {
    if (menu && menu.length > 0) return menu.filter(i => i.active !== false && !i.sold86);
    return [
      { id: 'f1', name: 'Paneer Tikka', price: 250, category: 'Starters' },
      { id: 'f2', name: 'Chicken Wings', price: 300, category: 'Starters' },
      { id: 'f3', name: 'Crispy Nachos', price: 180, category: 'Starters' },
      { id: 'f4', name: 'Butter Chicken', price: 450, category: 'Main Course' },
      { id: 'f5', name: 'Garlic Naan', price: 60, category: 'Main Course' },
      { id: 'f6', name: 'Dal Makhani', price: 350, category: 'Main Course' },
      { id: 'f7', name: 'Gulab Jamun', price: 120, category: 'Desserts' },
      { id: 'f8', name: 'Fresh Lime Soda', price: 90, category: 'Beverages' },
      { id: 'f9', name: 'Cold Coffee', price: 150, category: 'Beverages' },
    ];
  }, [menu]);

  const categories = useMemo(() => {
    const cats = [...new Set(menuItems.map(i => i.category).filter(Boolean))];
    return cats.length > 0 ? cats : ['Starters', 'Main Course', 'Desserts', 'Beverages'];
  }, [menuItems]);

  useEffect(() => {
    if (!activeCategory && categories.length > 0) setActiveCategory(categories[0]);
  }, [categories, activeCategory]);

  // Build tables from floorPlans
  useEffect(() => {
    const fp = floorPlans || { tables: [], sections: [] };
    const floorTables = (fp.tables || []).map(t => ({
      id: t.id || t.number,
      number: t.number || t.id,
      seats: t.seats || t.capacity || 4,
      shape: t.shape || 'square',
      section: t.section || t.sectionId || null,
      status: 'available',
      guestName: null,
      guestId: null,
      seatedAt: null,
      serverId: t.serverId || null,
    }));
    if (floorTables.length > 0) {
      setTables(floorTables);
    } else {
      // Fallback: generate 16 tables
      setTables(Array.from({ length: 16 }, (_, i) => ({
        id: i + 1, number: i + 1, seats: [2, 4, 4, 6, 4, 2, 4, 8, 4, 2, 4, 4, 6, 4, 2, 4][i],
        shape: i % 5 === 0 ? 'round' : i % 7 === 0 ? 'bar' : 'square',
        section: i < 4 ? 'Patio' : i < 8 ? 'Main Hall' : i < 12 ? 'Bar' : 'Private',
        status: 'available', guestName: null, guestId: null, seatedAt: null,
        serverId: null,
      })));
    }
  }, [floorPlans]);

  const sections = useMemo(() => {
    const fp = floorPlans || {};
    if (fp.sections?.length > 0) return fp.sections;
    const sectionNames = [...new Set(tables.map(t => t.section).filter(Boolean))];
    return sectionNames.map(name => ({ id: name, name }));
  }, [floorPlans, tables]);

  const serverMap = useMemo(() => {
    const map = {};
    (staff || []).filter(s => s.role === 'server' || s.role === 'waiter' || s.position === 'server').forEach(s => {
      map[s.id] = s;
    });
    return map;
  }, [staff]);

  const gstRate = settings?.billing?.gstRate ?? 5;
  const serviceChargeRate = settings?.billing?.enableServiceCharge ? (settings?.billing?.serviceCharge || 0) : 0;
  const autoGratuityThreshold = settings?.billing?.autoGratuityThreshold || 6;
  const autoGratuityRate = settings?.billing?.autoGratuityRate || 18;
  const currency = settings?.restaurant?.currency || 'INR';

  const cartTotal = useMemo(() => {
    return cart.reduce((s, i) => {
      const modPrice = (i.modifiers || []).reduce((ms, m) => ms + (m.price || 0), 0);
      return s + (i.price + modPrice) * i.qty;
    }, 0);
  }, [cart]);

  const tax = cartTotal * (gstRate / 100);
  const serviceCharge = cartTotal * (serviceChargeRate / 100);
  const autoGratuity = partySize >= autoGratuityThreshold ? cartTotal * (autoGratuityRate / 100) : 0;
  const grandTotal = cartTotal + tax + serviceCharge + autoGratuity - discountAmount;

  // ── Helpers ───────────────────────────────────────────────
  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3500);
  };

  const addToCart = useCallback((item, modData) => {
    const mods = modData?.modifiers || [];
    const special = modData?.specialInstructions || '';
    const cartKey = `${item.id}_${mods.map(m => m.name).sort().join('_')}_${special}`;

    setCart(prev => {
      const existing = prev.find(i => (i._cartKey || i.id) === cartKey);
      if (existing) {
        return prev.map(i => (i._cartKey || i.id) === cartKey ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, {
        ...item, qty: 1, _cartKey: cartKey,
        modifiers: mods, specialInstructions: special,
        course: 1, seat: 1,
      }];
    });
  }, []);

  const handleAddItem = (item) => {
    const hasModGroups = item.modifierGroups && item.modifierGroups.length > 0;
    if (hasModGroups && modifiers.length > 0) {
      setModifierModal(item);
    } else {
      addToCart(item);
    }
  };

  const updateQty = (cartKey, delta) => {
    setCart(prev => prev.map(i => {
      const key = i._cartKey || i.id;
      if (key === cartKey) return { ...i, qty: Math.max(0, i.qty + delta) };
      return i;
    }).filter(i => i.qty > 0));
  };

  const updateCourse = (cartKey, course) => {
    setCart(prev => prev.map(i => {
      const key = i._cartKey || i.id;
      if (key === cartKey) return { ...i, course };
      return i;
    }));
  };

  const updateSeat = (cartKey, seat) => {
    setCart(prev => prev.map(i => {
      const key = i._cartKey || i.id;
      if (key === cartKey) return { ...i, seat };
      return i;
    }));
  };

  // ── Table click ───────────────────────────────────────────
  const handleTableClick = (table) => {
    if (table.status !== 'available') {
      setActiveTable(table);
      setCart(savedOrders[table.id] || []);
      setPartySize(table.partySize || 1);
      setView('order');
    } else {
      setGuestModal(table.id);
    }
  };

  const handleGuestConfirmed = (guest) => {
    const tableId = guestModal;
    setTables(prev => prev.map(t => t.id === tableId
      ? { ...t, status: 'seated', guestName: guest.name, guestId: guest.id || null, seatedAt: new Date().toISOString() }
      : t
    ));
    const table = tables.find(t => t.id === tableId);
    const updatedTable = { ...table, status: 'seated', guestName: guest.name, guestId: guest.id || null, seatedAt: new Date().toISOString() };
    setActiveTable(updatedTable);
    setCart(savedOrders[tableId] || []);
    setGuestModal(null);
    setView('order');
  };

  // ── KOT / Fire ────────────────────────────────────────────
  const handleSaveKOT = () => {
    if (cart.length === 0) return;
    setSavedOrders(prev => ({ ...prev, [activeTable?.id || 'takeout']: cart }));
    if (activeTable) {
      setTables(prev => prev.map(t => t.id === activeTable.id ? { ...t, status: 'ordered' } : t));
    }
    showSuccess('KOT saved! Kitchen notified.');
  };

  const handleFireNextCourse = () => {
    const nextCourse = Math.min(...cart.filter(i => !firedCourses.has(i.course)).map(i => i.course));
    if (isFinite(nextCourse)) {
      const courseItems = cart.filter(i => i.course === nextCourse);
      setFiredCourses(prev => new Set([...prev, nextCourse]));
      const orderId = activeTable ? `T${activeTable.id}` : 'takeout';
      fireToKDS(orderId, courseItems, activeTable?.id, orderType);
      showSuccess(`Course ${nextCourse} fired to kitchen!`);
    }
  };

  const handleRepeatLastRound = () => {
    const beverages = cart.filter(i => (i.category || '').toLowerCase().includes('beverage'));
    if (beverages.length === 0) return;
    setCart(prev => {
      const next = [...prev];
      beverages.forEach(bev => {
        const idx = next.findIndex(i => (i._cartKey || i.id) === (bev._cartKey || bev.id));
        if (idx >= 0) next[idx] = { ...next[idx], qty: next[idx].qty + bev.qty };
      });
      return next;
    });
    showSuccess('Last round repeated!');
  };

  const handleHoldFire = () => {
    if (holdTimer > 0) {
      setIsHeld(true);
      showSuccess(`Ticket held for ${holdTimer} minutes`);
    }
  };

  // ── Merge ─────────────────────────────────────────────────
  const handleMerge = (fromTableId) => {
    const fromItems = savedOrders[fromTableId] || [];
    setCart(prev => {
      const merged = [...prev];
      fromItems.forEach(item => {
        const existing = merged.find(i => (i._cartKey || i.id) === (item._cartKey || item.id));
        if (existing) {
          existing.qty += item.qty;
        } else {
          merged.push({ ...item });
        }
      });
      return merged;
    });
    setSavedOrders(prev => {
      const next = { ...prev };
      delete next[fromTableId];
      return next;
    });
    setTables(prev => prev.map(t => t.id === fromTableId
      ? { ...t, status: 'available', guestName: null, guestId: null, seatedAt: null }
      : t
    ));
    showSuccess(`Table ${fromTableId} merged into current tab`);
  };

  // ── Comp / Void / Discount ────────────────────────────────
  const handleManagerAction = (action) => {
    setManagerPinModal(action);
  };

  const handleManagerPinConfirm = (data) => {
    const action = managerPinModal;
    if (action === 'comp') {
      setDiscountAmount(prev => prev + data.amount);
      addAuditEntry('COMP', 'manager', 'Manager', `Comp: ${data.reason} - ${data.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}`);
      showSuccess(`Comp applied: ${data.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}`);
    } else if (action === 'void') {
      // Void removes last item
      if (cart.length > 0) {
        const lastItem = cart[cart.length - 1];
        const voidAmount = lastItem.price * lastItem.qty;
        setCart(prev => prev.slice(0, -1));
        addAuditEntry('VOID', 'manager', 'Manager', `Void: ${lastItem.name} - ${data.reason}`);
        showSuccess(`Voided: ${lastItem.name}`);
      }
    } else if (action === 'discount') {
      const discAmt = data.amount > 0 ? data.amount : 0;
      setDiscountAmount(prev => prev + discAmt);
      addAuditEntry('DISCOUNT', 'manager', 'Manager', `Discount: ${data.reason} - ${discAmt.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}`);
      showSuccess(`Discount: ${discAmt.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}`);
    }
    setManagerPinModal(null);
  };

  // ── Blind Drop ────────────────────────────────────────────
  const handleBlindDrop = (amount) => {
    const drops = [...(cashDrawer?.drops || []), { amount, time: new Date().toISOString() }];
    updateCashDrawer({ ...cashDrawer, drops });
    addAuditEntry('BLIND_DROP', 'cashier', 'Cashier', `Blind drop: ${amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}`);
    showSuccess(`Blind drop: ${amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}`);
  };

  // ── Payment ───────────────────────────────────────────────
  const handleConfirmPayment = async (paymentMethod, tipValue, finalTotal) => {
    if (cart.length === 0) return;

    const extra = {
      orderType,
      customerName: orderType !== 'dine-in' ? customerName : activeTable?.guestName,
      customerPhone,
      pickupTime: orderType === 'takeout' ? pickupTime : undefined,
      deliveryAddress: orderType === 'delivery' ? deliveryAddress : undefined,
      driverInstructions: orderType === 'delivery' ? driverInstructions : undefined,
      tip: tipValue,
      autoGratuity,
      discount: discountAmount,
      serviceCharge,
      partySize,
    };

    const tableId = activeTable?.id || null;
    const order = await placeOrder(tableId, cart, paymentMethod, extra);

    // Update guest
    if (activeTable?.guestId) {
      const guest = (getAll('guests') || []).find(g => g.id === activeTable.guestId);
      if (guest) {
        update('guests', activeTable.guestId, {
          visitCount: (guest.visitCount || 0) + 1,
          totalSpend: (guest.totalSpend || 0) + (order.total || finalTotal),
        });
      }
    }

    // Update cash drawer for cash payments
    if (paymentMethod === 'Cash') {
      updateCashDrawer({ ...cashDrawer, cashIn: (cashDrawer?.cashIn || 0) + finalTotal });
    }

    // Print receipt
    printReceipt({
      order: { ...order, items: cart },
      settings, tableId,
      guestName: activeTable?.guestName || customerName,
    });

    // Clear table
    if (activeTable) {
      setSavedOrders(prev => { const next = { ...prev }; delete next[activeTable.id]; return next; });
      setTables(prev => prev.map(t => t.id === activeTable.id
        ? { ...t, status: 'available', guestName: null, guestId: null, seatedAt: null }
        : t
      ));
    }

    // Fire to KDS
    fireToKDS(order.id || Date.now().toString(), cart, tableId, orderType);

    // Reset
    setCart([]);
    setPaymentModal(false);
    setDiscountAmount(0);
    setFiredCourses(new Set([1]));
    setIsHeld(false);
    setHoldTimer(0);
    setPartySize(1);
    setCustomerName('');
    setCustomerPhone('');
    setPickupTime('');
    setDeliveryAddress('');
    setDriverInstructions('');
    setView('floor');
    showSuccess(`Bill settled! ${(order.total || finalTotal).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })} via ${paymentMethod}`);
  };

  // Takeout/Delivery: go straight to order view
  const handleStartTakeoutDelivery = () => {
    setActiveTable(null);
    setCart([]);
    setView('order');
  };

  // Filtered menu items
  const filteredItems = useMemo(() => {
    let items = menuItems;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i => i.name?.toLowerCase().includes(q));
    } else {
      items = items.filter(i => i.category === activeCategory);
    }
    return items;
  }, [menuItems, activeCategory, searchQuery]);

  // ═══════════════════════════════════════════════════════════
  // ─── FLOOR / TABLE VIEW ───────────────────────────────────
  // ═══════════════════════════════════════════════════════════
  if (view === 'floor') {
    return (
      <div className="animate-fade-up">
        <Toast message={successMsg} />
        <OfflineBanner />

        {/* Header */}
        <div className="page-title-row" style={{ marginBottom: 16 }}>
          <h1 className="page-title">POS & Billing</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setCashDrawerModal(true)}>
              <Banknote size={14} /> Cash Drawer
            </button>
          </div>
        </div>

        {/* Order Type Tabs */}
        <div style={{
          display: 'flex', gap: 6, marginBottom: 16, padding: 4,
          background: 'rgba(255,255,255,0.5)', borderRadius: 'var(--r-lg)',
          backdropFilter: 'blur(12px)', border: '1px solid var(--border-subtle)',
          width: 'fit-content',
        }}>
          {ORDER_TYPES.map(ot => {
            const Icon = ot.icon;
            const active = orderType === ot.key;
            return (
              <button key={ot.key} onClick={() => setOrderType(ot.key)}
                style={{
                  padding: '8px 18px', borderRadius: 'var(--r-md)', border: 'none', cursor: 'pointer',
                  background: active ? 'var(--primary)' : 'transparent',
                  color: active ? 'white' : 'var(--text-secondary)',
                  fontWeight: active ? 700 : 500, fontSize: '0.85rem',
                  display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s',
                }}>
                <Icon size={15} /> {ot.label}
              </button>
            );
          })}
        </div>

        {/* Dine-in: Floor Plan */}
        {orderType === 'dine-in' && (
          <>
            {/* Status Legend */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              {Object.entries(TABLE_STATUS_COLORS).map(([status, color]) => (
                <span key={status} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', boxShadow: `0 0 6px ${color}50` }} />
                  {TABLE_STATUS_LABELS[status]}
                </span>
              ))}
            </div>

            {/* Server Sections */}
            {sections.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                {sections.map(sec => {
                  const sectionTables = tables.filter(t => t.section === sec.name || t.section === sec.id);
                  const serverIds = [...new Set(sectionTables.map(t => t.serverId).filter(Boolean))];
                  return (
                    <div key={sec.id || sec.name} style={{
                      padding: '6px 12px', borderRadius: 'var(--r-md)',
                      background: 'rgba(255,255,255,0.6)', border: '1px solid var(--border-subtle)',
                      fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{sec.name}</span>
                      {serverIds.length > 0 && (
                        <span style={{ color: 'var(--text-muted)' }}>
                          {serverIds.map(id => serverMap[id]?.name || 'Staff').join(', ')}
                        </span>
                      )}
                      <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{sectionTables.length} tables</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Table Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 12 }}>
              {tables.map(table => {
                const statusColor = TABLE_STATUS_COLORS[table.status] || TABLE_STATUS_COLORS.available;
                const isOccupied = table.status !== 'available';
                const hasOrder = savedOrders[table.id]?.length > 0;
                const serverName = table.serverId && serverMap[table.serverId]?.name;

                return (
                  <button key={table.id} onClick={() => handleTableClick(table)}
                    style={{
                      padding: '16px 14px', textAlign: 'left', cursor: 'pointer',
                      borderRadius: table.shape === 'round' ? '50%' : table.shape === 'bar' ? 'var(--r-xl)' : 'var(--r-xl)',
                      background: 'var(--card-bg)', backdropFilter: 'blur(20px)',
                      border: `2px solid ${statusColor}40`,
                      boxShadow: `0 4px 14px ${statusColor}15`,
                      transition: 'all 0.2s', position: 'relative',
                      minHeight: table.shape === 'round' ? 155 : 'auto',
                      display: 'flex', flexDirection: 'column',
                      justifyContent: table.shape === 'round' ? 'center' : 'flex-start',
                      alignItems: table.shape === 'round' ? 'center' : 'stretch',
                    }}
                    onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 10px 28px ${statusColor}25`; }}
                    onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 4px 14px ${statusColor}15`; }}
                  >
                    {/* Status dot */}
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%', background: statusColor,
                      boxShadow: `0 0 8px ${statusColor}80`,
                      position: table.shape === 'round' ? 'absolute' : 'relative',
                      top: table.shape === 'round' ? 12 : 'auto',
                      right: table.shape === 'round' ? 12 : 'auto',
                      marginBottom: table.shape === 'round' ? 0 : 8,
                    }} />

                    {/* Table shape icon */}
                    {table.shape === 'round' && <Circle size={18} style={{ color: statusColor, marginBottom: 4, opacity: 0.5 }} />}
                    {table.shape === 'bar' && <Coffee size={18} style={{ color: statusColor, marginBottom: 4, opacity: 0.5 }} />}
                    {table.shape === 'square' && <Square size={14} style={{ color: statusColor, marginBottom: 4, opacity: 0.5 }} />}

                    <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: 2, textAlign: table.shape === 'round' ? 'center' : 'left' }}>
                      T{table.number}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: table.shape === 'round' ? 'center' : 'left' }}>
                      {table.seats} seats{table.section ? ` | ${table.section}` : ''}
                    </div>

                    {isOccupied && (
                      <div style={{ marginTop: 4, fontSize: '0.7rem', color: 'var(--text-secondary)', textAlign: table.shape === 'round' ? 'center' : 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: table.shape === 'round' ? 'center' : 'flex-start' }}>
                          <User size={10} /> {table.guestName || 'Guest'}
                        </div>
                        <TurnTimer seatedAt={table.seatedAt} />
                      </div>
                    )}

                    {serverName && (
                      <div style={{ fontSize: '0.62rem', color: 'var(--primary)', fontWeight: 600, marginTop: 2, textAlign: table.shape === 'round' ? 'center' : 'left' }}>
                        {serverName}
                      </div>
                    )}

                    {hasOrder && (
                      <div style={{
                        position: 'absolute', top: 8, right: 8,
                        background: 'var(--primary)', color: 'white',
                        borderRadius: 'var(--r-sm)', padding: '1px 6px',
                        fontSize: '0.62rem', fontWeight: 700,
                      }}>
                        KOT
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Takeout view */}
        {orderType === 'takeout' && (
          <div className="card" style={{ maxWidth: 500, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 16, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Package size={18} /> New Takeout Order
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="input-group">
                <label className="input-label">Customer Name *</label>
                <input className="input-field" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="e.g. Rahul" />
              </div>
              <div className="input-group">
                <label className="input-label">Phone *</label>
                <input className="input-field" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="+91 XXXXX XXXXX" type="tel" />
              </div>
              <div className="input-group" style={{ gridColumn: '1/-1' }}>
                <label className="input-label">Pickup Time</label>
                <input className="input-field" type="time" value={pickupTime} onChange={e => setPickupTime(e.target.value)} />
              </div>
            </div>
            <button className="btn btn-primary" style={{ marginTop: 16, width: '100%' }} onClick={handleStartTakeoutDelivery} disabled={!customerName.trim()}>
              <ShoppingCart size={15} /> Start Order
            </button>
          </div>
        )}

        {/* Delivery view */}
        {orderType === 'delivery' && (
          <div className="card" style={{ maxWidth: 500, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 16, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Truck size={18} /> New Delivery Order
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="input-group">
                <label className="input-label">Customer Name *</label>
                <input className="input-field" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="e.g. Rahul" />
              </div>
              <div className="input-group">
                <label className="input-label">Phone *</label>
                <input className="input-field" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="+91 XXXXX XXXXX" type="tel" />
              </div>
              <div className="input-group" style={{ gridColumn: '1/-1' }}>
                <label className="input-label">Delivery Address *</label>
                <input className="input-field" value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} placeholder="Full address..." />
              </div>
              <div className="input-group" style={{ gridColumn: '1/-1' }}>
                <label className="input-label">Driver Instructions</label>
                <input className="input-field" value={driverInstructions} onChange={e => setDriverInstructions(e.target.value)} placeholder="e.g. Ring doorbell, leave at gate..." />
              </div>
            </div>
            <button className="btn btn-primary" style={{ marginTop: 16, width: '100%' }} onClick={handleStartTakeoutDelivery} disabled={!customerName.trim() || !deliveryAddress.trim()}>
              <ShoppingCart size={15} /> Start Order
            </button>
          </div>
        )}

        {/* Guest Check-in Modal */}
        {guestModal && (
          <GuestModal tableId={guestModal} onConfirm={handleGuestConfirmed} onClose={() => setGuestModal(null)} />
        )}

        {/* Cash Drawer Modal */}
        {cashDrawerModal && (
          <CashDrawerPanel cashDrawer={cashDrawer} onBlindDrop={handleBlindDrop} onClose={() => setCashDrawerModal(false)} />
        )}
      </div>
    );
  }


  // ═══════════════════════════════════════════════════════════
  // ─── ORDER ENTRY VIEW ─────────────────────────────────────
  // ═══════════════════════════════════════════════════════════
  const currentGuest = activeTable?.guestName || customerName;
  const unfiredCourses = [...new Set(cart.filter(i => !firedCourses.has(i.course)).map(i => i.course))].sort();

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 80px)', gap: 12, overflow: 'hidden' }}>
      <Toast message={successMsg} />
      <OfflineBanner />

      {/* ── Left: Menu Panel ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { setView('floor'); setCart([]); setDiscountAmount(0); }}>
              <ChevronLeft size={15} /> Back
            </button>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                {activeTable ? `Table ${activeTable.number || activeTable.id}` : orderType === 'takeout' ? 'Takeout' : 'Delivery'}
                {currentGuest && <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.82rem' }}> -- {currentGuest}</span>}
                {hasCardOnFile && (
                  <span style={{
                    background: 'rgba(59,130,246,0.1)', color: 'var(--accent-blue)',
                    padding: '2px 8px', borderRadius: 'var(--r-sm)', fontSize: '0.68rem', fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                  }}>
                    <CreditCard size={10} /> Card on file
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {cart.reduce((s, i) => s + i.qty, 0)} items in cart
                {isHeld && <span style={{ color: 'var(--warning)', fontWeight: 700 }}> | HELD {holdTimer}m</span>}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {orderType === 'dine-in' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem' }}>
                <Users size={13} style={{ color: 'var(--text-muted)' }} />
                <input type="number" min={1} max={20} value={partySize}
                  onChange={e => setPartySize(parseInt(e.target.value) || 1)}
                  style={{
                    width: 38, padding: '4px 6px', borderRadius: 'var(--r-sm)',
                    border: '1px solid var(--border-subtle)', fontSize: '0.82rem',
                    fontWeight: 700, textAlign: 'center', background: 'rgba(255,255,255,0.6)',
                  }}
                />
              </div>
            )}
            <button className="btn btn-secondary btn-sm" onClick={() => setHasCardOnFile(prev => !prev)} title="Toggle tab pre-auth">
              <CreditCard size={14} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input className="input-field" style={{ paddingLeft: 36 }} placeholder="Search menu items..."
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Category Tabs */}
        {!searchQuery && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', paddingBottom: 4, flexShrink: 0 }}>
            {categories.map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)}
                className={activeCategory === cat ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                style={{ whiteSpace: 'nowrap', fontSize: '0.78rem' }}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Menu Grid */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, alignContent: 'start', paddingBottom: 8 }}>
          {filteredItems.map(item => {
            const inCart = cart.find(c => c.id === item.id);
            const totalInCart = cart.filter(c => c.id === item.id).reduce((s, c) => s + c.qty, 0);
            return (
              <button key={item.id} onClick={() => handleAddItem(item)}
                style={{
                  padding: '12px', textAlign: 'left', borderRadius: 'var(--r-lg)', cursor: 'pointer',
                  background: totalInCart > 0 ? 'rgba(124,58,237,0.07)' : 'var(--card-bg)',
                  backdropFilter: 'blur(16px)',
                  border: `1.5px solid ${totalInCart > 0 ? 'rgba(124,58,237,0.3)' : 'var(--border-subtle)'}`,
                  transition: 'all var(--t-fast)', position: 'relative',
                }}
                onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.3 }}>{item.name}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '0.88rem' }}>
                    {item.price.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                  </span>
                  {totalInCart > 0 && (
                    <span style={{
                      fontSize: '0.68rem', fontWeight: 700, background: 'var(--primary)',
                      color: 'white', borderRadius: 20, padding: '2px 7px',
                    }}>
                      x{totalInCart}
                    </span>
                  )}
                </div>
                {item.sold86 && (
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(255,255,255,0.7)', borderRadius: 'var(--r-lg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, color: 'var(--danger)', fontSize: '0.82rem',
                  }}>
                    86'd
                  </div>
                )}
              </button>
            );
          })}
          {filteredItems.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
              No items found
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Cart Sidebar ── */}
      <div style={{
        width: 330, flexShrink: 0, display: 'flex', flexDirection: 'column',
        background: 'var(--card-bg)', backdropFilter: 'blur(20px)',
        border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-2xl)', overflow: 'hidden',
      }}>
        {/* Cart Header */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>
              {activeTable ? `Order - T${activeTable.number || activeTable.id}` : `${orderType === 'takeout' ? 'Takeout' : 'Delivery'} Order`}
            </div>
            {autoGratuity > 0 && (
              <span style={{
                background: 'rgba(168,85,247,0.1)', color: '#a855f7',
                padding: '2px 8px', borderRadius: 'var(--r-sm)', fontSize: '0.65rem', fontWeight: 700,
              }}>
                Auto-grat {autoGratuityRate}%
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {currentGuest && <><User size={11} /> {currentGuest} | </>}
            {cart.reduce((s, i) => s + i.qty, 0)} items
          </div>
        </div>

        {/* Cart Items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {cart.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: 8 }}>
              <ShoppingCart size={32} strokeWidth={1.2} />
              <p style={{ fontSize: '0.82rem' }}>Add items from the menu</p>
            </div>
          ) : cart.map(item => {
            const key = item._cartKey || item.id;
            const modPrice = (item.modifiers || []).reduce((s, m) => s + (m.price || 0), 0);
            const lineTotal = (item.price + modPrice) * item.qty;

            return (
              <div key={key} style={{
                padding: '8px 10px', background: 'rgba(255,255,255,0.6)',
                borderRadius: 'var(--r-md)', border: '1px solid var(--border-subtle)',
                marginBottom: 5,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name}
                    </div>
                    {item.modifiers?.length > 0 && (
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 1 }}>
                        + {item.modifiers.map(m => m.name).join(', ')}
                      </div>
                    )}
                    {item.specialInstructions && (
                      <div style={{ fontSize: '0.65rem', color: '#d97706', fontStyle: 'italic', marginTop: 1 }}>
                        {item.specialInstructions}
                      </div>
                    )}
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {(item.price + modPrice).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })} ea
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <button onClick={() => updateQty(key, -1)} style={{
                      width: 22, height: 22, borderRadius: 'var(--r-sm)', border: '1px solid var(--border-subtle)',
                      background: 'white', cursor: 'pointer', fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem',
                    }}>-</button>
                    <span style={{ width: 20, textAlign: 'center', fontSize: '0.82rem', fontWeight: 700 }}>{item.qty}</span>
                    <button onClick={() => updateQty(key, 1)} style={{
                      width: 22, height: 22, borderRadius: 'var(--r-sm)', border: '1px solid rgba(124,58,237,0.3)',
                      background: 'rgba(124,58,237,0.07)', cursor: 'pointer', fontWeight: 700, color: 'var(--primary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem',
                    }}>+</button>
                  </div>

                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary)', width: 52, textAlign: 'right', flexShrink: 0 }}>
                    {lineTotal.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                  </div>
                </div>

                {/* Course & Seat selectors */}
                {orderType === 'dine-in' && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
                    <select value={item.course || 1} onChange={e => updateCourse(key, parseInt(e.target.value))}
                      style={{
                        padding: '2px 6px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border-subtle)',
                        fontSize: '0.68rem', background: 'rgba(255,255,255,0.6)', color: 'var(--text-secondary)',
                        cursor: 'pointer',
                      }}>
                      <option value={1}>C1</option>
                      <option value={2}>C2</option>
                      <option value={3}>C3</option>
                    </select>
                    <select value={item.seat || 1} onChange={e => updateSeat(key, parseInt(e.target.value))}
                      style={{
                        padding: '2px 6px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border-subtle)',
                        fontSize: '0.68rem', background: 'rgba(255,255,255,0.6)', color: 'var(--text-secondary)',
                        cursor: 'pointer',
                      }}>
                      {Array.from({ length: 8 }, (_, i) => <option key={i + 1} value={i + 1}>S{i + 1}</option>)}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Action Bar */}
        <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.4)' }}>
          {/* Quick actions row */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
            {unfiredCourses.length > 0 && (
              <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.72rem', padding: '5px 8px' }} onClick={handleFireNextCourse}>
                <Flame size={12} /> Fire C{Math.min(...unfiredCourses)}
              </button>
            )}
            <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.72rem', padding: '5px 8px' }} onClick={handleRepeatLastRound} disabled={cart.length === 0}>
              <RotateCcw size={12} /> Repeat Round
            </button>
            {orderType === 'dine-in' && (
              <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.72rem', padding: '5px 8px' }} onClick={() => setMergeModal(true)}>
                <ArrowRightLeft size={12} /> Merge
              </button>
            )}
          </div>

          {/* Hold & Fire row */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 6, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, flex: 1 }}>
              <input type="number" min={0} max={120} value={holdTimer}
                onChange={e => setHoldTimer(parseInt(e.target.value) || 0)}
                placeholder="0"
                style={{
                  width: 42, padding: '4px 6px', borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border-subtle)', fontSize: '0.72rem', textAlign: 'center',
                  background: 'rgba(255,255,255,0.6)',
                }}
              />
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>min</span>
            </div>
            <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.72rem', padding: '5px 8px' }} onClick={handleHoldFire} disabled={holdTimer <= 0}>
              {isHeld ? <Play size={12} /> : <Pause size={12} />} {isHeld ? 'Release' : 'Hold'}
            </button>
          </div>

          {/* Permission-gated actions */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            <button className="btn btn-secondary btn-sm" style={{ flex: 1, fontSize: '0.72rem', padding: '5px 6px', color: 'var(--warning)' }}
              onClick={() => handleManagerAction('comp')} disabled={cart.length === 0}>
              <BadgeCheck size={12} /> Comp
            </button>
            <button className="btn btn-secondary btn-sm" style={{ flex: 1, fontSize: '0.72rem', padding: '5px 6px', color: 'var(--danger)' }}
              onClick={() => handleManagerAction('void')} disabled={cart.length === 0}>
              <Ban size={12} /> Void
            </button>
            <button className="btn btn-secondary btn-sm" style={{ flex: 1, fontSize: '0.72rem', padding: '5px 6px', color: 'var(--accent-blue)' }}
              onClick={() => handleManagerAction('discount')} disabled={cart.length === 0}>
              <Percent size={12} /> Discount
            </button>
          </div>
        </div>

        {/* Totals */}
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.6)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, fontSize: '0.8rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Subtotal</span>
            <span style={{ fontWeight: 600 }}>{cartTotal.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, fontSize: '0.8rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>GST ({gstRate}%)</span>
            <span style={{ fontWeight: 600 }}>{tax.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
          </div>
          {serviceCharge > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Service ({serviceChargeRate}%)</span>
              <span style={{ fontWeight: 600 }}>{serviceCharge.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
            </div>
          )}
          {autoGratuity > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, fontSize: '0.8rem' }}>
              <span style={{ color: '#a855f7' }}>Auto-Grat ({autoGratuityRate}%)</span>
              <span style={{ fontWeight: 600, color: '#a855f7' }}>{autoGratuity.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
            </div>
          )}
          {discountAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--success)' }}>Discount</span>
              <span style={{ fontWeight: 600, color: 'var(--success)' }}>-{discountAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
            </div>
          )}
          <div style={{
            display: 'flex', justifyContent: 'space-between', marginTop: 6, paddingTop: 8,
            borderTop: '1.5px dashed var(--border-subtle)',
          }}>
            <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>Total</span>
            <span style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--primary)' }}>
              {grandTotal.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 10, marginBottom: 6 }}>
            <button className="btn btn-secondary" style={{ flex: 1, fontSize: '0.78rem', padding: '8px' }} onClick={handleSaveKOT} disabled={cart.length === 0}>
              <Bookmark size={14} /> KOT
            </button>
            <button className="btn btn-secondary" style={{ flex: 1, fontSize: '0.78rem', padding: '8px' }} onClick={() => cart.length > 0 && setSplitModal(true)} disabled={cart.length === 0}>
              <Split size={14} /> Split
            </button>
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => cart.length > 0 && setPaymentModal(true)} disabled={cart.length === 0}>
            <ReceiptText size={15} /> Settle Bill
          </button>
        </div>
      </div>

      {/* ── Modals ── */}
      {modifierModal && (
        <ModifierModal
          item={modifierModal}
          modifierGroups={modifiers}
          onConfirm={(modData) => { addToCart(modifierModal, modData); setModifierModal(null); }}
          onClose={() => setModifierModal(null)}
        />
      )}

      {splitModal && (
        <SplitBillModal
          cart={cart} grandTotal={grandTotal} gstRate={gstRate}
          onClose={() => setSplitModal(false)}
          onApply={(mode) => showSuccess(`Split applied: ${mode}`)}
        />
      )}

      {paymentModal && (
        <PaymentModal
          cart={cart} cartTotal={cartTotal} tax={tax} gstRate={gstRate}
          grandTotal={grandTotal} serviceCharge={serviceCharge}
          autoGratuity={autoGratuity} discount={discountAmount}
          activeTable={activeTable} currentGuest={currentGuest}
          onConfirm={handleConfirmPayment}
          onClose={() => setPaymentModal(false)}
        />
      )}

      {mergeModal && (
        <MergeModal
          currentTableId={activeTable?.id}
          tables={tables} savedOrders={savedOrders}
          onMerge={handleMerge}
          onClose={() => setMergeModal(false)}
        />
      )}

      {managerPinModal && (
        <ManagerPinModal
          title={managerPinModal === 'comp' ? 'Comp Item' : managerPinModal === 'void' ? 'Void Item' : 'Apply Discount'}
          reasons={managerPinModal === 'comp' ? COMP_REASONS : managerPinModal === 'void' ? VOID_REASONS : DISCOUNT_REASONS}
          showAmount={managerPinModal !== 'void'}
          onConfirm={handleManagerPinConfirm}
          onClose={() => setManagerPinModal(null)}
        />
      )}

      {cashDrawerModal && (
        <CashDrawerPanel cashDrawer={cashDrawer} onBlindDrop={handleBlindDrop} onClose={() => setCashDrawerModal(false)} />
      )}
    </div>
  );
};

export default POS;
