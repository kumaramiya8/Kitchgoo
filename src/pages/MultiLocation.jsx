import React, { useState, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom';
import {
  MapPin, Building2, Plus, X, Edit2, Save, Search, Crown, Phone,
  User, TrendingUp, TrendingDown, BarChart3, ShoppingCart, ChefHat,
  Truck, FileText, Check, CheckCircle, XCircle, ArrowRight, Star,
  IndianRupee, Layers, ChevronDown, Package, Send, Clock, RefreshCw,
  AlertTriangle, Settings2, Globe, Factory, Warehouse, Receipt,
  DollarSign, Percent, Eye, Filter, Copy, ChevronRight, Hash,
  ArrowUpDown, CircleDot, Zap, BadgeCheck
} from 'lucide-react';
import { useApp } from '../db/AppContext';

// ── Helpers ─────────────────────────────────────────────────────
const fmt = (n) => {
  if (n == null || isNaN(n)) return '\u20B90';
  if (n >= 10000000) return `\u20B9${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `\u20B9${(n / 100000).toFixed(1)}L`;
  return `\u20B9${Math.round(n).toLocaleString('en-IN')}`;
};
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '--';
const genLocalId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// ── Portal Modal ────────────────────────────────────────────────
const Modal = ({ title, onClose, children, wide }) => ReactDOM.createPortal(
  <div className="modal-backdrop" onClick={onClose}>
    <div className="modal" style={wide ? { maxWidth: 720, width: '95%' } : {}} onClick={e => e.stopPropagation()}>
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

// ── Badge ───────────────────────────────────────────────────────
const StatusBadge = ({ status, small }) => {
  const map = {
    active: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', label: 'Active' },
    inactive: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', label: 'Inactive' },
    paid: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', label: 'Paid' },
    pending: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', label: 'Pending' },
    overdue: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', label: 'Overdue' },
    placed: { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6', label: 'Placed' },
    'in-production': { bg: 'rgba(124,58,237,0.12)', color: '#7c3aed', label: 'In Production' },
    ready: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', label: 'Ready' },
    dispatched: { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6', label: 'Dispatched' },
    received: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', label: 'Received' },
  };
  const s = map[status] || { bg: 'rgba(148,163,184,0.12)', color: '#94a3b8', label: status };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: small ? '2px 8px' : '3px 10px',
      borderRadius: 20, fontSize: small ? 11 : 12, fontWeight: 600,
      background: s.bg, color: s.color,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />
      {s.label}
    </span>
  );
};

// ── Stat Card ───────────────────────────────────────────────────
const StatCard = ({ icon: Icon, label, value, color, sub }) => (
  <div style={{
    flex: 1, minWidth: 160, padding: 16, borderRadius: 14,
    background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
    backdropFilter: 'blur(12px)',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={18} color={color} />
      </div>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
    </div>
    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
  </div>
);

// ── Tab Config ──────────────────────────────────────────────────
const TABS = [
  { key: 'locations', label: 'Locations', icon: MapPin },
  { key: 'master-menu', label: 'Master Menu', icon: ChefHat },
  { key: 'global-reports', label: 'Global Reports', icon: BarChart3 },
  { key: 'franchise', label: 'Franchise', icon: Building2 },
  { key: 'commissary', label: 'Commissary', icon: Factory },
];

const COMMISSARY_FLOW = ['placed', 'in-production', 'ready', 'dispatched', 'received'];

// ── Demo Data Generators ────────────────────────────────────────
const DEMO_LOCATIONS = [
  { id: 'loc_hq', name: 'Kitchgoo Downtown HQ', address: '12 MG Road, Bengaluru 560001', phone: '+91 80 4567 8900', manager: 'Arjun Mehta', status: 'active', isHQ: true, revenue: 1845000, orderCount: 2340 },
  { id: 'loc_2', name: 'Kitchgoo Koramangala', address: '5th Block, Koramangala, Bengaluru 560034', phone: '+91 80 4567 8901', manager: 'Priya Sharma', status: 'active', isHQ: false, revenue: 1230000, orderCount: 1780 },
  { id: 'loc_3', name: 'Kitchgoo Indiranagar', address: '100 Feet Road, Indiranagar, Bengaluru 560038', phone: '+91 80 4567 8902', manager: 'Vikram Das', status: 'active', isHQ: false, revenue: 980000, orderCount: 1450 },
  { id: 'loc_4', name: 'Kitchgoo Whitefield', address: 'ITPL Main Road, Whitefield, Bengaluru 560066', phone: '+91 80 4567 8903', manager: 'Neha Reddy', status: 'inactive', isHQ: false, revenue: 420000, orderCount: 620 },
];

const DEMO_ROYALTY_INVOICES = [
  { id: 'ri_1', locationId: 'loc_2', locationName: 'Kitchgoo Koramangala', period: 'Mar 2026', grossSales: 1230000, royaltyPct: 6, amountDue: 73800, status: 'paid' },
  { id: 'ri_2', locationId: 'loc_3', locationName: 'Kitchgoo Indiranagar', period: 'Mar 2026', grossSales: 980000, royaltyPct: 6, amountDue: 58800, status: 'pending' },
  { id: 'ri_3', locationId: 'loc_4', locationName: 'Kitchgoo Whitefield', period: 'Mar 2026', grossSales: 420000, royaltyPct: 5, amountDue: 21000, status: 'overdue' },
  { id: 'ri_4', locationId: 'loc_2', locationName: 'Kitchgoo Koramangala', period: 'Feb 2026', grossSales: 1180000, royaltyPct: 6, amountDue: 70800, status: 'paid' },
  { id: 'ri_5', locationId: 'loc_3', locationName: 'Kitchgoo Indiranagar', period: 'Feb 2026', grossSales: 910000, royaltyPct: 6, amountDue: 54600, status: 'paid' },
];

const DEMO_COMMISSARY_ORDERS = [
  { id: 'co_1', fromLocation: 'Kitchgoo Koramangala', fromId: 'loc_2', items: [{ name: 'Paneer Tikka Base', qty: 50 }, { name: 'Dal Makhani Premix', qty: 30 }], status: 'received', date: '2026-03-28T10:30:00' },
  { id: 'co_2', fromLocation: 'Kitchgoo Indiranagar', fromId: 'loc_3', items: [{ name: 'Naan Dough', qty: 200 }, { name: 'Tandoori Marinade', qty: 25 }], status: 'dispatched', date: '2026-03-29T08:00:00' },
  { id: 'co_3', fromLocation: 'Kitchgoo Whitefield', fromId: 'loc_4', items: [{ name: 'Biryani Masala Mix', qty: 40 }], status: 'in-production', date: '2026-03-30T06:15:00' },
  { id: 'co_4', fromLocation: 'Kitchgoo Koramangala', fromId: 'loc_2', items: [{ name: 'Naan Dough', qty: 150 }, { name: 'Paneer Tikka Base', qty: 40 }, { name: 'Raita Premix', qty: 20 }], status: 'placed', date: '2026-03-30T09:00:00' },
];

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function MultiLocation() {
  const { locations: ctxLocations, menu, orders, settings, addLocation, editLocation } = useApp();

  const [activeTab, setActiveTab] = useState('locations');
  const [search, setSearch] = useState('');

  // Use context locations if available, fallback to demo
  const locations = useMemo(() => {
    if (ctxLocations && ctxLocations.length > 0) return ctxLocations;
    return DEMO_LOCATIONS;
  }, [ctxLocations]);

  // ── Location Modal State ─────────────────────────────────────
  const [locModal, setLocModal] = useState(null); // null | 'add' | location object
  const [locForm, setLocForm] = useState({ name: '', address: '', phone: '', manager: '', status: 'active', isHQ: false });

  const openAddLocation = () => {
    setLocForm({ name: '', address: '', phone: '', manager: '', status: 'active', isHQ: false });
    setLocModal('add');
  };
  const openEditLocation = (loc) => {
    setLocForm({ name: loc.name, address: loc.address || '', phone: loc.phone || '', manager: loc.manager || '', status: loc.status || 'active', isHQ: !!loc.isHQ });
    setLocModal(loc);
  };
  const saveLocation = async () => {
    if (!locForm.name.trim()) return;
    if (locModal === 'add') {
      await addLocation({ ...locForm, revenue: 0, orderCount: 0, id: genLocalId() });
    } else {
      await editLocation(locModal.id, locForm);
    }
    setLocModal(null);
  };

  // ── Master Menu State ────────────────────────────────────────
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [priceOverrides, setPriceOverrides] = useState({});
  const [pushSuccess, setPushSuccess] = useState('');

  const toggleLocSelection = (id) => {
    setSelectedLocations(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const selectAllLocs = () => setSelectedLocations(locations.map(l => l.id));
  const deselectAllLocs = () => setSelectedLocations([]);

  const handlePushMenu = () => {
    const target = selectedLocations.length === 0 ? 'all locations' : `${selectedLocations.length} location(s)`;
    setPushSuccess(`Menu successfully pushed to ${target}`);
    setTimeout(() => setPushSuccess(''), 3000);
  };

  const toggleOverride = (locId, itemId) => {
    const key = `${locId}_${itemId}`;
    setPriceOverrides(prev => {
      const copy = { ...prev };
      if (copy[key]) { delete copy[key]; } else { copy[key] = { price: '' }; }
      return copy;
    });
  };
  const setOverridePrice = (locId, itemId, price) => {
    const key = `${locId}_${itemId}`;
    setPriceOverrides(prev => ({ ...prev, [key]: { price } }));
  };

  // ── Global Reports State ─────────────────────────────────────
  const [reportPeriod, setReportPeriod] = useState('this-month');

  // ── Franchise State ──────────────────────────────────────────
  const [royaltyConfig, setRoyaltyConfig] = useState({});
  const [royaltyInvoices, setRoyaltyInvoices] = useState(DEMO_ROYALTY_INVOICES);
  const [showGenInvoice, setShowGenInvoice] = useState(false);
  const [genInvoiceForm, setGenInvoiceForm] = useState({ locationId: '', period: '', royaltyPct: 6 });

  const generateInvoice = () => {
    const loc = locations.find(l => l.id === genInvoiceForm.locationId);
    if (!loc) return;
    const grossSales = loc.revenue || 0;
    const amountDue = grossSales * (genInvoiceForm.royaltyPct / 100);
    setRoyaltyInvoices(prev => [{
      id: genLocalId(), locationId: loc.id, locationName: loc.name,
      period: genInvoiceForm.period || 'Mar 2026', grossSales, royaltyPct: genInvoiceForm.royaltyPct,
      amountDue, status: 'pending',
    }, ...prev]);
    setShowGenInvoice(false);
  };

  // ── Commissary State ─────────────────────────────────────────
  const [commOrders, setCommOrders] = useState(DEMO_COMMISSARY_ORDERS);
  const [showCommOrder, setShowCommOrder] = useState(false);
  const [commForm, setCommForm] = useState({ fromId: '', items: [{ name: '', qty: 1 }] });

  const addCommItem = () => setCommForm(f => ({ ...f, items: [...f.items, { name: '', qty: 1 }] }));
  const removeCommItem = (idx) => setCommForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  const updateCommItem = (idx, field, val) => {
    setCommForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, [field]: val } : it) }));
  };

  const placeCommOrder = () => {
    const loc = locations.find(l => l.id === commForm.fromId);
    if (!loc || commForm.items.every(i => !i.name.trim())) return;
    setCommOrders(prev => [{
      id: genLocalId(), fromLocation: loc.name, fromId: loc.id,
      items: commForm.items.filter(i => i.name.trim()).map(i => ({ name: i.name, qty: Number(i.qty) || 1 })),
      status: 'placed', date: new Date().toISOString(),
    }, ...prev]);
    setShowCommOrder(false);
    setCommForm({ fromId: '', items: [{ name: '', qty: 1 }] });
  };

  const advanceCommStatus = (orderId) => {
    setCommOrders(prev => prev.map(o => {
      if (o.id !== orderId) return o;
      const idx = COMMISSARY_FLOW.indexOf(o.status);
      if (idx < 0 || idx >= COMMISSARY_FLOW.length - 1) return o;
      return { ...o, status: COMMISSARY_FLOW[idx + 1] };
    }));
  };

  // ── Derived Data ─────────────────────────────────────────────
  const activeLocations = locations.filter(l => l.status === 'active');
  const hqLocation = locations.find(l => l.isHQ);
  const totalRevenue = locations.reduce((s, l) => s + (l.revenue || 0), 0);
  const totalOrders = locations.reduce((s, l) => s + (l.orderCount || 0), 0);

  const filteredLocations = useMemo(() => {
    if (!search.trim()) return locations;
    const q = search.toLowerCase();
    return locations.filter(l =>
      l.name?.toLowerCase().includes(q) || l.address?.toLowerCase().includes(q) || l.manager?.toLowerCase().includes(q)
    );
  }, [locations, search]);

  const sortedByRevenue = useMemo(() =>
    [...locations].sort((a, b) => (b.revenue || 0) - (a.revenue || 0)),
    [locations]
  );

  const menuItems = useMemo(() => menu || [], [menu]);

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="animate-fade-up" style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>

      {/* ── Header ─────────────────────────────────────── */}
      <div className="page-title-row">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Globe size={28} color="var(--primary)" /> Multi-Location & Franchise
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '4px 0 0' }}>
            Manage all locations, menus, reports, royalties, and commissary operations
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{
            padding: '8px 16px', borderRadius: 10, background: 'var(--card-bg)',
            border: '1px solid var(--border-subtle)', fontSize: 13, color: 'var(--text-secondary)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Building2 size={15} /> {locations.length} Locations
          </div>
          <div style={{
            padding: '8px 16px', borderRadius: 10, background: 'rgba(34,197,94,0.1)',
            border: '1px solid rgba(34,197,94,0.2)', fontSize: 13, color: '#22c55e',
            display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600,
          }}>
            <CheckCircle size={15} /> {activeLocations.length} Active
          </div>
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 24, padding: 4, borderRadius: 14,
        background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
        backdropFilter: 'blur(12px)', overflowX: 'auto',
      }}>
        {TABS.map(t => {
          const Icon = t.icon;
          const active = activeTab === t.key;
          return (
            <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px',
              borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: active ? 'var(--primary)' : 'transparent',
              color: active ? '#fff' : 'var(--text-secondary)',
              transition: 'all 0.2s', whiteSpace: 'nowrap',
            }}>
              <Icon size={16} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════
         TAB: LOCATIONS
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'locations' && (
        <div>
          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input className="input-field" placeholder="Search locations..." value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: 36, width: '100%' }} />
            </div>
            <button className="btn btn-primary" onClick={openAddLocation}>
              <Plus size={16} /> Add Location
            </button>
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
            <StatCard icon={Building2} label="Total Locations" value={locations.length} color="var(--primary)" sub={`${activeLocations.length} active`} />
            <StatCard icon={IndianRupee} label="Total Revenue" value={fmt(totalRevenue)} color="var(--success)" />
            <StatCard icon={ShoppingCart} label="Total Orders" value={totalOrders.toLocaleString('en-IN')} color="var(--accent-blue)" />
            <StatCard icon={TrendingUp} label="Avg Check" value={fmt(totalOrders > 0 ? totalRevenue / totalOrders : 0)} color="var(--warning)" />
          </div>

          {/* Map Placeholder */}
          <div style={{
            borderRadius: 16, padding: 32, marginBottom: 24, textAlign: 'center',
            background: 'linear-gradient(135deg, rgba(124,58,237,0.06), rgba(59,130,246,0.06))',
            border: '1px dashed var(--border-subtle)', position: 'relative', overflow: 'hidden',
            minHeight: 200,
          }}>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <MapPin size={40} color="var(--primary)" style={{ marginBottom: 12, opacity: 0.7 }} />
              <h3 style={{ color: 'var(--text-primary)', margin: '0 0 6px', fontSize: 16 }}>Location Map</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0, maxWidth: 400, marginInline: 'auto' }}>
                Interactive map showing all location pins. Integration with mapping API available.
              </p>
            </div>
            {/* Location pins */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 20, flexWrap: 'wrap' }}>
              {locations.map((loc, i) => (
                <div key={loc.id || i} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                  borderRadius: 20, background: loc.isHQ ? 'rgba(124,58,237,0.15)' : 'rgba(59,130,246,0.1)',
                  border: `1px solid ${loc.isHQ ? 'rgba(124,58,237,0.3)' : 'rgba(59,130,246,0.2)'}`,
                  fontSize: 12, fontWeight: 600, color: loc.isHQ ? 'var(--primary)' : 'var(--accent-blue)',
                }}>
                  <MapPin size={13} /> {loc.name?.split(' ').slice(-1)[0] || loc.name}
                  {loc.isHQ && <Crown size={11} />}
                </div>
              ))}
            </div>
          </div>

          {/* Location Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340, 1fr))', gap: 16, marginBottom: 28 }}>
            {filteredLocations.map(loc => (
              <div key={loc.id} className="card" style={{
                padding: 20, borderRadius: 16, position: 'relative',
                background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
                backdropFilter: 'blur(12px)', transition: 'transform 0.15s, box-shadow 0.15s',
              }}>
                {loc.isHQ && (
                  <div style={{
                    position: 'absolute', top: 12, right: 12, display: 'flex', alignItems: 'center', gap: 4,
                    padding: '3px 10px', borderRadius: 20, background: 'rgba(124,58,237,0.12)',
                    color: 'var(--primary)', fontSize: 11, fontWeight: 700,
                  }}>
                    <Crown size={12} /> HQ
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: loc.isHQ ? 'rgba(124,58,237,0.12)' : 'rgba(59,130,246,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Building2 size={20} color={loc.isHQ ? 'var(--primary)' : 'var(--accent-blue)'} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{loc.name}</h3>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.3 }}>
                      <MapPin size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />{loc.address}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  <StatusBadge status={loc.status || 'active'} small />
                  {loc.manager && (
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <User size={12} /> {loc.manager}
                    </span>
                  )}
                  {loc.phone && (
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Phone size={12} /> {loc.phone}
                    </span>
                  )}
                </div>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
                  padding: 12, borderRadius: 10, background: 'rgba(124,58,237,0.04)',
                  border: '1px solid rgba(124,58,237,0.08)', marginBottom: 12,
                }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Revenue</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(loc.revenue)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Orders</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{(loc.orderCount || 0).toLocaleString('en-IN')}</div>
                  </div>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => openEditLocation(loc)} style={{ width: '100%' }}>
                  <Edit2 size={13} /> Edit Location
                </button>
              </div>
            ))}
          </div>

          {/* Comparison Cards */}
          {locations.length > 1 && (
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <BarChart3 size={18} color="var(--primary)" /> Location Comparison
              </h3>
              <div className="table-wrapper" style={{ borderRadius: 14, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(124,58,237,0.06)' }}>
                      <th style={thStyle}>Location</th>
                      <th style={thStyle}>Status</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Revenue</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Orders</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Avg Check</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedByRevenue.map(loc => (
                      <tr key={loc.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 600 }}>{loc.name}</span>
                            {loc.isHQ && <Crown size={13} color="var(--primary)" />}
                          </div>
                        </td>
                        <td style={tdStyle}><StatusBadge status={loc.status || 'active'} small /></td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmt(loc.revenue)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{(loc.orderCount || 0).toLocaleString('en-IN')}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          {fmt(loc.orderCount > 0 ? (loc.revenue || 0) / loc.orderCount : 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
         TAB: MASTER MENU
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'master-menu' && (
        <div>
          {/* Stats */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
            <StatCard icon={ChefHat} label="Master Menu Items" value={menuItems.length} color="var(--primary)" />
            <StatCard icon={Building2} label="Locations" value={locations.length} color="var(--accent-blue)" />
            <StatCard icon={Layers} label="Price Overrides" value={Object.keys(priceOverrides).length} color="var(--warning)" />
          </div>

          {pushSuccess && (
            <div style={{
              padding: '12px 16px', borderRadius: 10, marginBottom: 16,
              background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)',
              color: '#22c55e', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <CheckCircle size={16} /> {pushSuccess}
            </div>
          )}

          {/* Push Controls */}
          <div style={{
            padding: 20, borderRadius: 14, marginBottom: 24,
            background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
            backdropFilter: 'blur(12px)',
          }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Send size={16} color="var(--primary)" /> Push Menu to Locations
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 14 }}>
              Select locations to push the current master menu. Uncheck all to push to every location.
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <button className="btn btn-sm btn-secondary" onClick={selectAllLocs}>Select All</button>
              <button className="btn btn-sm btn-secondary" onClick={deselectAllLocs}>Deselect All</button>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              {locations.map(loc => (
                <label key={loc.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                  borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 500,
                  background: selectedLocations.includes(loc.id) ? 'rgba(124,58,237,0.1)' : 'rgba(100,116,139,0.06)',
                  border: `1px solid ${selectedLocations.includes(loc.id) ? 'rgba(124,58,237,0.3)' : 'var(--border-subtle)'}`,
                  color: selectedLocations.includes(loc.id) ? 'var(--primary)' : 'var(--text-secondary)',
                  transition: 'all 0.15s',
                }}>
                  <input type="checkbox" checked={selectedLocations.includes(loc.id)}
                    onChange={() => toggleLocSelection(loc.id)}
                    style={{ accentColor: 'var(--primary)' }} />
                  {loc.name} {loc.isHQ && <Crown size={11} />}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={handlePushMenu}>
                <Send size={15} /> Push to {selectedLocations.length || 'All'} Location{selectedLocations.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>

          {/* Price Overrides Table */}
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <IndianRupee size={16} color="var(--warning)" /> Location-Specific Price Overrides
          </h3>
          {menuItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 14 }}>
              No menu items found. Add items in the Menu page first.
            </div>
          ) : (
            <div className="table-wrapper" style={{ borderRadius: 14, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(124,58,237,0.06)' }}>
                    <th style={thStyle}>Location</th>
                    <th style={thStyle}>Item</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Master Price</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Local Price</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Override</th>
                  </tr>
                </thead>
                <tbody>
                  {locations.slice(0, 4).flatMap(loc =>
                    menuItems.slice(0, 5).map(item => {
                      const key = `${loc.id}_${item.id}`;
                      const hasOverride = !!priceOverrides[key];
                      return (
                        <tr key={key} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={tdStyle}>
                            <span style={{ fontWeight: 500 }}>{loc.name?.split(' ').slice(-1)[0]}</span>
                            {loc.isHQ && <Crown size={11} color="var(--primary)" style={{ marginLeft: 4 }} />}
                          </td>
                          <td style={tdStyle}>{item.name}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(item.price)}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>
                            {hasOverride ? (
                              <input type="number" value={priceOverrides[key]?.price || ''}
                                onChange={e => setOverridePrice(loc.id, item.id, e.target.value)}
                                placeholder={String(item.price)}
                                style={{
                                  width: 80, padding: '4px 8px', borderRadius: 6, fontSize: 13,
                                  border: '1px solid rgba(124,58,237,0.3)', textAlign: 'right',
                                  background: 'rgba(124,58,237,0.04)', outline: 'none',
                                }} />
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>--</span>
                            )}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            <button onClick={() => toggleOverride(loc.id, item.id)} style={{
                              width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                              background: hasOverride ? 'var(--primary)' : 'var(--border-subtle)',
                              position: 'relative', transition: 'background 0.2s',
                            }}>
                              <div style={{
                                width: 16, height: 16, borderRadius: '50%', background: '#fff',
                                position: 'absolute', top: 2,
                                left: hasOverride ? 18 : 2, transition: 'left 0.2s',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                              }} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
         TAB: GLOBAL REPORTS
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'global-reports' && (
        <div>
          {/* Period Selector */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 24, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>Period:</span>
            {['this-week', 'this-month', 'this-quarter', 'this-year'].map(p => (
              <button key={p} onClick={() => setReportPeriod(p)} style={{
                padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600,
                background: reportPeriod === p ? 'var(--primary)' : 'rgba(100,116,139,0.08)',
                color: reportPeriod === p ? '#fff' : 'var(--text-secondary)',
                transition: 'all 0.15s',
              }}>
                {p.replace('this-', '').replace(/^\w/, c => c.toUpperCase())}
              </button>
            ))}
          </div>

          {/* Consolidated Stats */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
            <StatCard icon={IndianRupee} label="Consolidated Revenue" value={fmt(totalRevenue)} color="var(--success)" sub={`Across ${locations.length} locations`} />
            <StatCard icon={ShoppingCart} label="Total Orders" value={totalOrders.toLocaleString('en-IN')} color="var(--accent-blue)" />
            <StatCard icon={TrendingUp} label="Avg Check" value={fmt(totalOrders > 0 ? totalRevenue / totalOrders : 0)} color="var(--warning)" />
            <StatCard icon={Star} label="Top Location" value={sortedByRevenue[0]?.name?.split(' ').pop() || '--'} color="var(--primary)" sub={fmt(sortedByRevenue[0]?.revenue)} />
          </div>

          {/* Side-by-Side Comparison */}
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart3 size={16} color="var(--primary)" /> Side-by-Side Comparison
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(locations.length, 4)}, 1fr)`, gap: 14, marginBottom: 28 }}>
            {sortedByRevenue.slice(0, 4).map(loc => {
              const avgCheck = loc.orderCount > 0 ? (loc.revenue || 0) / loc.orderCount : 0;
              const revShare = totalRevenue > 0 ? ((loc.revenue || 0) / totalRevenue * 100) : 0;
              return (
                <div key={loc.id} style={{
                  padding: 18, borderRadius: 14,
                  background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
                  backdropFilter: 'blur(12px)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: loc.isHQ ? 'rgba(124,58,237,0.12)' : 'rgba(59,130,246,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Building2 size={16} color={loc.isHQ ? 'var(--primary)' : 'var(--accent-blue)'} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{loc.name?.split(' ').pop()}</div>
                      {loc.isHQ && <span style={{ fontSize: 10, color: 'var(--primary)', fontWeight: 600 }}>HQ</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Revenue</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(loc.revenue)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Orders</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{(loc.orderCount || 0).toLocaleString('en-IN')}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Avg Check</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(avgCheck)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Revenue Share</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ flex: 1, height: 6, background: 'var(--border-subtle)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${revShare}%`, height: '100%', background: 'var(--primary)', borderRadius: 3, transition: 'width 0.3s' }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>{revShare.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Performance Ranking */}
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ArrowUpDown size={16} color="var(--warning)" /> Performance Ranking
          </h3>
          <div className="table-wrapper" style={{ borderRadius: 14, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(124,58,237,0.06)' }}>
                  <th style={thStyle}>Rank</th>
                  <th style={thStyle}>Location</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Revenue</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Orders</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Avg Check</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Rev Share</th>
                </tr>
              </thead>
              <tbody>
                {sortedByRevenue.map((loc, i) => {
                  const avgCheck = loc.orderCount > 0 ? (loc.revenue || 0) / loc.orderCount : 0;
                  const revShare = totalRevenue > 0 ? ((loc.revenue || 0) / totalRevenue * 100) : 0;
                  return (
                    <tr key={loc.id} style={{ borderBottom: '1px solid var(--border-subtle)', background: i === 0 ? 'rgba(34,197,94,0.04)' : 'transparent' }}>
                      <td style={tdStyle}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 26, height: 26, borderRadius: '50%', fontWeight: 700, fontSize: 12,
                          background: i === 0 ? 'rgba(245,158,11,0.15)' : i === 1 ? 'rgba(148,163,184,0.12)' : i === 2 ? 'rgba(205,127,50,0.12)' : 'rgba(100,116,139,0.06)',
                          color: i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : i === 2 ? '#CD7F32' : 'var(--text-muted)',
                        }}>
                          {i + 1}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 600 }}>{loc.name}</span>
                          {loc.isHQ && <Crown size={13} color="var(--primary)" />}
                        </div>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmt(loc.revenue)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{(loc.orderCount || 0).toLocaleString('en-IN')}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(avgCheck)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{revShare.toFixed(1)}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
         TAB: FRANCHISE
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'franchise' && (
        <div>
          {/* Royalty Config */}
          <div style={{
            padding: 20, borderRadius: 14, marginBottom: 24,
            background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
            backdropFilter: 'blur(12px)',
          }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Percent size={16} color="var(--primary)" /> Royalty Configuration
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 14 }}>
              Set royalty percentage per franchise location. Royalties are calculated on gross sales.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {locations.filter(l => !l.isHQ).map(loc => (
                <div key={loc.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                  borderRadius: 10, background: 'rgba(124,58,237,0.04)', border: '1px solid rgba(124,58,237,0.08)',
                }}>
                  <Building2 size={16} color="var(--accent-blue)" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{loc.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Gross: {fmt(loc.revenue)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input type="number" min="0" max="100" step="0.5"
                      value={royaltyConfig[loc.id] ?? 6}
                      onChange={e => setRoyaltyConfig(prev => ({ ...prev, [loc.id]: parseFloat(e.target.value) || 0 }))}
                      style={{
                        width: 56, padding: '4px 8px', borderRadius: 6, fontSize: 13,
                        border: '1px solid var(--border-subtle)', textAlign: 'right',
                        background: 'rgba(255,255,255,0.8)', outline: 'none',
                      }} />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>%</span>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 70 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>
                      {fmt((loc.revenue || 0) * (royaltyConfig[loc.id] ?? 6) / 100)}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>due</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Generate Invoice Button */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <button className="btn btn-primary" onClick={() => {
              setGenInvoiceForm({ locationId: '', period: 'Mar 2026', royaltyPct: 6 });
              setShowGenInvoice(true);
            }}>
              <Receipt size={15} /> Generate Royalty Invoice
            </button>
          </div>

          {/* Royalty Invoice List */}
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={16} color="var(--accent-blue)" /> Royalty Invoices
          </h3>
          <div className="table-wrapper" style={{ borderRadius: 14, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(124,58,237,0.06)' }}>
                  <th style={thStyle}>Location</th>
                  <th style={thStyle}>Period</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Gross Sales</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Royalty %</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Amount Due</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {royaltyInvoices.map(inv => (
                  <tr key={inv.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={tdStyle}><span style={{ fontWeight: 500 }}>{inv.locationName}</span></td>
                    <td style={tdStyle}>{inv.period}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(inv.grossSales)}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{inv.royaltyPct}%</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{fmt(inv.amountDue)}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}><StatusBadge status={inv.status} small /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div style={{ display: 'flex', gap: 14, marginTop: 20, flexWrap: 'wrap' }}>
            <StatCard icon={IndianRupee} label="Total Royalty Due"
              value={fmt(royaltyInvoices.filter(i => i.status !== 'paid').reduce((s, i) => s + i.amountDue, 0))}
              color="var(--warning)" sub={`${royaltyInvoices.filter(i => i.status === 'pending').length} pending`} />
            <StatCard icon={CheckCircle} label="Collected"
              value={fmt(royaltyInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amountDue, 0))}
              color="var(--success)" />
            <StatCard icon={AlertTriangle} label="Overdue"
              value={fmt(royaltyInvoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.amountDue, 0))}
              color="var(--danger)" />
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
         TAB: COMMISSARY
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'commissary' && (
        <div>
          {/* Header */}
          <div style={{
            padding: 20, borderRadius: 14, marginBottom: 24,
            background: 'linear-gradient(135deg, rgba(124,58,237,0.08), rgba(59,130,246,0.06))',
            border: '1px solid rgba(124,58,237,0.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <Factory size={22} color="var(--primary)" />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Central Kitchen / Commissary</h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}>
              Satellite locations place internal orders to the HQ kitchen. Track preparation and dispatch in real-time.
            </p>
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
            <StatCard icon={Package} label="Total Orders" value={commOrders.length} color="var(--accent-blue)" />
            <StatCard icon={Clock} label="In Progress" value={commOrders.filter(o => o.status === 'in-production').length} color="var(--warning)" />
            <StatCard icon={Truck} label="Dispatched" value={commOrders.filter(o => o.status === 'dispatched').length} color="var(--primary)" />
            <StatCard icon={CheckCircle} label="Received" value={commOrders.filter(o => o.status === 'received').length} color="var(--success)" />
          </div>

          {/* Action */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <button className="btn btn-primary" onClick={() => {
              setCommForm({ fromId: '', items: [{ name: '', qty: 1 }] });
              setShowCommOrder(true);
            }}>
              <Plus size={15} /> New Internal Order
            </button>
          </div>

          {/* Status Flow Legend */}
          <div style={{
            display: 'flex', gap: 6, marginBottom: 20, padding: '10px 16px',
            borderRadius: 10, background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
            alignItems: 'center', flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginRight: 4 }}>Workflow:</span>
            {COMMISSARY_FLOW.map((step, i) => (
              <React.Fragment key={step}>
                <StatusBadge status={step} small />
                {i < COMMISSARY_FLOW.length - 1 && <ArrowRight size={13} color="var(--text-muted)" />}
              </React.Fragment>
            ))}
          </div>

          {/* Orders List */}
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={16} color="var(--accent-blue)" /> Internal Order History
          </h3>
          <div className="table-wrapper" style={{ borderRadius: 14, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(124,58,237,0.06)' }}>
                  <th style={thStyle}>Order ID</th>
                  <th style={thStyle}>From Location</th>
                  <th style={thStyle}>Items</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                  <th style={thStyle}>Date</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {commOrders.map(order => (
                  <tr key={order.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={tdStyle}>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: 'var(--primary)' }}>
                        #{order.id.slice(-6).toUpperCase()}
                      </span>
                    </td>
                    <td style={tdStyle}><span style={{ fontWeight: 500 }}>{order.fromLocation}</span></td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {order.items.map((it, i) => (
                          <span key={i} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {it.name} x{it.qty}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}><StatusBadge status={order.status} small /></td>
                    <td style={tdStyle}>{fmtDate(order.date)}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {order.status !== 'received' ? (
                        <button className="btn btn-sm btn-secondary" onClick={() => advanceCommStatus(order.id)}
                          style={{ fontSize: 11, padding: '4px 10px' }}>
                          <ArrowRight size={12} /> Advance
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>
                          <CheckCircle size={13} style={{ verticalAlign: 'middle', marginRight: 3 }} /> Done
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
         MODALS
      ══════════════════════════════════════════════════════════ */}

      {/* Location Add/Edit Modal */}
      {locModal && (
        <Modal title={locModal === 'add' ? 'Add Location' : 'Edit Location'} onClose={() => setLocModal(null)}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="input-group">
              <label className="input-label">Location Name *</label>
              <input className="input-field" placeholder="e.g. Kitchgoo Koramangala" value={locForm.name}
                onChange={e => setLocForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="input-group">
              <label className="input-label">Address</label>
              <input className="input-field" placeholder="Full address" value={locForm.address}
                onChange={e => setLocForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="input-group">
                <label className="input-label">Phone</label>
                <input className="input-field" placeholder="+91 ..." value={locForm.phone}
                  onChange={e => setLocForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">Manager</label>
                <input className="input-field" placeholder="Manager name" value={locForm.manager}
                  onChange={e => setLocForm(f => ({ ...f, manager: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="input-group">
                <label className="input-label">Status</label>
                <select className="input-field" value={locForm.status}
                  onChange={e => setLocForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="input-group">
                <label className="input-label" style={{ marginBottom: 8 }}>Headquarters</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={locForm.isHQ}
                    onChange={e => setLocForm(f => ({ ...f, isHQ: e.target.checked }))}
                    style={{ accentColor: 'var(--primary)' }} />
                  Mark as HQ
                  <Crown size={14} color="var(--primary)" />
                </label>
              </div>
            </div>
          </div>
          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setLocModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveLocation}>
              <Save size={15} /> {locModal === 'add' ? 'Add Location' : 'Save Changes'}
            </button>
          </div>
        </Modal>
      )}

      {/* Generate Royalty Invoice Modal */}
      {showGenInvoice && (
        <Modal title="Generate Royalty Invoice" onClose={() => setShowGenInvoice(false)}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="input-group">
              <label className="input-label">Franchise Location *</label>
              <select className="input-field" value={genInvoiceForm.locationId}
                onChange={e => setGenInvoiceForm(f => ({ ...f, locationId: e.target.value }))}>
                <option value="">Select location...</option>
                {locations.filter(l => !l.isHQ).map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="input-group">
                <label className="input-label">Period</label>
                <input className="input-field" placeholder="e.g. Mar 2026" value={genInvoiceForm.period}
                  onChange={e => setGenInvoiceForm(f => ({ ...f, period: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">Royalty %</label>
                <input className="input-field" type="number" min="0" max="100" step="0.5"
                  value={genInvoiceForm.royaltyPct}
                  onChange={e => setGenInvoiceForm(f => ({ ...f, royaltyPct: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
            {genInvoiceForm.locationId && (() => {
              const loc = locations.find(l => l.id === genInvoiceForm.locationId);
              if (!loc) return null;
              const amount = (loc.revenue || 0) * (genInvoiceForm.royaltyPct / 100);
              return (
                <div style={{
                  padding: 14, borderRadius: 10, background: 'rgba(124,58,237,0.06)',
                  border: '1px solid rgba(124,58,237,0.12)',
                }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Invoice Preview</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>Gross Sales:</span><span style={{ fontWeight: 600 }}>{fmt(loc.revenue)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4 }}>
                    <span>Royalty ({genInvoiceForm.royaltyPct}%):</span>
                    <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: 16 }}>{fmt(amount)}</span>
                  </div>
                </div>
              );
            })()}
          </div>
          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setShowGenInvoice(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={generateInvoice} disabled={!genInvoiceForm.locationId}>
              <Receipt size={15} /> Generate Invoice
            </button>
          </div>
        </Modal>
      )}

      {/* New Commissary Order Modal */}
      {showCommOrder && (
        <Modal title="New Internal Order" onClose={() => setShowCommOrder(false)} wide>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="input-group">
              <label className="input-label">Ordering Location *</label>
              <select className="input-field" value={commForm.fromId}
                onChange={e => setCommForm(f => ({ ...f, fromId: e.target.value }))}>
                <option value="">Select satellite location...</option>
                {locations.filter(l => !l.isHQ).map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="input-label" style={{ marginBottom: 8, display: 'block' }}>Order Items</label>
              {commForm.items.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <input className="input-field" placeholder="Item name (e.g. Naan Dough)" value={item.name}
                    onChange={e => updateCommItem(i, 'name', e.target.value)}
                    style={{ flex: 1 }} />
                  <input className="input-field" type="number" min="1" placeholder="Qty" value={item.qty}
                    onChange={e => updateCommItem(i, 'qty', e.target.value)}
                    style={{ width: 80, textAlign: 'center' }} />
                  {commForm.items.length > 1 && (
                    <button onClick={() => removeCommItem(i)} style={{
                      background: 'rgba(239,68,68,0.08)', border: 'none', borderRadius: 8,
                      width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', color: 'var(--danger)', flexShrink: 0,
                    }}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              <button className="btn btn-sm btn-secondary" onClick={addCommItem} style={{ marginTop: 4 }}>
                <Plus size={13} /> Add Item
              </button>
            </div>
          </div>
          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setShowCommOrder(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={placeCommOrder}
              disabled={!commForm.fromId || commForm.items.every(i => !i.name.trim())}>
              <Send size={15} /> Place Order
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Table Styles ────────────────────────────────────────────────
const thStyle = {
  padding: '10px 14px', fontSize: 12, fontWeight: 600, textAlign: 'left',
  color: 'var(--text-secondary)', letterSpacing: '0.02em', whiteSpace: 'nowrap',
};
const tdStyle = {
  padding: '10px 14px', fontSize: 13, color: 'var(--text-primary)',
};
