import React, { useState, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom';
import {
  Shield, CreditCard, FileText, Webhook, Puzzle, Lock, Search,
  Download, Plus, Trash2, X, Check, AlertTriangle, Eye, EyeOff,
  ToggleLeft, ToggleRight, RefreshCw, Key, Globe, Zap, ChevronRight,
  ExternalLink, Copy, Play, Pause, Clock, Users, Monitor, Smartphone,
  CheckCircle, XCircle, Filter, Calendar, ArrowUpRight, Settings,
  Database, Mail, MessageSquare, DollarSign, Building2, Hotel,
  BarChart3, CircleDot, ShieldCheck, ShieldAlert, LogOut, Clipboard
} from 'lucide-react';
import { useApp } from '../db/AppContext';
import { genId } from '../db/database';

// ── Constants ──────────────────────────────────────────────────

const TABS = [
  { id: 'subscription', label: 'Subscription', icon: CreditCard },
  { id: 'audit', label: 'Audit Logs', icon: FileText },
  { id: 'api', label: 'API & Webhooks', icon: Webhook },
  { id: 'integrations', label: 'Integrations', icon: Puzzle },
  { id: 'security', label: 'Security', icon: Shield },
];

const PLANS = [
  {
    id: 'basic', name: 'Basic', price: 2999, period: '/mo',
    features: {
      'POS & Billing': true, 'Menu Management': true, 'Basic Reports': true,
      'KDS (Kitchen Display)': false, 'Online Ordering': false,
      'Inventory Management': false, 'Staff Scheduling': false,
      'Multi-location': false, 'API Access': false, 'Webhooks': false,
      'Priority Support': false, 'Custom Integrations': false,
    },
    sms: 500, transactions: 1000, apiCalls: 0,
  },
  {
    id: 'pro', name: 'Pro', price: 7999, period: '/mo',
    features: {
      'POS & Billing': true, 'Menu Management': true, 'Basic Reports': true,
      'KDS (Kitchen Display)': true, 'Online Ordering': true,
      'Inventory Management': true, 'Staff Scheduling': true,
      'Multi-location': false, 'API Access': true, 'Webhooks': true,
      'Priority Support': true, 'Custom Integrations': false,
    },
    sms: 2000, transactions: 10000, apiCalls: 50000,
  },
  {
    id: 'enterprise', name: 'Enterprise', price: 19999, period: '/mo',
    features: {
      'POS & Billing': true, 'Menu Management': true, 'Basic Reports': true,
      'KDS (Kitchen Display)': true, 'Online Ordering': true,
      'Inventory Management': true, 'Staff Scheduling': true,
      'Multi-location': true, 'API Access': true, 'Webhooks': true,
      'Priority Support': true, 'Custom Integrations': true,
    },
    sms: 10000, transactions: -1, apiCalls: -1,
  },
];

const WEBHOOK_EVENTS = [
  'order.created', 'order.paid', 'order.completed', 'order.cancelled',
  'inventory.low', 'inventory.updated', 'reservation.new', 'reservation.cancelled',
  'staff.clockin', 'staff.clockout', 'menu.updated', 'payment.received',
];

const INTEGRATION_CATEGORIES = ['All', 'Accounting', 'Payroll', 'Marketing', 'Communication', 'Hotel'];

const INTEGRATIONS_LIST = [
  { id: 'quickbooks', name: 'QuickBooks', category: 'Accounting', description: 'Sync sales, expenses, and invoices automatically with QuickBooks Online.', color: '#2CA01C' },
  { id: 'xero', name: 'Xero', category: 'Accounting', description: 'Seamless accounting integration with Xero for real-time financial data.', color: '#13B5EA' },
  { id: 'gusto', name: 'Gusto', category: 'Payroll', description: 'Automate payroll processing, tip distribution, and tax filings.', color: '#F45D48' },
  { id: 'hotel_pms', name: 'Hotel PMS', category: 'Hotel', description: 'Connect room charges and guest folios with hotel property management.', color: '#7c3aed' },
  { id: 'mailchimp', name: 'Mailchimp', category: 'Marketing', description: 'Sync guest data for email campaigns, promotions, and newsletters.', color: '#FFE01B' },
  { id: 'twilio', name: 'Twilio', category: 'Communication', description: 'SMS notifications for orders, reservations, and marketing messages.', color: '#F22F46' },
  { id: 'stripe', name: 'Stripe', category: 'Accounting', description: 'Accept online payments and manage subscriptions seamlessly.', color: '#635BFF' },
  { id: 'hubspot', name: 'HubSpot', category: 'Marketing', description: 'CRM integration for guest relationship management and marketing automation.', color: '#FF7A59' },
  { id: 'slack', name: 'Slack', category: 'Communication', description: 'Get real-time alerts for orders, low stock, and reservations in Slack.', color: '#4A154B' },
];

const ACTION_COLORS = {
  create: { bg: 'rgba(34,197,94,0.1)', text: '#16a34a' },
  update: { bg: 'rgba(245,158,11,0.1)', text: '#d97706' },
  delete: { bg: 'rgba(239,68,68,0.1)', text: '#dc2626' },
  login:  { bg: 'rgba(59,130,246,0.1)', text: '#2563eb' },
  logout: { bg: 'rgba(100,116,139,0.1)', text: '#64748b' },
  void:   { bg: 'rgba(239,68,68,0.1)', text: '#dc2626' },
  comp:   { bg: 'rgba(245,158,11,0.1)', text: '#d97706' },
  settings: { bg: 'rgba(124,58,237,0.1)', text: '#7c3aed' },
};

const COMPLIANCE_ITEMS = [
  { id: 'data_encryption', label: 'Data encrypted at rest and in transit', done: true },
  { id: 'consent_management', label: 'Cookie and consent management implemented', done: true },
  { id: 'right_to_delete', label: 'Right to erasure (deletion) workflows active', done: true },
  { id: 'data_portability', label: 'Data export available for guests on request', done: true },
  { id: 'breach_notification', label: 'Breach notification process documented', done: true },
  { id: 'privacy_policy', label: 'Privacy policy published and accessible', done: false },
  { id: 'dpo_appointed', label: 'Data Protection Officer appointed', done: false },
];

// ── Helpers ────────────────────────────────────────────────────

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '--';

const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--';

const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '--';

const maskKey = (key) => key ? key.slice(0, 8) + '****' + key.slice(-4) : '';

const generateApiKey = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'kg_live_';
  for (let i = 0; i < 32; i++) key += chars.charAt(Math.floor(Math.random() * chars.length));
  return key;
};

const getActionColor = (action) => {
  const lower = (action || '').toLowerCase();
  if (lower.includes('create') || lower.includes('add')) return ACTION_COLORS.create;
  if (lower.includes('update') || lower.includes('edit') || lower.includes('change')) return ACTION_COLORS.update;
  if (lower.includes('delete') || lower.includes('remove')) return ACTION_COLORS.delete;
  if (lower.includes('login')) return ACTION_COLORS.login;
  if (lower.includes('logout')) return ACTION_COLORS.logout;
  if (lower.includes('void')) return ACTION_COLORS.void;
  if (lower.includes('comp')) return ACTION_COLORS.comp;
  if (lower.includes('setting')) return ACTION_COLORS.settings;
  return { bg: 'rgba(100,116,139,0.1)', text: '#64748b' };
};

// ── Portal Modal ───────────────────────────────────────────────

const Modal = ({ title, onClose, children, wide }) =>
  ReactDOM.createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        style={wide ? { maxWidth: '640px', width: '95%' } : {}}
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

// ── Small shared components ────────────────────────────────────

const Badge = ({ children, bg, color, style: sx }) => (
  <span style={{
    padding: '3px 10px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 700,
    background: bg, color, whiteSpace: 'nowrap', ...sx,
  }}>
    {children}
  </span>
);

const StatusDot = ({ active }) => (
  <span style={{
    width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
    background: active ? 'var(--success)' : 'var(--text-muted)',
    boxShadow: active ? '0 0 6px rgba(34,197,94,0.5)' : 'none',
  }} />
);

const UsageMeter = ({ label, used, total, icon: Icon }) => {
  const unlimited = total === -1;
  const pct = unlimited ? 15 : total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const barColor = pct > 85 ? 'var(--danger)' : pct > 60 ? 'var(--warning)' : 'var(--primary)';
  return (
    <div style={{ padding: '16px', background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        {Icon && <Icon size={16} style={{ color: 'var(--primary)' }} />}
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
        <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
          {used.toLocaleString('en-IN')}
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          / {unlimited ? 'Unlimited' : total.toLocaleString('en-IN')}
        </span>
      </div>
      <div style={{ height: '6px', borderRadius: '3px', background: 'var(--border-subtle)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: '3px', background: barColor, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  );
};

const Toggle = ({ value, onChange, label, description }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
    <div>
      <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
      {description && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{description}</div>}
    </div>
    <button onClick={() => onChange(!value)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: value ? 'var(--primary)' : 'var(--text-muted)', flexShrink: 0, marginLeft: '16px' }}>
      {value ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
    </button>
  </div>
);

// ═══════════════════════════════════════════════════════════════
// ── SUBSCRIPTION TAB ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

const SubscriptionTab = ({ settings }) => {
  const currentPlan = settings?.subscription?.plan || 'pro';
  const plan = PLANS.find(p => p.id === currentPlan) || PLANS[1];
  const usage = settings?.subscription?.usage || { sms: 847, transactions: 3241, apiCalls: 12890 };

  return (
    <div className="animate-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Current Plan Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #7c3aed, #a855f7)', borderRadius: '16px',
        padding: '28px', color: 'white', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
        <div style={{ position: 'absolute', bottom: -20, right: 60, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
          <div>
            <div style={{ fontSize: '0.75rem', opacity: 0.8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Current Plan</div>
            <div style={{ fontSize: '2rem', fontWeight: 800 }}>{plan.name}</div>
            <div style={{ fontSize: '0.85rem', opacity: 0.9, marginTop: '4px' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 800 }}>&#8377;{plan.price.toLocaleString('en-IN')}</span>{plan.period}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Next billing date</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>15 Apr 2026</div>
            <div style={{ fontSize: '0.72rem', opacity: 0.7, marginTop: '6px' }}>Visa ending 4242</div>
          </div>
        </div>
      </div>

      {/* Usage Meters */}
      <div>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>Usage This Billing Cycle</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
          <UsageMeter label="SMS Credits" used={usage.sms} total={plan.sms} icon={MessageSquare} />
          <UsageMeter label="Online Transactions" used={usage.transactions} total={plan.transactions} icon={DollarSign} />
          <UsageMeter label="API Calls" used={usage.apiCalls} total={plan.apiCalls} icon={Zap} />
        </div>
      </div>

      {/* Feature Comparison Table */}
      <div>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>Plan Comparison</h3>
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          <div className="table-wrapper">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: 'rgba(124,58,237,0.04)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)' }}>Feature</th>
                  {PLANS.map(p => (
                    <th key={p.id} style={{
                      padding: '12px 16px', textAlign: 'center', fontWeight: 700, borderBottom: '1px solid var(--border-subtle)',
                      color: p.id === currentPlan ? 'var(--primary)' : 'var(--text-primary)',
                      background: p.id === currentPlan ? 'rgba(124,58,237,0.06)' : 'transparent',
                    }}>
                      {p.name}
                      {p.id === currentPlan && <div style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--primary)', marginTop: '2px' }}>CURRENT</div>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.keys(PLANS[0].features).map(feature => (
                  <tr key={feature}>
                    <td style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}>{feature}</td>
                    {PLANS.map(p => (
                      <td key={p.id} style={{
                        padding: '10px 16px', textAlign: 'center', borderBottom: '1px solid var(--border-subtle)',
                        background: p.id === currentPlan ? 'rgba(124,58,237,0.03)' : 'transparent',
                      }}>
                        {p.features[feature]
                          ? <CheckCircle size={16} style={{ color: 'var(--success)' }} />
                          : <Lock size={14} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                        }
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Upgrade / Downgrade Buttons */}
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
        {PLANS.filter(p => p.id !== currentPlan).map(p => (
          <button key={p.id} className={PLANS.indexOf(p) > PLANS.findIndex(x => x.id === currentPlan) ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ minWidth: '160px' }}>
            {PLANS.indexOf(p) > PLANS.findIndex(x => x.id === currentPlan) ? 'Upgrade' : 'Downgrade'} to {p.name}
          </button>
        ))}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// ── AUDIT LOGS TAB ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

const AuditLogsTab = ({ auditLog }) => {
  const [search, setSearch] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Generate demo data if none exists
  const logs = useMemo(() => {
    if (auditLog && auditLog.length > 0) return auditLog;
    const demoActions = [
      { action: 'login', user: 'admin@kitchgoo.com', userName: 'Admin', details: 'Logged in from Chrome/Windows', ip: '192.168.1.100' },
      { action: 'menu.update', user: 'chef@kitchgoo.com', userName: 'Chef Ravi', details: 'Updated price of "Butter Chicken" from 350 to 380', ip: '192.168.1.105' },
      { action: 'order.void', user: 'manager@kitchgoo.com', userName: 'Priya M.', details: 'Voided order #1042 - customer complaint', ip: '192.168.1.102' },
      { action: 'inventory.create', user: 'admin@kitchgoo.com', userName: 'Admin', details: 'Added new item "Truffle Oil" to inventory', ip: '192.168.1.100' },
      { action: 'settings.update', user: 'admin@kitchgoo.com', userName: 'Admin', details: 'Changed GST rate from 5% to 5.5%', ip: '192.168.1.100' },
      { action: 'staff.create', user: 'admin@kitchgoo.com', userName: 'Admin', details: 'Added new staff member "Karan S."', ip: '192.168.1.100' },
      { action: 'menu.delete', user: 'chef@kitchgoo.com', userName: 'Chef Ravi', details: 'Removed "Seasonal Salad" from lunch menu', ip: '192.168.1.105' },
      { action: 'order.comp', user: 'manager@kitchgoo.com', userName: 'Priya M.', details: 'Comp on order #1038 - regular guest courtesy', ip: '192.168.1.102' },
      { action: 'logout', user: 'chef@kitchgoo.com', userName: 'Chef Ravi', details: 'Session ended', ip: '192.168.1.105' },
      { action: 'price.update', user: 'admin@kitchgoo.com', userName: 'Admin', details: 'Bulk price update: 12 items adjusted', ip: '192.168.1.100' },
    ];
    return demoActions.map((d, i) => ({
      id: `demo_${i}`,
      timestamp: new Date(Date.now() - i * 3600000 * (1 + Math.random() * 3)).toISOString(),
      ...d,
    }));
  }, [auditLog]);

  const users = useMemo(() => [...new Set(logs.map(l => l.userName || l.user))], [logs]);
  const actions = useMemo(() => [...new Set(logs.map(l => l.action))], [logs]);

  const filtered = useMemo(() => {
    return logs.filter(l => {
      if (search) {
        const s = search.toLowerCase();
        if (!(l.details || '').toLowerCase().includes(s) && !(l.action || '').toLowerCase().includes(s) && !(l.userName || '').toLowerCase().includes(s)) return false;
      }
      if (filterUser && (l.userName || l.user) !== filterUser) return false;
      if (filterAction && l.action !== filterAction) return false;
      if (dateFrom && l.timestamp < dateFrom) return false;
      if (dateTo && l.timestamp < dateTo + 'T23:59:59') {
        // keep it
      }
      if (dateTo && new Date(l.timestamp) > new Date(dateTo + 'T23:59:59')) return false;
      return true;
    });
  }, [logs, search, filterUser, filterAction, dateFrom, dateTo]);

  const exportCSV = useCallback(() => {
    const header = 'Timestamp,User,Action,Details,IP Address';
    const rows = filtered.map(l =>
      `"${fmtDateTime(l.timestamp)}","${l.userName || l.user}","${l.action}","${(l.details || '').replace(/"/g, '""')}","${l.ip || ''}"`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered]);

  return (
    <div className="animate-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input-field" placeholder="Search logs..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: '32px' }} />
        </div>
        <select className="input-field" value={filterUser} onChange={e => setFilterUser(e.target.value)} style={{ flex: '0 1 160px' }}>
          <option value="">All Users</option>
          {users.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <select className="input-field" value={filterAction} onChange={e => setFilterAction(e.target.value)} style={{ flex: '0 1 160px' }}>
          <option value="">All Actions</option>
          {actions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <input className="input-field" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ flex: '0 1 140px' }} />
        <input className="input-field" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ flex: '0 1 140px' }} />
        <button className="btn btn-secondary" onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Count */}
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
        Showing {filtered.length} of {logs.length} entries
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div className="table-wrapper">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: 'rgba(124,58,237,0.04)' }}>
                {['Timestamp', 'User', 'Action', 'Details', 'IP Address'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>No audit log entries found.</td></tr>
              ) : filtered.slice(0, 100).map(l => {
                const ac = getActionColor(l.action);
                return (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmtDateTime(l.timestamp)}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{l.userName || l.user}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <Badge bg={ac.bg} color={ac.text}>{l.action}</Badge>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.details}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.75rem' }}>{l.ip || '--'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// ── API & WEBHOOKS TAB ────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

const ApiWebhooksTab = ({ addAuditEntry }) => {
  const [apiKeys, setApiKeys] = useState([
    { id: '1', name: 'Production Key', key: 'kg_live_aBcDeFgH1234XyZ56789qWeRtY', created: '2025-11-10T10:00:00Z', lastUsed: '2026-03-29T14:23:00Z', status: 'active' },
    { id: '2', name: 'Staging Key', key: 'kg_test_mNoPqRsT9876UvWx54321zZyXw', created: '2026-01-05T08:00:00Z', lastUsed: '2026-03-28T09:15:00Z', status: 'active' },
  ]);
  const [webhooks, setWebhooks] = useState([
    { id: '1', url: 'https://hooks.example.com/kitchgoo/orders', events: ['order.created', 'order.paid'], status: 'active', lastTriggered: '2026-03-29T18:45:00Z' },
    { id: '2', url: 'https://inventory.example.com/webhook', events: ['inventory.low', 'inventory.updated'], status: 'paused', lastTriggered: '2026-03-27T12:00:00Z' },
  ]);
  const [showNewKey, setShowNewKey] = useState(null);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEvents, setWebhookEvents] = useState([]);
  const [visibleKeys, setVisibleKeys] = useState({});
  const [testingWebhook, setTestingWebhook] = useState(null);

  const handleGenerateKey = () => {
    const key = generateApiKey();
    const newKey = {
      id: genId(), name: newKeyName || 'New API Key', key,
      created: new Date().toISOString(), lastUsed: null, status: 'active',
    };
    setApiKeys(prev => [...prev, newKey]);
    setShowNewKey(key);
    setShowKeyModal(false);
    setNewKeyName('');
    addAuditEntry?.('api_key.create', 'system', 'Admin', `Generated new API key: ${newKeyName || 'New API Key'}`);
  };

  const handleRevokeKey = (id) => {
    setApiKeys(prev => prev.map(k => k.id === id ? { ...k, status: 'revoked' } : k));
    addAuditEntry?.('api_key.delete', 'system', 'Admin', 'Revoked API key');
  };

  const handleAddWebhook = () => {
    if (!webhookUrl) return;
    const wh = {
      id: genId(), url: webhookUrl, events: webhookEvents,
      status: 'active', lastTriggered: null,
    };
    setWebhooks(prev => [...prev, wh]);
    setShowWebhookModal(false);
    setWebhookUrl('');
    setWebhookEvents([]);
    addAuditEntry?.('webhook.create', 'system', 'Admin', `Added webhook: ${webhookUrl}`);
  };

  const handleTestWebhook = (id) => {
    setTestingWebhook(id);
    setTimeout(() => setTestingWebhook(null), 2000);
  };

  const toggleWebhookStatus = (id) => {
    setWebhooks(prev => prev.map(w => w.id === id ? { ...w, status: w.status === 'active' ? 'paused' : 'active' } : w));
  };

  const removeWebhook = (id) => {
    setWebhooks(prev => prev.filter(w => w.id !== id));
    addAuditEntry?.('webhook.delete', 'system', 'Admin', 'Removed webhook endpoint');
  };

  const toggleEvent = (evt) => {
    setWebhookEvents(prev => prev.includes(evt) ? prev.filter(e => e !== evt) : [...prev, evt]);
  };

  return (
    <div className="animate-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* One-time key reveal */}
      {showNewKey && (
        <div style={{
          background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '12px',
          padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
        }}>
          <ShieldCheck size={20} style={{ color: 'var(--success)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
              New API Key Generated - Copy it now! It will not be shown again.
            </div>
            <code style={{
              fontSize: '0.78rem', background: 'rgba(0,0,0,0.06)', padding: '6px 10px', borderRadius: '6px',
              display: 'inline-block', fontFamily: 'monospace', wordBreak: 'break-all',
            }}>
              {showNewKey}
            </code>
          </div>
          <button className="btn btn-sm btn-secondary" onClick={() => { navigator.clipboard?.writeText(showNewKey); }}
            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Copy size={13} /> Copy
          </button>
          <button onClick={() => setShowNewKey(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>
      )}

      {/* API Keys Section */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Key size={18} style={{ color: 'var(--primary)' }} /> API Keys
          </h3>
          <button className="btn btn-primary btn-sm" onClick={() => setShowKeyModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Plus size={14} /> Generate Key
          </button>
        </div>
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          <div className="table-wrapper">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: 'rgba(124,58,237,0.04)' }}>
                  {['Name', 'Key', 'Created', 'Last Used', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {apiKeys.map(k => (
                  <tr key={k.id} style={{ borderBottom: '1px solid var(--border-subtle)', opacity: k.status === 'revoked' ? 0.5 : 1 }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{k.name}</td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        {visibleKeys[k.id] ? k.key : maskKey(k.key)}
                        <button onClick={() => setVisibleKeys(prev => ({ ...prev, [k.id]: !prev[k.id] }))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '2px' }}>
                          {visibleKeys[k.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{fmtDate(k.created)}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{k.lastUsed ? fmtDateTime(k.lastUsed) : 'Never'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <Badge
                        bg={k.status === 'active' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'}
                        color={k.status === 'active' ? '#16a34a' : '#dc2626'}
                      >
                        {k.status}
                      </Badge>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {k.status === 'active' && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleRevokeKey(k.id)} style={{ fontSize: '0.72rem' }}>
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Webhooks Section */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Globe size={18} style={{ color: 'var(--accent-blue)' }} /> Webhooks
          </h3>
          <button className="btn btn-primary btn-sm" onClick={() => setShowWebhookModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Plus size={14} /> Add Webhook
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {webhooks.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
              No webhooks configured. Add one to receive real-time event notifications.
            </div>
          )}
          {webhooks.map(w => (
            <div key={w.id} className="card" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <StatusDot active={w.status === 'active'} />
                    <code style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }}>{w.url}</code>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '6px' }}>
                    {w.events.map(ev => (
                      <Badge key={ev} bg="rgba(124,58,237,0.08)" color="var(--primary)">{ev}</Badge>
                    ))}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Last triggered: {w.lastTriggered ? fmtDateTime(w.lastTriggered) : 'Never'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => handleTestWebhook(w.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {testingWebhook === w.id ? <><RefreshCw size={13} className="spin" /> Testing...</> : <><Play size={13} /> Test</>}
                  </button>
                  <button className="btn btn-sm btn-secondary" onClick={() => toggleWebhookStatus(w.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {w.status === 'active' ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Resume</>}
                  </button>
                  <button onClick={() => removeWebhook(w.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', display: 'flex', padding: '4px' }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Generate Key Modal */}
      {showKeyModal && (
        <Modal title="Generate API Key" onClose={() => setShowKeyModal(false)}>
          <div className="modal-body">
            <div className="input-group">
              <label className="input-label">Key Name</label>
              <input className="input-field" placeholder="e.g., Production, Staging, Mobile App" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} />
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '8px', padding: '10px', background: 'rgba(245,158,11,0.08)', borderRadius: '8px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <AlertTriangle size={16} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: '1px' }} />
              <span>The API key will only be shown once after generation. Make sure to copy and store it securely.</span>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setShowKeyModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleGenerateKey}>Generate Key</button>
          </div>
        </Modal>
      )}

      {/* Add Webhook Modal */}
      {showWebhookModal && (
        <Modal title="Add Webhook Endpoint" onClose={() => setShowWebhookModal(false)} wide>
          <div className="modal-body">
            <div className="input-group">
              <label className="input-label">Endpoint URL</label>
              <input className="input-field" placeholder="https://your-server.com/webhook" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} />
            </div>
            <div className="input-group" style={{ marginTop: '14px' }}>
              <label className="input-label">Subscribe to Events</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                {WEBHOOK_EVENTS.map(evt => (
                  <button key={evt} onClick={() => toggleEvent(evt)}
                    style={{
                      padding: '6px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600,
                      border: '1px solid', cursor: 'pointer', transition: 'all 0.15s ease',
                      background: webhookEvents.includes(evt) ? 'var(--primary-light)' : 'transparent',
                      borderColor: webhookEvents.includes(evt) ? 'var(--primary)' : 'var(--border-subtle)',
                      color: webhookEvents.includes(evt) ? 'var(--primary)' : 'var(--text-secondary)',
                    }}>
                    {webhookEvents.includes(evt) && <Check size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />}
                    {evt}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setShowWebhookModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAddWebhook} disabled={!webhookUrl || webhookEvents.length === 0}>Add Webhook</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// ── INTEGRATIONS TAB ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

const IntegrationsTab = ({ addAuditEntry }) => {
  const [category, setCategory] = useState('All');
  const [connected, setConnected] = useState({
    quickbooks: { active: true, lastSync: '2026-03-29T16:30:00Z' },
    twilio: { active: true, lastSync: '2026-03-29T18:00:00Z' },
  });

  const filtered = category === 'All' ? INTEGRATIONS_LIST : INTEGRATIONS_LIST.filter(i => i.category === category);

  const toggleConnect = (id, name) => {
    setConnected(prev => {
      const next = { ...prev };
      if (next[id]) {
        delete next[id];
        addAuditEntry?.('integration.disconnect', 'system', 'Admin', `Disconnected ${name}`);
      } else {
        next[id] = { active: true, lastSync: new Date().toISOString() };
        addAuditEntry?.('integration.connect', 'system', 'Admin', `Connected ${name}`);
      }
      return next;
    });
  };

  return (
    <div className="animate-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Category Filter */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {INTEGRATION_CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setCategory(cat)}
            className={category === cat ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}>
            {cat}
          </button>
        ))}
      </div>

      {/* Integration Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '16px' }}>
        {filtered.map(integ => {
          const isConnected = !!connected[integ.id];
          return (
            <div key={integ.id} className="card" style={{
              padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px',
              border: isConnected ? '1px solid rgba(34,197,94,0.3)' : '1px solid var(--border-subtle)',
              transition: 'all 0.2s ease',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {/* Logo placeholder */}
                <div style={{
                  width: 44, height: 44, borderRadius: '12px', flexShrink: 0,
                  background: integ.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontWeight: 800, fontSize: '1rem',
                }}>
                  {integ.name.charAt(0)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>{integ.name}</span>
                    {isConnected && <Badge bg="rgba(34,197,94,0.1)" color="#16a34a">Connected</Badge>}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {integ.category}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.45', flex: 1 }}>
                {integ.description}
              </div>
              {isConnected && connected[integ.id]?.lastSync && (
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <RefreshCw size={12} /> Last sync: {fmtDateTime(connected[integ.id].lastSync)}
                </div>
              )}
              <button
                className={isConnected ? 'btn btn-danger btn-sm' : 'btn btn-primary btn-sm'}
                onClick={() => toggleConnect(integ.id, integ.name)}
                style={{ alignSelf: 'flex-start' }}
              >
                {isConnected ? 'Disconnect' : 'Connect'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// ── SECURITY TAB ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

const SecurityTab = ({ settings, updateSettingsSection, addAuditEntry }) => {
  const securitySettings = settings?.security || {};
  const [passwordPolicy, setPasswordPolicy] = useState({
    minLength: securitySettings.minPasswordLength || 8,
    requireSpecial: securitySettings.requireSpecialChars !== false,
    expiryDays: securitySettings.passwordExpiryDays || 90,
  });
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(securitySettings.twoFactorEnabled || false);
  const [compliance, setCompliance] = useState(COMPLIANCE_ITEMS);
  const [saved, setSaved] = useState(false);

  const sessions = [
    { id: '1', user: 'Admin', device: 'Chrome on MacOS', ip: '192.168.1.100', lastActive: '2026-03-30T10:15:00Z', current: true },
    { id: '2', user: 'Priya M.', device: 'Safari on iPad', ip: '192.168.1.102', lastActive: '2026-03-30T09:45:00Z', current: false },
    { id: '3', user: 'Chef Ravi', device: 'Chrome on Android', ip: '192.168.1.105', lastActive: '2026-03-29T22:30:00Z', current: false },
    { id: '4', user: 'Karan S.', device: 'Firefox on Windows', ip: '192.168.1.110', lastActive: '2026-03-29T18:00:00Z', current: false },
  ];

  const [activeSessions, setActiveSessions] = useState(sessions);

  const handleSavePolicy = () => {
    updateSettingsSection?.('security', {
      minPasswordLength: passwordPolicy.minLength,
      requireSpecialChars: passwordPolicy.requireSpecial,
      passwordExpiryDays: passwordPolicy.expiryDays,
      twoFactorEnabled,
    });
    addAuditEntry?.('settings.update', 'system', 'Admin', 'Updated security / password policy settings');
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleLogoutSession = (id) => {
    setActiveSessions(prev => prev.filter(s => s.id !== id));
    addAuditEntry?.('session.terminate', 'system', 'Admin', `Terminated session ${id}`);
  };

  const handleDataExport = () => {
    addAuditEntry?.('gdpr.export_request', 'system', 'Admin', 'GDPR data export requested');
    alert('Data export request submitted. You will receive a download link via email within 24 hours.');
  };

  return (
    <div className="animate-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* PCI Compliance Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.02))',
        border: '1px solid rgba(34,197,94,0.25)', borderRadius: '14px', padding: '20px 24px',
        display: 'flex', alignItems: 'center', gap: '16px',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '14px',
          background: 'rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ShieldCheck size={24} style={{ color: 'var(--success)' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>PCI DSS Compliant</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Your payment processing meets PCI DSS Level 1 requirements. Last audit: 15 Feb 2026
          </div>
        </div>
        <Badge bg="rgba(34,197,94,0.12)" color="#16a34a" style={{ fontSize: '0.75rem', padding: '5px 14px' }}>
          Compliant
        </Badge>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '20px' }}>
        {/* GDPR / CCPA Compliance */}
        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={17} style={{ color: 'var(--primary)' }} /> GDPR / CCPA Compliance
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {compliance.map(item => (
              <div key={item.id} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '8px 12px', borderRadius: '8px',
                background: item.done ? 'rgba(34,197,94,0.04)' : 'rgba(245,158,11,0.04)',
              }}>
                {item.done
                  ? <CheckCircle size={16} style={{ color: 'var(--success)', flexShrink: 0 }} />
                  : <AlertTriangle size={16} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                }
                <span style={{
                  fontSize: '0.8rem', color: item.done ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: item.done ? 500 : 400,
                }}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border-subtle)' }}>
            <button className="btn btn-secondary btn-sm" onClick={handleDataExport}
              style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Database size={14} /> Request Data Export (GDPR)
            </button>
          </div>
        </div>

        {/* Password Policy */}
        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lock size={17} style={{ color: 'var(--primary)' }} /> Password Policy
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="input-group">
              <label className="input-label">Minimum Password Length</label>
              <input className="input-field" type="number" min={6} max={32} value={passwordPolicy.minLength}
                onChange={e => setPasswordPolicy(p => ({ ...p, minLength: parseInt(e.target.value) || 8 }))} />
            </div>
            <Toggle
              value={passwordPolicy.requireSpecial}
              onChange={v => setPasswordPolicy(p => ({ ...p, requireSpecial: v }))}
              label="Require Special Characters"
              description="At least one symbol (!@#$%^&*) required"
            />
            <div className="input-group">
              <label className="input-label">Password Expiry (days)</label>
              <input className="input-field" type="number" min={0} max={365} value={passwordPolicy.expiryDays}
                onChange={e => setPasswordPolicy(p => ({ ...p, expiryDays: parseInt(e.target.value) || 0 }))} />
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>Set to 0 for no expiry</div>
            </div>
            <Toggle
              value={twoFactorEnabled}
              onChange={setTwoFactorEnabled}
              label="Two-Factor Authentication"
              description="Require 2FA for all admin and manager accounts"
            />
          </div>
          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button className="btn btn-primary btn-sm" onClick={handleSavePolicy}>Save Policy</button>
            {saved && <span style={{ fontSize: '0.78rem', color: 'var(--success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Check size={14} /> Saved
            </span>}
          </div>
        </div>
      </div>

      {/* Active Sessions */}
      <div>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Monitor size={18} style={{ color: 'var(--accent-blue)' }} /> Active Sessions
        </h3>
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          <div className="table-wrapper">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: 'rgba(124,58,237,0.04)' }}>
                  {['User', 'Device', 'IP Address', 'Last Active', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeSessions.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {s.user}
                        {s.current && <Badge bg="rgba(59,130,246,0.1)" color="#2563eb">Current</Badge>}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {s.device.includes('Android') || s.device.includes('iPad') || s.device.includes('iPhone')
                        ? <Smartphone size={14} style={{ color: 'var(--text-muted)' }} />
                        : <Monitor size={14} style={{ color: 'var(--text-muted)' }} />
                      }
                      {s.device}
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.ip}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{fmtDateTime(s.lastActive)}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {!s.current && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleLogoutSession(s.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem' }}>
                          <LogOut size={12} /> End
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {activeSessions.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>No active sessions.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// ── MAIN PAGE COMPONENT ───────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

export default function PlatformAdmin() {
  const { settings, auditLog, orders, updateSettingsSection, addAuditEntry } = useApp();
  const [activeTab, setActiveTab] = useState('subscription');

  return (
    <div className="animate-fade-up" style={{ padding: '0 4px' }}>
      {/* Header */}
      <div className="page-title-row">
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Shield size={26} style={{ color: 'var(--primary)' }} />
          Platform Admin
        </h1>
      </div>

      {/* Tab Navigation */}
      <div style={{
        display: 'flex', gap: '4px', marginBottom: '24px', overflowX: 'auto',
        borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0',
      }}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                padding: '10px 18px', border: 'none', cursor: 'pointer',
                background: 'transparent', fontSize: '0.84rem', fontWeight: 600,
                color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                borderBottom: isActive ? '2px solid var(--primary)' : '2px solid transparent',
                whiteSpace: 'nowrap', transition: 'all 0.15s ease',
              }}>
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'subscription' && <SubscriptionTab settings={settings} />}
      {activeTab === 'audit' && <AuditLogsTab auditLog={auditLog} />}
      {activeTab === 'api' && <ApiWebhooksTab addAuditEntry={addAuditEntry} />}
      {activeTab === 'integrations' && <IntegrationsTab addAuditEntry={addAuditEntry} />}
      {activeTab === 'security' && <SecurityTab settings={settings} updateSettingsSection={updateSettingsSection} addAuditEntry={addAuditEntry} />}
    </div>
  );
}
