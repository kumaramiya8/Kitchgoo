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
  GripVertical, Coffee, ReceiptText, UserX, Smartphone, Globe, Check, Eye,
  Sparkles, Trash2, AlertCircle, Edit3
} from 'lucide-react';
import { useApp } from '../db/AppContext';
import { useAuth } from '../db/AuthContext';
import { getAll, insert, update, getById } from '../db/database';
import { printReceipt, printTableTransferNotice, printKOT } from '../utils/printReceipt';
import { getNoun } from '../utils/naming';
import { isModuleEnabled } from '../../shared/seeds';
import { calculateTableBill } from '../utils/tableOrders';
import { localDayStr } from '../../shared/dates';
import { stripItems } from '../../shared/items';

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
  paying: '#8b5cf6', // violet — must stay distinguishable from available-green at dot size
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
const GuestModal = ({ tableId, onConfirm, onClose, floatingTabs = [], onSeatToken, savedOrders = {} }) => {
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
        {floatingTabs && floatingTabs.length > 0 && onSeatToken && (
          <div style={{
            marginBottom: '16px',
            padding: '12px 14px',
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1.5px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '12px',
          }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#b45309', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={14} /> Open Tokens Waiting for Table ({floatingTabs.length}):
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {floatingTabs.map(t => {
                const tabItems = t.items || (Array.isArray(savedOrders[`tab_${t.id}`]) ? savedOrders[`tab_${t.id}`] : (savedOrders[`tab_${t.id}`]?.items || []));
                const count = tabItems.reduce((s, i) => s + (i.qty || 1), 0);
                return (
                  <button
                    key={t.id}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{
                      background: '#fff',
                      borderColor: 'rgba(245, 158, 11, 0.4)',
                      color: 'var(--text-primary)',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: '0.78rem',
                      fontWeight: 700,
                    }}
                    onClick={() => {
                      onSeatToken(t);
                      onClose();
                    }}
                  >
                    <span style={{ background: '#f59e0b', color: '#fff', borderRadius: '4px', padding: '1px 5px', fontSize: '0.7rem' }}>
                      Token #{t.tokenNumber}
                    </span>
                    {t.guestName && <span>{t.guestName}</span>}
                    <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
                      ({count} item{count === 1 ? '' : 's'})
                    </span>
                    <span style={{ color: '#059669', fontWeight: 800, marginLeft: 2 }}>➔ Seat Here</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
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
                      borderRadius: 'var(--r-lg)', border: `1.5px solid ${selected?.id === g.id ? 'rgba(30, 94, 74,0.4)' : 'var(--border-subtle)'}`,
                      background: selected?.id === g.id ? 'rgba(30, 94, 74,0.06)' : 'rgba(255,255,255,0.5)',
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                    }}>
                    <div style={{ width: 36, height: 36, borderRadius: 'var(--r-md)', background: 'linear-gradient(135deg, #1e5e4a, #2e7d5b)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.9rem', flexShrink: 0 }}>
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
                  <div style={{ flex: 1, padding: '10px', background: 'rgba(30, 94, 74,0.06)', borderRadius: 'var(--r-md)', textAlign: 'center' }}>
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
                      border: `1.5px solid ${sel ? 'rgba(30, 94, 74,0.4)' : 'var(--border-subtle)'}`,
                      background: sel ? 'rgba(30, 94, 74,0.06)' : 'rgba(255,255,255,0.5)',
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
const SplitBillModal = ({ cart, grandTotal, gstRate, pricesIncludeGst = true, onClose, onApply }) => {
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
      const lineTotal = pricesIncludeGst
        ? item.price * item.qty
        : item.price * item.qty * (1 + gstRate / 100);
      totals[person] = (totals[person] || 0) + lineTotal;
    });
    return totals;
  };

  const getSeatSplitTotals = () => {
    const totals = {};
    cart.forEach(item => {
      const seat = seatAssignments[item.id] || 1;
      const lineTotal = pricesIncludeGst
        ? item.price * item.qty
        : item.price * item.qty * (1 + gstRate / 100);
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
                  background: 'rgba(30, 94, 74,0.05)', border: '1px solid rgba(30, 94, 74,0.15)',
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
                  background: p === 'A' ? 'rgba(30, 94, 74,0.1)' : p === 'B' ? 'rgba(59,130,246,0.1)' : 'rgba(34,197,94,0.1)',
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
                  background: person === 'A' ? 'rgba(30, 94, 74,0.06)' : person === 'B' ? 'rgba(59,130,246,0.06)' : 'rgba(34,197,94,0.06)',
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
                  background: 'rgba(30, 94, 74,0.05)', border: '1px solid rgba(30, 94, 74,0.15)',
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
    t.status !== 'available' && String(t.id) !== String(currentTableId) && savedOrders[t.id]?.length > 0
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
                  border: `1.5px solid ${selectedTable === t.id ? 'rgba(30, 94, 74,0.4)' : 'var(--border-subtle)'}`,
                  background: selectedTable === t.id ? 'rgba(30, 94, 74,0.06)' : 'rgba(255,255,255,0.5)',
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


// ─── Shift / Transfer Table Modal ──────────────────────────────────────────
const ShiftTableModal = ({ currentTable, tables, savedOrders, currentCart, onShift, onClose }) => {
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [markNeedsCleaning, setMarkNeedsCleaning] = useState(true);
  const [printNotice, setPrintNotice] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const currentItems = (currentCart && currentCart.length > 0)
    ? currentCart
    : (savedOrders[currentTable?.id] || savedOrders[String(currentTable?.id)] || []);

  const totalAmount = currentItems.reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0);

  // Exclude the current table itself
  const candidateTables = tables.filter(t => String(t.id) !== String(currentTable?.id));

  const filteredTables = candidateTables.filter(t => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const tNum = String(t.number || t.id).toLowerCase();
    const sec = String(t.section || '').toLowerCase();
    return tNum.includes(term) || sec.includes(term);
  });

  const selectedTarget = tables.find(t => String(t.id) === String(selectedTableId));
  const isTargetOccupied = selectedTarget && selectedTarget.status !== 'available';

  return (
    <Modal title={`Shift Table ${currentTable?.number || currentTable?.id} to Another Table`} onClose={onClose} wide>
      <div className="modal-body" style={{ maxHeight: '68vh', overflowY: 'auto' }}>
        {/* Source Table Summary Banner */}
        <div style={{
          padding: '12px 16px', borderRadius: 'var(--r-md)',
          background: 'rgba(30, 94, 74,0.06)', border: '1px solid rgba(30, 94, 74,0.2)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
        }}>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
              Current Tab
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Table {currentTable?.number || currentTable?.id}
              {currentTable?.guestName && <span style={{ fontWeight: 500, fontSize: '0.85rem', color: 'var(--text-secondary)' }}> — {currentTable.guestName}</span>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '1.05rem' }}>
              {totalAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {currentItems.length} item{currentItems.length === 1 ? '' : 's'} on tab
            </div>
          </div>
        </div>

        {/* Search destination */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
            Select Destination Table:
          </div>
          <input
            type="text"
            className="input-field"
            placeholder="Search by table number or section..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ margin: 0, padding: '8px 12px', fontSize: '0.82rem' }}
          />
        </div>

        {/* Table Selector Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
          gap: 10,
          marginBottom: 16,
          maxHeight: 240,
          overflowY: 'auto',
          padding: 2,
        }}>
          {filteredTables.map(t => {
            const isSelected = String(selectedTableId) === String(t.id);
            const isAvail = t.status === 'available';
            const statusColor = TABLE_STATUS_COLORS[t.status] || '#94a3b8';
            const tOrders = savedOrders[t.id] || [];

            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedTableId(t.id)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--r-md)',
                  cursor: 'pointer',
                  border: isSelected
                    ? '2px solid var(--primary)'
                    : '1px solid var(--border-subtle)',
                  background: isSelected
                    ? 'rgba(30, 94, 74, 0.08)'
                    : 'rgba(255,255,255,0.6)',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  transition: 'all 0.15s ease',
                  boxShadow: isSelected ? '0 0 0 2px rgba(30, 94, 74, 0.2)' : 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                    T{t.number || t.id}
                  </span>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: statusColor,
                  }} />
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  {t.seats || 2} seats{t.section ? ` · ${t.section}` : ''}
                </div>
                <div style={{
                  fontSize: '0.66rem',
                  fontWeight: 600,
                  color: isAvail ? 'var(--success)' : 'var(--text-secondary)',
                  marginTop: 2,
                }}>
                  {isAvail ? 'Available' : (TABLE_STATUS_LABELS[t.status] || t.status)}
                  {tOrders.length > 0 ? ` (${tOrders.length} items)` : ''}
                </div>
              </button>
            );
          })}
        </div>

        {/* Warning if destination is occupied */}
        {selectedTarget && isTargetOccupied && (
          <div style={{
            padding: '10px 14px', borderRadius: 'var(--r-md)',
            background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)',
            color: '#b45309', fontSize: '0.78rem', marginBottom: 16,
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong>Table {selectedTarget.number || selectedTarget.id} is already occupied.</strong>
              <div>
                Shifting to this table will <strong>merge</strong> Table {currentTable?.number || currentTable?.id}&apos;s items into Table {selectedTarget.number || selectedTarget.id}&apos;s tab.
              </div>
            </div>
          </div>
        )}

        {/* Shift Options */}
        <div style={{
          borderTop: '1px solid var(--border-subtle)',
          paddingTop: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
            <input
              type="checkbox"
              checked={markNeedsCleaning}
              onChange={e => setMarkNeedsCleaning(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--primary)' }}
            />
            <span>Mark Table {currentTable?.number || currentTable?.id} as <strong>Needs Cleaning</strong> (bus table)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
            <input
              type="checkbox"
              checked={printNotice}
              onChange={e => setPrintNotice(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--primary)' }}
            />
            <span>Print Kitchen Transfer Notice for food runners</span>
          </label>
        </div>
      </div>

      <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          onClick={() => {
            if (selectedTableId) {
              onShift({
                targetTableId: selectedTableId,
                markNeedsCleaning,
                printNotice,
              });
              onClose();
            }
          }}
          disabled={!selectedTableId}
        >
          <ArrowRightLeft size={15} />
          {isTargetOccupied
            ? `Merge & Shift to Table ${selectedTarget?.number || selectedTarget?.id}`
            : `Confirm Shift to Table ${selectedTarget?.number || selectedTarget?.id || ''}`}
        </button>
      </div>
    </Modal>
  );
};


// ─── Assign Table Modal (For Unassigned Tabs / Tokens) ────────────
const AssignTableModal = ({ tab, tables, savedOrders, currentCart, onAssign, onClose }) => {
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const cleanTabId = String(tab?.id || '').replace(/^tab_/, '');
  const tabRaw = tab ? (savedOrders[`tab_${cleanTabId}`] || savedOrders[tab.id]) : null;
  const currentItems = (currentCart && currentCart.length > 0)
    ? currentCart
    : (tab ? (tab.items || (Array.isArray(tabRaw) ? tabRaw : tabRaw?.items) || []) : []);

  const totalAmount = currentItems.reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0);

  const filteredTables = tables.filter(t => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const tNum = String(t.number || t.id).toLowerCase();
    const sec = String(t.section || '').toLowerCase();
    return tNum.includes(term) || sec.includes(term);
  });

  const selectedTarget = tables.find(t => String(t.id) === String(selectedTableId));
  const isTargetOccupied = selectedTarget && selectedTarget.status !== 'available';

  return (
    <Modal title={`Assign Token #${tab?.tokenNumber} to Table`} onClose={onClose} wide>
      <div className="modal-body" style={{ maxHeight: '68vh', overflowY: 'auto' }}>
        {/* Token Summary Banner */}
        <div style={{
          padding: '12px 16px', borderRadius: 'var(--r-md)',
          background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
        }}>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#b45309', textTransform: 'uppercase', fontWeight: 800 }}>
              Unassigned Dine-In Tab
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Token #{tab?.tokenNumber}
              {tab?.guestName && <span style={{ fontWeight: 500, fontSize: '0.85rem', color: 'var(--text-secondary)' }}> — {tab.guestName}</span>}
              {tab?.partySize > 1 && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 6 }}>({tab.partySize} guests)</span>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '1.05rem' }}>
              {totalAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {currentItems.length} item{currentItems.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>

        {/* Search destination */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
            Select Dining Table for this Guest:
          </div>
          <input
            type="text"
            className="input-field"
            placeholder="Search by table number or section..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ margin: 0, padding: '8px 12px', fontSize: '0.82rem' }}
          />
        </div>

        {/* Tables Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
          gap: 10,
          marginBottom: 16,
        }}>
          {filteredTables.map(t => {
            const isSelected = String(selectedTableId) === String(t.id);
            const isAvail = t.status === 'available';
            const statusColor = TABLE_STATUS_COLORS[t.status] || '#94a3b8';

            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedTableId(t.id)}
                style={{
                  padding: '12px 10px',
                  borderRadius: 'var(--r-md)',
                  border: isSelected
                    ? '2px solid var(--primary)'
                    : `1.5px solid ${isAvail ? 'rgba(34, 197, 94, 0.4)' : 'var(--border-subtle)'}`,
                  background: isSelected
                    ? 'rgba(30, 94, 74, 0.08)'
                    : (isAvail ? 'rgba(34, 197, 94, 0.05)' : 'rgba(255,255,255,0.6)'),
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  transition: 'all 0.15s ease',
                  cursor: 'pointer',
                  boxShadow: isSelected ? '0 0 0 2px rgba(30, 94, 74, 0.2)' : 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                    T{t.number || t.id}
                  </span>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: statusColor,
                  }} />
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  {t.section || 'Main Area'} · {t.seats || 4} seats
                </div>
                <div style={{
                  fontSize: '0.7rem', fontWeight: 700,
                  color: isAvail ? '#16a34a' : statusColor,
                  textTransform: 'capitalize',
                }}>
                  {t.status === 'available' ? 'Available' : t.status}
                </div>
              </button>
            );
          })}
        </div>

        {isTargetOccupied && (
          <div style={{
            padding: '10px 14px', borderRadius: 'var(--r-md)',
            background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)',
            fontSize: '0.78rem', color: '#854d0e', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <AlertCircle size={15} />
            <span>
              <strong>Note:</strong> Table {selectedTarget.number || selectedTarget.id} currently has status &quot;{selectedTarget.status}&quot;. Assigning will merge this tab into that table.
            </span>
          </div>
        )}
      </div>

      <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          onClick={() => {
            if (selectedTableId) {
              onAssign(selectedTableId, tab);
              onClose();
            }
          }}
          disabled={!selectedTableId}
        >
          <UtensilsCrossed size={15} />
          {isTargetOccupied
            ? `Merge into Table ${selectedTarget?.number || selectedTarget?.id}`
            : `Assign to Table ${selectedTarget?.number || selectedTarget?.id || ''}`}
        </button>
      </div>
    </Modal>
  );
};


// ─── Quick Start No-Table Dine-In Modal ────────────────────────────
const NoTableOrderModal = ({ nextToken, onStart, onClose }) => {
  const [tokenNumber, setTokenNumber] = useState(String(nextToken || 1));
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [notes, setNotes] = useState('');

  const handleSubmit = (e) => {
    e?.preventDefault();
    onStart({
      tokenNumber: tokenNumber.trim() || String(nextToken || 1),
      guestName: guestName.trim(),
      guestPhone: guestPhone.trim(),
      partySize: parseInt(partySize, 10) || 1,
      notes: notes.trim(),
    });
  };

  return (
    <Modal title="Take Dine-In Order (No Table Yet)" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Start taking the order immediately. The kitchen can prepare food with the Token/Buzzer number, and staff can assign a table whenever the customer is seated.
          </p>

          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
            padding: '12px 14px', background: 'rgba(245, 158, 11, 0.06)',
            borderRadius: '10px', border: '1px solid rgba(245, 158, 11, 0.25)',
          }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#b45309', marginBottom: 4 }}>
                Token / Buzzer # *
              </label>
              <input
                type="text"
                className="input-field"
                value={tokenNumber}
                onChange={e => setTokenNumber(e.target.value)}
                placeholder="e.g. 1, 2, B-12..."
                required
                autoFocus
                style={{ margin: 0, fontWeight: 700 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
                Party Size (Guests)
              </label>
              <input
                type="number"
                min="1"
                max="30"
                className="input-field"
                value={partySize}
                onChange={e => setPartySize(e.target.value)}
                style={{ margin: 0 }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
              Customer Name (Optional)
            </label>
            <input
              type="text"
              className="input-field"
              value={guestName}
              onChange={e => setGuestName(e.target.value)}
              placeholder="e.g. Rahul, Table Waiting..."
              style={{ margin: 0 }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
              Phone Number (Optional - for CRM/Loyalty)
            </label>
            <input
              type="tel"
              className="input-field"
              value={guestPhone}
              onChange={e => setGuestPhone(e.target.value)}
              placeholder="10-digit mobile number"
              style={{ margin: 0 }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
              Special Notes / Seating Preference
            </label>
            <input
              type="text"
              className="input-field"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Prefers window table, high chair needed"
              style={{ margin: 0 }}
            />
          </div>
        </div>

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" style={{ fontWeight: 700 }}>
            Start Order ➔
          </button>
        </div>
      </form>
    </Modal>
  );
};


// ─── Release / Clear Table Modal ──────────────────────────────────────────
const ReleaseTableModal = ({ table, hasItems, itemCount, onConfirm, onClose }) => {
  const [markStatus, setMarkStatus] = useState('available'); // 'available' | 'needs-bussing'
  const [cancelKds, setCancelKds] = useState(true);

  return (
    <Modal title={`Release Table ${table?.number || table?.id}`} onClose={onClose}>
      <div className="modal-body" style={{ padding: '20px 16px' }}>
        <div style={{
          padding: '12px 14px', borderRadius: 'var(--r-md)',
          background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)',
          marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <AlertTriangle size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#991b1b', marginBottom: 2 }}>
              Vacate Table {table?.number || table?.id}?
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              {hasItems
                ? `This table has ${itemCount} active item${itemCount === 1 ? '' : 's'} on the tab. Releasing will cancel the order for ${table?.guestName || 'this guest'} and clear the tab.`
                : `This will unseat ${table?.guestName || 'the guest'} and return the table to available.`}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
            Table Status After Release:
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <label style={{
              flex: 1, padding: '10px 12px', borderRadius: 'var(--r-md)', cursor: 'pointer',
              border: `1.5px solid ${markStatus === 'available' ? 'var(--primary)' : 'var(--border-subtle)'}`,
              background: markStatus === 'available' ? 'rgba(30, 94, 74, 0.08)' : 'rgba(255,255,255,0.6)',
              display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', fontWeight: 600,
            }}>
              <input
                type="radio"
                name="releaseStatus"
                value="available"
                checked={markStatus === 'available'}
                onChange={() => setMarkStatus('available')}
                style={{ accentColor: 'var(--primary)' }}
              />
              <span>Available (Ready)</span>
            </label>
            <label style={{
              flex: 1, padding: '10px 12px', borderRadius: 'var(--r-md)', cursor: 'pointer',
              border: `1.5px solid ${markStatus === 'needs-bussing' ? 'var(--primary)' : 'var(--border-subtle)'}`,
              background: markStatus === 'needs-bussing' ? 'rgba(30, 94, 74, 0.08)' : 'rgba(255,255,255,0.6)',
              display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', fontWeight: 600,
            }}>
              <input
                type="radio"
                name="releaseStatus"
                value="needs-bussing"
                checked={markStatus === 'needs-bussing'}
                onChange={() => setMarkStatus('needs-bussing')}
                style={{ accentColor: 'var(--primary)' }}
              />
              <span>Needs Cleaning (Bus)</span>
            </label>
          </div>
        </div>

        {hasItems && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
            <input
              type="checkbox"
              checked={cancelKds}
              onChange={e => setCancelKds(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--primary)' }}
            />
            <span>Cancel pending kitchen tickets (KDS) for this table</span>
          </label>
        )}
      </div>

      <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-danger"
          onClick={() => {
            onConfirm({ markStatus, cancelKds });
            onClose();
          }}
          style={{ background: '#dc2626', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <UserX size={15} /> Release Table
        </button>
      </div>
    </Modal>
  );
};


// ─── Cash Drawer Panel ──────────────────────────────────────────────────────
const DENOMINATIONS = [
  { value: 2000, label: '₹2,000 Note' },
  { value: 500, label: '₹500 Note' },
  { value: 200, label: '₹200 Note' },
  { value: 100, label: '₹100 Note' },
  { value: 50, label: '₹50 Note' },
  { value: 20, label: '₹20 Note' },
  { value: 10, label: '₹10 Note' },
  { value: 5, label: '₹5 Coin/Note' },
  { value: 2, label: '₹2 Coin' },
  { value: 1, label: '₹1 Coin' },
];

const DenominationGrid = ({ values = {}, onChange }) => {
  const handleCountChange = (val, countStr) => {
    const count = Math.max(0, parseInt(countStr) || 0);
    const next = { ...values, [val]: count };
    let total = 0;
    DENOMINATIONS.forEach(d => {
      total += (next[d.value] || 0) * d.value;
    });
    onChange(next, total);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px', margin: '12px 0' }}>
      {DENOMINATIONS.map(d => {
        const count = values[d.value] ?? '';
        return (
          <div key={d.value} style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'rgba(30, 94, 74, 0.02)', padding: '8px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{d.label}</span>
            <input
              type="number"
              min="0"
              className="input-field"
              style={{ padding: '4px 6px', fontSize: '0.82rem', width: '100%' }}
              value={count}
              onChange={e => handleCountChange(d.value, e.target.value)}
              placeholder="0"
            />
            {count > 0 && (
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                ₹{(count * d.value).toLocaleString('en-IN')}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

const CashDrawerPanel = ({ cashDrawer, onBlindDrop, onClose, onCloseRegister }) => {
  const { settings, posTables = [], posSavedOrders = {}, updateCashDrawer, addRegisterClosure, addAuditEntry } = useApp();
  const { user } = useAuth();

  const isClosed = cashDrawer?.isClosed || !cashDrawer?.shiftStart;
  const isEnhanced = settings?.operations?.enhancedRegisterEnabled ?? false;

  // Tabs: 'summary' | 'midday' | 'close' | 'drops' | 'open'
  const [activeTab, setActiveTab] = useState(isClosed ? 'open' : 'summary');

  // State for opening register
  const [openDenoms, setOpenDenoms] = useState({});
  const [openTotal, setOpenTotal] = useState(0);

  // State for mid-day count
  const [midDenoms, setMidDenoms] = useState({});
  const [midTotal, setMidTotal] = useState(0);
  const [midNotes, setMidNotes] = useState('');

  // State for close register
  const [closeDenoms, setCloseDenoms] = useState({});
  const [closeTotal, setCloseTotal] = useState(0);
  const [closeNotes, setCloseNotes] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [depositNotes, setDepositNotes] = useState('');

  // State for blind drop
  const [dropAmount, setDropAmount] = useState('');

  const balance = (cashDrawer?.openingBalance || 0) +
    (cashDrawer?.cashIn || 0) -
    (cashDrawer?.cashOut || 0) -
    (cashDrawer?.drops || []).reduce((s, d) => s + d.amount, 0);

  // Sync tab if cashDrawer status changes dynamically
  useEffect(() => {
    if (isClosed) {
      setActiveTab('open');
    } else if (activeTab === 'open') {
      setActiveTab('summary');
    }
  }, [isClosed]);

  // Open Register Action
  const handleOpenRegisterSubmit = async (e) => {
    e.preventDefault();
    const floatVal = isEnhanced ? openTotal : parseFloat(openTotal) || 0;
    if (floatVal < 0) {
      alert('Float cannot be negative.');
      return;
    }

    const updated = {
      openingBalance: floatVal,
      currentBalance: floatVal,
      cashIn: 0,
      cashOut: 0,
      drops: [],
      discrepancies: [],
      shiftStart: new Date().toISOString(),
      isClosed: false,
      openingDenominations: isEnhanced ? openDenoms : {},
      midDayCounts: [],
    };
    await updateCashDrawer(updated);
    await addAuditEntry(
      'cash_register.open',
      user?.id || 'system',
      user?.name || 'System / Guest',
      `Opened register with starting float: ₹${floatVal}`
    );
    onClose();
  };

  // Log Mid-day Count
  const handleLogMidDayCount = async () => {
    const variance = midTotal - balance;
    const countEntry = {
      time: new Date().toISOString(),
      denominations: midDenoms,
      actualCash: midTotal,
      expectedCash: balance,
      variance,
      notes: midNotes || '',
      loggedBy: user?.name || 'Staff',
    };

    const updatedCounts = [...(cashDrawer?.midDayCounts || []), countEntry];
    await updateCashDrawer({
      ...cashDrawer,
      midDayCounts: updatedCounts,
    });

    await addAuditEntry(
      'cash_register.midday_count',
      user?.id || 'system',
      user?.name || 'System / Guest',
      `Logged mid-day count. Expected: ₹${balance}, Actual: ₹${midTotal}, Variance: ₹${variance}`
    );

    alert(`Mid-day count saved. Variance: ₹${variance}`);
    setMidDenoms({});
    setMidTotal(0);
    setMidNotes('');
    setActiveTab('summary');
  };

  // Close Register Validation (Open Invoices Check)
  const hasOpenInvoices = posTables.some(t => t.status && t.status !== 'available');
  const hasSavedOrders = Object.keys(posSavedOrders || {}).length > 0;
  const blockClosureWithInvoices = isEnhanced && (settings?.operations?.blockClosureIfOpenInvoices ?? true);
  const isClosureBlocked = blockClosureWithInvoices && (hasOpenInvoices || hasSavedOrders);

  // Close Register Action
  const handleEnhancedCloseRegister = async () => {
    if (isClosureBlocked) {
      alert("Cannot close register. Settle or cancel all active tables and open invoices first.");
      return;
    }

    const finalActual = isEnhanced ? closeTotal : (parseFloat(closeTotal) || 0);
    const variance = finalActual - balance;

    const depAmt = parseFloat(depositAmount) || 0;
    if (depAmt > finalActual) {
      alert("Deposit amount cannot exceed actual cash counted.");
      return;
    }

    const carryoverFloat = finalActual - depAmt;

    const newClosure = {
      openingBalance: cashDrawer.openingBalance,
      cashIn: cashDrawer.cashIn || 0,
      cashOut: cashDrawer.cashOut || 0,
      drops: cashDrawer.drops || [],
      expectedBalance: balance,
      actualCash: finalActual,
      variance,
      notes: closeNotes || '',
      shiftStart: cashDrawer.shiftStart,
      shiftEnd: new Date().toISOString(),
      closedBy: user?.name || 'Manager',
      denominations: isEnhanced ? closeDenoms : {},
      depositAmount: depAmt,
      bankName: bankName || '',
      depositNotes: depositNotes || '',
      midDayCounts: cashDrawer.midDayCounts || [],
    };

    await addRegisterClosure(newClosure);

    // Remaining balance becomes the opening balance for the next shift if enhanced is enabled
    const closedDrawer = {
      openingBalance: isEnhanced ? carryoverFloat : 0,
      currentBalance: isEnhanced ? carryoverFloat : 0,
      cashIn: 0,
      cashOut: 0,
      drops: [],
      discrepancies: [],
      shiftStart: null,
      isClosed: true,
      openingDenominations: {},
      midDayCounts: [],
    };
    await updateCashDrawer(closedDrawer);

    await addAuditEntry(
      'cash_register.close',
      user?.id || 'system',
      user?.name || 'System / Guest',
      `Closed register. Expected: ₹${balance}, Actual: ₹${finalActual}, Variance: ₹${variance}, Deposited: ₹${depAmt}, Next Float: ₹${carryoverFloat}`
    );

    onClose();
    window.location.reload();
  };

  return (
    <Modal title={isEnhanced ? "Register Management" : "Cash Drawer"} onClose={onClose}>
      <div className="modal-body" style={{ maxHeight: '78vh', overflowY: 'auto', padding: '16px' }}>
        {/* Navigation Tabs */}
        {!isClosed && (
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', marginBottom: '16px', gap: '4px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveTab('summary')}
              className={`btn btn-sm ${activeTab === 'summary' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ borderRadius: '20px 20px 0 0', borderBottom: 'none' }}
            >
              Summary
            </button>
            {isEnhanced && (
              <button
                onClick={() => setActiveTab('midday')}
                className={`btn btn-sm ${activeTab === 'midday' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ borderRadius: '20px 20px 0 0', borderBottom: 'none' }}
              >
                Mid-day Count
              </button>
            )}
            <button
              onClick={() => setActiveTab('close')}
              className={`btn btn-sm ${activeTab === 'close' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ borderRadius: '20px 20px 0 0', borderBottom: 'none' }}
            >
              Close Register
            </button>
            <button
              onClick={() => setActiveTab('drops')}
              className={`btn btn-sm ${activeTab === 'drops' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ borderRadius: '20px 20px 0 0', borderBottom: 'none' }}
            >
              Safe Drop
            </button>
          </div>
        )}

        {/* Tab 1: Open Register */}
        {activeTab === 'open' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(30, 94, 74, 0.05)', padding: '10px 14px', borderRadius: 'var(--r-md)', marginBottom: '14px' }}>
              <Lock size={16} style={{ color: 'var(--primary)' }} />
              <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>Enter opening float currency count to start the business day.</div>
            </div>

            <form onSubmit={handleOpenRegisterSubmit}>
              {isEnhanced ? (
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Denomination Counts</label>
                  <DenominationGrid values={openDenoms} onChange={(next, total) => { setOpenDenoms(next); setOpenTotal(total); }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)', padding: '12px', borderRadius: 'var(--r-md)', border: '1px solid var(--border-subtle)', marginTop: '12px' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>Total Opening Float:</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--primary)' }}>
                      {openTotal.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>Starting Float (₹)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    className="input-field"
                    value={openTotal || ''}
                    onChange={e => setOpenTotal(parseFloat(e.target.value) || 0)}
                    placeholder="Enter starting cash float"
                    style={{ width: '100%' }}
                  />
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <Play size={14} /> Open Register &amp; Start Shift
              </button>
            </form>
          </div>
        )}

        {/* Tab 2: Summary */}
        {activeTab === 'summary' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '16px' }}>
              <div style={{ padding: 12, borderRadius: 'var(--r-md)', background: 'rgba(30, 94, 74, 0.05)', textAlign: 'center' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Opening</div>
                <div style={{ fontWeight: 800, color: 'var(--primary)' }}>
                  {(cashDrawer?.openingBalance || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                </div>
              </div>
              <div style={{ padding: 12, borderRadius: 'var(--r-md)', background: 'rgba(34,197,94, 0.05)', textAlign: 'center' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Cash In (Sales)</div>
                <div style={{ fontWeight: 800, color: 'var(--success)' }}>
                  {(cashDrawer?.cashIn || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                </div>
              </div>
              <div style={{ padding: 12, borderRadius: 'var(--r-md)', background: 'rgba(239,68,68, 0.05)', textAlign: 'center' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Cash Out (Refunds)</div>
                <div style={{ fontWeight: 800, color: 'var(--danger)' }}>
                  {(cashDrawer?.cashOut || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                </div>
              </div>
              <div style={{ padding: 12, borderRadius: 'var(--r-md)', background: 'rgba(59,130,246, 0.05)', textAlign: 'center' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Shift Balance</div>
                <div style={{ fontWeight: 800, color: 'var(--accent-blue)' }}>
                  {balance.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                </div>
              </div>
            </div>

            {/* Drops history inside summary */}
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

            {/* Mid-day count logs inside summary */}
            {isEnhanced && (cashDrawer?.midDayCounts || []).length > 0 && (
              <div style={{ marginTop: 16, borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Logged Mid-day Counts</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '150px', overflowY: 'auto' }}>
                  {cashDrawer.midDayCounts.slice().reverse().map((cnt, i) => (
                    <div key={i} style={{ background: 'rgba(255,255,255,0.5)', border: '1px solid var(--border-subtle)', padding: '8px', borderRadius: 'var(--r-sm)', fontSize: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                        <span>{new Date(cnt.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                        <span style={{ color: cnt.variance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                          Variance: {cnt.variance >= 0 ? '+' : ''}{cnt.variance.toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        <span>Actual Cash: ₹{cnt.actualCash.toLocaleString('en-IN')}</span>
                        <span>Expected: ₹{cnt.expectedCash.toLocaleString('en-IN')}</span>
                      </div>
                      {cnt.notes && <div style={{ fontStyle: 'italic', color: 'var(--text-muted)', marginTop: '4px' }}>Note: {cnt.notes}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Mid-day Count */}
        {activeTab === 'midday' && (
          <div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Physical Cash Count</label>
              <DenominationGrid values={midDenoms} onChange={(next, total) => { setMidDenoms(next); setMidTotal(total); }} />
            </div>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', padding: '12px', borderRadius: 'var(--r-md)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Expected Drawer Balance:</div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, textAlign: 'right' }}>₹{balance.toLocaleString('en-IN')}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Actual Cash Counted:</div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, textAlign: 'right' }}>₹{midTotal.toLocaleString('en-IN')}</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, borderTop: '1px solid var(--border-subtle)', paddingTop: '4px' }}>Variance:</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, textAlign: 'right', borderTop: '1px solid var(--border-subtle)', paddingTop: '4px', color: (midTotal - balance) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                ₹{(midTotal - balance).toLocaleString('en-IN')}
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '4px' }}>Mid-day Notes</label>
              <textarea
                className="input-field"
                rows={2}
                value={midNotes}
                onChange={e => setMidNotes(e.target.value)}
                placeholder="Discrepancies, shift change notes..."
                style={{ width: '100%', fontFamily: 'inherit', resize: 'vertical' }}
              />
            </div>

            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleLogMidDayCount}>
              Log Mid-day Count
            </button>
          </div>
        )}

        {/* Tab 4: Close Register */}
        {activeTab === 'close' && (
          <div>
            {isClosureBlocked && (
              <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239,68,68,0.2)', padding: '12px', borderRadius: 'var(--r-md)', marginBottom: '14px', color: 'var(--danger)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.82rem' }}>
                  <AlertTriangle size={15} /> Close Register Blocked
                </div>
                <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                  There are active dine-in tables or open invoices. Please settle all orders before closing the register.
                </div>
              </div>
            )}

            {isEnhanced ? (
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Physical Cash Count</label>
                <DenominationGrid values={closeDenoms} onChange={(next, total) => { setCloseDenoms(next); setCloseTotal(total); }} />
              </div>
            ) : (
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '4px' }}>Actual Cash Counted (₹)</label>
                <input
                  type="number"
                  min="0"
                  className="input-field"
                  value={closeTotal || ''}
                  onChange={e => setCloseTotal(parseFloat(e.target.value) || 0)}
                  placeholder="Enter total physical cash"
                  style={{ width: '100%' }}
                />
              </div>
            )}

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', padding: '12px', borderRadius: 'var(--r-md)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px', marginTop: '12px' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Expected Balance:</div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, textAlign: 'right' }}>₹{balance.toLocaleString('en-IN')}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Actual Cash:</div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, textAlign: 'right' }}>₹{closeTotal.toLocaleString('en-IN')}</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, borderTop: '1px solid var(--border-subtle)', paddingTop: '4px' }}>Variance:</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, textAlign: 'right', borderTop: '1px solid var(--border-subtle)', paddingTop: '4px', color: (closeTotal - balance) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                ₹{(closeTotal - balance).toLocaleString('en-IN')}
              </div>
            </div>

            {isEnhanced && (
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px', marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>Bank Deposit Details</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Bank Name</label>
                    <input
                      className="input-field"
                      value={bankName}
                      onChange={e => setBankName(e.target.value)}
                      placeholder="e.g. HDFC Bank"
                      style={{ width: '100%', fontSize: '0.8rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Deposit Amount (₹)</label>
                    <input
                      type="number"
                      min="0"
                      className="input-field"
                      value={depositAmount}
                      onChange={e => setDepositAmount(e.target.value)}
                      placeholder="e.g. 5000"
                      style={{ width: '100%', fontSize: '0.8rem' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', padding: '6px 8px', background: 'rgba(59, 130, 246, 0.05)', borderRadius: 'var(--r-sm)' }}>
                  <span>Carryover till float (left in drawer):</span>
                  <span style={{ fontWeight: 700, color: 'var(--accent-blue)' }}>
                    ₹{Math.max(0, closeTotal - (parseFloat(depositAmount) || 0)).toLocaleString('en-IN')}
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Deposit Notes</label>
                  <input
                    className="input-field"
                    value={depositNotes}
                    onChange={e => setDepositNotes(e.target.value)}
                    placeholder="Reference #, envelope ID, etc."
                    style={{ width: '100%', fontSize: '0.8rem' }}
                  />
                </div>
              </div>
            )}

            <div style={{ marginTop: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '4px' }}>Closure Notes</label>
              <textarea
                className="input-field"
                rows={2}
                value={closeNotes}
                onChange={e => setCloseNotes(e.target.value)}
                placeholder="Notes for shift summary..."
                style={{ width: '100%', fontFamily: 'inherit', resize: 'vertical' }}
              />
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', background: 'var(--danger)', border: 'none', color: 'white', marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              disabled={isClosureBlocked}
              onClick={() => {
                if (confirm('Are you sure you want to close the register and end this shift?')) {
                  handleEnhancedCloseRegister();
                }
              }}
            >
              <Lock size={14} /> Close Register &amp; End Shift
            </button>
          </div>
        )}

        {/* Tab 5: Safe Drop */}
        {activeTab === 'drops' && (
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Remove excess cash from the register and drop it into the main safe.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input-field"
                type="number"
                min="0"
                value={dropAmount}
                onChange={e => setDropAmount(e.target.value)}
                placeholder="Drop Amount (₹)"
                style={{ flex: 1 }}
              />
              <button
                className="btn btn-primary"
                onClick={() => {
                  const amt = parseFloat(dropAmount);
                  if (amt > 0) { onBlindDrop(amt); setDropAmount(''); setActiveTab('summary'); }
                }}
                disabled={!dropAmount || parseFloat(dropAmount) <= 0}
              >
                <Banknote size={15} /> Safe Drop
              </button>
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
  cart, cartTotal, tax, gstRate, pricesIncludeGst = true, grandTotal, serviceCharge, autoGratuity,
  discount, activeTable, unassignedTab, currentGuest, onConfirm, onClose, settings, packagingCharge = 0
}) => {
  const [isSplit, setIsSplit] = useState(false);
  const [tipAmount, setTipAmount] = useState('');
  const [cashTendered, setCashTendered] = useState('');

  const paymentsConfig = settings?.payments || {};
  const payMethods = useMemo(() => {
    const list = [];
    if (paymentsConfig.cash !== false) list.push({ key: 'Cash', icon: Banknote, color: '#22c55e' });
    if (paymentsConfig.upi !== false) list.push({ key: 'UPI', icon: Phone, color: '#1e5e4a' });
    if (paymentsConfig.card !== false) list.push({ key: 'Card', icon: CreditCard, color: '#3b82f6' });
    if (paymentsConfig.wallet) list.push({ key: 'Wallet', icon: Wallet, color: '#f59e0b' });
    if (paymentsConfig.applePay) list.push({ key: 'Apple Pay', icon: Smartphone, color: '#000000' });
    if (paymentsConfig.googlePay) list.push({ key: 'Google Pay', icon: Globe, color: '#4285F4' });
    if (paymentsConfig.onlineGateway) list.push({ key: 'Online', icon: CreditCard, color: '#8b5cf6' });
    if (list.length === 0) list.push({ key: 'Cash', icon: Banknote, color: '#22c55e' });
    return list;
  }, [paymentsConfig]);

  const [paymentMethod, setPaymentMethod] = useState(() => payMethods[0]?.key || 'Cash');

  const tipValue = parseFloat(tipAmount) || 0;
  const roundingMode = settings?.billing?.roundingMode || 'none';
  const applyRounding = useCallback((val) => {
    if (roundingMode === 'nearest') return Math.round(val);
    if (roundingMode === 'up') return Math.ceil(val);
    return Math.round(val * 100) / 100;
  }, [roundingMode]);

  // grandTotal already includes serviceCharge + autoGratuity + packagingCharge and is net of discount.
  // Only the tip is added on top here — re-applying discount/gratuity double-counted them.
  const finalTotal = applyRounding(grandTotal + tipValue);
  const cashChange = paymentMethod === 'Cash' ? Math.max(0, (parseFloat(cashTendered) || 0) - finalTotal) : 0;

  const shouldAutoPrint = (
    settings?.printer?.autoPrintBill !== false &&
    settings?.operations?.autoPrintReceipt !== false &&
    settings?.workflow?.autoPrintOnPayment !== false
  );

  const tipSuggestions = (settings?.receipt?.tipSuggestions && settings.receipt.tipSuggestions.length > 0)
    ? settings.receipt.tipSuggestions
    : [10, 15, 20];

  // Split payments state
  const [splitRows, setSplitRows] = useState([
    { id: '1', method: 'UPI', amount: '', cashTendered: '' },
    { id: '2', method: 'Cash', amount: '', cashTendered: '' },
  ]);

  const totalAllocated = useMemo(() => {
    return splitRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
  }, [splitRows]);

  const remainingToPay = useMemo(() => {
    return Math.round((finalTotal - totalAllocated) * 100) / 100;
  }, [finalTotal, totalAllocated]);

  const handleToggleSplit = (enableSplit) => {
    setIsSplit(enableSplit);
    if (enableSplit) {
      if (splitRows.every(r => !r.amount || parseFloat(r.amount) === 0)) {
        const half = Math.round((finalTotal / 2) * 100) / 100;
        setSplitRows([
          { id: '1', method: paymentMethod === 'Cash' ? 'UPI' : paymentMethod, amount: half.toString(), cashTendered: '' },
          { id: '2', method: 'Cash', amount: (Math.round((finalTotal - half) * 100) / 100).toString(), cashTendered: '' }
        ]);
      }
    }
  };

  const updateRowMethod = (id, method) => {
    setSplitRows(prev => prev.map(r => r.id === id ? { ...r, method } : r));
  };

  const updateRowAmount = (id, val) => {
    setSplitRows(prev => prev.map(r => r.id === id ? { ...r, amount: val } : r));
  };

  const updateRowCashTendered = (id, val) => {
    setSplitRows(prev => prev.map(r => r.id === id ? { ...r, cashTendered: val } : r));
  };

  const addSplitRow = () => {
    const existingMethods = new Set(splitRows.map(r => r.method));
    const nextMethod = payMethods.find(m => !existingMethods.has(m.key))?.key || 'Card';
    const fillAmount = remainingToPay > 0 ? remainingToPay.toFixed(2) : '';
    setSplitRows(prev => [...prev, {
      id: Date.now().toString(),
      method: nextMethod,
      amount: fillAmount,
      cashTendered: ''
    }]);
  };

  const removeSplitRow = (id) => {
    if (splitRows.length <= 2) return;
    setSplitRows(prev => prev.filter(r => r.id !== id));
  };

  const autoFillRow = (id) => {
    const currentVal = parseFloat(splitRows.find(r => r.id === id)?.amount || 0);
    const newAmount = Math.max(0, currentVal + remainingToPay);
    updateRowAmount(id, (Math.round(newAmount * 100) / 100).toString());
  };

  const handleSplitEvenly = () => {
    const count = splitRows.length;
    if (count === 0) return;
    const share = Math.floor((finalTotal / count) * 100) / 100;
    const remainder = Math.round((finalTotal - (share * count)) * 100) / 100;
    setSplitRows(prev => prev.map((r, idx) => ({
      ...r,
      amount: (idx === 0 ? share + remainder : share).toFixed(2)
    })));
  };

  const isSplitValid = useMemo(() => {
    if (!isSplit) return true;
    if (splitRows.length < 2) return false;
    const allHaveAmount = splitRows.every(r => parseFloat(r.amount) > 0);
    return allHaveAmount && Math.abs(remainingToPay) <= 0.01;
  }, [isSplit, splitRows, remainingToPay]);

  const handleSettle = () => {
    if (!isSplit) {
      onConfirm(paymentMethod, tipValue, finalTotal, null);
    } else {
      if (!isSplitValid) return;
      const validSplits = splitRows.map(r => ({
        method: r.method,
        amount: Math.round((parseFloat(r.amount) || 0) * 100) / 100,
        cashTendered: r.method === 'Cash' && r.cashTendered ? parseFloat(r.cashTendered) : undefined
      }));
      const methodLabel = `Split (${validSplits.map(s => `${s.method}: ₹${s.amount.toFixed(0)}`).join(', ')})`;
      onConfirm(methodLabel, tipValue, finalTotal, validSplits);
    }
  };

  return (
    <Modal title="Settle Bill" onClose={onClose} wide>
      <div className="modal-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Left: Summary */}
          <div>
            <div style={{
              background: 'rgba(30, 94, 74,0.05)', border: '1px solid rgba(30, 94, 74,0.15)',
              borderRadius: 'var(--r-lg)', padding: 14,
            }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 10, color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{activeTable ? `Table ${activeTable.number || activeTable.id}` : (unassignedTab ? `Token #${unassignedTab.tokenNumber} (Dine-In)` : 'Order')}{currentGuest ? ` - ${currentGuest}` : ''}</span>
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
                  <span>{pricesIncludeGst ? 'Subtotal (Net)' : 'Subtotal'}</span>
                  <span>{(pricesIncludeGst ? cartTotal - tax : cartTotal).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>GST ({gstRate}%{pricesIncludeGst ? ' incl.' : ''})</span>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2e7d5b' }}>
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
            {/* Payment Mode Selector: Single vs Split */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Payment Mode</div>
              <div style={{ display: 'flex', background: 'var(--border-subtle)', borderRadius: 'var(--r-md)', padding: 2 }}>
                <button
                  type="button"
                  onClick={() => handleToggleSplit(false)}
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.74rem',
                    fontWeight: !isSplit ? 700 : 500,
                    border: 'none',
                    borderRadius: 'var(--r-sm)',
                    background: !isSplit ? 'var(--primary)' : 'transparent',
                    color: !isSplit ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  Single Method
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleSplit(true)}
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.74rem',
                    fontWeight: isSplit ? 700 : 500,
                    border: 'none',
                    borderRadius: 'var(--r-sm)',
                    background: isSplit ? 'var(--primary)' : 'transparent',
                    color: isSplit ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    transition: 'all 0.15s'
                  }}
                >
                  <Split size={12} />
                  Split / Partial
                </button>
              </div>
            </div>

            {/* SINGLE PAYMENT MODE */}
            {!isSplit && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                  {payMethods.map(pm => {
                    const Icon = pm.icon;
                    const active = paymentMethod === pm.key;
                    return (
                      <button key={pm.key} onClick={() => setPaymentMethod(pm.key)}
                        style={{
                          padding: '12px 10px', borderRadius: 'var(--r-md)', cursor: 'pointer',
                          border: `2px solid ${active ? pm.color : 'var(--border-subtle)'}`,
                          background: active ? `${pm.color}10` : 'rgba(255,255,255,0.5)',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                          transition: 'all 0.15s',
                        }}>
                        <Icon size={20} style={{ color: active ? pm.color : 'var(--text-muted)' }} />
                        <span style={{ fontWeight: active ? 700 : 500, fontSize: '0.82rem', color: active ? pm.color : 'var(--text-secondary)' }}>{pm.key}</span>
                      </button>
                    );
                  })}
                </div>

                {paymentMethod === 'Cash' && (
                  <div className="input-group" style={{ marginBottom: 12 }}>
                    <label className="input-label">Cash Tendered</label>
                    <input className="input-field" type="number" value={cashTendered} onChange={e => setCashTendered(e.target.value)}
                      placeholder={finalTotal.toFixed(2)}
                    />
                    {cashChange > 0 && (
                      <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 'var(--r-sm)', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', fontSize: '0.82rem', fontWeight: 700, color: '#15803d' }}>
                        Change: {cashChange.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* SPLIT / MULTI-TENDER PAYMENT MODE */}
            {isSplit && (
              <div style={{ marginBottom: 12 }}>
                {/* Allocation summary banner */}
                <div style={{
                  background: Math.abs(remainingToPay) <= 0.01 ? 'rgba(34,197,94,0.08)' : remainingToPay > 0 ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)',
                  border: `1px solid ${Math.abs(remainingToPay) <= 0.01 ? 'rgba(34,197,94,0.25)' : remainingToPay > 0 ? 'rgba(245,158,11,0.25)' : 'rgba(239,68,68,0.25)'}`,
                  borderRadius: 'var(--r-md)',
                  padding: '7px 10px',
                  marginBottom: 10,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.78rem'
                }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Paid: </span>
                    <strong style={{ color: 'var(--text-primary)' }}>₹{totalAllocated.toFixed(2)}</strong> / ₹{finalTotal.toFixed(2)}
                  </div>
                  <div>
                    {Math.abs(remainingToPay) <= 0.01 ? (
                      <span style={{ color: '#15803d', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                        <CheckCircle size={13} /> Balanced
                      </span>
                    ) : remainingToPay > 0 ? (
                      <span style={{ color: '#b45309', fontWeight: 700 }}>
                        Left: ₹{remainingToPay.toFixed(2)}
                      </span>
                    ) : (
                      <span style={{ color: '#b91c1c', fontWeight: 700 }}>
                        Over: ₹{(-remainingToPay).toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Split Rows */}
                <div style={{ maxHeight: 210, overflowY: 'auto', paddingRight: 2 }}>
                  {splitRows.map((row) => {
                    const isRowCash = row.method === 'Cash';
                    const rowCashChange = isRowCash ? Math.max(0, (parseFloat(row.cashTendered) || 0) - (parseFloat(row.amount) || 0)) : 0;

                    return (
                      <div key={row.id} style={{
                        background: 'rgba(0,0,0,0.02)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--r-md)',
                        padding: '8px 10px',
                        marginBottom: 8
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginBottom: 6 }}>
                          {/* Method Selector Pills */}
                          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                            {payMethods.map(pm => {
                              const selected = row.method === pm.key;
                              const PMIcon = pm.icon;
                              return (
                                <button
                                  key={pm.key}
                                  type="button"
                                  onClick={() => updateRowMethod(row.id, pm.key)}
                                  style={{
                                    padding: '3px 7px',
                                    borderRadius: 'var(--r-sm)',
                                    border: `1.5px solid ${selected ? pm.color : 'var(--border-subtle)'}`,
                                    background: selected ? `${pm.color}15` : 'rgba(255,255,255,0.7)',
                                    color: selected ? pm.color : 'var(--text-secondary)',
                                    fontSize: '0.72rem',
                                    fontWeight: selected ? 700 : 500,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 3
                                  }}
                                >
                                  <PMIcon size={11} />
                                  {pm.key}
                                </button>
                              );
                            })}
                          </div>

                          {splitRows.length > 2 && (
                            <button
                              type="button"
                              onClick={() => removeSplitRow(row.id)}
                              title="Remove method"
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: 'var(--text-muted)', padding: 2, display: 'flex', alignItems: 'center'
                              }}
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <div style={{ position: 'relative', flex: 1 }}>
                            <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>₹</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              className="input-field"
                              style={{ paddingLeft: 22, height: 32, fontSize: '0.84rem', fontWeight: 700 }}
                              placeholder="Amount"
                              value={row.amount}
                              onChange={e => updateRowAmount(row.id, e.target.value)}
                            />
                          </div>

                          {remainingToPay > 0 && (
                            <button
                              type="button"
                              onClick={() => autoFillRow(row.id)}
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '0.7rem', padding: '4px 8px', height: 32, whiteSpace: 'nowrap' }}
                              title={`Auto-fill remaining ₹${remainingToPay.toFixed(2)}`}
                            >
                              +₹{remainingToPay.toFixed(0)}
                            </button>
                          )}
                        </div>

                        {/* Cash Tendered & Change on Cash split */}
                        {isRowCash && parseFloat(row.amount) > 0 && (
                          <div style={{ marginTop: 6, paddingTop: 4, borderTop: '1px dashed var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.74rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Cash Paid:</span>
                            <input
                              type="number"
                              className="input-field"
                              style={{ width: 85, height: 26, padding: '2px 6px', fontSize: '0.75rem' }}
                              placeholder={row.amount || '0'}
                              value={row.cashTendered}
                              onChange={e => updateRowCashTendered(row.id, e.target.value)}
                            />
                            {rowCashChange > 0 && (
                              <span style={{ fontWeight: 700, color: '#15803d' }}>
                                Change: ₹{rowCashChange.toFixed(2)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Quick actions for split */}
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  {splitRows.length < 4 && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={addSplitRow}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.73rem', padding: '4px 8px' }}
                    >
                      <Plus size={12} /> Add Method
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleSplitEvenly}
                    style={{ fontSize: '0.73rem', padding: '4px 8px' }}
                  >
                    Split 50/50
                  </button>
                </div>
              </div>
            )}

            {/* Tip section (shared) */}
            <div className="input-group">
              <label className="input-label">Add Tip</label>
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                {tipSuggestions.map(pct => (
                  <button key={pct} className="btn btn-secondary btn-sm" style={{ flex: 1, padding: '4px' }}
                    onClick={() => setTipAmount(((cartTotal * pct) / 100).toFixed(0))}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
              <input className="input-field" type="number" value={tipAmount} onChange={e => setTipAmount(e.target.value)} placeholder="Custom tip amount" style={{ height: 32 }} />
            </div>
          </div>
        </div>
      </div>

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button
          className="btn btn-success"
          disabled={isSplit && !isSplitValid}
          onClick={handleSettle}
          style={{ minWidth: 200 }}
        >
          {shouldAutoPrint ? <Printer size={15} /> : <Check size={15} />}
          {!isSplit
            ? `Settle ${finalTotal.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}${shouldAutoPrint ? ' & Print' : ''}`
            : isSplitValid
            ? `Settle ${finalTotal.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })} (Split)${shouldAutoPrint ? ' & Print' : ''}`
            : remainingToPay > 0
            ? `Allocate Remaining ₹${remainingToPay.toFixed(2)}`
            : `Over-allocated by ₹${(-remainingToPay).toFixed(2)}`
          }
        </button>
      </div>
    </Modal>
  );
};

// ─── Table Order Hover Card / Popover ────────────────────────
const TableOrderHoverCard = ({
  table,
  summary,
  statusColor,
  statusLabel,
  serverName,
  position = 'top',
  align = 'center',
  onSettle,
  onOpenOrder,
  onReleaseTable,
  onViewHistory,
  onMouseEnter,
  onMouseLeave,
}) => {
  if (!table) return null;
  const {
    items = [],
    itemCount = 0,
    subtotal = 0,
    tax = 0,
    serviceCharge = 0,
    autoGratuity = 0,
    grandTotal = 0,
    hasOrder = false,
  } = summary || {};

  const stylePos = {
    position: 'absolute',
    [position === 'top' ? 'bottom' : 'top']: 'calc(100% + 8px)',
    width: '280px',
    maxWidth: '90vw',
    background: 'var(--card-bg, #ffffff)',
    backdropFilter: 'blur(20px)',
    border: '1px solid var(--border-subtle, #e2e8f0)',
    borderRadius: '16px',
    padding: '14px',
    boxShadow: '0 16px 36px rgba(0, 0, 0, 0.22), 0 2px 8px rgba(0, 0, 0, 0.08)',
    zIndex: 1000,
    pointerEvents: 'auto',
    textAlign: 'left',
    cursor: 'default',
  };

  if (align === 'left') {
    stylePos.left = '0';
    stylePos.transform = 'none';
  } else if (align === 'right') {
    stylePos.right = '0';
    stylePos.transform = 'none';
  } else {
    stylePos.left = '50%';
    stylePos.transform = 'translateX(-50%)';
  }

  return (
    <div
      className="table-order-hover-card animate-fade-in"
      style={stylePos}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
              Table {table.number || table.id}
            </span>
            <span style={{
              fontSize: '0.62rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              padding: '2px 6px',
              borderRadius: '6px',
              background: `${statusColor || '#22c55e'}18`,
              color: statusColor || 'var(--primary)',
            }}>
              {statusLabel || table.status}
            </span>
          </div>
          {table.guestName && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <User size={11} /> <span>{table.guestName}</span>
              {table.partySize && <span>({table.partySize} guests)</span>}
            </div>
          )}
        </div>

        {table.seatedAt && (
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'right' }}>
            <TurnTimer seatedAt={table.seatedAt} />
          </div>
        )}
      </div>

      {serverName && (
        <div style={{ fontSize: '0.68rem', color: 'var(--primary)', fontWeight: 600, marginBottom: '8px' }}>
          Server: {serverName}
        </div>
      )}

      {/* Items Section */}
      {hasOrder ? (
        <>
          <div style={{
            maxHeight: '130px',
            overflowY: 'auto',
            paddingRight: '4px',
            marginBottom: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}>
            {items.map((item, idx) => {
              const modPrice = (item.modifiers || []).reduce((sum, m) => sum + (Number(m.price) || 0), 0);
              const lineTotal = ((Number(item.price) || 0) + modPrice) * (Number(item.qty || item.quantity) || 1);
              return (
                <div key={item._cartKey || item.id || idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: '0.75rem' }}>
                  <div style={{ flex: 1, minWidth: 0, paddingRight: '8px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <span style={{
                        display: 'inline-block',
                        background: 'rgba(30, 94, 74, 0.1)',
                        color: 'var(--primary)',
                        padding: '0 4px',
                        borderRadius: '4px',
                        marginRight: '6px',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                      }}>
                        {item.qty || item.quantity || 1}x
                      </span>
                      {item.name}
                    </div>
                    {item.specialInstructions && (
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontStyle: 'italic', paddingLeft: '22px' }}>
                        "{item.specialInstructions}"
                      </div>
                    )}
                  </div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                    ₹{lineTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Subtotals & Taxes */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '8px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
              <span>Subtotal ({itemCount} items)</span>
              <span>₹{subtotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
            </div>
            {tax > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                <span>GST</span>
                <span>₹{tax.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              </div>
            )}
            {serviceCharge > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                <span>Service Charge</span>
                <span>₹{serviceCharge.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              </div>
            )}
            {autoGratuity > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                <span>Auto-Gratuity</span>
                <span>₹{autoGratuity.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', paddingTop: '4px', borderTop: '1px dashed var(--border-subtle)' }}>
              <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)' }}>Total Due</span>
              <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--primary)' }}>
                ₹{grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{
                flex: 1,
                padding: '8px 10px',
                fontSize: '0.78rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
              onClick={(e) => onSettle(table, e)}
            >
              <ReceiptText size={14} /> Settle Bill
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{
                padding: '8px 10px',
                fontSize: '0.75rem',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
              }}
              onClick={() => onOpenOrder(table)}
              title="Open full order screen to add or edit items"
            >
              <Eye size={13} /> View
            </button>
            {onViewHistory && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{
                  padding: '8px 10px',
                  fontSize: '0.75rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                }}
                onClick={() => onViewHistory(table)}
                title="View past orders & receipts for this table"
              >
                <History size={13} /> History
              </button>
            )}
          </div>
        </>
      ) : (
        /* Empty or Seated Without Items */
        <div style={{ textAlign: 'center', padding: '10px 0' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
            {table.status === 'seated' ? 'Guest seated • No items ordered yet' : 'Table is unoccupied'}
          </div>
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ padding: '6px 12px', fontSize: '0.75rem' }}
              onClick={() => onOpenOrder(table)}
            >
              {table.status === 'seated' ? 'Start Order' : 'Seat Table'}
            </button>
            {onViewHistory && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ padding: '6px 10px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                onClick={() => onViewHistory(table)}
                title="View past orders & receipts for this table"
              >
                <History size={12} /> Past Orders
              </button>
            )}
            {table.status === 'seated' && onReleaseTable && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ padding: '6px 10px', fontSize: '0.72rem', color: 'var(--danger)' }}
                onClick={(e) => { e.stopPropagation(); onReleaseTable(table); }}
              >
                Release
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};


// ─── Table Past Orders Helpers & Modals ───────────────────────
export function getTableOrders(orders, table) {
  if (!orders || !Array.isArray(orders)) return [];
  if (!table || table.id === 'all' || table.number === 'All' || table.number === 'All Tables') {
    return (orders || []).filter(o => o.orderType === 'dine-in' || o.tableId || o.tableName || o.tokenNumber).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }
  const tableIdStr = String(table.id);
  const tableNumStr = String(table.number || table.id);

  return (orders || []).filter(o => {
    if (!o.tableId && !o.tableName && !o.tokenNumber) return false;
    const oTableId = String(o.tableId || '');
    const oTableName = String(o.tableName || '');

    return (
      oTableId === tableIdStr ||
      oTableId === tableNumStr ||
      oTableName === `Table ${tableNumStr}` ||
      oTableName === `Table ${tableIdStr}` ||
      (table.tokenNumber && String(o.tokenNumber) === String(table.tokenNumber)) ||
      (tableIdStr.startsWith('tab_') && oTableId === tableIdStr)
    );
  }).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

const ChangePaymentModal = ({ order, onClose, onConfirm }) => {
  const [method, setMethod] = useState(order?.paymentMethod || 'Cash');
  const [isSplit, setIsSplit] = useState(order?.paymentMethod === 'Split');
  const [splits, setSplits] = useState(order?.paymentSplits || [
    { method: 'Cash', amount: Math.round((order?.total || 0) / 2) },
    { method: 'UPI', amount: (order?.total || 0) - Math.round((order?.total || 0) / 2) },
  ]);

  if (!order) return null;

  const total = Number(order.total) || 0;
  const splitTotal = splits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const isSplitValid = Math.abs(splitTotal - total) < 0.01;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isSplit && !isSplitValid) {
      alert(`Split total (₹${splitTotal}) must equal order total (₹${total}).`);
      return;
    }
    onConfirm(isSplit ? 'Split' : method, isSplit ? splits : null);
  };

  const METHODS = ['Cash', 'Card', 'UPI', 'Split'];

  return (
    <Modal title={`Change Payment Method • ${order.billNo || 'Order'}`} onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-muted, #f8fafc)', padding: '10px 14px', borderRadius: '10px' }}>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Bill Amount</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                ₹{total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Current Tender</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--primary)' }}>
                {order.paymentMethod || 'Unspecified'}
              </div>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.82rem', fontWeight: 700, display: 'block', marginBottom: 8 }}>
              Select New Payment Method:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {METHODS.map(m => (
                <button
                  key={m}
                  type="button"
                  className={((isSplit && m === 'Split') || (!isSplit && method === m)) ? 'btn btn-primary' : 'btn btn-secondary'}
                  style={{ padding: '10px 6px', fontSize: '0.85rem', fontWeight: 700 }}
                  onClick={() => {
                    if (m === 'Split') {
                      setIsSplit(true);
                      setMethod('Split');
                    } else {
                      setIsSplit(false);
                      setMethod(m);
                    }
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {isSplit && (
            <div style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Specify Split Portions:
              </div>
              {splits.map((s, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    className="input-field"
                    value={s.method}
                    style={{ width: 120, height: 36 }}
                    onChange={e => {
                      const next = [...splits];
                      next[idx].method = e.target.value;
                      setSplits(next);
                    }}
                  >
                    <option value="Cash">Cash</option>
                    <option value="Card">Card</option>
                    <option value="UPI">UPI</option>
                  </select>
                  <input
                    type="number"
                    className="input-field"
                    style={{ flex: 1, height: 36 }}
                    value={s.amount}
                    min="0"
                    step="any"
                    onChange={e => {
                      const next = [...splits];
                      next[idx].amount = parseFloat(e.target.value) || 0;
                      setSplits(next);
                    }}
                  />
                  {splits.length > 2 && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setSplits(splits.filter((_, i) => i !== idx))}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, fontSize: '0.8rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSplits([...splits, { method: 'UPI', amount: 0 }])}
                >
                  + Add Split Line
                </button>
                <div style={{ fontWeight: 700, color: isSplitValid ? 'var(--success)' : 'var(--danger)' }}>
                  Total: ₹{splitTotal.toFixed(2)} / ₹{total.toFixed(2)} {isSplitValid ? '✓' : `(Diff: ₹${(total - splitTotal).toFixed(2)})`}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={isSplit && !isSplitValid}>
            Save Payment Method
          </button>
        </div>
      </form>
    </Modal>
  );
};

const VoidOrderModal = ({ order, onClose, onConfirm }) => {
  const [reason, setReason] = useState('Billing Error');
  const [customReason, setCustomReason] = useState('');

  if (!order) return null;

  const REASONS = [
    'Billing Error',
    'Customer Complaint',
    'Kitchen Error / Wrong Item',
    'Customer Walkout / Left',
    'Wrong Table Charged',
    'Duplicate Bill Created',
    'Other',
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    const finalReason = reason === 'Other' ? (customReason.trim() || 'Other') : reason;
    onConfirm(finalReason);
  };

  return (
    <Modal title={`Void Order • ${order.billNo || 'Order'}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: '10px',
            padding: '12px 14px',
            color: '#dc2626',
            fontSize: '0.82rem',
            lineHeight: 1.4,
          }}>
            <strong>Warning:</strong> Voiding this bill will mark it as cancelled, reverse cash drawer contributions if paid in cash, and record an audit log entry.
          </div>

          <div style={{ background: 'var(--surface-muted, #f8fafc)', padding: '10px 14px', borderRadius: '10px', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'var(--text-muted)' }}>Bill No:</span>
              <strong>{order.billNo}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'var(--text-muted)' }}>Amount:</span>
              <strong>₹{(order.total || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Payment Tender:</span>
              <strong>{order.paymentMethod}</strong>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.82rem', fontWeight: 700, display: 'block', marginBottom: 6 }}>
              Select Reason for Voiding:
            </label>
            <select
              className="input-field"
              value={reason}
              onChange={e => setReason(e.target.value)}
              style={{ width: '100%', height: 38 }}
            >
              {REASONS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {reason === 'Other' && (
            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, display: 'block', marginBottom: 6 }}>
                Specify Reason:
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="Enter details..."
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
                style={{ width: '100%', height: 38 }}
                required
              />
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-danger" style={{ background: '#dc2626', color: '#fff', border: 'none' }}>
            Confirm & Void Bill
          </button>
        </div>
      </form>
    </Modal>
  );
};

const EditPastOrderModal = ({ order, menu = [], settings = {}, onClose, onConfirm }) => {
  const [items, setItems] = useState((order?.items || []).map(i => ({ ...i, qty: i.qty || i.quantity || 1 })));
  const [discount, setDiscount] = useState(order?.discount || 0);
  const [discountReason, setDiscountReason] = useState(order?.discountReason || '');
  const [guestName, setGuestName] = useState(order?.guestName || '');
  const [customerPhone, setCustomerPhone] = useState(order?.customerPhone || '');
  const [selectedMenuItemId, setSelectedMenuItemId] = useState('');
  const [paymentMethodForDelta, setPaymentMethodForDelta] = useState(order?.paymentMethod === 'Cash' ? 'Cash' : 'UPI');
  const [refundMethodForDelta, setRefundMethodForDelta] = useState(order?.paymentMethod === 'Cash' ? 'Cash' : 'UPI');

  if (!order) return null;

  const pricesIncludeGst = order.pricesIncludeGst !== undefined
    ? order.pricesIncludeGst
    : (settings?.billing?.pricesIncludeGst !== false);
  const gstRate = order.taxRate ?? settings?.billing?.gstRate ?? 5;

  const itemsTotal = items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 1), 0);
  let subtotal = 0;
  let tax = 0;
  if (pricesIncludeGst) {
    tax = gstRate > 0 ? itemsTotal - (itemsTotal / (1 + gstRate / 100)) : 0;
    subtotal = itemsTotal - tax;
  } else {
    subtotal = itemsTotal;
    tax = subtotal * (gstRate / 100);
  }

  const serviceCharge = order.serviceCharge || 0;
  const autoGratuity = order.autoGratuity || 0;
  const tip = order.tip || 0;
  const discountVal = Math.max(0, Number(discount) || 0);
  const rawTotal = subtotal + tax + serviceCharge + autoGratuity - discountVal + tip;
  const revisedTotal = Math.max(0, parseFloat(rawTotal.toFixed(2)));

  const originalTotal = Number(order.total) || 0;
  const delta = parseFloat((revisedTotal - originalTotal).toFixed(2));

  const handleQtyChange = (idx, newQty) => {
    if (newQty <= 0) {
      setItems(items.filter((_, i) => i !== idx));
    } else {
      const next = [...items];
      next[idx] = { ...next[idx], qty: newQty };
      setItems(next);
    }
  };

  const handleAddItem = () => {
    if (!selectedMenuItemId) return;
    const menuItem = menu.find(m => String(m.id) === String(selectedMenuItemId));
    if (!menuItem) return;

    const existingIdx = items.findIndex(i => String(i.id) === String(menuItem.id));
    if (existingIdx >= 0) {
      const next = [...items];
      next[existingIdx].qty += 1;
      setItems(next);
    } else {
      setItems([...items, {
        id: menuItem.id,
        name: menuItem.name,
        price: menuItem.price || 0,
        qty: 1,
        category: menuItem.category || '',
      }]);
    }
    setSelectedMenuItemId('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (items.length === 0) {
      alert('Order must contain at least one item. If you want to cancel the entire order, use Void instead.');
      return;
    }
    onConfirm({
      items,
      subtotal,
      tax,
      total: revisedTotal,
      discount: discountVal,
      discountReason,
      guestName,
      customerPhone,
      delta,
      deltaAction: delta > 0.01 ? 'charge' : delta < -0.01 ? 'refund' : 'none',
      deltaPaymentMethod: delta > 0.01 ? paymentMethodForDelta : delta < -0.01 ? refundMethodForDelta : 'None',
    });
  };

  return (
    <Modal title={`Edit Past Order • ${order.billNo || 'Order'}`} onClose={onClose} extraWide>
      <form onSubmit={handleSubmit}>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Guest and Phone */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: 4 }}>
                Guest Name:
              </label>
              <input
                type="text"
                className="input-field"
                value={guestName}
                onChange={e => setGuestName(e.target.value)}
                placeholder="Guest Name"
                style={{ width: '100%', height: 34 }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: 4 }}>
                Phone Number:
              </label>
              <input
                type="text"
                className="input-field"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                placeholder="Phone (optional)"
                style={{ width: '100%', height: 34 }}
              />
            </div>
          </div>

          {/* Items Editor */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Order Items ({items.length}):</span>
            </div>
            <div style={{
              maxHeight: 180,
              overflowY: 'auto',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}>
              {items.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px', background: 'var(--card-bg)', borderRadius: 6, border: '1px solid var(--border-subtle)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{item.name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>₹{item.price} each</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ width: 26, height: 26, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={() => handleQtyChange(idx, item.qty - 1)}
                    >
                      <Minus size={12} />
                    </button>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', width: 20, textAlign: 'center' }}>
                      {item.qty}
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ width: 26, height: 26, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={() => handleQtyChange(idx, item.qty + 1)}
                    >
                      <Plus size={12} />
                    </button>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', width: 60, textAlign: 'right' }}>
                      ₹{(item.price * item.qty).toFixed(0)}
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '3px 6px', color: 'var(--danger)' }}
                      onClick={() => handleQtyChange(idx, 0)}
                      title="Remove item"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Add item dropdown */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              className="input-field"
              value={selectedMenuItemId}
              onChange={e => setSelectedMenuItemId(e.target.value)}
              style={{ flex: 1, height: 34 }}
            >
              <option value="">+ Add item from menu...</option>
              {menu.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} (₹{m.price})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!selectedMenuItemId}
              onClick={handleAddItem}
              style={{ height: 34, padding: '0 12px' }}
            >
              Add Item
            </button>
          </div>

          {/* Discount & Adjustments */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: 4 }}>
                Discount Amount (₹):
              </label>
              <input
                type="number"
                className="input-field"
                value={discount}
                min="0"
                step="any"
                onChange={e => setDiscount(e.target.value)}
                style={{ width: '100%', height: 34 }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: 4 }}>
                Discount Reason:
              </label>
              <input
                type="text"
                className="input-field"
                value={discountReason}
                onChange={e => setDiscountReason(e.target.value)}
                placeholder="Manager Comp / Loyalty / Special"
                style={{ width: '100%', height: 34 }}
              />
            </div>
          </div>

          {/* Financial Recalculation Summary */}
          <div style={{
            background: 'var(--surface-muted, #f8fafc)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            fontSize: '0.82rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Items Subtotal:</span>
              <span>₹{itemsTotal.toFixed(2)}</span>
            </div>
            {tax > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>GST ({gstRate}%):</span>
                <span>₹{tax.toFixed(2)}</span>
              </div>
            )}
            {discountVal > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--success)' }}>
                <span>Discount:</span>
                <span>-₹{discountVal.toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, paddingTop: 4, borderTop: '1px solid var(--border-subtle)', marginTop: 4 }}>
              <span>Revised Total:</span>
              <span style={{ fontSize: '0.95rem', color: 'var(--primary)' }}>₹{revisedTotal.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
              <span>Original Total:</span>
              <span>₹{originalTotal.toFixed(2)}</span>
            </div>

            {/* Delta Box */}
            <div style={{
              marginTop: 6,
              padding: '8px 10px',
              borderRadius: 6,
              background: delta > 0 ? 'rgba(245, 158, 11, 0.12)' : delta < 0 ? 'rgba(34, 197, 94, 0.12)' : 'rgba(0,0,0,0.04)',
              color: delta > 0 ? '#b45309' : delta < 0 ? '#15803d' : 'var(--text-muted)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontWeight: 700,
            }}>
              <span>
                {delta > 0 ? `Customer Pays Additional: ₹${delta.toFixed(2)}` : delta < 0 ? `Refund Due to Customer: ₹${(-delta).toFixed(2)}` : 'No Change in Total'}
              </span>
              {delta > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 500 }}>via:</span>
                  <select
                    className="input-field"
                    value={paymentMethodForDelta}
                    onChange={e => setPaymentMethodForDelta(e.target.value)}
                    style={{ height: 26, fontSize: '0.72rem', padding: '0 4px' }}
                  >
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="Card">Card</option>
                  </select>
                </div>
              )}
              {delta < 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 500 }}>via:</span>
                  <select
                    className="input-field"
                    value={refundMethodForDelta}
                    onChange={e => setRefundMethodForDelta(e.target.value)}
                    style={{ height: 26, fontSize: '0.72rem', padding: '0 4px' }}
                  >
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="Card">Card</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">
            Save & Update Order
          </button>
        </div>
      </form>
    </Modal>
  );
};

const TableHistoryModal = ({
  table,
  tables = [],
  orders = [],
  menu = [],
  settings = {},
  onClose,
  onReprint,
  onReopen,
  onChangePayment,
  onEditOrder,
  onVoidOrder,
}) => {
  const { loadOlderOrders } = useApp();
  const [selectedTableId, setSelectedTableId] = useState(table ? (table.id || 'all') : 'all');
  const [period, setPeriod] = useState('today'); // 'today' | '7days' | 'all' | 'date'
  const [filterDate, setFilterDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'paid' | 'voided' | 'reopened'
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedOrderId, setExpandedOrderId] = useState(null);

  useEffect(() => {
    if (filterDate && typeof loadOlderOrders === 'function') {
      loadOlderOrders(filterDate);
    } else if (period === '7days' && typeof loadOlderOrders === 'function') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      loadOlderOrders(localDayStr(d));
    } else if (period === 'all' && typeof loadOlderOrders === 'function') {
      loadOlderOrders('2020-01-01');
    }
  }, [filterDate, period, loadOlderOrders]);

  const activeTableObj = useMemo(() => {
    if (selectedTableId === 'all') return { id: 'all', number: 'All Tables' };
    return tables.find(t => String(t.id) === String(selectedTableId)) || { id: selectedTableId, number: selectedTableId };
  }, [selectedTableId, tables]);

  // Filter orders for table
  const tableOrders = useMemo(() => {
    return getTableOrders(orders, activeTableObj);
  }, [orders, activeTableObj]);

  // Filter by period, status, search query
  const filteredOrders = useMemo(() => {
    const now = new Date();
    const todayStr = localDayStr(now);

    return tableOrders.filter(o => {
      // Date / Period filter
      if (filterDate) {
        if (!o.createdAt || localDayStr(new Date(o.createdAt)) !== filterDate) return false;
      } else if (period === 'today') {
        if (!o.createdAt || localDayStr(new Date(o.createdAt)) !== todayStr) return false;
      } else if (period === '7days') {
        const orderDate = new Date(o.createdAt || 0);
        const diffDays = (now - orderDate) / (1000 * 60 * 60 * 24);
        if (diffDays > 7) return false;
      }

      // Status filter
      if (statusFilter === 'paid' && o.status !== 'paid') return false;
      if (statusFilter === 'voided' && o.status !== 'voided' && o.status !== 'cancelled') return false;
      if (statusFilter === 'reopened' && o.status !== 'reopened') return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesBill = (o.billNo || '').toLowerCase().includes(q);
        const matchesGuest = (o.guestName || '').toLowerCase().includes(q);
        const matchesItem = (o.items || []).some(i => (i.name || '').toLowerCase().includes(q));
        if (!matchesBill && !matchesGuest && !matchesItem) return false;
      }

      return true;
    });
  }, [tableOrders, period, filterDate, statusFilter, searchQuery]);

  // Aggregate stats
  const totalRevenue = useMemo(() => {
    return filteredOrders
      .filter(o => o.status === 'paid')
      .reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  }, [filteredOrders]);

  const paidCount = filteredOrders.filter(o => o.status === 'paid').length;
  const avgOrder = paidCount > 0 ? (totalRevenue / paidCount) : 0;

  return (
    <Modal title={`Table History • ${activeTableObj.number === 'All Tables' ? 'All Tables' : `Table ${activeTableObj.number || activeTableObj.id}`}`} onClose={onClose} extraWide>
      <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Controls row */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Table:</span>
            <select
              className="input-field"
              value={selectedTableId}
              onChange={e => setSelectedTableId(e.target.value)}
              style={{ height: 32, fontSize: '0.82rem', padding: '0 8px', minWidth: 130 }}
            >
              <option value="all">All Tables</option>
              {tables.map(t => (
                <option key={t.id} value={t.id}>
                  Table {t.number || t.id} {t.section ? `(${t.section})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Period tabs */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface-muted, #f1f5f9)', padding: 3, borderRadius: 8 }}>
            {[
              { id: 'today', label: 'Today' },
              { id: '7days', label: 'Last 7 Days' },
              { id: 'all', label: 'All Time' },
            ].map(p => (
              <button
                key={p.id}
                type="button"
                className="btn btn-sm"
                style={{
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  fontWeight: (!filterDate && period === p.id) ? 700 : 500,
                  background: (!filterDate && period === p.id) ? 'var(--card-bg, #fff)' : 'transparent',
                  color: (!filterDate && period === p.id) ? 'var(--primary)' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: 6,
                  boxShadow: (!filterDate && period === p.id) ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
                onClick={() => { setPeriod(p.id); setFilterDate(''); }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Date filter */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Date:</span>
            <input
              type="date"
              className="input-field"
              value={filterDate}
              onChange={e => {
                setFilterDate(e.target.value);
                if (e.target.value) setPeriod('date');
              }}
              style={{
                height: 32,
                fontSize: '0.82rem',
                padding: '0 8px',
                minWidth: 130,
                border: filterDate ? '1px solid var(--primary)' : '1px solid var(--border)',
                background: filterDate ? 'rgba(30, 94, 74, 0.05)' : 'white'
              }}
            />
            {filterDate && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => { setFilterDate(''); setPeriod('today'); }}
                title="Clear date filter"
                style={{
                  height: 32,
                  padding: '0 8px',
                  fontSize: '0.75rem',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Status filter tabs */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface-muted, #f1f5f9)', padding: 3, borderRadius: 8 }}>
            {[
              { id: 'all', label: 'All Status' },
              { id: 'paid', label: 'Paid' },
              { id: 'voided', label: 'Voided' },
              { id: 'reopened', label: 'Reopened' },
            ].map(s => (
              <button
                key={s.id}
                type="button"
                className="btn btn-sm"
                style={{
                  padding: '4px 8px',
                  fontSize: '0.72rem',
                  fontWeight: statusFilter === s.id ? 700 : 500,
                  background: statusFilter === s.id ? 'var(--card-bg, #fff)' : 'transparent',
                  color: statusFilter === s.id ? 'var(--primary)' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: 6,
                  boxShadow: statusFilter === s.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
                onClick={() => setStatusFilter(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search bar */}
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="input-field"
            placeholder="Search past bills by Bill No, guest name, or ordered dish..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', height: 34, paddingLeft: 32, fontSize: '0.8rem' }}
          />
        </div>

        {/* Stats banner */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, background: 'var(--surface-muted, #f8fafc)', padding: '10px 14px', borderRadius: 10 }}>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Orders Count</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{filteredOrders.length}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Revenue (Paid)</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--primary)' }}>
              ₹{totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Avg Ticket</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-secondary)' }}>
              ₹{avgOrder.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>

        {/* Order Cards List */}
        {filteredOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)' }}>
            <Clock size={32} style={{ opacity: 0.35, marginBottom: 8 }} />
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>No orders found</div>
            <div style={{ fontSize: '0.75rem' }}>No orders matching the selected filters.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '420px', overflowY: 'auto', paddingRight: 4 }}>
            {filteredOrders.map(order => {
              const isExpanded = expandedOrderId === order.id;
              const isVoided = order.status === 'voided' || order.status === 'cancelled';
              const isReopened = order.status === 'reopened';
              const itemCount = (order.items || []).reduce((s, i) => s + (i.qty || i.quantity || 1), 0);
              const orderTimeStr = order.createdAt ? new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
              const orderDateStr = order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '';

              return (
                <div
                  key={order.id}
                  style={{
                    background: 'var(--card-bg, #fff)',
                    border: `1px solid ${isVoided ? 'rgba(239, 68, 68, 0.3)' : isReopened ? 'rgba(139, 92, 246, 0.3)' : 'var(--border)'}`,
                    borderRadius: 12,
                    padding: 12,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    opacity: isVoided ? 0.75 : 1,
                  }}
                >
                  {/* Top Bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                          {order.billNo || `#${order.id.slice(-6)}`}
                        </span>
                        <span style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: 'rgba(30, 94, 74, 0.1)',
                          color: 'var(--primary)',
                        }}>
                          {order.tableId ? `Table ${order.tableId}` : (order.tokenNumber ? `Token #${order.tokenNumber}` : 'Dine-In')}
                        </span>
                        {/* Status Badge */}
                        <span style={{
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: isVoided ? 'rgba(239, 68, 68, 0.15)' : isReopened ? 'rgba(139, 92, 246, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                          color: isVoided ? '#dc2626' : isReopened ? '#7c3aed' : '#16a34a',
                        }}>
                          {order.status || 'paid'}
                        </span>
                        {/* Payment Method Badge */}
                        <span style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: 'rgba(59, 130, 246, 0.12)',
                          color: '#2563eb',
                        }}>
                          {order.paymentMethod || 'Cash'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span>{orderDateStr} • {orderTimeStr}</span>
                        {order.guestName && <span>• Guest: <strong>{order.guestName}</strong></span>}
                        {order.serverName && <span>• Staff: {order.serverName}</span>}
                        {order.isRevised && <span style={{ color: '#d97706', fontWeight: 700 }}>• (Revised)</span>}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, fontSize: '1.05rem', color: isVoided ? '#991b1b' : 'var(--text-primary)' }}>
                        ₹{(order.total || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {itemCount} {itemCount === 1 ? 'item' : 'items'}
                      </div>
                    </div>
                  </div>

                  {/* Void reason if applicable */}
                  {isVoided && order.voidReason && (
                    <div style={{ fontSize: '0.72rem', color: '#dc2626', background: 'rgba(239, 68, 68, 0.08)', padding: '3px 8px', borderRadius: 4, marginBottom: 8 }}>
                      Void Reason: <strong>{order.voidReason}</strong>
                    </div>
                  )}

                  {/* Collapsible Items Details */}
                  {isExpanded && (
                    <div style={{ background: 'var(--surface-muted, #f8fafc)', borderRadius: 8, padding: 8, marginTop: 8, marginBottom: 8, fontSize: '0.75rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
                        {(order.items || []).map((item, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--border-subtle)', paddingBottom: 2 }}>
                            <span><strong>{item.qty || item.quantity || 1}x</strong> {item.name}</span>
                            <span>₹{((item.price || 0) * (item.qty || item.quantity || 1)).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.7rem', borderTop: '1px solid var(--border)', paddingTop: 4 }}>
                        <span>Subtotal: ₹{(order.subtotal || 0).toFixed(2)}</span>
                        {order.tax > 0 && <span>GST: ₹{(order.tax || 0).toFixed(2)}</span>}
                        {order.discount > 0 && <span style={{ color: 'var(--success)' }}>Discount: -₹{(order.discount || 0).toFixed(2)}</span>}
                        <strong>Total: ₹{(order.total || 0).toFixed(2)}</strong>
                      </div>
                    </div>
                  )}

                  {/* Actions Row */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8, borderTop: '1px solid var(--border-subtle)', paddingTop: 8 }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '4px 8px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                    >
                      <Eye size={12} /> {isExpanded ? 'Hide Items' : 'View Items'}
                    </button>

                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '4px 8px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      onClick={() => onReprint?.(order)}
                      title="Reprint Bill Receipt"
                    >
                      <Printer size={12} /> Reprint
                    </button>

                    {!isVoided && !isReopened && (
                      <>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 8px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          onClick={() => onChangePayment?.(order)}
                          title="Change Payment Tender (Cash, UPI, Card, Split)"
                        >
                          <CreditCard size={12} /> Change Payment
                        </button>

                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 8px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          onClick={() => onEditOrder?.(order)}
                          title="Edit items, change quantities, apply discount"
                        >
                          <Edit3 size={12} /> Edit Order
                        </button>

                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 8px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--primary)', fontWeight: 700 }}
                          onClick={() => onReopen?.(order)}
                          title="Re-open order to table active cart"
                        >
                          <RotateCcw size={12} /> Re-Open to Table
                        </button>

                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 8px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--danger)' }}
                          onClick={() => onVoidOrder?.(order)}
                          title="Void / Cancel this bill"
                        >
                          <Ban size={12} /> Void
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// ─── Main POS Component ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

const POS = () => {
  const { user } = useAuth();
  const {
    menu, settings, floorPlans, staff, guests, modifiers, cashDrawer,
    placeOrder, fireToKDS, transferKDSTickets, cancelKDSTickets, updateCashDrawer, addAuditEntry,
    posTables, setPosTables, posSavedOrders, setPosSavedOrders,
    onlineOrders, editOnlineOrder, reload, addRegisterClosure, broadcastOrderCreated,
    reservations, orders, kdsTickets, updatePOSOrder,
  } = useApp();

  // ── State ─────────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [mobileTab, setMobileTab] = useState('menu');
  const [showPendingModal, setShowPendingModal] = useState(false);

  // No longer polling every 60 seconds since we have realtime websockets
  // The database triggers postgres_changes and broadcast events.

  const pendingOrders = useMemo(() => {
    return (onlineOrders || []).filter(o => o.status === 'new');
  }, [onlineOrders]);

  const handleAcceptPendingOrder = async (order) => {
    try {
      // Map itemsList to POS cart items format
      const posItems = (order.itemsList || []).map(item => {
        const match = menu.find(m => m.name.toLowerCase() === item.name.toLowerCase());
        const itemId = match?.id || `item_${Math.random().toString(36).substring(2, 9)}`;
        return {
          id: itemId,
          name: item.name,
          price: item.price,
          qty: item.qty,
          _cartKey: `${itemId}_`,
          modifiers: [],
          specialInstructions: item.notes || '',
          modifierGroups: match?.modifierGroups || [],
          course: 1,
          seat: 1,
        };
      });

      const tableMatch = order.address && order.address.match(/Table\s+(\S+)/i);
      const tableNum = tableMatch ? tableMatch[1] : null;

      if (tableNum) {
        const targetTable = tables.find(t => String(t.number || t.id).trim().toLowerCase() === tableNum.trim().toLowerCase());
        if (targetTable) {
          setSavedOrders(prev => ({
            ...prev,
            [targetTable.id]: posItems
          }));

          setTables(prev => prev.map(t => String(t.id) === String(targetTable.id)
            ? {
                ...t,
                status: 'ordered',
                guestName: order.customer,
                seatedAt: new Date().toISOString(),
              }
            : t
          ));

          await fireToKDS(order.id, posItems, targetTable.id, 'dine-in');
          await editOnlineOrder(order.id, { status: 'delivered' });
          showSuccess(`Order accepted and added to Table ${tableNum}!`);
        } else {
          alert(`Table "${tableNum}" was not found in the layout.`);
          return;
        }
      } else {
        setActiveTable(null);
        setCart(posItems);
        setCustomerName(order.customer);
        setCustomerPhone(order.phone || '');
        setOrderType('takeout');
        setView('order');
        
        await editOnlineOrder(order.id, { status: 'preparing' });
        showSuccess(`Takeout order accepted! Cart populated.`);
      }

      setShowPendingModal(false);
      reload();
    } catch (err) {
      console.error('Error accepting pending order:', err);
      alert('Failed to accept order.');
    }
  };

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isTableManagementEnabled = isModuleEnabled(settings, 'tableManagement');
  const isKdsEnabled = isModuleEnabled(settings, 'kds');

  const [orderType, setOrderType] = useState('dine-in');
  const [view, setView] = useState(() => (isTableManagementEnabled ? 'floor' : 'order')); // 'floor' | 'order'

  useEffect(() => {
    if (!isTableManagementEnabled && view === 'floor') {
      setView('order');
    }
  }, [isTableManagementEnabled, view]);
  const [viewMode, setViewMode] = useState('map'); // 'grid' | 'map'
  const tables = posTables || [];
  const setTables = setPosTables;
  const [activeTable, setActiveTable] = useState(null);
  const [unassignedTab, setUnassignedTab] = useState(null);
  const [cart, setCart] = useState([]);
  const savedOrders = posSavedOrders || {};
  const setSavedOrders = setPosSavedOrders;

  // Table status the settle flow should restore if payment is cancelled
  const prePayStatusRef = useRef(null);

  // Tables with a confirmed reservation coming up (next 2h, 30min grace) show
  // as 'reserved' while they sit available — display-only, never persisted.
  const reservedTableIds = useMemo(() => {
    const ids = new Set();
    // Reservation dates are written with toISOString (UTC); accept the local
    // date too so the overlay doesn't vanish around midnight in non-UTC zones.
    const todayUTC = new Date().toISOString().split('T')[0];
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const todayLocal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const now = Date.now();
    (reservations || []).forEach(r => {
      if (r.status !== 'confirmed' || !r.tableId || !r.time) return;
      if (r.date !== todayUTC && r.date !== todayLocal) return;
      const at = new Date(`${todayLocal}T${r.time}`).getTime();
      if (isNaN(at)) return;
      if (at - now <= 2 * 60 * 60 * 1000 && at - now >= -30 * 60 * 1000) {
        ids.add(String(r.tableId));
      }
    });
    return ids;
  }, [reservations]);

  // Status to DISPLAY for a table (layers the reservation overlay on top)
  const displayStatus = (table) =>
    table.status === 'available' && reservedTableIds.has(String(table.id))
      ? 'reserved'
      : (table.status || 'available');
  const [activeCategory, setActiveCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Takeout / Delivery fields
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [pickupTime, setPickupTime] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [driverInstructions, setDriverInstructions] = useState('');
  const [deliveryChannel, setDeliveryChannel] = useState('In-House');

  // Prefill Takeout defaults
  useEffect(() => {
    if (orderType === 'takeout' && view === 'floor') {
      setCustomerName('Walk-in Guest');
      const now = new Date();
      now.setMinutes(now.getMinutes() + 15);
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      setPickupTime(`${hours}:${minutes}`);
    }
  }, [orderType, view]);

  // Automatic Register Closure check
  useEffect(() => {
    const checkAutoClose = async () => {
      const isEnhanced = settings?.operations?.enhancedRegisterEnabled ?? false;
      const autoCloseEnabled = settings?.operations?.autoCloseEnabled ?? false;
      if (!isEnhanced || !autoCloseEnabled || !settings?.operations?.autoCloseTime) return;

      const isRegisterClosed = cashDrawer?.isClosed || !cashDrawer?.shiftStart;
      if (isRegisterClosed) return;

      const shiftStartLocal = new Date(cashDrawer.shiftStart);
      const [closeHours, closeMinutes] = settings.operations.autoCloseTime.split(':').map(Number);
      
      const autoCloseDateTime = new Date(shiftStartLocal);
      autoCloseDateTime.setHours(closeHours, closeMinutes, 0, 0);

      const now = new Date();
      if (now > autoCloseDateTime) {
        console.log('[Auto-Close] Closing register since current time is past scheduled close time.');
        
        const expectedBalance = (cashDrawer?.openingBalance || 0) +
          (cashDrawer?.cashIn || 0) -
          (cashDrawer?.cashOut || 0) -
          (cashDrawer?.drops || []).reduce((s, d) => s + d.amount, 0);

        const autoClosure = {
          openingBalance: cashDrawer.openingBalance,
          cashIn: cashDrawer.cashIn || 0,
          cashOut: cashDrawer.cashOut || 0,
          drops: cashDrawer.drops || [],
          expectedBalance,
          actualCash: expectedBalance,
          variance: 0,
          notes: 'Automatically closed by system scheduler.',
          shiftStart: cashDrawer.shiftStart,
          shiftEnd: autoCloseDateTime.toISOString(),
          closedBy: 'System Scheduler',
          denominations: {},
          depositAmount: expectedBalance,
          bankName: 'System Vault',
          depositNotes: 'Auto-closed deposit.',
          midDayCounts: cashDrawer.midDayCounts || [],
        };

        await addRegisterClosure(autoClosure);

        const closedDrawer = {
          openingBalance: 0,
          currentBalance: 0,
          cashIn: 0,
          cashOut: 0,
          drops: [],
          discrepancies: [],
          shiftStart: null,
          isClosed: true,
          openingDenominations: {},
          midDayCounts: [],
        };
        await updateCashDrawer(closedDrawer);

        await addAuditEntry(
          'cash_register.auto_close',
          'system',
          'System Scheduler',
          `Automatically closed register. Expected/Actual: ₹${expectedBalance}`
        );

        alert(`The cash register has been automatically closed at the configured time (${settings.operations.autoCloseTime}) with Actual = Expected.`);
        window.location.reload();
      }
    };

    checkAutoClose();
  }, [settings, cashDrawer]);

  // Modals
  const [guestModal, setGuestModal] = useState(null);
  const [noTableModal, setNoTableModal] = useState(false);
  const [assignTableModal, setAssignTableModal] = useState(null);
  const [modifierModal, setModifierModal] = useState(null);
  const [splitModal, setSplitModal] = useState(false);
  const [paymentModal, setPaymentModal] = useState(false);
  const [mergeModal, setMergeModal] = useState(false);
  const [shiftTableModal, setShiftTableModal] = useState(false);
  const [releaseModal, setReleaseModal] = useState(false);
  const [cashDrawerModal, setCashDrawerModal] = useState(false);
  const [cleaningTable, setCleaningTable] = useState(null);
  const [startingFloat, setStartingFloat] = useState('5000');
  const [compModal, setCompModal] = useState(null);    // 'comp' | 'void' | 'discount'
  const [managerPinModal, setManagerPinModal] = useState(null);

  // Past Table History & Order Management Modals
  const [tableHistoryModal, setTableHistoryModal] = useState(null); // table object or 'all'
  const [changePaymentModal, setChangePaymentModal] = useState(null); // order object
  const [editPastOrderModal, setEditPastOrderModal] = useState(null); // order object
  const [voidOrderModal, setVoidOrderModal] = useState(null); // order object

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

  // Table Hover Card state & timers
  const [hoveredTableId, setHoveredTableId] = useState(null);
  const hoverTimeoutRef = useRef(null);

  const handleTableMouseEnter = (tableId) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredTableId(tableId);
  };

  const handleTableMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredTableId(null);
    }, 200);
  };

  const handlePopoverMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  const handlePopoverMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredTableId(null);
    }, 200);
  };

  // ── Shift Open overlay ──────────────────────────────────────
  // Built here, but RETURNED AFTER all hooks (just before the main return).
  // A conditional early-return in the middle of the hook list changes the
  // hook count whenever the register opens/closes — or cashDrawer arrives on
  // a reload — which crashes React with a "change in order of Hooks" error
  // and blanks the screen. All hooks must run unconditionally first.
  const isRegisterClosed = cashDrawer?.isClosed || !cashDrawer?.shiftStart;
  const registerClosedScreen = (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100vw',
        background: 'radial-gradient(circle at 10% 20%, rgb(90, 92, 234) 0%, rgb(32, 45, 78) 90%)',
        fontFamily: "'Outfit', sans-serif",
        color: 'white',
        overflow: 'hidden',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 9999
      }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: 24,
          padding: '40px 32px',
          width: '90%',
          maxWidth: 420,
          boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          textAlign: 'center'
        }}>
          <div style={{
            background: 'rgba(30, 94, 74, 0.2)',
            width: 72,
            height: 72,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
            border: '2px solid rgba(30, 94, 74, 0.4)'
          }}>
            <Lock size={32} color="#6faa93" />
          </div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: 8, letterSpacing: '-0.02em' }}>
            Cash Register Closed
          </h2>
          <p style={{ fontSize: '0.88rem', color: '#cbd5e1', marginBottom: 28, lineHeight: 1.5 }}>
            To begin POS billing operations, please enter the starting cash float to open the register.
          </p>

          <form onSubmit={handleOpenRegister} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ textAlign: 'left' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.05em' }}>
                Starting Float (₹)
              </label>
              <input
                type="number"
                required
                className="input-field"
                value={startingFloat}
                onChange={e => setStartingFloat(e.target.value)}
                placeholder="Enter starting cash float"
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: 'white',
                  borderRadius: 12,
                  padding: '12px 16px',
                  fontSize: '1rem',
                  outline: 'none',
                  transition: 'all 0.3s'
                }}
              />
            </div>
            <button
              type="submit"
              className="btn"
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #1e5e4a, #174b3b)',
                color: 'white',
                border: 'none',
                borderRadius: 12,
                padding: '14px',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 4px 14px 0 rgba(30, 94, 74, 0.4)',
                transition: 'all 0.3s'
              }}
            >
              <Play size={16} fill="white" /> Open Register &amp; Start Shift
            </button>
          </form>
        </div>
      </div>
  );

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
    return cats.length > 0 ? cats : (settings?.menuCategories?.categories || ['Starters', 'Main Course', 'Desserts', 'Beverages']);
  }, [menuItems, settings?.menuCategories?.categories]);

  useEffect(() => {
    if (categories.length > 0) {
      if (!activeCategory || !categories.includes(activeCategory)) {
        setActiveCategory(categories[0]);
      }
    } else {
      setActiveCategory('');
    }
  }, [categories, activeCategory]);



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
  const pricesIncludeGst = settings?.billing?.pricesIncludeGst !== false;
  const serviceChargeRate = settings?.billing?.enableServiceCharge ? (settings?.billing?.serviceCharge || 0) : 0;
  const autoGratuityThreshold = settings?.billing?.autoGratuityThreshold || 6;
  const autoGratuityEnabled = settings?.billing?.autoGratuityEnabled !== false;
  const autoGratuityRate = settings?.billing?.autoGratuityPercent || 18;
  const autoGratuityPreTax = settings?.billing?.autoGratuityPreTax !== false;
  const currency = settings?.restaurant?.currency || 'INR';

  const cartTotal = useMemo(() => {
    return cart.reduce((s, i) => {
      const modPrice = (i.modifiers || []).reduce((ms, m) => ms + (m.price || 0), 0);
      return s + (i.price + modPrice) * i.qty;
    }, 0);
  }, [cart]);

  const tax = pricesIncludeGst
    ? (gstRate > 0 ? cartTotal - (cartTotal / (1 + gstRate / 100)) : 0)
    : cartTotal * (gstRate / 100);

  const subtotalNet = pricesIncludeGst ? cartTotal - tax : cartTotal;

  const serviceCharge = (autoGratuityPreTax ? subtotalNet : cartTotal) * (serviceChargeRate / 100);

  const autoGratuity = (autoGratuityEnabled && partySize >= autoGratuityThreshold)
    ? (autoGratuityPreTax ? subtotalNet : (pricesIncludeGst ? cartTotal : cartTotal + tax)) * (autoGratuityRate / 100)
    : 0;

  const packagingCharge = (orderType === 'takeout' || orderType === 'delivery')
    ? (parseFloat(settings?.delivery?.packagingCharge) || 0)
    : 0;

  const roundingMode = settings?.billing?.roundingMode || 'none';
  const applyRounding = useCallback((val) => {
    if (roundingMode === 'nearest') return Math.round(val);
    if (roundingMode === 'up') return Math.ceil(val);
    return Math.round(val * 100) / 100;
  }, [roundingMode]);

  const rawGrandTotal = pricesIncludeGst
    ? cartTotal + serviceCharge + autoGratuity + packagingCharge - discountAmount
    : cartTotal + tax + serviceCharge + autoGratuity + packagingCharge - discountAmount;
  const grandTotal = applyRounding(rawGrandTotal);

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

  const getTableOrderSummary = useCallback((table) => {
    if (!table) return null;
    const items = (activeTable && String(activeTable.id) === String(table.id) && cart.length > 0)
      ? cart
      : (savedOrders[table.id] || []);

    return calculateTableBill({
      items,
      settings,
      partySize: table.partySize || 1,
      discountAmount: (activeTable && String(activeTable.id) === String(table.id)) ? discountAmount : 0,
      orderType: 'dine-in',
    });
  }, [activeTable, cart, savedOrders, settings, discountAmount]);

  const handleDirectSettle = (table, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const tableItems = (activeTable && String(activeTable.id) === String(table.id) && cart.length > 0)
      ? cart
      : (savedOrders[table.id] || []);

    if (tableItems.length === 0) {
      showSuccess(`Table ${table.number || table.id} has no ordered items to settle.`);
      return;
    }
    if (!checkRegisterBeforePayment()) return;

    setActiveTable(table);
    setCart(tableItems);
    setOrderType('dine-in');
    setPartySize(table.partySize || 1);
    prePayStatusRef.current = table.status;
    setTables(prev => prev.map(t => String(t.id) === String(table.id) ? { ...t, status: 'paying' } : t));
    setHoveredTableId(null);
    setPaymentModal(true);
  };

  // ─── Unassigned Dine-In Tabs & Floating Orders ─────────────────
  const floatingTabs = useMemo(() => {
    const tabs = [];
    if (!savedOrders || typeof savedOrders !== 'object') return tabs;

    const tickets = kdsTickets || [];

    Object.entries(savedOrders).forEach(([key, val]) => {
      if (!key.startsWith('tab_') || !val) return;
      const tabId = key.replace(/^tab_/, '');

      let tabData;
      if (typeof val === 'object' && !Array.isArray(val) && val.tokenNumber) {
        tabData = { ...val };
      } else {
        const meta = savedOrders.__tabs_meta__?.[tabId] || {};
        tabData = {
          id: tabId,
          tokenNumber: meta.tokenNumber || '?',
          guestName: meta.guestName || '',
          partySize: meta.partySize || 1,
          createdAt: meta.createdAt || new Date().toISOString(),
          ...meta,
          items: Array.isArray(val) ? val : (val?.items || []),
        };
      }

      const tabItems = tabData.items || [];
      if (tabItems.length === 0 && (!unassignedTab || unassignedTab.id !== tabId)) {
        return; // Skip empty discarded tabs
      }

      // Check KDS preparation status
      const tabTickets = tickets.filter(t =>
        (t.tableId === key || t.tableId === tabId || (tabData.tokenNumber && String(t.tokenNumber) === String(tabData.tokenNumber))) &&
        t.status !== 'cancelled'
      );
      const hasActiveTicket = tabTickets.some(t => t.status === 'active');
      const hasCompletedTicket = tabTickets.some(t => t.status === 'completed');
      const isFoodReady = tabTickets.length > 0 && tabTickets.every(t => t.status === 'completed');

      tabs.push({
        ...tabData,
        items: tabItems,
        hasKdsTicket: tabTickets.length > 0,
        isFoodReady,
        hasActiveTicket,
        hasCompletedTicket,
      });
    });

    // Also include active unassignedTab if not yet reflected
    if (unassignedTab && !tabs.some(t => t.id === unassignedTab.id)) {
      tabs.push({
        ...unassignedTab,
        items: cart,
        hasKdsTicket: false,
        isFoodReady: false,
        hasActiveTicket: false,
      });
    }

    return tabs.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  }, [savedOrders, unassignedTab, cart, kdsTickets]);

  const getNextTokenNumber = useCallback(() => {
    const activeTokens = floatingTabs
      .map(t => parseInt(t.tokenNumber, 10))
      .filter(n => !isNaN(n));

    const todayStr = new Date().toISOString().split('T')[0];
    const orderList = orders || getAll('orders') || [];
    const todayOrders = orderList.filter(o => o?.createdAt?.startsWith(todayStr));
    const completedTokens = todayOrders
      .map(o => parseInt(o.tokenNumber, 10))
      .filter(n => !isNaN(n));

    const allTokens = [...activeTokens, ...completedTokens];
    if (allTokens.length === 0) return 1;
    return Math.max(...allTokens) + 1;
  }, [floatingTabs, orders]);

  // Keep savedOrders in sync whenever cart changes for an unassigned tab
  useEffect(() => {
    if (!unassignedTab?.id) return;
    setSavedOrders(prev => {
      const existing = prev[`tab_${unassignedTab.id}`];
      const currentItems = Array.isArray(existing) ? existing : (existing?.items || []);
      const prevSig = currentItems.map(i => `${i._cartKey || i.id}:${i.qty}:${i.price}`).join('|');
      const nextSig = cart.map(i => `${i._cartKey || i.id}:${i.qty}:${i.price}`).join('|');
      if (prevSig === nextSig) return prev;

      const updated = {
        ...(typeof existing === 'object' && !Array.isArray(existing) ? existing : unassignedTab),
        items: cart,
        firedItems: (typeof existing === 'object' && !Array.isArray(existing) ? existing.firedItems : unassignedTab.firedItems) || [],
      };
      return {
        ...prev,
        [`tab_${unassignedTab.id}`]: updated,
      };
    });
  }, [cart, unassignedTab, setSavedOrders]);

  const handleStartNoTableOrder = () => {
    setNoTableModal(true);
  };

  const handleConfirmNoTableOrder = ({ tokenNumber, guestName, guestPhone, partySize, notes }) => {
    const newTab = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      tokenNumber: tokenNumber || String(getNextTokenNumber()),
      guestName: guestName || '',
      guestPhone: guestPhone || '',
      partySize: partySize || 2,
      notes: notes || '',
      createdAt: new Date().toISOString(),
      orderType: 'dine-in',
      items: [],
      firedItems: [],
    };

    setUnassignedTab(newTab);
    setActiveTable(null);
    setCart([]);
    setOrderType('dine-in');
    setCustomerName(newTab.guestName);
    setCustomerPhone(newTab.guestPhone);
    setPartySize(newTab.partySize);

    setSavedOrders(prev => ({
      ...prev,
      [`tab_${newTab.id}`]: newTab,
    }));

    setView('order');
    setNoTableModal(false);
  };

  const handleOpenFloatingTab = (tab) => {
    const tabRaw = savedOrders[`tab_${tab.id}`];
    const tabItems = (tabRaw && Array.isArray(tabRaw))
      ? tabRaw
      : (tabRaw?.items || tab.items || []);
    const firedItems = (tabRaw && !Array.isArray(tabRaw) && tabRaw.firedItems)
      ? tabRaw.firedItems
      : (tab.firedItems || []);

    setUnassignedTab({
      ...tab,
      items: tabItems,
      firedItems,
    });
    setActiveTable(null);
    setCart(tabItems);
    setOrderType('dine-in');
    setCustomerName(tab.guestName || '');
    setCustomerPhone(tab.guestPhone || '');
    setPartySize(tab.partySize || 1);
    setView('order');
  };

  const handleSettleFloatingTab = (tab) => {
    const tabRaw = savedOrders[`tab_${tab.id}`];
    const tabItems = (tabRaw && Array.isArray(tabRaw))
      ? tabRaw
      : (tabRaw?.items || tab.items || []);
    const firedItems = (tabRaw && !Array.isArray(tabRaw) && tabRaw.firedItems)
      ? tabRaw.firedItems
      : (tab.firedItems || []);

    if (!tabItems || tabItems.length === 0) {
      alert(`Token #${tab.tokenNumber} has no items in the order yet. Open cart and add items first.`);
      return;
    }

    setUnassignedTab({
      ...tab,
      items: tabItems,
      firedItems,
    });
    setActiveTable(null);
    setCart(tabItems);
    setOrderType('dine-in');
    setPartySize(tab.partySize || 1);
    setCustomerName(tab.guestName || '');
    setCustomerPhone(tab.guestPhone || '');
    setPaymentModal(true);
  };

  const handleDiscardFloatingTab = async (tab) => {
    if (window.confirm(`Are you sure you want to discard Token #${tab.tokenNumber}${tab.guestName ? ` (${tab.guestName})` : ''}?`)) {
      if (cancelKDSTickets) {
        try {
          await cancelKDSTickets(`tab_${tab.id}`, `Token #${tab.tokenNumber}`);
        } catch (e) {
          console.error('Failed to cancel KDS tickets for discarded tab:', e);
        }
      }
      setSavedOrders(prev => {
        const next = { ...prev };
        delete next[`tab_${tab.id}`];
        if (next.__tabs_meta__) {
          const nextMeta = { ...next.__tabs_meta__ };
          delete nextMeta[tab.id];
          next.__tabs_meta__ = nextMeta;
        }
        return next;
      });
      if (unassignedTab?.id === tab.id) {
        setUnassignedTab(null);
        setCart([]);
      }
      showSuccess(`Token #${tab.tokenNumber} discarded`);
    }
  };

  const handleAssignTableToTab = async (targetTableId, tabToAssign) => {
    const tab = tabToAssign || unassignedTab;
    if (!tab || !targetTableId) return;
    const targetTable = tables.find(t => String(t.id) === String(targetTableId));
    if (!targetTable) return;

    const rawTabId = String(tab.id || '');
    const cleanTabId = rawTabId.replace(/^tab_/, '');
    const tabKey = `tab_${cleanTabId}`;

    const tabRaw = savedOrders[tabKey] || savedOrders[rawTabId];
    const tabItems = (unassignedTab && String(unassignedTab.id).replace(/^tab_/, '') === cleanTabId && cart && cart.length > 0)
      ? cart
      : (tab.items || (Array.isArray(tabRaw) ? tabRaw : tabRaw?.items) || []);

    const existingTargetItems = savedOrders[targetTable.id] || savedOrders[String(targetTable.id)] || [];
    const mergedItems = [...existingTargetItems];
    tabItems.forEach(item => {
      const idx = mergedItems.findIndex(i => (i._cartKey || i.id) === (item._cartKey || item.id));
      if (idx >= 0) {
        mergedItems[idx] = { ...mergedItems[idx], qty: mergedItems[idx].qty + item.qty };
      } else {
        mergedItems.push({ ...item });
      }
    });

    // Update savedOrders: move items to target table, delete tab
    setSavedOrders(prev => {
      const next = { ...prev };
      next[targetTable.id] = mergedItems;
      next[String(targetTable.id)] = mergedItems;
      delete next[tabKey];
      delete next[rawTabId];
      if (next.__tabs_meta__) {
        const nextMeta = { ...next.__tabs_meta__ };
        delete nextMeta[cleanTabId];
        delete nextMeta[rawTabId];
        next.__tabs_meta__ = nextMeta;
      }
      return next;
    });

    // Update target table
    const updatedTargetTable = {
      ...targetTable,
      status: mergedItems.length > 0 ? 'ordered' : 'seated',
      guestName: tab.guestName || targetTable.guestName || `Token #${tab.tokenNumber}`,
      partySize: tab.partySize || targetTable.partySize || 1,
      seatedAt: targetTable.seatedAt || tab.createdAt || new Date().toISOString(),
    };

    setTables(prev => prev.map(t => String(t.id) === String(targetTable.id)
      ? updatedTargetTable
      : t
    ));

    // Transfer active KDS tickets
    if (transferKDSTickets) {
      try {
        await transferKDSTickets(
          tabKey,
          targetTable.id,
          `Token #${tab.tokenNumber}`,
          targetTable.number || targetTable.id
        );
      } catch (err) {
        console.error('Error transferring KDS tickets for unassigned tab:', err);
      }
    }

    broadcastOrderCreated(targetTable.id, `ASSIGN-${tab.tokenNumber}-T${targetTable.number || targetTable.id}`);

    // Update active table & cart so the staff sees the assigned table with all items in the cart!
    setActiveTable(updatedTargetTable);
    setCart(mergedItems);
    setUnassignedTab(null);
    setOrderType('dine-in');
    setPartySize(updatedTargetTable.partySize || 1);
    setView('order');

    setAssignTableModal(null);
    showSuccess(`Token #${tab.tokenNumber} assigned to Table ${targetTable.number || targetTable.id}!`);
  };

  const handleTableClick = (table) => {
    if (table.status === 'needs-bussing') {
      // Table was settled; staff confirms it's been cleaned before reuse
      setCleaningTable(table);
      return;
    }
    if (table.status !== 'available') {
      setActiveTable(table);
      const items = savedOrders[table.id] || savedOrders[String(table.id)] || [];
      setCart(items);
      setPartySize(table.partySize || 1);
      setView('order');
    } else {
      setGuestModal(table.id);
    }
  };

  const handleGuestConfirmed = (guest) => {
    const tableId = guestModal;
    setTables(prev => prev.map(t => String(t.id) === String(tableId)
      ? { ...t, status: 'seated', guestName: guest.name, guestId: guest.id || null, seatedAt: new Date().toISOString() }
      : t
    ));
    const table = tables.find(t => String(t.id) === String(tableId));
    const updatedTable = { ...table, status: 'seated', guestName: guest.name, guestId: guest.id || null, seatedAt: new Date().toISOString() };
    setActiveTable(updatedTable);
    const items = savedOrders[tableId] || savedOrders[String(tableId)] || [];
    setCart(items);
    setGuestModal(null);
    setView('order');
  };

  // ── KOT / Fire ────────────────────────────────────────────
  const handleSaveKOT = async () => {
    if (cart.length === 0) return;

    const tableId = unassignedTab ? `tab_${unassignedTab.id}` : (activeTable?.id || (orderType === 'delivery' ? 'delivery' : 'takeout'));
    const previousRaw = savedOrders[tableId];

    // For unassigned tabs, diff against firedItems (items actually sent to KDS/kitchen).
    // For regular tables, diff against previous savedOrders[tableId].
    const previousItems = unassignedTab
      ? ((typeof previousRaw === 'object' && !Array.isArray(previousRaw) ? previousRaw?.firedItems : unassignedTab.firedItems) || [])
      : (Array.isArray(previousRaw) ? previousRaw : (previousRaw?.items || []));

    // Diff current cart with already fired items to fire only new items/quantities
    const itemsToFire = [];
    cart.forEach(item => {
      const prev = previousItems.find(p => (p._cartKey || p.id) === (item._cartKey || item.id));
      const prevQty = prev ? prev.qty : 0;
      const diffQty = item.qty - prevQty;
      if (diffQty > 0) {
        itemsToFire.push({
          ...item,
          qty: diffQty
        });
      }
    });

    if (unassignedTab) {
      const updatedTab = {
        ...unassignedTab,
        items: cart,
        firedItems: cart.map(i => ({ ...i })),
        lastFiredAt: new Date().toISOString(),
      };
      setUnassignedTab(updatedTab);
      setSavedOrders(prev => {
        const next = { ...prev };
        next[`tab_${unassignedTab.id}`] = updatedTab;
        if (next.__tabs_meta__) {
          const nextMeta = { ...next.__tabs_meta__ };
          nextMeta[unassignedTab.id] = updatedTab;
          next.__tabs_meta__ = nextMeta;
        }
        return next;
      });
    } else {
      setSavedOrders(prev => ({
        ...prev,
        [tableId]: cart,
      }));
      if (activeTable) {
        setTables(prev => prev.map(t => String(t.id) === String(activeTable.id) ? { ...t, status: 'ordered' } : t));
      }
    }

    if (itemsToFire.length > 0) {
      const orderId = unassignedTab
        ? `TOK-${unassignedTab.tokenNumber}-${Date.now().toString().slice(-4)}`
        : (activeTable ? `T${activeTable.id}-${Date.now().toString().slice(-4)}` : `TK-${Date.now().toString().slice(-4)}`);

      const kdsTableId = unassignedTab ? `tab_${unassignedTab.id}` : (activeTable?.id || null);
      await fireToKDS(orderId, itemsToFire, kdsTableId, orderType, {
        tokenNumber: unassignedTab?.tokenNumber || null,
        guestName: unassignedTab?.guestName || null,
      });
      broadcastOrderCreated(kdsTableId, orderId);

      // Auto-print KOT if enabled in settings
      const shouldAutoPrintKOT = settings?.printer?.autoPrintKOT || settings?.operations?.autoKOT;
      if (shouldAutoPrintKOT) {
        printKOT({
          orderId,
          items: itemsToFire,
          tableId: kdsTableId,
          tableName: unassignedTab
            ? `Token #${unassignedTab.tokenNumber} (Unassigned Table)`
            : (activeTable ? `Table ${activeTable.number || activeTable.id}` : (orderType === 'takeout' ? 'Takeout' : 'Delivery')),
          serverName: activeTable?.serverName || user?.name || 'Staff',
          orderType,
          settings,
        });
      }
      showSuccess(unassignedTab ? `Token #${unassignedTab.tokenNumber} sent to kitchen!` : 'KOT saved! Kitchen notified.');
    } else {
      showSuccess(unassignedTab ? `Token #${unassignedTab.tokenNumber} saved (no new items to send to kitchen).` : 'Order saved (no new items to send to kitchen).');
    }
  };

  const handleFireNextCourse = async () => {
    const nextCourse = Math.min(...cart.filter(i => !firedCourses.has(i.course)).map(i => i.course));
    if (isFinite(nextCourse)) {
      const courseItems = cart.filter(i => i.course === nextCourse);
      setFiredCourses(prev => new Set([...prev, nextCourse]));
      const orderId = activeTable ? `T${activeTable.id}` : 'takeout';
      try {
        await fireToKDS(orderId, courseItems, activeTable?.id, orderType);
        broadcastOrderCreated(activeTable?.id || null, orderId);

        if (settings?.printer?.autoPrintKOT || settings?.operations?.autoKOT) {
          printKOT({
            orderId,
            items: courseItems,
            tableId: activeTable?.id,
            tableName: activeTable ? `Table ${activeTable.number || activeTable.id}` : 'Takeout',
            serverName: activeTable?.serverName || user?.name || 'Staff',
            orderType,
            notes: `Course ${nextCourse}`,
            settings,
          });
        }
        showSuccess(`Course ${nextCourse} fired to kitchen!`);
      } catch (err) {
        console.error('[POS] Failed to fire course to KDS:', err);
        alert('Could not send this course to the Kitchen Display. Please try again.');
      }
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
    const fromItems = savedOrders[fromTableId] || savedOrders[String(fromTableId)] || [];
    const merged = [...cart];
    fromItems.forEach(item => {
      const existing = merged.find(i => (i._cartKey || i.id) === (item._cartKey || item.id));
      if (existing) {
        existing.qty += item.qty;
      } else {
        merged.push({ ...item });
      }
    });
    setCart(merged);
    setSavedOrders(prev => {
      const next = { ...prev };
      delete next[fromTableId];
      delete next[String(fromTableId)];
      if (activeTable?.id) {
        next[activeTable.id] = merged;
        next[String(activeTable.id)] = merged;
      }
      return next;
    });
    setTables(prev => prev.map(t => String(t.id) === String(fromTableId)
      ? { ...t, status: 'available', guestName: null, guestId: null, seatedAt: null }
      : t
    ));
    showSuccess(`Table ${fromTableId} merged into current tab`);
  };

  // ── Shift / Transfer Table ────────────────────────────────
  const handleShiftTable = async ({ targetTableId, markNeedsCleaning, printNotice }) => {
    if (!activeTable) return;
    const fromTable = activeTable;
    const toTable = tables.find(t => String(t.id) === String(targetTableId));
    if (!toTable || String(fromTable.id) === String(toTable.id)) return;

    const fromKey = fromTable.id;
    const toKey = toTable.id;

    // Items from current cart or saved order
    const fromItems = (cart && cart.length > 0)
      ? cart
      : (savedOrders[fromKey] || savedOrders[String(fromKey)] || []);

    const targetExistingItems = savedOrders[toKey] || savedOrders[String(toKey)] || [];

    // Combine items if target already has an order, else take fromItems
    let finalTargetItems = [];
    if (targetExistingItems.length > 0) {
      finalTargetItems = [...targetExistingItems];
      fromItems.forEach(item => {
        const existing = finalTargetItems.find(i => (i._cartKey || i.id) === (item._cartKey || item.id));
        if (existing) {
          existing.qty += item.qty;
        } else {
          finalTargetItems.push({ ...item });
        }
      });
    } else {
      finalTargetItems = fromItems.map(i => ({ ...i }));
    }

    // 1. Update savedOrders
    setSavedOrders(prev => {
      const next = { ...prev };
      delete next[fromKey];
      delete next[String(fromKey)];
      next[toKey] = finalTargetItems;
      next[String(toKey)] = finalTargetItems;
      return next;
    });

    // 2. Update tables status
    const updatedToTable = {
      ...toTable,
      status: fromTable.status && fromTable.status !== 'available' ? fromTable.status : (finalTargetItems.length > 0 ? 'ordered' : 'seated'),
      guestName: fromTable.guestName || toTable.guestName,
      guestId: fromTable.guestId || toTable.guestId,
      seatedAt: fromTable.seatedAt || toTable.seatedAt || new Date().toISOString(),
      partySize: fromTable.partySize || toTable.partySize || 1,
      serverId: fromTable.serverId || toTable.serverId || user?.id || null,
    };

    setTables(prev => prev.map(t => {
      if (String(t.id) === String(fromTable.id)) {
        return {
          ...t,
          status: markNeedsCleaning ? 'needs-bussing' : 'available',
          guestName: null,
          guestId: null,
          seatedAt: null,
          partySize: null,
        };
      }
      if (String(t.id) === String(toTable.id)) {
        return updatedToTable;
      }
      return t;
    }));

    // 3. Update active table & cart so the screen stays on the new table
    setActiveTable(updatedToTable);
    setCart(finalTargetItems);
    setView('order');

    // 4. Transfer KDS tickets in real time
    if (transferKDSTickets) {
      try {
        await transferKDSTickets(fromTable.id, toTable.id, fromTable.number, toTable.number);
      } catch (err) {
        console.error('[POS] Failed to transfer KDS tickets:', err);
      }
    }

    // 5. Audit Log
    addAuditEntry(
      'TABLE_TRANSFER',
      user?.role || 'staff',
      user?.name || 'Staff',
      `Shifted Table ${fromTable.number || fromTable.id} to Table ${toTable.number || toTable.id} (${fromItems.length} items)`
    );

    // 6. Broadcast Realtime
    broadcastOrderCreated(toTable.id, `SHIFT-T${toTable.number || toTable.id}`);

    // 7. Print Transfer Notice if requested
    if (printNotice) {
      try {
        printTableTransferNotice({
          fromTable,
          toTable,
          guestName: fromTable.guestName,
          serverName: user?.name,
          items: fromItems,
          settings,
        });
      } catch (err) {
        console.error('[POS] Failed to print transfer notice:', err);
      }
    }

    showSuccess(`Table ${fromTable.number || fromTable.id} shifted to Table ${toTable.number || toTable.id}!`);
  };

  // ── Release / Clear Table ─────────────────────────────────
  const handleReleaseTable = async ({ targetTable = null, markStatus = 'available', cancelKds = true } = {}) => {
    const tableToRelease = targetTable || activeTable;
    if (!tableToRelease) return;
    const tableId = tableToRelease.id;
    const tableNum = tableToRelease.number || tableToRelease.id;
    const isActive = activeTable && String(activeTable.id) === String(tableId);
    const currentItems = (isActive && cart && cart.length > 0) ? cart : (savedOrders[tableId] || []);

    // 1. Clear saved orders for this table
    setSavedOrders(prev => {
      const next = { ...prev };
      delete next[tableId];
      return next;
    });

    // 2. Reset cart and tab states if active
    if (isActive) {
      setCart([]);
      setDiscountAmount(0);
      setFiredCourses(new Set([1]));
      setIsHeld(false);
      setHoldTimer(0);
      setPartySize(1);
      setHasCardOnFile(false);
      setActiveTable(null);
      setView('floor');
    }

    // 3. Reset table status
    setTables(prev => prev.map(t => {
      if (String(t.id) === String(tableId)) {
        return {
          ...t,
          status: markStatus,
          guestName: null,
          guestId: null,
          seatedAt: null,
          partySize: null,
          serverId: null,
        };
      }
      return t;
    }));

    // 4. Cancel active KDS tickets if requested
    if (cancelKds && cancelKDSTickets) {
      try {
        await cancelKDSTickets(tableId, tableNum);
      } catch (err) {
        console.error('[POS] Failed to cancel KDS tickets:', err);
      }
    }

    // 5. Audit Log
    addAuditEntry(
      'TABLE_RELEASE',
      user?.role || 'staff',
      user?.name || 'Staff',
      `Released Table ${tableNum} (${currentItems.length} items cleared, status: ${markStatus})`
    );

    // 6. Broadcast Realtime
    broadcastOrderCreated(tableId, `RELEASE-T${tableNum}`);

    setHoveredTableId(null);
    showSuccess(`Table ${tableNum} released (${markStatus === 'needs-bussing' ? 'needs cleaning' : 'available'})!`);
  };

  const requestReleaseTable = () => {
    if (!activeTable) return;
    const items = (cart && cart.length > 0) ? cart : (savedOrders[activeTable.id] || []);
    if (items.length === 0) {
      // Empty table: release immediately to available
      handleReleaseTable({ markStatus: 'available', cancelKds: false });
    } else {
      // Table has items: show confirmation modal
      setReleaseModal(true);
    }
  };

  // ── Comp / Void / Discount ────────────────────────────────
  const handleManagerAction = (action) => {
    if (action === 'void' && cart.length > 0) {
      const lastItem = cart[cart.length - 1];
      const voidAmount = lastItem.price * lastItem.qty;
      const voidThreshold = settings?.operations?.voidApprovalThreshold || settings?.workflow?.voidApprovalAmount || 0;
      if (voidThreshold > 0 && voidAmount <= voidThreshold) {
        setCart(prev => prev.slice(0, -1));
        addAuditEntry('VOID', user?.role || 'staff', user?.name || 'Staff', `Void (under threshold ₹${voidThreshold}): ${lastItem.name}`);
        showSuccess(`Voided: ${lastItem.name}`);
        return;
      }
    }
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

  // ── Open Register ──────────────────────────────────────────
  // Hoisted: the "Cash Register Closed" early return above renders before this line runs
  async function handleOpenRegister(e) {
    e.preventDefault();
    const floatVal = parseFloat(startingFloat);
    if (isNaN(floatVal) || floatVal < 0) {
      alert('Please enter a valid starting float.');
      return;
    }
    const updated = {
      openingBalance: floatVal,
      currentBalance: floatVal,
      cashIn: 0,
      cashOut: 0,
      drops: [],
      discrepancies: [],
      shiftStart: new Date().toISOString(),
      isClosed: false,
    };
    await updateCashDrawer(updated);
    await addAuditEntry(
      'cash_register.open',
      user?.id || 'system',
      user?.name || 'System / Guest',
      `Opened register with starting float: ₹${floatVal}`
    );
  }

  // ── Close Register ─────────────────────────────────────────
  const handleCloseRegister = async (actualCash, notes) => {
    const expectedBalance = (cashDrawer?.openingBalance || 0) +
      (cashDrawer?.cashIn || 0) -
      (cashDrawer?.cashOut || 0) -
      (cashDrawer?.drops || []).reduce((s, d) => s + d.amount, 0);
    const variance = actualCash - expectedBalance;

    const newClosure = {
      openingBalance: cashDrawer.openingBalance,
      cashIn: cashDrawer.cashIn || 0,
      cashOut: cashDrawer.cashOut || 0,
      drops: cashDrawer.drops || [],
      expectedBalance,
      actualCash,
      variance,
      notes: notes || '',
      shiftStart: cashDrawer.shiftStart,
      shiftEnd: new Date().toISOString(),
      closedBy: user?.name || 'Manager',
    };

    await addRegisterClosure(newClosure);

    const closedDrawer = {
      openingBalance: 0,
      currentBalance: 0,
      cashIn: 0,
      cashOut: 0,
      drops: [],
      discrepancies: [],
      shiftStart: null,
      isClosed: true,
    };
    await updateCashDrawer(closedDrawer);

    await addAuditEntry(
      'cash_register.close',
      user?.id || 'system',
      user?.name || 'System / Guest',
      `Closed register. Expected: ₹${expectedBalance}, Actual: ₹${actualCash}, Variance: ₹${variance}`
    );

    setCashDrawerModal(false);
    window.location.reload();
  };

  const checkRegisterBeforePayment = () => {
    const isEnhancedRegister = settings?.operations?.enhancedRegisterEnabled ?? false;
    if (!isEnhancedRegister) return true;

    // 1. Mandatory Opening check
    const isRegisterClosed = cashDrawer?.isClosed || !cashDrawer?.shiftStart;
    const isMandatoryOpening = settings?.operations?.mandatoryOpeningEnabled ?? false;
    if (isMandatoryOpening && isRegisterClosed) {
      alert('Register must be opened first. Opening the Register Management panel.');
      setCashDrawerModal(true);
      return false;
    }

    // 2. Block Payments if Previous Register Not Closed
    const blockPaymentsIfPrevNotClosed = settings?.operations?.blockPaymentsIfPrevNotClosed ?? false;
    if (blockPaymentsIfPrevNotClosed && cashDrawer?.shiftStart) {
      const shiftDate = new Date(cashDrawer.shiftStart).toDateString();
      const todayDate = new Date().toDateString();
      if (shiftDate !== todayDate && !cashDrawer.isClosed) {
        alert("You have an open register from a previous day. Please close the previous day's register first.");
        setCashDrawerModal(true);
        return false;
      }
    }
    return true;
  };

  // ── Payment ───────────────────────────────────────────────
  const handleConfirmPayment = async (paymentMethod, tipValue, finalTotal, paymentSplits = null) => {
    if (cart.length === 0) return;

    // Find any KDS tickets associated with this table or tab
    const relatedTickets = (kdsTickets || []).filter(t => {
      if (activeTable && (
        String(t.tableId) === String(activeTable.id) ||
        t.tableId === `T-${activeTable.id}` ||
        t.tableId === `T${activeTable.id}` ||
        String(t.tableId) === `tab_${activeTable.id}`
      )) return true;
      if (unassignedTab && (
        String(t.tableId) === `tab_${unassignedTab.id}` ||
        (unassignedTab.tokenNumber && String(t.tokenNumber) === String(unassignedTab.tokenNumber)) ||
        String(t.tableId) === `token_${unassignedTab.tokenNumber}`
      )) return true;
      return false;
    });

    const ticketTimes = relatedTickets.map(t => new Date(t.firedAt || t.createdAt).getTime()).filter(Boolean);
    const firstTicketPrinted = ticketTimes.length > 0 ? new Date(Math.min(...ticketTimes)).toISOString() : null;

    const bumpTimes = [];
    relatedTickets.forEach(t => {
      if (t.bumpedAt) bumpTimes.push(new Date(t.bumpedAt).getTime());
      else if (t.completedAt) bumpTimes.push(new Date(t.completedAt).getTime());
      else {
        const itemBumps = (t.items || []).map(i => i.bumpedAt ? new Date(i.bumpedAt).getTime() : 0).filter(Boolean);
        if (itemBumps.length > 0) bumpTimes.push(Math.max(...itemBumps));
      }
    });
    const latestFoodBumped = bumpTimes.length > 0 ? new Date(Math.max(...bumpTimes)).toISOString() : null;

    const orderPlacedTime = activeTable?.seatedAt || unassignedTab?.createdAt || firstTicketPrinted || new Date().toISOString();

    const extra = {
      orderType,
      customerName: activeTable?.guestName || unassignedTab?.guestName || customerName,
      customerPhone: customerPhone || unassignedTab?.guestPhone || '',
      tokenNumber: unassignedTab?.tokenNumber || null,
      pickupTime: orderType === 'takeout' ? pickupTime : undefined,
      deliveryAddress: orderType === 'delivery' ? deliveryAddress : undefined,
      driverInstructions: orderType === 'delivery' ? driverInstructions : undefined,
      deliveryChannel: orderType === 'delivery' ? deliveryChannel : undefined,
      deliveryStatus: orderType === 'delivery' ? 'preparing' : undefined,
      tip: tipValue,
      autoGratuity,
      discount: discountAmount,
      serviceCharge,
      partySize,
      paymentSplits,
      orderPlacedAt: orderPlacedTime,
      ticketPrintedAt: firstTicketPrinted,
      foodBumpedAt: latestFoodBumped,
      kdsTicketIds: relatedTickets.map(t => t.id),
    };

    const tableId = activeTable?.id || null;
    const order = await placeOrder(tableId, cart, paymentMethod, extra);

    // Link tickets to this settled order in database
    if (relatedTickets.length > 0 && order?.id) {
      for (const t of relatedTickets) {
        try {
          await update('kds_tickets', t.id, {
            orderId: order.id,
            billNo: order.billNo,
            settledAt: new Date().toISOString(),
          });
        } catch (e) {
          console.warn('[POS] Could not update ticket order link:', e);
        }
      }
    }

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

    // Update cash drawer for cash payments (either full cash or partial cash split)
    let cashPortion = 0;
    let hasCardPayment = false;
    if (Array.isArray(paymentSplits) && paymentSplits.length > 0) {
      cashPortion = paymentSplits
        .filter(p => (p.method || '').toLowerCase() === 'cash')
        .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      hasCardPayment = paymentSplits.some(p => (p.method || '').toLowerCase() === 'card');
    } else if (paymentMethod === 'Cash') {
      cashPortion = finalTotal;
    } else if (paymentMethod === 'Card') {
      hasCardPayment = true;
    }

    if (cashPortion > 0) {
      updateCashDrawer({ ...cashDrawer, cashIn: (cashDrawer?.cashIn || 0) + cashPortion });
      if (settings?.operations?.autoOpenCashDrawer !== false) {
        addAuditEntry('DRAWER_OPEN', 'cashier', user?.name || 'Cashier', `Cash drawer auto-opened for cash payment of ₹${cashPortion.toFixed(2)}`);
      }
    } else if (hasCardPayment && settings?.workflow?.cashDrawerOnCreditSplit) {
      addAuditEntry('DRAWER_OPEN', 'cashier', user?.name || 'Cashier', 'Cash drawer popped on card split payment');
    }

    // Auto-print receipt according to settings
    const shouldAutoPrint = (
      settings?.printer?.autoPrintBill !== false &&
      settings?.operations?.autoPrintReceipt !== false &&
      settings?.workflow?.autoPrintOnPayment !== false
    );

    if (shouldAutoPrint) {
      printReceipt({
        order: { ...order, items: cart, paymentSplits, tokenNumber: unassignedTab?.tokenNumber || order.tokenNumber },
        settings, tableId,
        guestName: activeTable?.guestName || unassignedTab?.guestName || customerName,
      });
    } else {
      showSuccess(`Payment of ${finalTotal.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })} settled!`);
    }

    // Bill settled — table needs bussing before it can be reused. Tapping the
    // table on the floor map marks it cleaned and available again.
    if (activeTable) {
      prePayStatusRef.current = null;
      setSavedOrders(prev => { const next = { ...prev }; delete next[activeTable.id]; return next; });
      setTables(prev => prev.map(t => String(t.id) === String(activeTable.id)
        ? { ...t, status: 'needs-bussing', guestName: null, guestId: null, seatedAt: null }
        : t
      ));
    }

    if (unassignedTab) {
      setSavedOrders(prev => {
        const next = { ...prev };
        delete next[`tab_${unassignedTab.id}`];
        if (next.__tabs_meta__) {
          const nextMeta = { ...next.__tabs_meta__ };
          delete nextMeta[unassignedTab.id];
          next.__tabs_meta__ = nextMeta;
        }
        return next;
      });
    }

    // Fire to KDS if dine-in order wasn't saved, or if it is takeout/delivery
    const tabData = unassignedTab ? savedOrders[`tab_${unassignedTab.id}`] : null;
    const tabFired = unassignedTab && (
      (Array.isArray(tabData) ? tabData.length > 0 : (tabData?.firedItems?.length > 0 || unassignedTab.firedItems?.length > 0)) ||
      (kdsTickets || []).some(t =>
        (t.tableId === `tab_${unassignedTab.id}` || t.tableId === unassignedTab.id || (unassignedTab.tokenNumber && String(t.tokenNumber) === String(unassignedTab.tokenNumber))) &&
        t.status !== 'cancelled'
      )
    );
    const tableFired = activeTable && (savedOrders[activeTable.id]?.length > 0);
    const wasFired = tableFired || tabFired;

    if (!wasFired && isKdsEnabled) {
      const kdsOrderId = order.id || Date.now().toString();
      try {
        await fireToKDS(kdsOrderId, cart, tableId, orderType, {
          tokenNumber: unassignedTab?.tokenNumber || null,
          guestName: unassignedTab?.guestName || customerName || null,
        });
        broadcastOrderCreated(tableId, kdsOrderId);
      } catch (err) {
        console.error('[POS] Failed to fire order to KDS:', err);
        alert('Order billed, but it could not be sent to the Kitchen Display. Please notify the kitchen manually.');
      }
    }

    // Reset
    setCart([]);
    setUnassignedTab(null);
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
    setDeliveryChannel('In-House');
    setView(isTableManagementEnabled ? 'floor' : 'order');
    const displayMethod = paymentSplits && paymentSplits.length > 0
      ? `Split (${paymentSplits.map(s => `${s.method}: ₹${s.amount}`).join(', ')})`
      : paymentMethod;
    showSuccess(`Bill settled! ${(order.total || finalTotal).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })} via ${displayMethod}`);
  };

  // Takeout/Delivery: go straight to order view
  const handleStartTakeoutDelivery = () => {
    setActiveTable(null);
    setUnassignedTab(null);
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

  // ── Past Order Management Handlers ────────────────────────
  const handleReprint = (order) => {
    if (!order) return;
    try {
      printReceipt({
        order,
        settings,
        tableId: order.tableId,
        guestName: order.customerName || order.guestName,
      });
      showSuccess(`Receipt sent to printer for Order #${order.orderNumber || order.id || ''}`);
    } catch (err) {
      console.error('[POS] Failed to reprint receipt:', err);
      alert('Failed to print receipt.');
    }
  };

  const handleChangePaymentMethod = async (order, newMethod, splits = null) => {
    if (!order) return;
    try {
      const getOrderCash = (targetSplits, method, tot) => {
        if (Array.isArray(targetSplits) && targetSplits.length > 0) {
          return targetSplits
            .filter(p => (p.method || '').toLowerCase() === 'cash')
            .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        }
        if ((method || '').toLowerCase() === 'cash') return parseFloat(tot) || 0;
        return 0;
      };

      const oldCash = getOrderCash(order.paymentSplits, order.paymentMethod, order.total);
      const newCash = getOrderCash(splits, newMethod, order.total);
      const deltaCash = newCash - oldCash;

      if (deltaCash !== 0) {
        updateCashDrawer({
          ...cashDrawer,
          cashIn: Math.max(0, (cashDrawer?.cashIn || 0) + deltaCash),
        });
      }

      await updatePOSOrder(order.id, {
        paymentMethod: newMethod,
        paymentSplits: splits || [],
        paymentMethodChangedAt: new Date().toISOString(),
        paymentMethodChangedBy: user?.name || 'Staff',
      });

      addAuditEntry(
        'PAYMENT_METHOD_CHANGE',
        user?.role || 'staff',
        user?.name || 'Staff',
        `Changed payment method for order #${order.orderNumber || order.id} from ${order.paymentMethod || 'Unknown'} to ${newMethod}${deltaCash !== 0 ? ` (Cash drawer delta: ₹${deltaCash.toFixed(2)})` : ''}`
      );

      showSuccess(`Payment method updated to ${newMethod} for order #${order.orderNumber || order.id}!`);
      setChangePaymentModal(null);
    } catch (err) {
      console.error('[POS] Error updating payment method:', err);
      alert('Failed to update payment method.');
    }
  };

  const handleVoidPastOrder = async (order, reason) => {
    if (!order) return;
    try {
      const cashToReverse = Array.isArray(order.paymentSplits) && order.paymentSplits.length > 0
        ? order.paymentSplits.filter(p => (p.method || '').toLowerCase() === 'cash').reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
        : ((order.paymentMethod || '').toLowerCase() === 'cash' ? (parseFloat(order.total) || 0) : 0);

      if (cashToReverse > 0) {
        updateCashDrawer({
          ...cashDrawer,
          cashIn: Math.max(0, (cashDrawer?.cashIn || 0) - cashToReverse),
        });
      }

      await updatePOSOrder(order.id, {
        status: 'voided',
        voidReason: reason,
        voidedAt: new Date().toISOString(),
        voidedBy: user?.name || 'Staff',
      });

      addAuditEntry(
        'ORDER_VOID',
        user?.role || 'staff',
        user?.name || 'Staff',
        `Voided past order #${order.orderNumber || order.id}. Reason: ${reason}. Amount: ₹${(parseFloat(order.total) || 0).toFixed(2)}${cashToReverse > 0 ? ` (Reversed ₹${cashToReverse.toFixed(2)} cash)` : ''}`
      );

      showSuccess(`Order #${order.orderNumber || order.id} marked as voided.`);
      setVoidOrderModal(null);
    } catch (err) {
      console.error('[POS] Error voiding order:', err);
      alert('Failed to void order.');
    }
  };

  const handleSaveEditedOrder = async (order, changes) => {
    if (!order) return;
    try {
      const { items, subtotal, tax, total, discount, discountReason, delta, deltaAction, deltaPaymentMethod, guestName, customerPhone } = changes;

      if ((deltaPaymentMethod || '').toLowerCase() === 'cash') {
        const absDelta = Math.abs(delta || 0);
        if (deltaAction === 'charge') {
          updateCashDrawer({
            ...cashDrawer,
            cashIn: (cashDrawer?.cashIn || 0) + absDelta,
          });
        } else if (deltaAction === 'refund') {
          updateCashDrawer({
            ...cashDrawer,
            cashIn: Math.max(0, (cashDrawer?.cashIn || 0) - absDelta),
          });
        }
      }

      const existingHistory = Array.isArray(order.history) ? order.history : [];
      const editRecord = {
        action: 'edited',
        timestamp: new Date().toISOString(),
        by: user?.name || 'Staff',
        previousTotal: order.total,
        newTotal: total,
        delta,
        deltaAction,
        deltaPaymentMethod,
      };

      await updatePOSOrder(order.id, {
        items,
        subtotal,
        tax,
        total,
        discount,
        discountReason,
        guestName: guestName || order.guestName,
        customerPhone: customerPhone || order.customerPhone,
        editedAt: new Date().toISOString(),
        editedBy: user?.name || 'Staff',
        isRevised: true,
        history: [...existingHistory, editRecord],
      });

      addAuditEntry(
        'ORDER_EDIT',
        user?.role || 'staff',
        user?.name || 'Staff',
        `Edited order #${order.orderNumber || order.id}: total changed from ₹${(order.total || 0).toFixed(2)} to ₹${total.toFixed(2)} (${deltaAction !== 'none' ? `${deltaAction} ₹${Math.abs(delta).toFixed(2)} via ${deltaPaymentMethod}` : 'no price change'})`
      );

      showSuccess(`Order #${order.orderNumber || order.id} updated! Total: ₹${total.toFixed(2)}`);
      setEditPastOrderModal(null);
    } catch (err) {
      console.error('[POS] Error saving edited order:', err);
      alert('Failed to update order.');
    }
  };

  const handleReopenOrder = async (order) => {
    if (!order) return;
    try {
      const formattedItems = (order.items || []).map(item => {
        const itemId = item.id || `item_${Math.random().toString(36).substring(2, 9)}`;
        return {
          ...item,
          id: itemId,
          _cartKey: item._cartKey || `${itemId}_${(item.modifiers || []).map(m => m.id || m.name).join('_')}`,
          qty: item.qty || item.quantity || 1,
          modifiers: item.modifiers || [],
          specialInstructions: item.specialInstructions || '',
          course: item.course || 1,
          seat: item.seat || 1,
        };
      });

      const targetTable = tables.find(t => 
        String(t.id) === String(order.tableId) || 
        String(t.number) === String(order.tableId) || 
        (order.tableName && `Table ${t.number}` === order.tableName)
      );

      let restoreToTable = false;
      if (targetTable) {
        const isOccupied = (targetTable.status && targetTable.status !== 'available' && targetTable.status !== 'needs-bussing') || 
                           (savedOrders[targetTable.id] && savedOrders[targetTable.id].length > 0);
        if (isOccupied) {
          const makeFloating = window.confirm(`Table ${targetTable.number} is currently occupied! Would you like to restore this order as a Floating Tab with a Token number instead?`);
          if (!makeFloating) return;
          restoreToTable = false;
        } else {
          restoreToTable = true;
        }
      }

      if (restoreToTable && targetTable) {
        setSavedOrders(prev => ({
          ...prev,
          [targetTable.id]: formattedItems,
        }));

        setTables(prev => prev.map(t => String(t.id) === String(targetTable.id) ? {
          ...t,
          status: 'ordered',
          guestName: order.customerName || order.guestName || t.guestName || null,
          guestPhone: order.customerPhone || t.guestPhone || null,
          partySize: order.partySize || t.partySize || 1,
          seatedAt: new Date().toISOString(),
        } : t));

        setActiveTable(targetTable);
        setUnassignedTab(null);
      } else {
        const tokenNum = order.tokenNumber || getNextTokenNumber();
        const tabId = `reopened_${Date.now()}`;
        const newTab = {
          id: tabId,
          tokenNumber: tokenNum,
          guestName: order.customerName || order.guestName || 'Reopened Guest',
          guestPhone: order.customerPhone || '',
          partySize: order.partySize || 1,
          notes: `Reopened Order #${order.orderNumber || order.id}`,
          createdAt: new Date().toISOString(),
          items: formattedItems,
          firedItems: formattedItems,
        };

        setSavedOrders(prev => ({
          ...prev,
          [`tab_${tabId}`]: formattedItems,
          __tabs_meta__: {
            ...(prev.__tabs_meta__ || {}),
            [tabId]: newTab,
          }
        }));

        setActiveTable(null);
        setUnassignedTab(newTab);
      }

      // Reverse cash drawer if previous order was settled in cash
      const cashToReverse = Array.isArray(order.paymentSplits) && order.paymentSplits.length > 0
        ? order.paymentSplits.filter(p => (p.method || '').toLowerCase() === 'cash').reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
        : ((order.paymentMethod || '').toLowerCase() === 'cash' ? (parseFloat(order.total) || 0) : 0);

      if (cashToReverse > 0) {
        updateCashDrawer({
          ...cashDrawer,
          cashIn: Math.max(0, (cashDrawer?.cashIn || 0) - cashToReverse),
        });
      }

      await updatePOSOrder(order.id, {
        status: 'reopened',
        reopenedAt: new Date().toISOString(),
        reopenedBy: user?.name || 'Staff',
      });

      addAuditEntry(
        'ORDER_REOPEN',
        user?.role || 'staff',
        user?.name || 'Staff',
        `Re-opened order #${order.orderNumber || order.id} to ${restoreToTable ? `Table ${targetTable.number}` : 'Floating Tab'}`
      );

      setCart(formattedItems);
      setDiscountAmount(order.discount || 0);
      setView('order');
      setTableHistoryModal(null);
      showSuccess(`Order #${order.orderNumber || order.id} re-opened to ${restoreToTable ? `Table ${targetTable.number}` : 'active cart'}!`);
    } catch (err) {
      console.error('[POS] Error reopening order:', err);
      alert('Failed to reopen order.');
    }
  };

  const renderHistoryModals = () => (
    <>
      {tableHistoryModal && (
        <TableHistoryModal
          table={tableHistoryModal === 'all' ? null : tableHistoryModal}
          tables={tables}
          orders={orders}
          menu={menuItems}
          settings={settings}
          onClose={() => setTableHistoryModal(null)}
          onReprint={handleReprint}
          onReopen={handleReopenOrder}
          onChangePayment={(ord) => setChangePaymentModal(ord)}
          onEditOrder={(ord) => setEditPastOrderModal(ord)}
          onVoidOrder={(ord) => setVoidOrderModal(ord)}
        />
      )}

      {changePaymentModal && (
        <ChangePaymentModal
          order={changePaymentModal}
          onConfirm={(newMethod, splits) => handleChangePaymentMethod(changePaymentModal, newMethod, splits)}
          onClose={() => setChangePaymentModal(null)}
        />
      )}

      {editPastOrderModal && (
        <EditPastOrderModal
          order={editPastOrderModal}
          menu={menuItems}
          settings={settings}
          onConfirm={(changes) => handleSaveEditedOrder(editPastOrderModal, changes)}
          onClose={() => setEditPastOrderModal(null)}
        />
      )}

      {voidOrderModal && (
        <VoidOrderModal
          order={voidOrderModal}
          onConfirm={(reason) => handleVoidPastOrder(voidOrderModal, reason)}
          onClose={() => setVoidOrderModal(null)}
        />
      )}
    </>
  );

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 className="page-title" style={{ margin: 0 }}>POS & Billing</h1>
            {pendingOrders.length > 0 && (
              <button 
                className="btn btn-sm btn-danger" 
                onClick={() => setShowPendingModal(true)}
                style={{ 
                  boxShadow: '0 0 10px rgba(239, 68, 68, 0.35)',
                  padding: '6px 12px',
                  borderRadius: 10,
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', display: 'inline-block', opacity: 0.8 }} />
                {pendingOrders.length} New QR Order{pendingOrders.length > 1 ? 's' : ''}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {orderType === 'dine-in' && !isMobile && (
              <div style={{ display: 'flex', gap: '2px', background: 'rgba(255,255,255,0.5)', padding: '2px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <button
                  type="button"
                  className={viewMode === 'map' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                  onClick={() => setViewMode('map')}
                  style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: viewMode === 'map' ? 'var(--primary)' : 'transparent', color: viewMode === 'map' ? 'white' : 'var(--text-secondary)', fontWeight: 600, fontSize: '0.75rem' }}
                >
                  Map View
                </button>
                <button
                  type="button"
                  className={viewMode === 'grid' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                  onClick={() => setViewMode('grid')}
                  style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: viewMode === 'grid' ? 'var(--primary)' : 'transparent', color: viewMode === 'grid' ? 'white' : 'var(--text-secondary)', fontWeight: 600, fontSize: '0.75rem' }}
                >
                  Grid View
                </button>
              </div>
            )}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, padding: '6px 12px', borderRadius: '8px' }}
              onClick={handleStartNoTableOrder}
            >
              <Sparkles size={14} /> Take Order (No Table)
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, padding: '6px 12px', borderRadius: '8px' }}
              onClick={() => setTableHistoryModal('all')}
              title="View past table orders, reprint receipts, and manage settled orders"
            >
              <Clock size={14} /> Table History
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setCashDrawerModal(true)}>
              <Banknote size={14} /> {settings?.operations?.enhancedRegisterEnabled ? "Manage Register" : "Cash Drawer"}
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

        {/* Floating Tabs / Orders Waiting for Table */}
        {orderType === 'dine-in' && floatingTabs.length > 0 && (
          <div style={{
            marginBottom: 16,
            padding: '14px 18px',
            background: 'linear-gradient(135deg, rgba(254, 243, 199, 0.75), rgba(253, 230, 138, 0.45))',
            border: '1.5px solid rgba(245, 158, 11, 0.4)',
            borderRadius: '16px',
            boxShadow: '0 4px 16px rgba(245, 158, 11, 0.08)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  background: '#f59e0b', color: '#fff',
                  width: 24, height: 24, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 900, fontSize: '0.75rem',
                }}>
                  {floatingTabs.length}
                </span>
                <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#92400e' }}>
                  Orders Waiting for Table
                </span>
                <span style={{ fontSize: '0.75rem', color: '#b45309' }}>
                  (Customers who ordered first and are choosing a table)
                </span>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ padding: '3px 8px', fontSize: '0.72rem', background: 'rgba(255,255,255,0.7)', borderColor: 'rgba(245, 158, 11, 0.3)' }}
                onClick={handleStartNoTableOrder}
              >
                + New No-Table Order
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {floatingTabs.map(tab => {
                const tabItems = (tab.items && tab.items.length > 0)
                  ? tab.items
                  : (Array.isArray(savedOrders[`tab_${tab.id}`])
                      ? savedOrders[`tab_${tab.id}`]
                      : (savedOrders[`tab_${tab.id}`]?.items || []));
                const itemCount = tabItems.reduce((s, i) => s + (i.qty || 1), 0);
                const totalAmt = tabItems.reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0);
                const elapsedMin = Math.max(0, Math.floor((Date.now() - new Date(tab.createdAt).getTime()) / 60000));

                return (
                  <div
                    key={tab.id}
                    style={{
                      background: '#fff',
                      border: tab.isFoodReady
                        ? '1.5px solid #22c55e'
                        : '1.5px solid rgba(245, 158, 11, 0.35)',
                      borderRadius: '14px',
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 10,
                      boxShadow: tab.isFoodReady
                        ? '0 4px 14px rgba(34, 197, 94, 0.16)'
                        : '0 2px 8px rgba(0,0,0,0.03)',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{
                              background: '#f59e0b', color: '#fff',
                              padding: '2px 8px', borderRadius: '6px',
                              fontWeight: 900, fontSize: '0.8rem',
                            }}>
                              Token #{tab.tokenNumber}
                            </span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              {elapsedMin}m ago
                            </span>
                            {tab.isFoodReady ? (
                              <span style={{
                                background: 'rgba(34, 197, 94, 0.15)', color: '#15803d',
                                padding: '2px 7px', borderRadius: '6px', fontSize: '0.7rem',
                                fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4,
                                border: '1px solid rgba(34, 197, 94, 0.3)',
                              }}>
                                <Check size={11} strokeWidth={3} /> Food Ready
                              </span>
                            ) : tab.hasActiveTicket ? (
                              <span style={{
                                background: 'rgba(245, 158, 11, 0.15)', color: '#b45309',
                                padding: '2px 7px', borderRadius: '6px', fontSize: '0.7rem',
                                fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4,
                                border: '1px solid rgba(245, 158, 11, 0.3)',
                              }}>
                                <Flame size={11} /> In Kitchen
                              </span>
                            ) : null}
                          </div>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', marginTop: 4 }}>
                            {tab.guestName || 'Walk-in Guest'}
                            {tab.partySize > 1 && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}> · {tab.partySize}p</span>}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--primary)' }}>
                            ₹{totalAmt.toLocaleString('en-IN')}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {itemCount} item{itemCount === 1 ? '' : 's'}
                          </div>
                        </div>
                      </div>

                      {tabItems.length > 0 && (
                        <div style={{
                          fontSize: '0.73rem', color: 'var(--text-secondary)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          background: 'rgba(0,0,0,0.03)', padding: '5px 8px', borderRadius: '6px',
                          marginTop: 8,
                        }}>
                          {tabItems.map(i => `${i.qty}x ${i.name}`).join(', ')}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{
                          flex: 1.3, padding: '7px 10px', fontSize: '0.78rem', fontWeight: 800,
                          background: '#16a34a', borderColor: '#15803d', color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                          boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)',
                        }}
                        onClick={() => handleSettleFloatingTab(tab)}
                        title="Take payment & settle bill directly"
                      >
                        <CreditCard size={13} /> Settle Bill
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{
                          flex: 1.1, padding: '7px 8px', fontSize: '0.76rem', fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                        }}
                        onClick={() => setAssignTableModal(tab)}
                      >
                        <UtensilsCrossed size={12} /> Assign Table
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ flex: 0.9, padding: '7px 8px', fontSize: '0.75rem', fontWeight: 600 }}
                        onClick={() => handleOpenFloatingTab(tab)}
                      >
                        Open Cart
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '7px 8px', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                        onClick={() => handleDiscardFloatingTab(tab)}
                        title="Discard tab"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Dine-in: Floor Plan */}
        {orderType === 'dine-in' && (
          <>
            {/* Status Legend — live counts per status */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              {Object.entries(TABLE_STATUS_COLORS).map(([status, color]) => {
                const count = tables.filter(t => displayStatus(t) === status).length;
                return (
                  <span key={status} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: count > 0 ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: count > 0 ? 600 : 400 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', boxShadow: `0 0 6px ${color}50`, opacity: count > 0 ? 1 : 0.45 }} />
                    {TABLE_STATUS_LABELS[status]}{count > 0 ? ` · ${count}` : ''}
                  </span>
                );
              })}
            </div>

            {/* Server Sections */}
            {sections.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                {sections.map(sec => {
                  // Sections are stored as plain strings; older layouts may hold objects
                  const secName = typeof sec === 'string' ? sec : (sec.name || sec.id);
                  const sectionTables = tables.filter(t => t.section === secName);
                  const serverIds = [...new Set(sectionTables.map(t => t.serverId).filter(Boolean))];
                  return (
                    <div key={secName} style={{
                      padding: '6px 12px', borderRadius: 'var(--r-md)',
                      background: 'rgba(255,255,255,0.6)', border: '1px solid var(--border-subtle)',
                      fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{secName}</span>
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

            {/* Table Grid or Floor Plan Map */}
            {tables.length === 0 ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px',
                background: 'rgba(255, 255, 255, 0.4)',
                borderRadius: '18px',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)',
                fontSize: '0.9rem',
                fontWeight: 600,
                textAlign: 'center',
                gap: '8px',
                minHeight: '200px'
              }}>
                <div style={{ fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: 800 }}>No Tables Configured</div>
                <div>Design your floor plan in Settings &gt; Table Layout first.</div>
              </div>
            ) : (isMobile ? 'grid' : viewMode) === 'map' ? (
              <div style={{
                position: 'relative',
                width: '100%',
                background: 'rgba(255, 255, 255, 0.4)',
                borderRadius: '18px',
                border: '1px solid var(--border-subtle)',
                overflow: 'auto',
                padding: '24px',
              }}>
                <div style={{
                  position: 'relative',
                  width: '750px',
                  height: '500px',
                  backgroundSize: '30px 30px',
                  backgroundImage: 'radial-gradient(rgba(30, 94, 74,0.06) 1.5px, transparent 0)',
                }}>
                  {tables.map(table => {
                    const fpTable = floorPlans?.tables?.find(t => String(t.id) === String(table.id) || String(t.number) === String(table.number)) || {};
                    const posX = fpTable.x !== undefined ? fpTable.x : 50;
                    const posY = fpTable.y !== undefined ? fpTable.y : 50;
                    
                    const statusColor = TABLE_STATUS_COLORS[displayStatus(table)] || TABLE_STATUS_COLORS.available;
                    const isOccupied = table.status !== 'available';
                    const hasOrder = savedOrders[table.id]?.length > 0;
                    const serverName = table.serverId && serverMap[table.serverId]?.name;
                    const size = table.shape === 'bar' ? 80 : 90;
                    const isHovered = String(hoveredTableId) === String(table.id);
                    const align = posX < 140 ? 'left' : posX > 560 ? 'right' : 'center';

                    return (
                      <div
                        key={table.id}
                        style={{
                          position: 'absolute',
                          left: posX,
                          top: posY,
                          width: size,
                          height: size,
                          zIndex: isHovered ? 100 : 2,
                        }}
                        onMouseEnter={() => handleTableMouseEnter(table.id)}
                        onMouseLeave={handleTableMouseLeave}
                      >
                        <button type="button" onClick={() => handleTableClick(table)}
                          style={{
                            width: '100%',
                            height: '100%',
                            padding: '12px 10px',
                            textAlign: 'center',
                            cursor: 'pointer',
                            borderRadius: table.shape === 'round' ? '50%' : '14px',
                            background: 'var(--card-bg)',
                            backdropFilter: 'blur(20px)',
                            border: `2px solid ${statusColor}40`,
                            boxShadow: `0 4px 14px ${statusColor}15`,
                            transition: 'all 0.2s',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            alignItems: 'center',
                            position: 'relative',
                          }}
                          onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 10px 28px ${statusColor}25`; }}
                          onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 4px 14px ${statusColor}15`; }}
                        >
                          <div style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: statusColor,
                            boxShadow: `0 0 6px ${statusColor}80`,
                            position: 'absolute',
                            top: 10,
                            right: 10,
                          }} />

                          <div style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: 2 }}>
                            T{table.number}
                          </div>
                          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                            {table.seats} seats
                          </div>

                          {isOccupied && (
                            <div style={{ marginTop: 4, fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center' }}>
                                <User size={8} /> <span style={{ maxWidth: '60px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{table.guestName || 'Guest'}</span>
                              </div>
                              <TurnTimer seatedAt={table.seatedAt} />
                            </div>
                          )}

                          {serverName && (
                            <div style={{ fontSize: '0.58rem', color: 'var(--primary)', fontWeight: 600, marginTop: 2 }}>
                              {serverName}
                            </div>
                          )}

                          {hasOrder && (
                            <div style={{
                              position: 'absolute',
                              bottom: 6,
                              background: 'var(--primary)',
                              color: 'white',
                              borderRadius: '4px',
                              padding: '1px 5px',
                              fontSize: '0.55rem',
                              fontWeight: 700,
                            }}>
                              KOT
                            </div>
                          )}
                        </button>

                        {isHovered && (
                          <TableOrderHoverCard
                            table={table}
                            summary={getTableOrderSummary(table)}
                            statusColor={statusColor}
                            statusLabel={TABLE_STATUS_LABELS[displayStatus(table)] || table.status}
                            serverName={serverName}
                            position={posY >= 200 ? 'top' : 'bottom'}
                            align={align}
                            onSettle={handleDirectSettle}
                            onOpenOrder={handleTableClick}
                            onReleaseTable={(t) => handleReleaseTable({ targetTable: t || table, markStatus: 'available', cancelKds: false })}
                            onViewHistory={(t) => setTableHistoryModal(t || table)}
                            onMouseEnter={handlePopoverMouseEnter}
                            onMouseLeave={handlePopoverMouseLeave}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 12 }}>
                {tables.map((table, idx) => {
                  const statusColor = TABLE_STATUS_COLORS[displayStatus(table)] || TABLE_STATUS_COLORS.available;
                  const isOccupied = table.status !== 'available';
                  const hasOrder = savedOrders[table.id]?.length > 0;
                  const serverName = table.serverId && serverMap[table.serverId]?.name;
                  const isHovered = String(hoveredTableId) === String(table.id);

                  return (
                    <div
                      key={table.id}
                      style={{
                        position: 'relative',
                        zIndex: isHovered ? 100 : 1,
                      }}
                      onMouseEnter={() => handleTableMouseEnter(table.id)}
                      onMouseLeave={handleTableMouseLeave}
                    >
                      <button type="button" onClick={() => handleTableClick(table)}
                        style={{
                          width: '100%',
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
                        <div style={{
                          width: 10, height: 10, borderRadius: '50%', background: statusColor,
                          boxShadow: `0 0 8px ${statusColor}80`,
                          position: table.shape === 'round' ? 'absolute' : 'relative',
                          top: table.shape === 'round' ? 12 : 'auto',
                          right: table.shape === 'round' ? 12 : 'auto',
                          marginBottom: table.shape === 'round' ? 0 : 8,
                        }} />

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

                      {isHovered && (
                        <TableOrderHoverCard
                          table={table}
                          summary={getTableOrderSummary(table)}
                          statusColor={statusColor}
                          statusLabel={TABLE_STATUS_LABELS[displayStatus(table)] || table.status}
                          serverName={serverName}
                          position={idx < 3 ? 'bottom' : 'top'}
                          align="center"
                          onSettle={handleDirectSettle}
                          onOpenOrder={handleTableClick}
                          onReleaseTable={(t) => handleReleaseTable({ targetTable: t || table, markStatus: 'available', cancelKds: false })}
                          onViewHistory={(t) => setTableHistoryModal(t || table)}
                          onMouseEnter={handlePopoverMouseEnter}
                          onMouseLeave={handlePopoverMouseLeave}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label className="input-label" style={{ margin: 0 }}>Customer Name *</label>
                  <button type="button" onClick={() => setCustomerName('Walk-in Guest')}
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                    Set Walk-in
                  </button>
                </div>
                <input className="input-field" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="e.g. Rahul" style={{ margin: 0 }} />
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
                <label className="input-label">Delivery Channel</label>
                <select className="input-field" value={deliveryChannel} onChange={e => setDeliveryChannel(e.target.value)}>
                  <option value="In-House">In-House Fleet</option>
                  <option value="Zomato">Zomato</option>
                  <option value="Swiggy">Swiggy</option>
                  <option value="UberEats">Uber Eats</option>
                  <option value="DoorDash">DoorDash</option>
                  <option value="Dunzo">Dunzo Courier</option>
                  <option value="Direct">Direct Online (Portal)</option>
                </select>
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
          <GuestModal
            tableId={guestModal}
            onConfirm={handleGuestConfirmed}
            onClose={() => setGuestModal(null)}
            floatingTabs={floatingTabs}
            onSeatToken={(tab) => handleAssignTableToTab(guestModal, tab)}
            savedOrders={savedOrders}
          />
        )}

        {/* No-Table / Quick Dine-In Modal */}
        {noTableModal && (
          <NoTableOrderModal
            nextToken={getNextTokenNumber()}
            onStart={handleConfirmNoTableOrder}
            onClose={() => setNoTableModal(false)}
          />
        )}



        {/* Cash Drawer Modal */}
        {cashDrawerModal && (
          <CashDrawerPanel cashDrawer={cashDrawer} onBlindDrop={handleBlindDrop} onClose={() => setCashDrawerModal(false)} onCloseRegister={handleCloseRegister} />
        )}

        {cleaningTable && (
          <Modal title="Clean Table" onClose={() => setCleaningTable(null)}>
            <div className="modal-body" style={{ padding: '24px 20px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                Mark Table {cleaningTable.number || cleaningTable.id} as cleaned and available?
              </p>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setCleaningTable(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => {
                setTables(prev => prev.map(t => String(t.id) === String(cleaningTable.id)
                  ? { ...t, status: 'available', guestName: null, guestId: null, seatedAt: null }
                  : t
                ));
                showSuccess(`Table ${cleaningTable.number || cleaningTable.id} is available again`);
                setCleaningTable(null);
              }}>Clean & Make Available</button>
            </div>
          </Modal>
        )}

        {showPendingModal && (
          <Modal title={`Incoming Online/QR Orders (${pendingOrders.length})`} onClose={() => setShowPendingModal(false)} wide>
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
                Review and accept orders placed by guests via QR Menu.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {pendingOrders.map(order => (
                  <div key={order.id} className="card" style={{ padding: 16, background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <span className="badge badge-primary" style={{ marginBottom: 4 }}>Direct QR</span>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>Order #{order.id}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                          👤 {order.customer} {order.phone ? `(${order.phone})` : ''}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--primary)', fontWeight: 700, marginTop: 2 }}>
                          📍 {order.address || 'Takeout'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--primary)' }}>
                          ₹{order.total?.toLocaleString('en-IN')}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>
                          {new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>

                    {/* Items list */}
                    <div style={{ background: 'rgba(0,0,0,0.02)', padding: '8px 12px', borderRadius: 8, marginBottom: 12 }}>
                      {order.itemsList && order.itemsList.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '3px 0' }}>
                          <span>
                            <strong style={{ color: 'var(--primary)' }}>{item.qty}x</strong> {item.name}
                            {item.notes && <span style={{ fontSize: '0.7rem', color: 'var(--danger)', marginLeft: 6 }}>({item.notes})</span>}
                          </span>
                          <span style={{ fontWeight: 600 }}>₹{(item.price * item.qty).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>

                    {order.specialInstructions && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--danger)', padding: '6px 10px', background: 'rgba(239,68,68,0.04)', borderRadius: 6, border: '1px solid rgba(239,68,68,0.1)', marginBottom: 12 }}>
                        <strong>Note:</strong> {order.specialInstructions}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button 
                        className="btn btn-sm btn-secondary" 
                        style={{ color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.2)', padding: '5px 10px', borderRadius: 8 }}
                        onClick={async () => {
                          if (confirm('Are you sure you want to reject this order?')) {
                            await editOnlineOrder(order.id, { status: 'rejected' });
                            reload();
                          }
                        }}
                      >
                        Reject
                      </button>
                      <button 
                        className="btn btn-sm btn-primary"
                        style={{ padding: '5px 12px', borderRadius: 8 }}
                        onClick={() => handleAcceptPendingOrder(order)}
                      >
                        {order.address?.toLowerCase().includes('table') ? 'Accept & Add to Table' : 'Accept Order'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowPendingModal(false)}>Close</button>
            </div>
          </Modal>
        )}

        {renderHistoryModals()}
      </div>
    );
  }


  // ═══════════════════════════════════════════════════════════
  // ─── ORDER ENTRY VIEW ─────────────────────────────────────
  // ═══════════════════════════════════════════════════════════
  const currentGuest = activeTable?.guestName || customerName;
  const unfiredCourses = [...new Set(cart.filter(i => !firedCourses.has(i.course)).map(i => i.course))].sort();

  // Safe to return now — every hook above has already run this render.
  const shouldBlockPOSComplete = isRegisterClosed && !settings?.operations?.enhancedRegisterEnabled;
  if (shouldBlockPOSComplete) return registerClosedScreen;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Toast message={successMsg} />
      <OfflineBanner />

      {isMobile && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, background: 'rgba(255, 255, 255, 0.4)', backdropFilter: 'blur(10px)', border: '1px solid var(--border-subtle)', padding: 4, borderRadius: 12 }}>
          <button 
            type="button"
            className={mobileTab === 'menu' ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ flex: 1, padding: '8px', fontSize: '0.8rem', borderRadius: '8px', border: 'none', fontWeight: 600 }}
            onClick={() => setMobileTab('menu')}
          >
            Menu Catalog
          </button>
          <button 
            type="button"
            className={mobileTab === 'cart' ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ flex: 1, padding: '8px', fontSize: '0.8rem', borderRadius: '8px', border: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            onClick={() => setMobileTab('cart')}
          >
            Cart ({cart.reduce((s, i) => s + i.qty, 0)})
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, gap: 12, overflow: 'hidden' }}>
        {/* ── Left: Menu Panel ── */}
        {(!isMobile || mobileTab === 'menu') && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isTableManagementEnabled ? (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  const items = (cart && cart.length > 0) ? cart : (activeTable ? (savedOrders[activeTable.id] || savedOrders[String(activeTable.id)] || []) : []);
                  if (activeTable && items.length === 0 && (activeTable.status === 'seated' || activeTable.guestName)) {
                    if (window.confirm(`Table ${activeTable.number || activeTable.id} has no orders. Release table and mark it available?`)) {
                      handleReleaseTable({ markStatus: 'available', cancelKds: false });
                      return;
                    }
                  }
                  if (unassignedTab) {
                    if (cart.length > 0) {
                      const updatedTab = {
                        ...unassignedTab,
                        items: cart,
                        firedItems: unassignedTab.firedItems || [],
                      };
                      setSavedOrders(prev => ({
                        ...prev,
                        [`tab_${unassignedTab.id}`]: updatedTab,
                        __tabs_meta__: {
                          ...(prev.__tabs_meta__ || {}),
                          [unassignedTab.id]: updatedTab,
                        },
                      }));
                    } else {
                      const existing = savedOrders[`tab_${unassignedTab.id}`];
                      const existingItems = Array.isArray(existing) ? existing : (existing?.items || []);
                      if (existingItems.length === 0) {
                        setSavedOrders(prev => {
                          const next = { ...prev };
                          delete next[`tab_${unassignedTab.id}`];
                          if (next.__tabs_meta__) {
                            const nextMeta = { ...next.__tabs_meta__ };
                            delete nextMeta[unassignedTab.id];
                            next.__tabs_meta__ = nextMeta;
                          }
                          return next;
                        });
                      }
                    }
                    setUnassignedTab(null);
                  } else if (activeTable) {
                    if (cart.length > 0) {
                      setSavedOrders(prev => ({
                        ...prev,
                        [activeTable.id]: cart,
                        [String(activeTable.id)]: cart,
                      }));
                      setTables(prev => prev.map(t => String(t.id) === String(activeTable.id)
                        ? { ...t, status: t.status === 'available' ? 'ordered' : t.status }
                        : t
                      ));
                    }
                    setActiveTable(null);
                  }
                  setView('floor');
                  setCart([]);
                  setDiscountAmount(0);
                }}
              >
                <ChevronLeft size={15} /> {getNoun(settings, 'tables', 'Tables')}
              </button>
            ) : (
              <button className="btn btn-secondary btn-sm" onClick={() => { setCart([]); setDiscountAmount(0); }}>
                <RotateCcw size={15} /> Clear Cart
              </button>
            )}
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                {activeTable
                  ? `${getNoun(settings, 'tables', 'Table')} ${activeTable.number || activeTable.id}`
                  : (unassignedTab
                      ? `Dine-In • Token #${unassignedTab.tokenNumber}`
                      : (orderType === 'takeout' ? 'Takeout' : 'Delivery'))}
                {currentGuest && <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.82rem' }}> -- {currentGuest}</span>}
                {unassignedTab && !activeTable && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{
                      padding: '3px 10px',
                      fontSize: '0.72rem',
                      borderRadius: 'var(--r-sm)',
                      marginLeft: 6,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontWeight: 700,
                    }}
                    onClick={() => setAssignTableModal(unassignedTab)}
                    title="Assign order to a table"
                  >
                    <UtensilsCrossed size={12} /> Assign Table
                  </button>
                )}
                {hasCardOnFile && (
                  <span style={{
                    background: 'rgba(59,130,246,0.1)', color: 'var(--accent-blue)',
                    padding: '2px 8px', borderRadius: 'var(--r-sm)', fontSize: '0.68rem', fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                  }}>
                    <CreditCard size={10} /> Card on file
                  </span>
                )}
                {activeTable && orderType === 'dine-in' && (
                  <>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{
                        padding: '2px 8px',
                        fontSize: '0.68rem',
                        borderRadius: 'var(--r-sm)',
                        marginLeft: 4,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        border: '1px solid rgba(30, 94, 74, 0.25)',
                        background: 'rgba(30, 94, 74, 0.05)',
                        color: 'var(--primary)',
                        cursor: 'pointer',
                      }}
                      onClick={() => setShiftTableModal(true)}
                      title="Shift guest to another table"
                    >
                      <ArrowRightLeft size={11} /> Shift Table
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{
                        padding: '2px 8px',
                        fontSize: '0.68rem',
                        borderRadius: 'var(--r-sm)',
                        marginLeft: 4,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        border: '1px solid rgba(239, 68, 68, 0.35)',
                        background: 'rgba(239, 68, 68, 0.08)',
                        color: '#dc2626',
                        cursor: 'pointer',
                      }}
                      onClick={requestReleaseTable}
                      title="Release and clear table"
                    >
                      <UserX size={11} /> Release Table
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{
                        padding: '2px 8px',
                        fontSize: '0.68rem',
                        borderRadius: 'var(--r-sm)',
                        marginLeft: 4,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        border: '1px solid var(--border-subtle)',
                        background: 'rgba(255, 255, 255, 0.7)',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                      }}
                      onClick={() => setTableHistoryModal(activeTable)}
                      title={`View past orders and receipts for Table ${activeTable.number || activeTable.id}`}
                    >
                      <History size={11} /> Past Orders
                    </button>
                  </>
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
                  padding: 0, textAlign: 'left', borderRadius: 'var(--r-lg)', cursor: 'pointer',
                  background: totalInCart > 0 ? 'rgba(30, 94, 74,0.07)' : 'var(--card-bg)',
                  backdropFilter: 'blur(16px)',
                  border: `1.5px solid ${totalInCart > 0 ? 'rgba(30, 94, 74,0.3)' : 'var(--border-subtle)'}`,
                  transition: 'all var(--t-fast)', position: 'relative',
                  display: 'flex', flexDirection: 'column', overflow: 'hidden',
                }}
                onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div style={{ position: 'relative', height: 70, width: '100%', overflow: 'hidden', background: 'rgba(30, 94, 74,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid var(--border-subtle)' }}>
                  {item.image ? (
                    typeof item.image === 'string' && item.image.trim().startsWith('<svg') ? (
                      <div 
                        className="svg-img-container" 
                        style={{ width: '100%', height: '100%', overflow: 'hidden' }}
                        dangerouslySetInnerHTML={{ __html: item.image }} 
                      />
                    ) : (
                      <img src={item.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    )
                  ) : (
                    <div style={{ fontSize: '1.5rem', opacity: 0.15 }}>🍳</div>
                  )}
                </div>
                <div style={{ padding: '10px 12px 12px 12px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between', width: '100%' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: 6, lineHeight: 1.3 }}>{item.name}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
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
                </div>
                {item.sold86 && (
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(255,255,255,0.7)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, color: 'var(--danger)', fontSize: '0.82rem',
                    zIndex: 2,
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
      )}

      {/* ── Right: Cart Sidebar ── */}
      {(!isMobile || mobileTab === 'cart') && (
        <div style={{
          width: isMobile ? '100%' : 330, flexShrink: 0, display: 'flex', flexDirection: 'column',
          background: 'var(--card-bg)', backdropFilter: 'blur(20px)',
          border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-2xl)', overflow: 'hidden',
        }}>
        {/* Cart Header */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>
              {activeTable ? `${getNoun(settings, 'checks', 'Order')} - T${activeTable.number || activeTable.id}` : `${orderType === 'takeout' ? 'Takeout' : 'Delivery'} ${getNoun(settings, 'checks', 'Order')}`}
            </div>
            {autoGratuity > 0 && (
              <span style={{
                background: 'rgba(46, 125, 91,0.1)', color: '#2e7d5b',
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
                      width: 22, height: 22, borderRadius: 'var(--r-sm)', border: '1px solid rgba(30, 94, 74,0.3)',
                      background: 'rgba(30, 94, 74,0.07)', cursor: 'pointer', fontWeight: 700, color: 'var(--primary)',
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
            {unfiredCourses.length > 0 && isKdsEnabled && (
              <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.72rem', padding: '5px 8px' }} onClick={handleFireNextCourse}>
                <Flame size={12} /> Fire C{Math.min(...unfiredCourses)}
              </button>
            )}
            <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.72rem', padding: '5px 8px' }} onClick={handleRepeatLastRound} disabled={cart.length === 0}>
              <RotateCcw size={12} /> Repeat Round
            </button>
            {orderType === 'dine-in' && activeTable && (
              <>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.72rem', padding: '5px 8px' }}
                  onClick={() => setShiftTableModal(true)}
                  title="Shift this tab to another table"
                >
                  <ArrowRightLeft size={12} /> Shift Table
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.72rem', padding: '5px 8px' }}
                  onClick={() => setMergeModal(true)}
                  title="Merge another open tab into this table"
                >
                  Merge
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{
                    fontSize: '0.72rem',
                    padding: '5px 8px',
                    color: '#dc2626',
                    borderColor: 'rgba(239, 68, 68, 0.35)',
                    background: 'rgba(239, 68, 68, 0.05)',
                  }}
                  onClick={requestReleaseTable}
                  title="Release and clear this table"
                >
                  <UserX size={12} /> Release Table
                </button>
              </>
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
            <span style={{ color: 'var(--text-muted)' }}>{pricesIncludeGst ? 'Subtotal (Net)' : 'Subtotal'}</span>
            <span style={{ fontWeight: 600 }}>{subtotalNet.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, fontSize: '0.8rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>GST ({gstRate}%{pricesIncludeGst ? ' incl.' : ''})</span>
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
              <span style={{ color: '#2e7d5b' }}>Auto-Grat ({autoGratuityRate}%)</span>
              <span style={{ fontWeight: 600, color: '#2e7d5b' }}>{autoGratuity.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
            </div>
          )}
          {discountAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--success)' }}>Discount</span>
              <span style={{ fontWeight: 600, color: 'var(--success)' }}>-{discountAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
            </div>
          )}
          {packagingCharge > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Packaging Charge</span>
              <span style={{ fontWeight: 600 }}>{packagingCharge.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
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
            <button className="btn btn-secondary" style={{ flex: 1, fontSize: '0.78rem', padding: '8px' }} onClick={() => {
              if (cart.length === 0) return;
              if (!checkRegisterBeforePayment()) return;
              setSplitModal(true);
            }} disabled={cart.length === 0}>
              <Split size={14} /> Split
            </button>
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => {
            if (cart.length === 0) return;
            if (!checkRegisterBeforePayment()) return;
            if (activeTable) {
              prePayStatusRef.current = activeTable.status;
              setTables(prev => prev.map(t => String(t.id) === String(activeTable.id) ? { ...t, status: 'paying' } : t));
            }
            setPaymentModal(true);
          }} disabled={cart.length === 0}>
            <ReceiptText size={15} /> Settle Bill
          </button>
        </div>
      </div>
      )}
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
          cart={cart} grandTotal={grandTotal} gstRate={gstRate} pricesIncludeGst={pricesIncludeGst}
          onClose={() => setSplitModal(false)}
          onApply={(mode) => showSuccess(`Split applied: ${mode}`)}
        />
      )}

      {paymentModal && (
        <PaymentModal
          cart={cart} cartTotal={cartTotal} tax={tax} gstRate={gstRate} pricesIncludeGst={pricesIncludeGst}
          grandTotal={grandTotal} serviceCharge={serviceCharge}
          autoGratuity={autoGratuity} discount={discountAmount}
          packagingCharge={packagingCharge}
          settings={settings}
          activeTable={activeTable}
          unassignedTab={unassignedTab}
          currentGuest={currentGuest}
          onConfirm={handleConfirmPayment}
          onClose={() => {
            setPaymentModal(false);
            // Payment cancelled — put the table back in its pre-paying state
            if (activeTable && prePayStatusRef.current) {
              const restore = prePayStatusRef.current;
              prePayStatusRef.current = null;
              setTables(prev => prev.map(t => String(t.id) === String(activeTable.id) && t.status === 'paying' ? { ...t, status: restore } : t));
            }
          }}
        />
      )}

      {assignTableModal && (
        <AssignTableModal
          tab={assignTableModal}
          tables={tables}
          savedOrders={savedOrders}
          currentCart={cart}
          onAssign={handleAssignTableToTab}
          onClose={() => setAssignTableModal(null)}
        />
      )}

      {shiftTableModal && activeTable && (
        <ShiftTableModal
          currentTable={activeTable}
          tables={tables}
          savedOrders={savedOrders}
          currentCart={cart}
          onShift={handleShiftTable}
          onClose={() => setShiftTableModal(false)}
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

      {releaseModal && activeTable && (
        <ReleaseTableModal
          table={activeTable}
          hasItems={((cart && cart.length > 0) ? cart : (savedOrders[activeTable.id] || [])).length > 0}
          itemCount={((cart && cart.length > 0) ? cart : (savedOrders[activeTable.id] || [])).reduce((s, i) => s + (i.qty || 1), 0)}
          onConfirm={handleReleaseTable}
          onClose={() => setReleaseModal(false)}
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
        <CashDrawerPanel cashDrawer={cashDrawer} onBlindDrop={handleBlindDrop} onClose={() => setCashDrawerModal(false)} onCloseRegister={handleCloseRegister} />
      )}

      {renderHistoryModals()}
    </div>
  );
};

export default POS;
