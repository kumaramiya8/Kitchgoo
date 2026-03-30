import React, { useState, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom';
import {
  User, Search, Phone, Mail, Star, History, Plus, Trash2, X, ChevronRight,
  ShoppingBag, Edit2, Check, StickyNote, Crown, Award, Gift, Megaphone,
  Filter, Users, TrendingUp, Heart, Calendar, Tag, Send, Eye, Pause, Play,
  Clock, CreditCard, ChevronDown, ChevronUp, ArrowLeft, Settings, ToggleLeft,
  ToggleRight, Zap, Target, Layers, AlertCircle, UserCheck, BarChart3,
  FileText, Utensils, MapPin, MessageSquare, Percent, Hash, RefreshCw
} from 'lucide-react';
import { useApp } from '../db/AppContext';
import { getAll } from '../db/database';

// ── Constants ─────────────────────────────────────────────────
const TIERS = ['Bronze', 'Silver', 'Gold', 'VIP'];
const TIER_COLORS = {
  Bronze: { bg: 'rgba(180,83,9,0.1)', text: '#b45309', border: 'rgba(180,83,9,0.25)' },
  Silver: { bg: 'rgba(100,116,139,0.1)', text: '#64748b', border: 'rgba(100,116,139,0.25)' },
  Gold: { bg: 'rgba(245,158,11,0.1)', text: '#d97706', border: 'rgba(245,158,11,0.25)' },
  VIP: { bg: 'rgba(124,58,237,0.1)', text: '#7c3aed', border: 'rgba(124,58,237,0.25)' },
};
const CAMPAIGN_TYPES = ['Birthday', 'Anniversary', 'Win-back', 'Promotional'];
const CAMPAIGN_STATUSES = ['active', 'paused', 'draft'];
const ALL_TAGS = ['Regular', 'VIP', 'Wine Lover', 'Vegetarian', 'Vegan', 'Gluten-Free', 'Family', 'Corporate', 'Date Night', 'Foodie', 'Health Conscious', 'Weekend Regular'];
const CHANNELS = ['WhatsApp', 'SMS', 'Email', 'Phone Call'];
const DIETARY = ['Vegetarian', 'Non-Vegetarian', 'Vegan', 'Eggetarian', 'Jain', 'Gluten-Free', 'Nut Allergy', 'Lactose Intolerant', 'Halal', 'Kosher'];
const SEATING_PREFS = ['Window', 'Corner Booth', 'Patio/Outdoor', 'Bar', 'Private Room', 'Near Kitchen', 'Quiet Area', 'No Preference'];

const TABS = [
  { id: 'directory', label: 'Guest Directory', icon: Users },
  { id: 'profile', label: 'Guest Profile', icon: User },
  { id: 'loyalty', label: 'Loyalty Program', icon: Award },
  { id: 'campaigns', label: 'Campaigns', icon: Megaphone },
  { id: 'segmentation', label: 'Segmentation', icon: Target },
];

// ── Helpers ───────────────────────────────────────────────────
const fmt = (n) => typeof n === 'number' ? n.toLocaleString('en-IN') : '0';
const fmtCurrency = (n) => '₹' + fmt(Math.round(n || 0));
const daysSince = (dateStr) => {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
};
const guestTier = (g) => g.loyaltyTier || (g.totalSpend >= 50000 ? 'VIP' : g.totalSpend >= 25000 ? 'Gold' : g.totalSpend >= 10000 ? 'Silver' : 'Bronze');
const guestLTV = (g) => g.totalSpend || 0;
const isActive = (g) => daysSince(g.lastVisit) < 30;
const guestPoints = (g) => g.loyaltyPoints || 0;

// ── Portal Modal ──────────────────────────────────────────────
const Modal = ({ title, onClose, children, wide, extraWide }) =>
  ReactDOM.createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        style={extraWide ? { maxWidth: '860px', width: '95%' } : wide ? { maxWidth: '640px', width: '95%' } : {}}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );

// ── Avatar ────────────────────────────────────────────────────
const Avatar = ({ name, size = 42, tier }) => {
  const gradients = {
    Bronze: 'linear-gradient(135deg, #b45309, #d97706)',
    Silver: 'linear-gradient(135deg, #64748b, #94a3b8)',
    Gold: 'linear-gradient(135deg, #d97706, #fbbf24)',
    VIP: 'linear-gradient(135deg, #7c3aed, #a855f7)',
  };
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.28, flexShrink: 0,
      background: gradients[tier] || 'linear-gradient(135deg, #7c3aed, #a855f7)',
      color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 800, fontSize: size * 0.38,
    }}>
      {name?.charAt(0)?.toUpperCase() || '?'}
    </div>
  );
};

// ── Tier Badge ────────────────────────────────────────────────
const TierBadge = ({ tier, small }) => {
  const c = TIER_COLORS[tier] || TIER_COLORS.Bronze;
  return (
    <span style={{
      padding: small ? '2px 8px' : '3px 10px',
      borderRadius: '20px',
      fontSize: small ? '0.65rem' : '0.72rem',
      fontWeight: 700,
      background: c.bg,
      color: c.text,
      border: `1px solid ${c.border}`,
      display: 'inline-flex',
      alignItems: 'center',
      gap: '3px',
    }}>
      {tier === 'VIP' && <Crown size={small ? 9 : 11} />}
      {tier === 'Gold' && <Star size={small ? 9 : 11} />}
      {tier}
    </span>
  );
};

// ── Stat Card ─────────────────────────────────────────────────
const StatCard = ({ label, value, color, icon: Icon }) => (
  <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
    {Icon && (
      <div style={{
        width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: `${color}18`, color,
      }}>
        <Icon size={20} />
      </div>
    )}
    <div>
      <div style={{ fontSize: '1.35rem', fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
    </div>
  </div>
);

// ── Tag Chips ─────────────────────────────────────────────────
const TagChips = ({ tags = [], onRemove }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
    {tags.map(t => (
      <span key={t} style={{
        padding: '2px 8px', borderRadius: '12px', fontSize: '0.68rem', fontWeight: 600,
        background: 'rgba(124,58,237,0.08)', color: 'var(--primary)',
        border: '1px solid rgba(124,58,237,0.15)', display: 'inline-flex', alignItems: 'center', gap: '4px',
      }}>
        {t}
        {onRemove && (
          <X size={10} style={{ cursor: 'pointer', opacity: 0.6 }} onClick={(e) => { e.stopPropagation(); onRemove(t); }} />
        )}
      </span>
    ))}
  </div>
);

// ── Multi-Select Tag Input ────────────────────────────────────
const TagSelect = ({ value = [], onChange, options, label }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="input-group" style={{ position: 'relative' }}>
      <label className="input-label">{label}</label>
      <div
        className="input-field"
        style={{ cursor: 'pointer', minHeight: '38px', display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}
        onClick={() => setOpen(!open)}
      >
        {value.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Select...</span>}
        {value.map(t => (
          <span key={t} style={{
            padding: '1px 7px', borderRadius: '10px', fontSize: '0.68rem', fontWeight: 600,
            background: 'rgba(124,58,237,0.1)', color: 'var(--primary)',
          }}>
            {t}
            <X size={9} style={{ marginLeft: 3, cursor: 'pointer' }} onClick={e => { e.stopPropagation(); onChange(value.filter(v => v !== t)); }} />
          </span>
        ))}
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
          background: 'white', border: '1px solid var(--border-subtle)', borderRadius: '10px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: '180px', overflowY: 'auto',
        }}>
          {options.filter(o => !value.includes(o)).map(o => (
            <div key={o} style={{
              padding: '8px 12px', cursor: 'pointer', fontSize: '0.82rem',
              borderBottom: '1px solid var(--border-subtle)',
            }}
              onMouseOver={e => e.currentTarget.style.background = 'var(--primary-light)'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
              onClick={(e) => { e.stopPropagation(); onChange([...value, o]); }}
            >
              {o}
            </div>
          ))}
          {options.filter(o => !value.includes(o)).length === 0 && (
            <div style={{ padding: '8px 12px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>All selected</div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Toggle Component ──────────────────────────────────────────
const Toggle = ({ value, onChange, label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
    <div
      onClick={() => onChange(!value)}
      style={{
        width: 44, height: 24, borderRadius: 12, cursor: 'pointer', position: 'relative',
        background: value ? 'var(--primary)' : '#cbd5e1', transition: 'background 0.2s',
      }}
    >
      <div style={{
        width: 18, height: 18, borderRadius: '50%', background: 'white',
        position: 'absolute', top: 3, left: value ? 23 : 3, transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </div>
    {label && <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>}
  </div>
);

// ── Progress Bar ──────────────────────────────────────────────
const ProgressBar = ({ value, max, color = 'var(--primary)', height = 8 }) => (
  <div style={{ width: '100%', height, borderRadius: height, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
    <div style={{
      height: '100%', borderRadius: height,
      width: `${Math.min(100, (value / max) * 100)}%`,
      background: color,
      transition: 'width 0.5s ease',
    }} />
  </div>
);

// ══════════════════════════════════════════════════════════════
//  INVOICE MODAL
// ══════════════════════════════════════════════════════════════
const InvoiceModal = ({ order, onClose, settings }) => {
  if (!order) return null;
  const restaurant = settings?.restaurant || {};
  return (
    <Modal title={`Invoice ${order.billNo || ''}`} onClose={onClose} wide>
      <div className="modal-body" style={{ padding: '24px' }}>
        {/* Restaurant header */}
        <div style={{ textAlign: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '2px dashed var(--border-subtle)' }}>
          <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)' }}>{restaurant.name || 'Kitchgoo'}</div>
          {restaurant.address && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>{restaurant.address}</div>}
          {restaurant.gstin && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>GSTIN: {restaurant.gstin}</div>}
        </div>

        {/* Order info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px', fontSize: '0.78rem' }}>
          <div><span style={{ color: 'var(--text-muted)' }}>Bill No:</span> <strong>{order.billNo}</strong></div>
          <div style={{ textAlign: 'right' }}><span style={{ color: 'var(--text-muted)' }}>Date:</span> <strong>{new Date(order.createdAt).toLocaleString('en-IN')}</strong></div>
          <div><span style={{ color: 'var(--text-muted)' }}>Table:</span> <strong>{order.tableId || 'N/A'}</strong></div>
          <div style={{ textAlign: 'right' }}><span style={{ color: 'var(--text-muted)' }}>Payment:</span> <strong>{order.paymentMethod || 'N/A'}</strong></div>
          {order.server && <div><span style={{ color: 'var(--text-muted)' }}>Server:</span> <strong>{order.server}</strong></div>}
        </div>

        {/* Items */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)', padding: '12px 0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '4px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', padding: '0 4px' }}>
            <div>Item</div><div style={{ textAlign: 'center' }}>Qty</div><div style={{ textAlign: 'right' }}>Rate</div><div style={{ textAlign: 'right' }}>Amount</div>
          </div>
          {(order.items || []).map((item, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '4px', fontSize: '0.8rem', padding: '6px 4px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
              <div style={{ fontWeight: 600 }}>{item.name}</div>
              <div style={{ textAlign: 'center' }}>{item.qty}</div>
              <div style={{ textAlign: 'right' }}>{fmtCurrency(item.price)}</div>
              <div style={{ textAlign: 'right', fontWeight: 600 }}>{fmtCurrency((item.price || 0) * (item.qty || 1))}</div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div style={{ marginTop: '12px', fontSize: '0.82rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
            <span style={{ color: 'var(--text-muted)' }}>Subtotal</span>
            <span style={{ fontWeight: 600 }}>{fmtCurrency(order.subtotal || order.total)}</span>
          </div>
          {order.tax > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span style={{ color: 'var(--text-muted)' }}>Tax</span>
              <span style={{ fontWeight: 600 }}>{fmtCurrency(order.tax)}</span>
            </div>
          )}
          {order.discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: 'var(--success)' }}>
              <span>Discount</span>
              <span style={{ fontWeight: 600 }}>-{fmtCurrency(order.discount)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '2px solid var(--text-primary)', marginTop: '8px' }}>
            <span style={{ fontWeight: 800, fontSize: '1rem' }}>Total</span>
            <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--primary)' }}>{fmtCurrency(order.total)}</span>
          </div>
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
};

// ══════════════════════════════════════════════════════════════
//  ADD/EDIT GUEST MODAL
// ══════════════════════════════════════════════════════════════
const GuestFormModal = ({ guest, onSave, onClose }) => {
  const isEdit = !!guest;
  const [form, setForm] = useState(guest ? { ...guest } : {
    name: '', phone: '', email: '', notes: '', birthday: '', anniversary: '',
    tags: [], channelPreference: 'WhatsApp', dietaryPreferences: [], seatingPreference: 'No Preference',
    visitCount: 0, totalSpend: 0, loyaltyPoints: 0, loyaltyTier: 'Bronze',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.name.trim()) return;
    onSave({
      ...form,
      lastVisit: form.lastVisit || new Date().toISOString(),
      createdAt: form.createdAt || new Date().toISOString(),
    });
    onClose();
  };

  return (
    <Modal title={isEdit ? 'Edit Guest' : 'Add New Guest'} onClose={onClose} wide>
      <div className="modal-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="input-group" style={{ gridColumn: '1/-1' }}>
            <label className="input-label">Full Name *</label>
            <input className="input-field" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Rahul Sharma" autoFocus />
          </div>
          <div className="input-group">
            <label className="input-label">Phone</label>
            <input className="input-field" type="tel" value={form.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="+91 XXXXX XXXXX" />
          </div>
          <div className="input-group">
            <label className="input-label">Email</label>
            <input className="input-field" type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} placeholder="email@example.com" />
          </div>
          <div className="input-group">
            <label className="input-label">Birthday</label>
            <input className="input-field" type="date" value={form.birthday || ''} onChange={e => set('birthday', e.target.value)} />
          </div>
          <div className="input-group">
            <label className="input-label">Anniversary</label>
            <input className="input-field" type="date" value={form.anniversary || ''} onChange={e => set('anniversary', e.target.value)} />
          </div>
          <div className="input-group">
            <label className="input-label">Channel Preference</label>
            <select className="input-field" value={form.channelPreference || 'WhatsApp'} onChange={e => set('channelPreference', e.target.value)}>
              {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="input-group">
            <label className="input-label">Seating Preference</label>
            <select className="input-field" value={form.seatingPreference || 'No Preference'} onChange={e => set('seatingPreference', e.target.value)}>
              {SEATING_PREFS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <TagSelect label="Tags" value={form.tags || []} onChange={v => set('tags', v)} options={ALL_TAGS} />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <TagSelect label="Dietary Preferences / Allergies" value={form.dietaryPreferences || []} onChange={v => set('dietaryPreferences', v)} options={DIETARY} />
          </div>
          <div className="input-group" style={{ gridColumn: '1/-1' }}>
            <label className="input-label">Notes</label>
            <textarea className="input-field" rows={3} value={form.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Special requests, preferences, allergies..." style={{ resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={!form.name.trim()}>
          {isEdit ? <><Check size={15} /> Save Changes</> : <><Plus size={15} /> Add Guest</>}
        </button>
      </div>
    </Modal>
  );
};

// ══════════════════════════════════════════════════════════════
//  CAMPAIGN MODAL
// ══════════════════════════════════════════════════════════════
const CampaignFormModal = ({ campaign, segments, onSave, onClose }) => {
  const isEdit = !!campaign;
  const [form, setForm] = useState(campaign || {
    name: '', type: 'Promotional', message: '', discount: 10, segment: 'All Guests',
    schedule: 'immediate', status: 'draft', sentCount: 0, openRate: 0,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Modal title={isEdit ? 'Edit Campaign' : 'Create Campaign'} onClose={onClose} wide>
      <div className="modal-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="input-group" style={{ gridColumn: '1/-1' }}>
            <label className="input-label">Campaign Name *</label>
            <input className="input-field" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Weekend Brunch Special" />
          </div>
          <div className="input-group">
            <label className="input-label">Type</label>
            <select className="input-field" value={form.type} onChange={e => set('type', e.target.value)}>
              {CAMPAIGN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="input-group">
            <label className="input-label">Discount %</label>
            <input className="input-field" type="number" min={0} max={100} value={form.discount} onChange={e => set('discount', parseInt(e.target.value) || 0)} />
          </div>
          <div className="input-group">
            <label className="input-label">Target Segment</label>
            <select className="input-field" value={form.segment} onChange={e => set('segment', e.target.value)}>
              <option value="All Guests">All Guests</option>
              {segments.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="input-group">
            <label className="input-label">Schedule</label>
            <select className="input-field" value={form.schedule} onChange={e => set('schedule', e.target.value)}>
              <option value="immediate">Send Immediately</option>
              <option value="scheduled">Schedule for Later</option>
              <option value="recurring">Recurring (Auto)</option>
            </select>
          </div>
          <div className="input-group" style={{ gridColumn: '1/-1' }}>
            <label className="input-label">Message Template</label>
            <textarea className="input-field" rows={4} value={form.message} onChange={e => set('message', e.target.value)}
              placeholder="Hi {name}, we miss you at Kitchgoo! Enjoy {discount}% off on your next visit. Valid this week only."
              style={{ resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => { if (form.name.trim()) { onSave({ ...form, createdAt: form.createdAt || new Date().toISOString() }); onClose(); } }} disabled={!form.name.trim()}>
          {isEdit ? <><Check size={15} /> Update</> : <><Send size={15} /> Create Campaign</>}
        </button>
      </div>
    </Modal>
  );
};

// ══════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════════
const Guests = () => {
  const {
    guests, orders, loyalty, campaigns, settings,
    addGuest, editGuest, deleteGuest,
    updateLoyalty, addCampaign, editCampaign, deleteCampaign,
  } = useApp();

  const allGuests = guests || [];
  const allOrders = orders || [];
  const allCampaigns = campaigns || [];
  const loyaltyConfig = loyalty || {};

  // ── State ─────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('directory');
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('All');
  const [selectedGuest, setSelectedGuest] = useState(null);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [editingGuest, setEditingGuest] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [invoiceOrder, setInvoiceOrder] = useState(null);

  // Profile sub-tab
  const [profileTab, setProfileTab] = useState('orders');

  // Segmentation state
  const [segFilters, setSegFilters] = useState({
    minVisits: '', maxVisits: '', minSpend: '', maxSpend: '',
    lastVisitDays: '', tier: 'All', tags: [], channel: 'All',
  });

  // ── Computed ──────────────────────────────────────────────
  const guestsWithTier = useMemo(() =>
    allGuests.map(g => ({ ...g, tier: guestTier(g) })),
    [allGuests]
  );

  const filtered = useMemo(() => {
    let list = guestsWithTier;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(g =>
        g.name?.toLowerCase().includes(q) ||
        (g.phone || '').includes(q) ||
        (g.email || '').toLowerCase().includes(q)
      );
    }
    if (tierFilter !== 'All') {
      list = list.filter(g => g.tier === tierFilter);
    }
    return list.sort((a, b) => (b.totalSpend || 0) - (a.totalSpend || 0));
  }, [guestsWithTier, search, tierFilter]);

  const stats = useMemo(() => {
    const total = allGuests.length;
    const active = allGuests.filter(isActive).length;
    const totalLTV = allGuests.reduce((s, g) => s + guestLTV(g), 0);
    const avgLTV = total > 0 ? totalLTV / total : 0;
    const vipCount = guestsWithTier.filter(g => g.tier === 'VIP').length;
    return { total, active, avgLTV, vipCount };
  }, [allGuests, guestsWithTier]);

  const guestOrders = useMemo(() => {
    if (!selectedGuest) return [];
    return allOrders.filter(o => o.guestId === selectedGuest.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [selectedGuest, allOrders]);

  // Loyalty stats
  const loyaltyStats = useMemo(() => {
    const enrolled = allGuests.filter(g => (g.loyaltyPoints || 0) > 0 || g.loyaltyTier).length;
    const issued = allGuests.reduce((s, g) => s + (g.pointsEarned || 0), 0);
    const redeemed = allGuests.reduce((s, g) => s + (g.pointsRedeemed || 0), 0);
    const rate = issued > 0 ? ((redeemed / issued) * 100).toFixed(1) : 0;
    return { enrolled, issued, redeemed, rate };
  }, [allGuests]);

  // Segmentation filter
  const segmentedGuests = useMemo(() => {
    let list = guestsWithTier;
    const f = segFilters;
    if (f.minVisits) list = list.filter(g => (g.visitCount || 0) >= parseInt(f.minVisits));
    if (f.maxVisits) list = list.filter(g => (g.visitCount || 0) <= parseInt(f.maxVisits));
    if (f.minSpend) list = list.filter(g => (g.totalSpend || 0) >= parseInt(f.minSpend));
    if (f.maxSpend) list = list.filter(g => (g.totalSpend || 0) <= parseInt(f.maxSpend));
    if (f.lastVisitDays) list = list.filter(g => daysSince(g.lastVisit) >= parseInt(f.lastVisitDays));
    if (f.tier !== 'All') list = list.filter(g => g.tier === f.tier);
    if (f.tags.length > 0) list = list.filter(g => f.tags.some(t => (g.tags || []).includes(t)));
    if (f.channel !== 'All') list = list.filter(g => g.channelPreference === f.channel);
    return list;
  }, [guestsWithTier, segFilters]);

  // Pre-built segments
  const preBuiltSegments = useMemo(() => {
    const now = new Date();
    const thisMonth = now.getMonth();
    return [
      { name: 'VIP Guests', count: guestsWithTier.filter(g => g.tier === 'VIP').length, color: '#7c3aed', icon: Crown,
        apply: () => setSegFilters(f => ({ ...f, tier: 'VIP' })) },
      { name: 'At Risk (30d+)', count: allGuests.filter(g => daysSince(g.lastVisit) >= 30).length, color: '#ef4444', icon: AlertCircle,
        apply: () => setSegFilters(f => ({ ...f, lastVisitDays: '30' })) },
      { name: 'Wine Lovers', count: allGuests.filter(g => (g.tags || []).includes('Wine Lover')).length, color: '#8b5cf6', icon: Heart,
        apply: () => setSegFilters(f => ({ ...f, tags: ['Wine Lover'] })) },
      { name: 'Birthday This Month', count: allGuests.filter(g => g.birthday && new Date(g.birthday).getMonth() === thisMonth).length, color: '#f59e0b', icon: Gift,
        apply: () => {} },
    ];
  }, [guestsWithTier, allGuests]);

  const segmentNames = ['VIP Guests', 'At Risk (30d+)', 'Wine Lovers', 'Birthday This Month', 'High Spenders', 'New Guests'];

  // ── Handlers ──────────────────────────────────────────────
  const handleAddGuest = async (data) => {
    await addGuest(data);
  };
  const handleEditGuest = async (data) => {
    await editGuest(data.id, data);
    setSelectedGuest(data);
  };
  const handleDeleteGuest = async (id) => {
    await deleteGuest(id);
    setDeleteConfirm(null);
    if (selectedGuest?.id === id) {
      setSelectedGuest(null);
      setActiveTab('directory');
    }
  };

  const openProfile = (guest) => {
    setSelectedGuest({ ...guest, tier: guestTier(guest) });
    setProfileTab('orders');
    setActiveTab('profile');
  };

  const handleSaveCampaign = async (data) => {
    if (data.id) {
      await editCampaign(data.id, data);
    } else {
      await addCampaign(data);
    }
  };

  const handleDeleteCampaign = async (id) => {
    await deleteCampaign(id);
  };

  const handleToggleCampaign = async (c) => {
    await editCampaign(c.id, { ...c, status: c.status === 'active' ? 'paused' : 'active' });
  };

  const handleSaveLoyalty = async (data) => {
    await updateLoyalty(data);
  };

  // Loyalty tier editing
  const [editTierIdx, setEditTierIdx] = useState(null);

  // ── Loyalty default config ────────────────────────────────
  const [loyaltyForm, setLoyaltyForm] = useState({
    enabled: loyaltyConfig.enabled ?? true,
    pointsPerRupee: loyaltyConfig.pointsPerRupee ?? 1,
    pointsPerVisit: loyaltyConfig.pointsPerVisit ?? 10,
    redemptionRate: loyaltyConfig.redemptionRate ?? 0.25,
    tiers: loyaltyConfig.tiers || [
      { name: 'Bronze', minPoints: 0, perks: 'Birthday discount 5%' },
      { name: 'Silver', minPoints: 500, perks: '10% off, Priority seating' },
      { name: 'Gold', minPoints: 2000, perks: '15% off, Free dessert, Priority seating' },
      { name: 'VIP', minPoints: 5000, perks: '20% off, Free dessert, Private room access, Chef\'s table' },
    ],
  });

  // ══════════════════════════════════════════════════════════
  //  RENDER: GUEST DIRECTORY TAB
  // ══════════════════════════════════════════════════════════
  const renderDirectory = () => (
    <>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '18px' }}>
        <StatCard label="Total Guests" value={fmt(stats.total)} color="#7c3aed" icon={Users} />
        <StatCard label="Active (30d)" value={fmt(stats.active)} color="#22c55e" icon={UserCheck} />
        <StatCard label="Average LTV" value={fmtCurrency(stats.avgLTV)} color="#3b82f6" icon={TrendingUp} />
        <StatCard label="VIP Guests" value={fmt(stats.vipCount)} color="#f59e0b" icon={Crown} />
      </div>

      {/* Search + Filter row */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: '400px' }}>
          <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input className="input-field" style={{ paddingLeft: 40 }} placeholder="Search by name, phone or email..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {['All', ...TIERS].map(t => (
            <button key={t} className={`btn btn-sm ${tierFilter === t ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setTierFilter(t)} style={{ fontSize: '0.72rem' }}>
              {t === 'All' ? 'All Tiers' : t}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <User size={44} strokeWidth={1} style={{ marginBottom: 12, opacity: 0.3 }} />
          <div style={{ fontWeight: 600, marginBottom: '6px' }}>No guests found</div>
          <div style={{ fontSize: '0.82rem' }}>Add your first guest profile to start tracking visits and orders.</div>
          <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => setShowGuestModal(true)}>
            <Plus size={15} /> Add First Guest
          </button>
        </div>
      ) : (
        <div className="table-wrapper">
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr>
                {['Name', 'Phone', 'Email', 'Visits', 'Total Spend', 'Avg Spend', 'Tier', 'Last Visit', 'Tags', 'Actions'].map(h => (
                  <th key={h} style={{
                    padding: '10px 14px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700,
                    color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)',
                    whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'rgba(255,255,255,0.95)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(g => {
                const avgSpend = g.visitCount > 0 ? (g.totalSpend || 0) / g.visitCount : 0;
                return (
                  <tr key={g.id} onClick={() => openProfile(g)} style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseOver={e => e.currentTarget.style.background = 'rgba(124,58,237,0.03)'}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Avatar name={g.name} size={32} tier={g.tier} />
                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{g.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{g.phone || '-'}</td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{g.email || '-'}</td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{g.visitCount || 0}</td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.85rem', fontWeight: 700, color: 'var(--success)' }}>{fmtCurrency(g.totalSpend)}</td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{fmtCurrency(avgSpend)}</td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)' }}><TierBadge tier={g.tier} small /></td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {g.lastVisit ? `${daysSince(g.lastVisit)}d ago` : 'Never'}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
                      <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                        {(g.tags || []).slice(0, 2).map(t => (
                          <span key={t} style={{ padding: '1px 6px', borderRadius: '8px', fontSize: '0.62rem', fontWeight: 600, background: 'rgba(124,58,237,0.06)', color: 'var(--primary)' }}>{t}</span>
                        ))}
                        {(g.tags || []).length > 2 && <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>+{g.tags.length - 2}</span>}
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => { setEditingGuest(g); setShowGuestModal(true); }} className="btn btn-sm btn-secondary" style={{ padding: '4px 8px' }}>
                          <Edit2 size={12} />
                        </button>
                        <button onClick={() => setDeleteConfirm(g)} className="btn btn-sm btn-danger" style={{ padding: '4px 8px' }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  // ══════════════════════════════════════════════════════════
  //  RENDER: GUEST PROFILE TAB
  // ══════════════════════════════════════════════════════════
  const renderProfile = () => {
    const g = selectedGuest;
    if (!g) return (
      <div className="card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <User size={48} strokeWidth={1} style={{ marginBottom: 12, opacity: 0.3 }} />
        <div style={{ fontWeight: 600, marginBottom: '6px' }}>No Guest Selected</div>
        <div style={{ fontSize: '0.82rem' }}>Select a guest from the Guest Directory to view their profile.</div>
        <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => setActiveTab('directory')}>
          <ArrowLeft size={15} /> Go to Directory
        </button>
      </div>
    );

    const avgSpend = g.visitCount > 0 ? (g.totalSpend || 0) / g.visitCount : 0;
    const memberSince = g.createdAt ? new Date(g.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : 'N/A';
    const daysAgo = daysSince(g.lastVisit);
    const tier = guestTier(g);
    const points = guestPoints(g);

    const nextTierIdx = TIERS.indexOf(tier);
    const nextTier = nextTierIdx < TIERS.length - 1 ? TIERS[nextTierIdx + 1] : null;
    const tierThresholds = { Bronze: 0, Silver: 500, Gold: 2000, VIP: 5000 };
    const nextTierPoints = nextTier ? (loyaltyForm.tiers.find(t => t.name === nextTier)?.minPoints || tierThresholds[nextTier]) : points;
    const currentTierPoints = loyaltyForm.tiers.find(t => t.name === tier)?.minPoints || tierThresholds[tier];
    const tierProgress = nextTier ? Math.min(100, ((points - currentTierPoints) / (nextTierPoints - currentTierPoints)) * 100) : 100;

    const profileSubTabs = [
      { id: 'orders', label: 'Order History', icon: ShoppingBag },
      { id: 'notes', label: 'Notes & Preferences', icon: StickyNote },
      { id: 'loyalty', label: 'Loyalty', icon: Award },
    ];

    return (
      <>
        {/* Back button */}
        <button className="btn btn-secondary btn-sm" style={{ marginBottom: '16px' }} onClick={() => setActiveTab('directory')}>
          <ArrowLeft size={14} /> Back to Directory
        </button>

        {/* Golden Guest Record Header */}
        <div className="card" style={{
          padding: '24px', marginBottom: '16px',
          background: 'linear-gradient(135deg, rgba(124,58,237,0.04), rgba(245,158,11,0.04))',
          border: '1px solid rgba(124,58,237,0.12)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
            <Avatar name={g.name} size={72} tier={tier} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>{g.name}</h2>
                <TierBadge tier={tier} />
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {g.phone && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Phone size={12} /> {g.phone}</span>}
                {g.email && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Mail size={12} /> {g.email}</span>}
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={12} /> Member since {memberSince}</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)' }}>{fmtCurrency(g.totalSpend)}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Lifetime Value</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => { setEditingGuest(g); setShowGuestModal(true); }}>
              <Edit2 size={13} /> Edit
            </button>
          </div>
        </div>

        {/* Quick Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '18px' }}>
          {[
            { label: 'Total Visits', value: g.visitCount || 0, color: '#7c3aed' },
            { label: 'Total Spend', value: fmtCurrency(g.totalSpend), color: '#22c55e' },
            { label: 'Avg Spend', value: fmtCurrency(avgSpend), color: '#3b82f6' },
            { label: 'Loyalty Points', value: fmt(points), color: '#f59e0b' },
            { label: 'Days Since Visit', value: daysAgo < 999 ? daysAgo : 'N/A', color: daysAgo > 30 ? '#ef4444' : '#22c55e' },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: '14px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: '2px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Sub-tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '1px solid var(--border-subtle)' }}>
          {profileSubTabs.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setProfileTab(t.id)} style={{
                padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
                fontWeight: profileTab === t.id ? 700 : 500, fontSize: '0.82rem',
                color: profileTab === t.id ? 'var(--primary)' : 'var(--text-muted)',
                borderBottom: profileTab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
                marginBottom: '-1px', display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* Sub-tab content */}
        {profileTab === 'orders' && (
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>Order History</h3>
            {guestOrders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                <ShoppingBag size={36} strokeWidth={1} style={{ marginBottom: 10, opacity: 0.4 }} />
                <p style={{ fontSize: '0.85rem' }}>No order history found.</p>
              </div>
            ) : guestOrders.map(o => (
              <div key={o.id} onClick={() => setInvoiceOrder(o)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 16px', background: 'rgba(255,255,255,0.6)', borderRadius: '12px',
                  border: '1px solid var(--border-subtle)', marginBottom: '8px',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseOver={e => { e.currentTarget.style.background = 'rgba(124,58,237,0.03)'; e.currentTarget.style.borderColor = 'rgba(124,58,237,0.2)'; }}
                onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.6)'; e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{o.billNo || 'Order'}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {new Date(o.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {' '}&middot; {o.items?.length || 0} items &middot; {o.paymentMethod || 'N/A'}
                    {o.server && <> &middot; Server: {o.server}</>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '0.95rem' }}>{fmtCurrency(o.total)}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--success)', fontWeight: 600 }}>Paid</div>
                  </div>
                  <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {profileTab === 'notes' && (
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>Notes & Preferences</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Notes */}
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>Notes</label>
                <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.02)', borderRadius: '10px', fontSize: '0.85rem', color: 'var(--text-primary)', minHeight: '60px', border: '1px solid var(--border-subtle)' }}>
                  {g.notes || 'No notes added.'}
                </div>
              </div>

              {/* Tags */}
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>Tags</label>
                {(g.tags || []).length > 0 ? <TagChips tags={g.tags} /> : <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>No tags</span>}
              </div>

              {/* Channel Preference */}
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>Channel Preference</label>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{g.channelPreference || 'Not set'}</span>
              </div>

              {/* Dietary */}
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
                  <Utensils size={12} style={{ marginRight: 4, display: 'inline' }} /> Dietary Preferences / Allergies
                </label>
                {(g.dietaryPreferences || []).length > 0 ? (
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {g.dietaryPreferences.map(d => (
                      <span key={d} style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 600, background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.15)' }}>{d}</span>
                    ))}
                  </div>
                ) : <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>None</span>}
              </div>

              {/* Seating */}
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
                  <MapPin size={12} style={{ marginRight: 4, display: 'inline' }} /> Seating Preference
                </label>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{g.seatingPreference || 'No preference'}</span>
              </div>

              {/* Special Occasions */}
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
                  <Gift size={12} style={{ marginRight: 4, display: 'inline' }} /> Special Occasions
                </label>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <div style={{ padding: '10px 16px', background: 'rgba(245,158,11,0.06)', borderRadius: '10px', border: '1px solid rgba(245,158,11,0.15)' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>Birthday</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>{g.birthday ? new Date(g.birthday).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : 'Not set'}</div>
                  </div>
                  <div style={{ padding: '10px 16px', background: 'rgba(239,68,68,0.04)', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.12)' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>Anniversary</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>{g.anniversary ? new Date(g.anniversary).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : 'Not set'}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {profileTab === 'loyalty' && (
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>Loyalty Details</h3>

            {/* Points Balance */}
            <div style={{
              padding: '20px', borderRadius: '14px', marginBottom: '16px',
              background: 'linear-gradient(135deg, rgba(124,58,237,0.06), rgba(245,158,11,0.06))',
              border: '1px solid rgba(124,58,237,0.1)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '2px' }}>Points Balance</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)' }}>{fmt(points)}</div>
                </div>
                <TierBadge tier={tier} />
              </div>

              {/* Tier progress */}
              {nextTier && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    <span>{tier}</span>
                    <span>{nextTier} ({nextTierPoints} pts)</span>
                  </div>
                  <ProgressBar value={tierProgress} max={100} color="var(--primary)" height={10} />
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {Math.max(0, nextTierPoints - points)} points to {nextTier}
                  </div>
                </div>
              )}
              {!nextTier && (
                <div style={{ fontSize: '0.78rem', color: 'var(--success)', fontWeight: 600 }}>
                  Top tier reached!
                </div>
              )}
            </div>

            {/* Points History */}
            <h4 style={{ margin: '16px 0 10px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Points History</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
              <div style={{ padding: '14px', background: 'rgba(34,197,94,0.06)', borderRadius: '10px', border: '1px solid rgba(34,197,94,0.12)' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>Points Earned</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--success)' }}>+{fmt(g.pointsEarned || points)}</div>
              </div>
              <div style={{ padding: '14px', background: 'rgba(239,68,68,0.04)', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.1)' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>Points Redeemed</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--danger)' }}>-{fmt(g.pointsRedeemed || 0)}</div>
              </div>
            </div>

            {/* Available Rewards */}
            <h4 style={{ margin: '16px 0 10px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Available Rewards</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { name: 'Free Dessert', points: 200, icon: Gift },
                { name: '10% Off Next Visit', points: 500, icon: Percent },
                { name: 'Free Main Course', points: 1000, icon: Utensils },
                { name: 'Private Dining Experience', points: 3000, icon: Crown },
              ].map(r => {
                const Icon = r.icon;
                const canRedeem = points >= r.points;
                return (
                  <div key={r.name} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 14px', borderRadius: '10px',
                    background: canRedeem ? 'rgba(34,197,94,0.04)' : 'rgba(0,0,0,0.02)',
                    border: `1px solid ${canRedeem ? 'rgba(34,197,94,0.15)' : 'var(--border-subtle)'}`,
                    opacity: canRedeem ? 1 : 0.5,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Icon size={16} style={{ color: canRedeem ? 'var(--success)' : 'var(--text-muted)' }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{r.name}</span>
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: canRedeem ? 'var(--success)' : 'var(--text-muted)' }}>
                      {r.points} pts
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </>
    );
  };

  // ══════════════════════════════════════════════════════════
  //  RENDER: LOYALTY PROGRAM TAB
  // ══════════════════════════════════════════════════════════
  const renderLoyalty = () => (
      <>
        {/* Program Settings */}
        <div className="card" style={{ padding: '24px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              <Settings size={18} style={{ marginRight: 8, display: 'inline', verticalAlign: 'text-bottom' }} />
              Program Settings
            </h3>
            <Toggle value={loyaltyForm.enabled} onChange={v => setLoyaltyForm(f => ({ ...f, enabled: v }))} label="Enabled" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
            <div className="input-group">
              <label className="input-label">Points per Rupee Spent</label>
              <input className="input-field" type="number" min={0} step={0.1} value={loyaltyForm.pointsPerRupee}
                onChange={e => setLoyaltyForm(f => ({ ...f, pointsPerRupee: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="input-group">
              <label className="input-label">Points per Visit</label>
              <input className="input-field" type="number" min={0} value={loyaltyForm.pointsPerVisit}
                onChange={e => setLoyaltyForm(f => ({ ...f, pointsPerVisit: parseInt(e.target.value) || 0 }))} />
            </div>
            <div className="input-group">
              <label className="input-label">Redemption Rate (₹ per point)</label>
              <input className="input-field" type="number" min={0} step={0.05} value={loyaltyForm.redemptionRate}
                onChange={e => setLoyaltyForm(f => ({ ...f, redemptionRate: parseFloat(e.target.value) || 0 }))} />
            </div>
          </div>

          <button className="btn btn-primary btn-sm" style={{ marginTop: '14px' }}
            onClick={() => handleSaveLoyalty(loyaltyForm)}>
            <Check size={14} /> Save Settings
          </button>
        </div>

        {/* Tier Configuration */}
        <div className="card" style={{ padding: '24px', marginBottom: '16px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            <Layers size={18} style={{ marginRight: 8, display: 'inline', verticalAlign: 'text-bottom' }} />
            Tier Configuration
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {loyaltyForm.tiers.map((t, i) => (
              <div key={t.name} style={{
                padding: '16px', borderRadius: '12px',
                background: editTierIdx === i ? 'rgba(124,58,237,0.04)' : 'rgba(0,0,0,0.02)',
                border: `1px solid ${editTierIdx === i ? 'rgba(124,58,237,0.2)' : 'var(--border-subtle)'}`,
              }}>
                {editTierIdx === i ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="input-group">
                      <label className="input-label">Tier Name</label>
                      <input className="input-field" value={t.name} onChange={e => {
                        const tiers = [...loyaltyForm.tiers];
                        tiers[i] = { ...tiers[i], name: e.target.value };
                        setLoyaltyForm(f => ({ ...f, tiers }));
                      }} />
                    </div>
                    <div className="input-group">
                      <label className="input-label">Min Points</label>
                      <input className="input-field" type="number" value={t.minPoints} onChange={e => {
                        const tiers = [...loyaltyForm.tiers];
                        tiers[i] = { ...tiers[i], minPoints: parseInt(e.target.value) || 0 };
                        setLoyaltyForm(f => ({ ...f, tiers }));
                      }} />
                    </div>
                    <div className="input-group" style={{ gridColumn: '1/-1' }}>
                      <label className="input-label">Perks</label>
                      <input className="input-field" value={t.perks} onChange={e => {
                        const tiers = [...loyaltyForm.tiers];
                        tiers[i] = { ...tiers[i], perks: e.target.value };
                        setLoyaltyForm(f => ({ ...f, tiers }));
                      }} />
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => setEditTierIdx(null)}>
                      <Check size={13} /> Done
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <TierBadge tier={t.name} />
                      <div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{t.minPoints} pts minimum</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>{t.perks}</div>
                      </div>
                    </div>
                    <button className="btn btn-sm btn-secondary" onClick={() => setEditTierIdx(i)}>
                      <Edit2 size={12} /> Edit
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Loyalty Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          <StatCard label="Enrolled Members" value={fmt(loyaltyStats.enrolled)} color="#7c3aed" icon={Users} />
          <StatCard label="Points Issued" value={fmt(loyaltyStats.issued)} color="#22c55e" icon={Zap} />
          <StatCard label="Points Redeemed" value={fmt(loyaltyStats.redeemed)} color="#ef4444" icon={Gift} />
          <StatCard label="Redemption Rate" value={`${loyaltyStats.rate}%`} color="#3b82f6" icon={BarChart3} />
        </div>

        {/* Digital Loyalty Card Preview */}
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            <CreditCard size={18} style={{ marginRight: 8, display: 'inline', verticalAlign: 'text-bottom' }} />
            Digital Loyalty Card Preview
          </h3>
          <LoyaltyCardPreview guests={allGuests} loyaltyForm={loyaltyForm} />
        </div>
      </>
    );

  // ══════════════════════════════════════════════════════════
  //  RENDER: CAMPAIGNS TAB
  // ══════════════════════════════════════════════════════════
  const renderCampaigns = () => (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Campaigns ({allCampaigns.length})
          </h3>
          <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Automated & manual campaigns for guest engagement
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingCampaign(null); setShowCampaignModal(true); }}>
          <Plus size={15} /> Create Campaign
        </button>
      </div>

      {allCampaigns.length === 0 ? (
        <div className="card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Megaphone size={44} strokeWidth={1} style={{ marginBottom: 12, opacity: 0.3 }} />
          <div style={{ fontWeight: 600, marginBottom: '6px' }}>No Campaigns Yet</div>
          <div style={{ fontSize: '0.82rem' }}>Create your first campaign to engage with guests.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '14px' }}>
          {allCampaigns.map(c => {
            const statusColors = {
              active: { bg: 'rgba(34,197,94,0.08)', text: '#22c55e', border: 'rgba(34,197,94,0.2)' },
              paused: { bg: 'rgba(245,158,11,0.08)', text: '#f59e0b', border: 'rgba(245,158,11,0.2)' },
              draft: { bg: 'rgba(100,116,139,0.08)', text: '#64748b', border: 'rgba(100,116,139,0.2)' },
            };
            const typeIcons = { Birthday: Gift, Anniversary: Heart, 'Win-back': RefreshCw, Promotional: Megaphone };
            const TypeIcon = typeIcons[c.type] || Megaphone;
            const sc = statusColors[c.status] || statusColors.draft;

            return (
              <div key={c.id} className="card" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(124,58,237,0.08)', color: 'var(--primary)' }}>
                      <TypeIcon size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{c.name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{c.type}</div>
                    </div>
                  </div>
                  <span style={{
                    padding: '3px 10px', borderRadius: '20px', fontSize: '0.68rem', fontWeight: 700,
                    background: sc.bg, color: sc.text, border: `1px solid ${sc.border}`,
                    textTransform: 'capitalize',
                  }}>{c.status}</span>
                </div>

                {c.message && (
                  <div style={{
                    padding: '10px 12px', borderRadius: '8px', background: 'rgba(0,0,0,0.02)',
                    fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '12px',
                    border: '1px solid var(--border-subtle)', lineHeight: 1.5,
                    overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  }}>
                    {c.message}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '16px', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '12px', flexWrap: 'wrap' }}>
                  {c.discount > 0 && <span><Percent size={11} style={{ marginRight: 3 }} />{c.discount}% off</span>}
                  <span><Target size={11} style={{ marginRight: 3 }} />{c.segment || 'All'}</span>
                  {c.sentCount > 0 && <span><Send size={11} style={{ marginRight: 3 }} />Sent: {c.sentCount}</span>}
                  {c.openRate > 0 && <span><Eye size={11} style={{ marginRight: 3 }} />Open: {c.openRate}%</span>}
                </div>

                <div style={{ display: 'flex', gap: '6px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => handleToggleCampaign(c)}>
                    {c.status === 'active' ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Activate</>}
                  </button>
                  <button className="btn btn-sm btn-secondary" onClick={() => { setEditingCampaign(c); setShowCampaignModal(true); }}>
                    <Edit2 size={12} /> Edit
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDeleteCampaign(c.id)}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  // ══════════════════════════════════════════════════════════
  //  RENDER: SEGMENTATION TAB
  // ══════════════════════════════════════════════════════════
  const renderSegmentation = () => (
    <>
      {/* Pre-built segments */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {preBuiltSegments.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.name} className="card" style={{ padding: '16px', cursor: 'pointer', transition: 'all 0.15s' }}
              onClick={s.apply}
              onMouseOver={e => e.currentTarget.style.borderColor = s.color}
              onMouseOut={e => e.currentTarget.style.borderColor = 'transparent'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${s.color}15`, color: s.color }}>
                  <Icon size={17} />
                </div>
                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{s.name}</span>
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.color }}>{s.count}</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>guests</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Segment Builder */}
        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            <Filter size={16} style={{ marginRight: 8, display: 'inline', verticalAlign: 'text-bottom' }} />
            Segment Builder
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div className="input-group">
              <label className="input-label">Min Visits</label>
              <input className="input-field" type="number" min={0} value={segFilters.minVisits} onChange={e => setSegFilters(f => ({ ...f, minVisits: e.target.value }))} placeholder="e.g. 5" />
            </div>
            <div className="input-group">
              <label className="input-label">Max Visits</label>
              <input className="input-field" type="number" min={0} value={segFilters.maxVisits} onChange={e => setSegFilters(f => ({ ...f, maxVisits: e.target.value }))} placeholder="e.g. 20" />
            </div>
            <div className="input-group">
              <label className="input-label">Min Spend (₹)</label>
              <input className="input-field" type="number" min={0} value={segFilters.minSpend} onChange={e => setSegFilters(f => ({ ...f, minSpend: e.target.value }))} placeholder="e.g. 5000" />
            </div>
            <div className="input-group">
              <label className="input-label">Max Spend (₹)</label>
              <input className="input-field" type="number" min={0} value={segFilters.maxSpend} onChange={e => setSegFilters(f => ({ ...f, maxSpend: e.target.value }))} placeholder="e.g. 50000" />
            </div>
            <div className="input-group">
              <label className="input-label">Last Visit (days ago+)</label>
              <input className="input-field" type="number" min={0} value={segFilters.lastVisitDays} onChange={e => setSegFilters(f => ({ ...f, lastVisitDays: e.target.value }))} placeholder="e.g. 30" />
            </div>
            <div className="input-group">
              <label className="input-label">Loyalty Tier</label>
              <select className="input-field" value={segFilters.tier} onChange={e => setSegFilters(f => ({ ...f, tier: e.target.value }))}>
                <option value="All">All Tiers</option>
                {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Channel</label>
              <select className="input-field" value={segFilters.channel} onChange={e => setSegFilters(f => ({ ...f, channel: e.target.value }))}>
                <option value="All">All Channels</option>
                {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <TagSelect label="Tags" value={segFilters.tags} onChange={v => setSegFilters(f => ({ ...f, tags: v }))} options={ALL_TAGS} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setSegFilters({ minVisits: '', maxVisits: '', minSpend: '', maxSpend: '', lastVisitDays: '', tier: 'All', tags: [], channel: 'All' })}>
              <X size={13} /> Clear Filters
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => {
              setEditingCampaign(null);
              setShowCampaignModal(true);
            }}>
              <Send size={13} /> Send Campaign
            </button>
          </div>
        </div>

        {/* Preview */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Matching Guests
            </h3>
            <span style={{
              padding: '4px 12px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 800,
              background: 'rgba(124,58,237,0.1)', color: 'var(--primary)',
            }}>{segmentedGuests.length}</span>
          </div>

          {segmentedGuests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              <Users size={36} strokeWidth={1} style={{ marginBottom: 10, opacity: 0.4 }} />
              <p style={{ fontSize: '0.82rem' }}>No guests match the current filters.</p>
            </div>
          ) : (
            <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
              {segmentedGuests.slice(0, 50).map(g => (
                <div key={g.id} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 12px', borderRadius: '10px', marginBottom: '4px',
                  cursor: 'pointer',
                }}
                  onClick={() => openProfile(g)}
                  onMouseOver={e => e.currentTarget.style.background = 'rgba(124,58,237,0.03)'}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                >
                  <Avatar name={g.name} size={30} tier={g.tier} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)' }}>{g.name}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      {g.visitCount || 0} visits &middot; {fmtCurrency(g.totalSpend)}
                    </div>
                  </div>
                  <TierBadge tier={g.tier} small />
                </div>
              ))}
              {segmentedGuests.length > 50 && (
                <div style={{ textAlign: 'center', padding: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  ... and {segmentedGuests.length - 50} more guests
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );

  // ══════════════════════════════════════════════════════════
  //  MAIN RENDER
  // ══════════════════════════════════════════════════════════
  return (
    <div className="animate-fade-up">
      {/* Header */}
      <div className="page-title-row" style={{ marginBottom: '16px' }}>
        <div>
          <h1 className="page-title">CRM & Guest Management</h1>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            {allGuests.length} guest{allGuests.length !== 1 ? 's' : ''} &middot; Loyalty, campaigns & guest intelligence
          </p>
        </div>
        {activeTab === 'directory' && (
          <button className="btn btn-primary" onClick={() => { setEditingGuest(null); setShowGuestModal(true); }}>
            <Plus size={15} /> Add Guest
          </button>
        )}
      </div>

      {/* Tab Navigation */}
      <div style={{
        display: 'flex', gap: '2px', marginBottom: '20px',
        borderBottom: '1px solid var(--border-subtle)',
        overflowX: 'auto',
      }}>
        {TABS.map(t => {
          const Icon = t.icon;
          const isDisabled = t.id === 'profile' && !selectedGuest;
          return (
            <button
              key={t.id}
              onClick={() => !isDisabled && setActiveTab(t.id)}
              style={{
                padding: '10px 18px', border: 'none', background: 'none', cursor: isDisabled ? 'default' : 'pointer',
                fontWeight: activeTab === t.id ? 700 : 500, fontSize: '0.82rem',
                color: isDisabled ? 'var(--text-muted)' : activeTab === t.id ? 'var(--primary)' : 'var(--text-secondary)',
                borderBottom: activeTab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
                marginBottom: '-1px', display: 'flex', alignItems: 'center', gap: '6px',
                whiteSpace: 'nowrap', opacity: isDisabled ? 0.4 : 1,
                transition: 'all 0.15s',
              }}
            >
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'directory' && renderDirectory()}
      {activeTab === 'profile' && renderProfile()}
      {activeTab === 'loyalty' && renderLoyalty()}
      {activeTab === 'campaigns' && renderCampaigns()}
      {activeTab === 'segmentation' && renderSegmentation()}

      {/* ── Modals ────────────────────────────────────────── */}
      {showGuestModal && (
        <GuestFormModal
          guest={editingGuest}
          onSave={editingGuest ? (data) => handleEditGuest(data) : handleAddGuest}
          onClose={() => { setShowGuestModal(false); setEditingGuest(null); }}
        />
      )}

      {showCampaignModal && (
        <CampaignFormModal
          campaign={editingCampaign}
          segments={segmentNames}
          onSave={handleSaveCampaign}
          onClose={() => { setShowCampaignModal(false); setEditingCampaign(null); }}
        />
      )}

      {invoiceOrder && (
        <InvoiceModal order={invoiceOrder} onClose={() => setInvoiceOrder(null)} settings={settings} />
      )}

      {deleteConfirm && (
        <Modal title="Confirm Delete" onClose={() => setDeleteConfirm(null)}>
          <div className="modal-body">
            <p style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>
              Are you sure you want to delete <strong>{deleteConfirm.name}</strong>? This action cannot be undone.
            </p>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => handleDeleteGuest(deleteConfirm.id)}>
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
//  LOYALTY CARD PREVIEW (phone lookup simulation)
// ══════════════════════════════════════════════════════════════
const LoyaltyCardPreview = ({ guests, loyaltyForm }) => {
  const [phone, setPhone] = useState('');
  const [found, setFound] = useState(null);

  const lookup = () => {
    const g = guests.find(g => (g.phone || '').replace(/\s/g, '').includes(phone.replace(/\s/g, '')));
    setFound(g || 'not_found');
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input className="input-field" value={phone} onChange={e => setPhone(e.target.value)}
          placeholder="Enter phone number to lookup..." style={{ flex: 1 }} />
        <button className="btn btn-primary btn-sm" onClick={lookup} disabled={!phone.trim()}>
          <Search size={14} /> Lookup
        </button>
      </div>

      {found && found !== 'not_found' && (
        <div style={{
          padding: '24px', borderRadius: '16px',
          background: 'linear-gradient(135deg, #7c3aed, #a855f7, #c084fc)',
          color: 'white', position: 'relative', overflow: 'hidden',
        }}>
          {/* Background decoration */}
          <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ position: 'absolute', bottom: -30, left: -30, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '0.68rem', opacity: 0.8, fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' }}>Kitchgoo Loyalty</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: '4px' }}>{found.name}</div>
              </div>
              <TierBadge tier={guestTier(found)} />
            </div>
            <div style={{ display: 'flex', gap: '24px' }}>
              <div>
                <div style={{ fontSize: '0.65rem', opacity: 0.7 }}>Points</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{fmt(guestPoints(found))}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.65rem', opacity: 0.7 }}>Visits</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{found.visitCount || 0}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.65rem', opacity: 0.7 }}>Value</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{fmtCurrency(found.totalSpend)}</div>
              </div>
            </div>
            <div style={{ marginTop: '12px', fontSize: '0.72rem', opacity: 0.7 }}>
              {found.phone}
            </div>
          </div>
        </div>
      )}

      {found === 'not_found' && (
        <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.02)', borderRadius: '12px' }}>
          <AlertCircle size={28} style={{ marginBottom: 8, opacity: 0.4 }} />
          <div style={{ fontSize: '0.85rem' }}>No guest found with that phone number.</div>
        </div>
      )}
    </div>
  );
};

export default Guests;
