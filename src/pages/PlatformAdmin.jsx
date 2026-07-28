import React, { useState, useMemo, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Shield, CreditCard, FileText, Webhook, Puzzle, Lock, Search,
  Download, Plus, Trash2, X, Check, AlertTriangle, Eye, EyeOff,
  ToggleLeft, ToggleRight, RefreshCw, Key, Globe, Zap, ChevronRight,
  ExternalLink, Copy, Play, Pause, Clock, Users, Monitor, Smartphone,
  CheckCircle, XCircle, Filter, Calendar, ArrowUpRight, Settings,
  Database, Mail, MessageSquare, DollarSign, Building2, Hotel,
  BarChart3, CircleDot, ShieldCheck, ShieldAlert, LogOut, Clipboard, User,
  Edit3, Save, Activity, CheckSquare, Server, Layers
} from 'lucide-react';
import { useAuth } from '../db/AuthContext';
import { useApp } from '../db/AppContext';
import { genId, getAll, remove as dbRemove, update as dbUpdate } from '../db/database';

// ── Constants ──────────────────────────────────────────────────

const TABS = [
  { id: 'accounts', label: 'Tenant Accounts', icon: Users },
  { id: 'subscription', label: 'Subscription', icon: CreditCard },
  { id: 'audit', label: 'Audit Logs', icon: FileText },
  { id: 'api', label: 'API & Webhooks', icon: Webhook },
  { id: 'integrations', label: 'Integrations', icon: Puzzle },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'profile', label: 'My Profile', icon: User },
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
  { id: 'quickbooks', name: 'QuickBooks', category: 'Accounting', description: 'Sync sales, expenses, and invoices automatically with QuickBooks Online.', color: '#2CA01C', fields: ['Client ID', 'Client Secret', 'Company ID'] },
  { id: 'xero', name: 'Xero', category: 'Accounting', description: 'Seamless accounting integration with Xero for real-time financial data.', color: '#13B5EA', fields: ['Client ID', 'Tenant ID'] },
  { id: 'gusto', name: 'Gusto', category: 'Payroll', description: 'Automate payroll processing, tip distribution, and tax filings.', color: '#F45D48', fields: ['API Key', 'Company ID'] },
  { id: 'hotel_pms', name: 'Hotel PMS', category: 'Hotel', description: 'Connect room charges and guest folios with hotel property management.', color: '#1e5e4a', fields: ['Server Endpoint URL', 'API Key'] },
  { id: 'mailchimp', name: 'Mailchimp', category: 'Marketing', description: 'Sync guest data for email campaigns, promotions, and newsletters.', color: '#FFE01B', fields: ['API Key', 'Audience ID'] },
  { id: 'twilio', name: 'Twilio', category: 'Communication', description: 'SMS notifications for orders, reservations, and marketing messages.', color: '#F22F46', fields: ['Account SID', 'Auth Token', 'From Phone Number'] },
  { id: 'stripe', name: 'Stripe', category: 'Accounting', description: 'Accept online payments and manage subscriptions seamlessly.', color: '#635BFF', fields: ['Publishable Key', 'Secret Key', 'Webhook Secret'] },
  { id: 'hubspot', name: 'HubSpot', category: 'Marketing', description: 'CRM integration for guest relationship management and marketing automation.', color: '#FF7A59', fields: ['Private Access Token'] },
  { id: 'slack', name: 'Slack', category: 'Communication', description: 'Get real-time alerts for orders, low stock, and reservations in Slack.', color: '#4A154B', fields: ['Webhook URL', 'Channel Name'] },
];

const ACTION_COLORS = {
  create: { bg: 'rgba(34,197,94,0.1)', text: '#16a34a' },
  update: { bg: 'rgba(245,158,11,0.1)', text: '#d97706' },
  delete: { bg: 'rgba(239,68,68,0.1)', text: '#dc2626' },
  login:  { bg: 'rgba(59,130,246,0.1)', text: '#2563eb' },
  logout: { bg: 'rgba(100,116,139,0.1)', text: '#64748b' },
  void:   { bg: 'rgba(239,68,68,0.1)', text: '#dc2626' },
  comp:   { bg: 'rgba(245,158,11,0.1)', text: '#d97706' },
  settings: { bg: 'rgba(30, 94, 74,0.1)', text: '#1e5e4a' },
};

const DEFAULT_COMPLIANCE = [
  { id: 'data_encryption', label: 'Data encrypted at rest and in transit', done: true },
  { id: 'consent_management', label: 'Cookie and consent management implemented', done: true },
  { id: 'right_to_delete', label: 'Right to erasure (deletion) workflows active', done: true },
  { id: 'data_portability', label: 'Data export available for guests on request', done: true },
  { id: 'breach_notification', label: 'Breach notification process documented', done: true },
  { id: 'privacy_policy', label: 'Privacy policy published and accessible', done: true },
  { id: 'dpo_appointed', label: 'Data Protection Officer appointed', done: false },
];

const DEFAULT_API_KEYS = [
  { id: 'key_prod_1', name: 'Production Key', key: 'kg_live_aBcDeFgH1234XyZ56789qWeRtY', created: '2025-11-10T10:00:00Z', lastUsed: '2026-03-29T14:23:00Z', status: 'active' },
  { id: 'key_stage_1', name: 'Staging Key', key: 'kg_test_mNoPqRsT9876UvWx54321zZyXw', created: '2026-01-05T08:00:00Z', lastUsed: '2026-03-28T09:15:00Z', status: 'active' },
];

const DEFAULT_WEBHOOKS = [
  { id: 'wh_1', url: 'https://hooks.example.com/kitchgoo/orders', events: ['order.created', 'order.paid'], status: 'active', lastTriggered: '2026-03-29T18:45:00Z' },
  { id: 'wh_2', url: 'https://inventory.example.com/webhook', events: ['inventory.low', 'inventory.updated'], status: 'paused', lastTriggered: '2026-03-27T12:00:00Z' },
];

const DEFAULT_INTEGRATIONS = {
  quickbooks: { active: true, config: { 'Client ID': 'qb_live_9921', 'Company ID': '91384022' }, lastSync: '2026-03-29T16:30:00Z' },
  twilio: { active: true, config: { 'Account SID': 'AC_8930219481', 'From Phone Number': '+18005550199' }, lastSync: '2026-03-29T18:00:00Z' },
};

const DEFAULT_SESSIONS = [
  { id: 'sess_1', user: 'Admin', device: 'Chrome on MacOS', ip: '192.168.1.100', lastActive: new Date().toISOString(), current: true },
  { id: 'sess_2', user: 'Priya M.', device: 'Safari on iPad', ip: '192.168.1.102', lastActive: new Date(Date.now() - 3600000).toISOString(), current: false },
  { id: 'sess_3', user: 'Chef Ravi', device: 'Chrome on Android', ip: '192.168.1.105', lastActive: new Date(Date.now() - 14400000).toISOString(), current: false },
];

// ── Helpers ────────────────────────────────────────────────────

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '--';

const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST' : '--';

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
    background: bg, color, whiteSpace: 'nowrap', textTransform: 'capitalize', ...sx,
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
// ── TENANT ACCOUNTS TAB ────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

const AccountsTab = ({ addAuditEntry }) => {
  const { register, impersonateAccount } = useAuth();
  const { reload } = useApp();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState({
    accountName: '',
    ownerName: '',
    email: '',
    password: '',
    phone: '',
    plan: 'pro',
    status: 'active'
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [flagsMap, setFlagsMap] = useState({});
  const [flagsLoading, setFlagsLoading] = useState({});

  const loadUsers = useCallback(() => {
    setUsers(getAll('users') || []);
  }, []);

  const loadFlags = async () => {
    try {
      const res = await fetch('/api/admin/accounts/flags', { credentials: 'include' });
      const data = await res.json();
      if (data.success) setFlagsMap(data.flagsMap || {});
    } catch { /* silently ignore */ }
  };

  useEffect(() => {
    loadUsers();
    loadFlags();
  }, [loadUsers]);

  const handleToggleAuditLog = async (accountId, currentDisabled) => {
    setFlagsLoading(prev => ({ ...prev, [accountId]: true }));
    try {
      const newFlags = { ...(flagsMap[accountId] || {}), audit_log_disabled: !currentDisabled };
      const res = await fetch(`/api/admin/accounts/${encodeURIComponent(accountId)}/flags`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flags: newFlags }),
      });
      const data = await res.json();
      if (data.success) {
        setFlagsMap(prev => ({ ...prev, [accountId]: newFlags }));
        addAuditEntry?.('account.flags_update', 'system', 'Admin', `${!currentDisabled ? 'Disabled' : 'Enabled'} audit logging for account ${accountId}`);
      }
    } finally {
      setFlagsLoading(prev => ({ ...prev, [accountId]: false }));
    }
  };

  const tenantAccounts = useMemo(() => {
    return users.filter(u => 
      u.restaurantName && 
      u.restaurantName.toLowerCase() !== 'kitchgoo'
    ).filter(u => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        (u.restaurantName || '').toLowerCase().includes(s) ||
        (u.name || '').toLowerCase().includes(s) ||
        (u.email || '').toLowerCase().includes(s) ||
        (u.plan || '').toLowerCase().includes(s)
      );
    });
  }, [users, search]);

  // Metrics summary
  const metrics = useMemo(() => {
    const total = tenantAccounts.length;
    const active = tenantAccounts.filter(a => (a.status || 'active') === 'active').length;
    const mrr = tenantAccounts.reduce((acc, curr) => {
      const p = curr.plan || 'pro';
      const planObj = PLANS.find(x => x.id === p) || PLANS[1];
      return acc + (curr.status === 'suspended' ? 0 : planObj.price);
    }, 0);
    return { total, active, mrr, totalUsers: users.length };
  }, [tenantAccounts, users]);

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    if (!form.accountName || !form.ownerName || !form.email || !form.password) {
      setError('Please fill in all required fields.');
      return;
    }
    setLoading(true);
    setError('');

    const result = await register({
      name: form.ownerName,
      email: form.email,
      password: form.password,
      role: 'Owner',
      restaurantName: form.accountName,
      phone: form.phone
    });

    setLoading(false);
    if (result.success) {
      // Find created user and apply plan & status
      const updatedUsers = getAll('users') || [];
      const created = updatedUsers.find(u => u.email === form.email);
      if (created) {
        await dbUpdate('users', created.id, { plan: form.plan, status: form.status });
      }
      addAuditEntry?.('account.create', 'system', 'Admin', `Created tenant account ${form.accountName} (${form.plan} plan)`);
      setShowCreateModal(false);
      setForm({
        accountName: '', ownerName: '', email: '', password: '', phone: '', plan: 'pro', status: 'active'
      });
      loadUsers();
    } else {
      setError(result.error);
    }
  };

  const handleUpdateAccount = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    setLoading(true);
    try {
      await dbUpdate('users', editingUser.id, {
        name: editingUser.name,
        email: editingUser.email,
        phone: editingUser.phone,
        plan: editingUser.plan || 'pro',
        status: editingUser.status || 'active',
        restaurantName: editingUser.restaurantName,
      });
      addAuditEntry?.('account.update', 'system', 'Admin', `Updated tenant account ${editingUser.restaurantName}`);
      setEditingUser(null);
      loadUsers();
    } catch (err) {
      alert('Failed to update account: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async (userId, userName, restaurantName) => {
    if (window.confirm(`Are you sure you want to delete account "${restaurantName}" for user "${userName}"?`)) {
      await dbRemove('users', userId);
      addAuditEntry?.('account.delete', 'system', 'Admin', `Deleted account ${restaurantName}`);
      loadUsers();
    }
  };

  const handleOpenAccount = async (tenantName) => {
    const res = await impersonateAccount(tenantName);
    if (res.success) {
      addAuditEntry?.('account.impersonate', 'system', 'Admin', `Impersonated account ${tenantName}`);
      reload();
      navigate('/');
    } else {
      alert(res.error || 'Failed to open account.');
    }
  };

  return (
    <div className="animate-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        <div style={{ padding: '16px', background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Accounts</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>{metrics.total}</div>
        </div>
        <div style={{ padding: '16px', background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active Tenants</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--success)', marginTop: '4px' }}>{metrics.active}</div>
        </div>
        <div style={{ padding: '16px', background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Estimated MRR</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--primary)', marginTop: '4px' }}>&#8377;{metrics.mrr.toLocaleString('en-IN')}</div>
        </div>
        <div style={{ padding: '16px', background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Platform Users</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent-blue, #2563eb)', marginTop: '4px' }}>{metrics.totalUsers}</div>
        </div>
      </div>

      {/* Action Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ position: 'relative', flex: '0 1 320px', minWidth: '200px' }}>
          <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input 
            className="input-field" 
            placeholder="Search accounts or email..." 
            value={search} 
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: '32px', width: '100%' }} 
          />
        </div>
        <button 
          className="btn btn-primary" 
          onClick={() => { setError(''); setShowCreateModal(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Plus size={16} /> Create Account
        </button>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div className="table-wrapper">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: 'rgba(30, 94, 74,0.04)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)' }}>Account Name</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)' }}>Owner</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)' }}>Plan</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)' }}>Created</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)' }}>Audit Log</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenantAccounts.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No tenant accounts found. Click "Create Account" to add one.
                  </td>
                </tr>
              ) : (
                tenantAccounts.map(account => {
                  const plan = account.plan || 'pro';
                  const status = account.status || 'active';
                  const statusBg = status === 'active' ? 'rgba(34,197,94,0.1)' : status === 'trial' ? 'rgba(59,130,246,0.1)' : 'rgba(239,68,68,0.1)';
                  const statusColor = status === 'active' ? '#16a34a' : status === 'trial' ? '#2563eb' : '#dc2626';

                  return (
                    <tr key={account.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {account.restaurantName}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                        <div>{account.name}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{account.email}</div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <Badge bg="rgba(30, 94, 74,0.08)" color="var(--primary)">{plan}</Badge>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <Badge bg={statusBg} color={statusColor}>{status}</Badge>
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                        {account.createdAt ? new Date(account.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '--'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        {(() => {
                          const accountId = account.restaurantName;
                          const disabled = !!(flagsMap[accountId]?.audit_log_disabled);
                          const busy = !!flagsLoading[accountId];
                          return (
                            <button
                              onClick={() => handleToggleAuditLog(accountId, disabled)}
                              disabled={busy}
                              title={disabled ? 'Audit log disabled — click to enable' : 'Audit log enabled — click to disable'}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: busy ? 'wait' : 'pointer',
                                padding: '2px',
                                opacity: busy ? 0.5 : 1,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.75rem',
                                color: disabled ? 'var(--text-muted)' : 'var(--primary)',
                                fontWeight: 600,
                              }}
                            >
                              {disabled
                                ? <><ToggleLeft size={18} /> Off</>
                                : <><ToggleRight size={18} /> On</>
                              }
                            </button>
                          );
                        })()}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => setEditingUser({ ...account })}
                            title="Edit Account Details"
                            style={{ padding: '5px 8px' }}
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => handleOpenAccount(account.restaurantName)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', padding: '5px 10px' }}
                          >
                            <ExternalLink size={12} /> Open
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => handleDeleteAccount(account.id, account.name, account.restaurantName)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', padding: '5px 10px' }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Account Modal */}
      {showCreateModal && (
        <Modal title="Create Tenant Account" onClose={() => setShowCreateModal(false)}>
          <form onSubmit={handleCreateAccount}>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="input-group">
                <label className="input-label">Account Name (Restaurant Name) <span style={{ color: 'red' }}>*</span></label>
                <input 
                  className="input-field" 
                  placeholder="e.g. Kiko Cafe" 
                  value={form.accountName} 
                  onChange={e => setForm(prev => ({ ...prev, accountName: e.target.value }))}
                  required
                />
              </div>
              <div className="input-group">
                <label className="input-label">Owner Name <span style={{ color: 'red' }}>*</span></label>
                <input 
                  className="input-field" 
                  placeholder="e.g. Kiko Owner" 
                  value={form.ownerName} 
                  onChange={e => setForm(prev => ({ ...prev, ownerName: e.target.value }))}
                  required
                />
              </div>
              <div className="input-group">
                <label className="input-label">Owner Email <span style={{ color: 'red' }}>*</span></label>
                <input 
                  className="input-field" 
                  type="email" 
                  placeholder="owner@kikocafe.com" 
                  value={form.email} 
                  onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                  required
                />
              </div>
              <div className="input-group">
                <label className="input-label">Password <span style={{ color: 'red' }}>*</span></label>
                <div style={{ position: 'relative' }}>
                  <input 
                    className="input-field" 
                    type={showPassword ? 'text' : 'password'} 
                    placeholder="Enter owner password" 
                    value={form.password} 
                    onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
                    style={{ paddingRight: '44px', width: '100%' }}
                    required
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="input-group">
                  <label className="input-label">Subscription Plan</label>
                  <select 
                    className="input-field" 
                    value={form.plan} 
                    onChange={e => setForm(prev => ({ ...prev, plan: e.target.value }))}
                  >
                    <option value="basic">Basic (&#8377;2,999/mo)</option>
                    <option value="pro">Pro (&#8377;7,999/mo)</option>
                    <option value="enterprise">Enterprise (&#8377;19,999/mo)</option>
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">Account Status</label>
                  <select 
                    className="input-field" 
                    value={form.status} 
                    onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))}
                  >
                    <option value="active">Active</option>
                    <option value="trial">Trial</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>

              {error && (
                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '10px', padding: '10px 14px', fontSize: '0.82rem', color: '#dc2626' }}>
                  ⚠ {error}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Creating...' : 'Create Account'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Account Modal */}
      {editingUser && (
        <Modal title={`Edit Account — ${editingUser.restaurantName}`} onClose={() => setEditingUser(null)}>
          <form onSubmit={handleUpdateAccount}>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="input-group">
                <label className="input-label">Account Name</label>
                <input 
                  className="input-field" 
                  value={editingUser.restaurantName || ''} 
                  onChange={e => setEditingUser(prev => ({ ...prev, restaurantName: e.target.value }))}
                  required
                />
              </div>
              <div className="input-group">
                <label className="input-label">Owner Name</label>
                <input 
                  className="input-field" 
                  value={editingUser.name || ''} 
                  onChange={e => setEditingUser(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              <div className="input-group">
                <label className="input-label">Owner Email</label>
                <input 
                  className="input-field" 
                  type="email" 
                  value={editingUser.email || ''} 
                  onChange={e => setEditingUser(prev => ({ ...prev, email: e.target.value }))}
                  required
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="input-group">
                  <label className="input-label">Subscription Plan</label>
                  <select 
                    className="input-field" 
                    value={editingUser.plan || 'pro'} 
                    onChange={e => setEditingUser(prev => ({ ...prev, plan: e.target.value }))}
                  >
                    <option value="basic">Basic (&#8377;2,999/mo)</option>
                    <option value="pro">Pro (&#8377;7,999/mo)</option>
                    <option value="enterprise">Enterprise (&#8377;19,999/mo)</option>
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">Status</label>
                  <select 
                    className="input-field" 
                    value={editingUser.status || 'active'} 
                    onChange={e => setEditingUser(prev => ({ ...prev, status: e.target.value }))}
                  >
                    <option value="active">Active</option>
                    <option value="trial">Trial</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setEditingUser(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// ── SUBSCRIPTION TAB ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

const SubscriptionTab = ({ settings, orders, updateSettingsSection, addAuditEntry, user }) => {
  const currentPlanId = settings?.subscription?.plan || 'pro';
  const plan = PLANS.find(p => p.id === currentPlanId) || PLANS[1];
  
  const [updatingPlan, setUpdatingPlan] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [showBillingModal, setShowBillingModal] = useState(false);

  const paymentMethod = settings?.subscription?.paymentMethod || 'Visa ending 4242';
  const nextBillingDate = settings?.subscription?.nextBillingDate || '15 Aug 2026';
  const gstNumber = settings?.subscription?.gstNumber || '07AAAAA0000A1Z5';

  const [billingForm, setBillingForm] = useState({
    paymentMethod,
    nextBillingDate,
    gstNumber,
  });

  const usage = useMemo(() => {
    const realTransactions = (orders || []).length;
    const sms = settings?.subscription?.usage?.sms ?? 847;
    const apiCalls = settings?.subscription?.usage?.apiCalls ?? 12890;
    return { sms, transactions: realTransactions || 3241, apiCalls };
  }, [orders, settings]);

  const handlePlanChange = async (planId) => {
    const targetPlan = PLANS.find(p => p.id === planId);
    if (!targetPlan) return;
    setUpdatingPlan(planId);
    
    await updateSettingsSection('subscription', {
      ...settings?.subscription,
      plan: planId,
      updatedAt: new Date().toISOString(),
    });

    addAuditEntry?.('subscription.change', user?.id || 'system', user?.name || 'Admin', `Changed subscription plan to ${targetPlan.name}`);
    setSuccessMsg(`Plan successfully updated to ${targetPlan.name}!`);
    setTimeout(() => setSuccessMsg(''), 3000);
    setUpdatingPlan(null);
  };

  const handleSaveBilling = async (e) => {
    e.preventDefault();
    await updateSettingsSection('subscription', {
      ...settings?.subscription,
      paymentMethod: billingForm.paymentMethod,
      nextBillingDate: billingForm.nextBillingDate,
      gstNumber: billingForm.gstNumber,
    });
    addAuditEntry?.('subscription.billing_update', user?.id || 'system', user?.name || 'Admin', 'Updated billing details');
    setShowBillingModal(false);
    setSuccessMsg('Billing details updated successfully!');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  return (
    <div className="animate-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Success Notification */}
      {successMsg && (
        <div style={{
          background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: '12px', padding: '14px 20px', color: '#16a34a', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem'
        }}>
          <CheckCircle size={18} /> {successMsg}
        </div>
      )}

      {/* Current Plan Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #1e5e4a, #2e7d5b)', borderRadius: '16px',
        padding: '28px', color: 'white', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
        <div style={{ position: 'absolute', bottom: -20, right: 60, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1, flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '0.75rem', opacity: 0.8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Current Subscription Plan</div>
            <div style={{ fontSize: '2rem', fontWeight: 800 }}>{plan.name}</div>
            <div style={{ fontSize: '0.85rem', opacity: 0.9, marginTop: '4px' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 800 }}>&#8377;{plan.price.toLocaleString('en-IN')}</span>{plan.period}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Next billing date</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>{nextBillingDate}</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '4px' }}>{paymentMethod}</div>
            <button 
              onClick={() => setShowBillingModal(true)}
              style={{
                marginTop: '10px', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
                color: 'white', padding: '5px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px'
              }}
            >
              <Edit3 size={12} /> Manage Billing
            </button>
          </div>
        </div>
      </div>

      {/* Usage Meters */}
      <div>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>Usage This Billing Cycle</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
          <UsageMeter label="SMS Credits" used={usage.sms} total={plan.sms} icon={MessageSquare} />
          <UsageMeter label="Processed Transactions" used={usage.transactions} total={plan.transactions} icon={DollarSign} />
          <UsageMeter label="API Calls" used={usage.apiCalls} total={plan.apiCalls} icon={Zap} />
        </div>
      </div>

      {/* Feature Comparison Table */}
      <div>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>Plan Features</h3>
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          <div className="table-wrapper">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: 'rgba(30, 94, 74,0.04)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)' }}>Feature</th>
                  {PLANS.map(p => (
                    <th key={p.id} style={{
                      padding: '12px 16px', textAlign: 'center', fontWeight: 700, borderBottom: '1px solid var(--border-subtle)',
                      color: p.id === currentPlanId ? 'var(--primary)' : 'var(--text-primary)',
                      background: p.id === currentPlanId ? 'rgba(30, 94, 74,0.06)' : 'transparent',
                    }}>
                      {p.name}
                      {p.id === currentPlanId && <div style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--primary)', marginTop: '2px' }}>CURRENT</div>}
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
                        background: p.id === currentPlanId ? 'rgba(30, 94, 74,0.03)' : 'transparent',
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

      {/* Upgrade / Downgrade Action Buttons */}
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
        {PLANS.map(p => {
          const isCurrent = p.id === currentPlanId;
          const isHigher = PLANS.indexOf(p) > PLANS.findIndex(x => x.id === currentPlanId);
          return (
            <button
              key={p.id}
              onClick={() => !isCurrent && handlePlanChange(p.id)}
              disabled={isCurrent || updatingPlan === p.id}
              className={isCurrent ? 'btn btn-secondary' : isHigher ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{ minWidth: '180px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              {updatingPlan === p.id ? (
                <><RefreshCw size={14} className="spin" /> Updating...</>
              ) : isCurrent ? (
                <><Check size={14} /> Active Plan</>
              ) : isHigher ? (
                <>Upgrade to {p.name}</>
              ) : (
                <>Downgrade to {p.name}</>
              )}
            </button>
          );
        })}
      </div>

      {/* Edit Billing Modal */}
      {showBillingModal && (
        <Modal title="Manage Billing & Payment Details" onClose={() => setShowBillingModal(false)}>
          <form onSubmit={handleSaveBilling}>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="input-group">
                <label className="input-label">Payment Method</label>
                <input 
                  className="input-field" 
                  placeholder="e.g. Visa ending 4242 or UPI / Bank Transfer" 
                  value={billingForm.paymentMethod} 
                  onChange={e => setBillingForm(prev => ({ ...prev, paymentMethod: e.target.value }))}
                  required
                />
              </div>
              <div className="input-group">
                <label className="input-label">Next Billing Date</label>
                <input 
                  className="input-field" 
                  value={billingForm.nextBillingDate} 
                  onChange={e => setBillingForm(prev => ({ ...prev, nextBillingDate: e.target.value }))}
                  required
                />
              </div>
              <div className="input-group">
                <label className="input-label">GSTIN / Tax Registration</label>
                <input 
                  className="input-field" 
                  value={billingForm.gstNumber} 
                  onChange={e => setBillingForm(prev => ({ ...prev, gstNumber: e.target.value }))}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowBillingModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Billing Info</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// ── AUDIT LOGS TAB ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

const AuditLogsTab = ({ auditLog, addAuditEntry }) => {
  const [search, setSearch] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterAccount, setFilterAccount] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [allLogs, setAllLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch all audit logs across all tenants if platform admin
  const fetchAllAuditLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/data/audit-all', { credentials: 'include' });
      const data = await res.json();
      if (data.success && Array.isArray(data.auditLog)) {
        setAllLogs(data.auditLog);
      } else {
        setAllLogs(auditLog || []);
      }
    } catch {
      setAllLogs(auditLog || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllAuditLogs();
  }, [auditLog]);

  const handleSeedDemoLogs = () => {
    addAuditEntry?.('account.create', 'system', 'Admin', 'Created tenant account "Kiko Cafe"');
    addAuditEntry?.('settings.update', 'system', 'Admin', 'Updated system security and password policy');
    addAuditEntry?.('integration.connect', 'system', 'Admin', 'Connected QuickBooks Online integration');
    addAuditEntry?.('subscription.change', 'system', 'Admin', 'Upgraded subscription plan to Enterprise');
    fetchAllAuditLogs();
  };

  const users = useMemo(() => [...new Set(allLogs.map(l => l.userName || l.user))], [allLogs]);
  const actions = useMemo(() => [...new Set(allLogs.map(l => l.action))], [allLogs]);
  const accounts = useMemo(() => [...new Set(allLogs.map(l => l.accountId || 'Kitchgoo'))], [allLogs]);

  const filtered = useMemo(() => {
    return allLogs.filter(l => {
      if (search) {
        const s = search.toLowerCase();
        if (
          !(l.details || '').toLowerCase().includes(s) &&
          !(l.action || '').toLowerCase().includes(s) &&
          !(l.userName || '').toLowerCase().includes(s) &&
          !(l.accountId || '').toLowerCase().includes(s)
        ) return false;
      }
      if (filterUser && (l.userName || l.user) !== filterUser) return false;
      if (filterAction && l.action !== filterAction) return false;
      if (filterAccount && (l.accountId || 'Kitchgoo') !== filterAccount) return false;
      if (dateFrom && l.timestamp < dateFrom) return false;
      if (dateTo && new Date(l.timestamp) > new Date(dateTo + 'T23:59:59')) return false;
      return true;
    });
  }, [allLogs, search, filterUser, filterAction, filterAccount, dateFrom, dateTo]);

  const exportCSV = useCallback(() => {
    const header = 'Timestamp,Account,User,Action,Details,IP Address';
    const rows = filtered.map(l =>
      `"${fmtDateTime(l.timestamp)}","${l.accountId || 'Kitchgoo'}","${l.userName || l.user}","${l.action}","${(l.details || '').replace(/"/g, '""')}","${l.ip || ''}"`
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
        <select className="input-field" value={filterAccount} onChange={e => setFilterAccount(e.target.value)} style={{ flex: '0 1 160px' }}>
          <option value="">All Accounts</option>
          {accounts.map(acc => <option key={acc} value={acc}>{acc}</option>)}
        </select>
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
        <button className="btn btn-secondary" onClick={handleSeedDemoLogs} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={14} /> Add Test Entry
        </button>
      </div>

      {/* Count */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
        <span>Showing {filtered.length} of {allLogs.length} entries</span>
        {loading && <span><RefreshCw size={12} className="spin" style={{ display: 'inline', marginRight: 4 }} /> Syncing...</span>}
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div className="table-wrapper">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: 'rgba(30, 94, 74,0.04)' }}>
                {['Timestamp', 'Account', 'User', 'Action', 'Details', 'IP Address'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No audit log entries found. Click "Add Test Entry" to create a sample audit event.
                  </td>
                </tr>
              ) : filtered.slice(0, 100).map(l => {
                const ac = getActionColor(l.action);
                return (
                  <tr key={l.id || l.timestamp} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmtDateTime(l.timestamp)}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{l.accountId || 'Kitchgoo'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{l.userName || l.user}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <Badge bg={ac.bg} color={ac.text}>{l.action}</Badge>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.details}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.75rem' }}>{l.ip || '192.168.1.100'}</td>
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

const ApiWebhooksTab = ({ settings, updateSettingsSection, addAuditEntry }) => {
  const [apiKeys, setApiKeys] = useState(() => settings?.api?.keys || DEFAULT_API_KEYS);
  const [webhooks, setWebhooks] = useState(() => settings?.api?.webhooks || DEFAULT_WEBHOOKS);

  const [showNewKey, setShowNewKey] = useState(null);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEvents, setWebhookEvents] = useState([]);
  const [visibleKeys, setVisibleKeys] = useState({});
  const [testResult, setTestResult] = useState(null);

  // Sync settings when loaded
  useEffect(() => {
    if (settings?.api?.keys) setApiKeys(settings.api.keys);
    if (settings?.api?.webhooks) setWebhooks(settings.api.webhooks);
  }, [settings]);

  const saveApiSettings = async (keys, hooks) => {
    setApiKeys(keys);
    setWebhooks(hooks);
    await updateSettingsSection('api', { keys, webhooks, updatedAt: new Date().toISOString() });
  };

  const handleGenerateKey = async () => {
    const key = generateApiKey();
    const newKey = {
      id: genId(), name: newKeyName || 'New API Key', key,
      created: new Date().toISOString(), lastUsed: null, status: 'active',
    };
    const updatedKeys = [...apiKeys, newKey];
    await saveApiSettings(updatedKeys, webhooks);
    setShowNewKey(key);
    setShowKeyModal(false);
    setNewKeyName('');
    addAuditEntry?.('api_key.create', 'system', 'Admin', `Generated API key: ${newKeyName || 'New API Key'}`);
  };

  const handleRevokeKey = async (id) => {
    const updatedKeys = apiKeys.map(k => k.id === id ? { ...k, status: 'revoked' } : k);
    await saveApiSettings(updatedKeys, webhooks);
    addAuditEntry?.('api_key.delete', 'system', 'Admin', 'Revoked API key');
  };

  const handleAddWebhook = async () => {
    if (!webhookUrl) return;
    const wh = {
      id: genId(), url: webhookUrl, events: webhookEvents,
      status: 'active', lastTriggered: null,
    };
    const updatedWebhooks = [...webhooks, wh];
    await saveApiSettings(apiKeys, updatedWebhooks);
    setShowWebhookModal(false);
    setWebhookUrl('');
    setWebhookEvents([]);
    addAuditEntry?.('webhook.create', 'system', 'Admin', `Added webhook endpoint: ${webhookUrl}`);
  };

  const handleTestWebhook = async (wh) => {
    const now = new Date().toISOString();
    const updatedWebhooks = webhooks.map(w => w.id === wh.id ? { ...w, lastTriggered: now } : w);
    await saveApiSettings(apiKeys, updatedWebhooks);

    setTestResult({
      url: wh.url,
      event: wh.events[0] || 'order.created',
      status: 200,
      latency: Math.floor(25 + Math.random() * 35),
      timestamp: now,
      payload: {
        event: wh.events[0] || 'order.created',
        timestamp: now,
        data: { orderId: 'ORD-1042', amount: 850, items: 3, tenant: 'Kitchgoo' }
      }
    });
    addAuditEntry?.('webhook.test', 'system', 'Admin', `Tested webhook endpoint: ${wh.url}`);
  };

  const toggleWebhookStatus = async (id) => {
    const updatedWebhooks = webhooks.map(w => w.id === id ? { ...w, status: w.status === 'active' ? 'paused' : 'active' } : w);
    await saveApiSettings(apiKeys, updatedWebhooks);
  };

  const removeWebhook = async (id) => {
    const updatedWebhooks = webhooks.filter(w => w.id !== id);
    await saveApiSettings(apiKeys, updatedWebhooks);
    addAuditEntry?.('webhook.delete', 'system', 'Admin', 'Removed webhook endpoint');
  };

  const toggleEvent = (evt) => {
    setWebhookEvents(prev => prev.includes(evt) ? prev.filter(e => e !== evt) : [...prev, evt]);
  };

  return (
    <div className="animate-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* One-time key reveal banner */}
      {showNewKey && (
        <div style={{
          background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '12px',
          padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
        }}>
          <ShieldCheck size={20} style={{ color: 'var(--success)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
              New API Key Generated — Copy it now! It will not be shown again.
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
                <tr style={{ background: 'rgba(30, 94, 74,0.04)' }}>
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
            <Globe size={18} style={{ color: 'var(--accent-blue, #2563eb)' }} /> Webhook Endpoints
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
                      <Badge key={ev} bg="rgba(30, 94, 74,0.08)" color="var(--primary)">{ev}</Badge>
                    ))}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Last triggered: {w.lastTriggered ? fmtDateTime(w.lastTriggered) : 'Never'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => handleTestWebhook(w)}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Play size={13} /> Test Ping
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
              <input className="input-field" placeholder="e.g., Production, Mobile App, POS Terminal" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} />
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
                  <button key={evt} type="button" onClick={() => toggleEvent(evt)}
                    style={{
                      padding: '6px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600,
                      border: '1px solid', cursor: 'pointer', transition: 'all 0.15s ease',
                      background: webhookEvents.includes(evt) ? 'rgba(30, 94, 74,0.1)' : 'transparent',
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

      {/* Test Webhook Results Modal */}
      {testResult && (
        <Modal title="Webhook Ping Test Result" onClose={() => setTestResult(null)} wide>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Badge bg="rgba(34,197,94,0.12)" color="#16a34a" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                {testResult.status} OK
              </Badge>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Response time: {testResult.latency} ms</span>
            </div>
            <div className="input-group">
              <label className="input-label">Target URL</label>
              <code style={{ fontSize: '0.8rem', padding: '8px', background: 'rgba(0,0,0,0.04)', borderRadius: '6px', display: 'block' }}>{testResult.url}</code>
            </div>
            <div className="input-group">
              <label className="input-label">Simulated Payload Sent</label>
              <pre style={{ fontSize: '0.78rem', background: '#1e293b', color: '#f8fafc', padding: '12px', borderRadius: '8px', overflowX: 'auto', margin: 0 }}>
                {JSON.stringify(testResult.payload, null, 2)}
              </pre>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-primary" onClick={() => setTestResult(null)}>Close</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// ── INTEGRATIONS TAB ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

const IntegrationsTab = ({ settings, updateSettingsSection, addAuditEntry }) => {
  const [category, setCategory] = useState('All');
  const [integrationsState, setIntegrationsState] = useState(() => settings?.integrations || DEFAULT_INTEGRATIONS);
  const [activeModal, setActiveModal] = useState(null);
  const [formConfig, setFormConfig] = useState({});
  const [syncingId, setSyncingId] = useState(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (settings?.integrations) setIntegrationsState(settings.integrations);
  }, [settings]);

  const saveIntegrations = async (nextState) => {
    setIntegrationsState(nextState);
    await updateSettingsSection('integrations', nextState);
  };

  const filtered = category === 'All' ? INTEGRATIONS_LIST : INTEGRATIONS_LIST.filter(i => i.category === category);

  const handleOpenConfig = (integ) => {
    const existing = integrationsState[integ.id]?.config || {};
    setFormConfig(existing);
    setActiveModal(integ);
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    if (!activeModal) return;

    const nextState = {
      ...integrationsState,
      [activeModal.id]: {
        active: true,
        config: formConfig,
        lastSync: new Date().toISOString(),
      }
    };
    await saveIntegrations(nextState);
    addAuditEntry?.('integration.connect', 'system', 'Admin', `Connected / configured integration: ${activeModal.name}`);
    setToast(`Successfully connected ${activeModal.name}!`);
    setTimeout(() => setToast(''), 3000);
    setActiveModal(null);
  };

  const handleDisconnect = async (integId, integName) => {
    if (window.confirm(`Are you sure you want to disconnect ${integName}?`)) {
      const nextState = { ...integrationsState };
      delete nextState[integId];
      await saveIntegrations(nextState);
      addAuditEntry?.('integration.disconnect', 'system', 'Admin', `Disconnected integration: ${integName}`);
      setToast(`Disconnected ${integName}.`);
      setTimeout(() => setToast(''), 3000);
    }
  };

  const handleSyncNow = async (integId, integName) => {
    setSyncingId(integId);
    setTimeout(async () => {
      const nextState = {
        ...integrationsState,
        [integId]: {
          ...(integrationsState[integId] || { active: true }),
          lastSync: new Date().toISOString()
        }
      };
      await saveIntegrations(nextState);
      setSyncingId(null);
      setToast(`Synced ${integName} successfully!`);
      setTimeout(() => setToast(''), 3000);
    }, 1200);
  };

  return (
    <div className="animate-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Toast alert */}
      {toast && (
        <div style={{
          background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: '12px', padding: '12px 18px', color: '#16a34a', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem'
        }}>
          <CheckCircle size={16} /> {toast}
        </div>
      )}

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
          const integData = integrationsState[integ.id];
          const isConnected = !!integData?.active;

          return (
            <div key={integ.id} className="card" style={{
              padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px',
              border: isConnected ? '1px solid rgba(34,197,94,0.3)' : '1px solid var(--border-subtle)',
              transition: 'all 0.2s ease',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
              {isConnected && integData?.lastSync && (
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <RefreshCw size={12} className={syncingId === integ.id ? 'spin' : ''} />
                  Last sync: {fmtDateTime(integData.lastSync)}
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                {isConnected ? (
                  <>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleOpenConfig(integ)}
                    >
                      Configure
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleSyncNow(integ.id, integ.name)}
                      disabled={syncingId === integ.id}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <RefreshCw size={12} className={syncingId === integ.id ? 'spin' : ''} />
                      Sync
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDisconnect(integ.id, integ.name)}
                    >
                      Disconnect
                    </button>
                  </>
                ) : (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleOpenConfig(integ)}
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Integration Setup Modal */}
      {activeModal && (
        <Modal title={`Configure ${activeModal.name}`} onClose={() => setActiveModal(null)}>
          <form onSubmit={handleSaveConfig}>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                Enter your credentials to link {activeModal.name} with your Kitchgoo account.
              </p>
              {activeModal.fields.map(fieldName => (
                <div className="input-group" key={fieldName}>
                  <label className="input-label">{fieldName} <span style={{ color: 'red' }}>*</span></label>
                  <input
                    className="input-field"
                    type={fieldName.toLowerCase().includes('secret') || fieldName.toLowerCase().includes('token') || fieldName.toLowerCase().includes('key') ? 'password' : 'text'}
                    placeholder={`Enter ${fieldName}`}
                    value={formConfig[fieldName] || ''}
                    onChange={e => setFormConfig(prev => ({ ...prev, [fieldName]: e.target.value }))}
                    required
                  />
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save & Connect</button>
            </div>
          </form>
        </Modal>
      )}
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
  const [compliance, setCompliance] = useState(() => securitySettings.compliance || DEFAULT_COMPLIANCE);
  const [activeSessions, setActiveSessions] = useState(() => securitySettings.sessions || DEFAULT_SESSIONS);
  const [saved, setSaved] = useState(false);

  const toggleComplianceItem = async (id) => {
    const updated = compliance.map(item => item.id === id ? { ...item, done: !item.done } : item);
    setCompliance(updated);
    await updateSettingsSection?.('security', {
      ...securitySettings,
      compliance: updated,
    });
    addAuditEntry?.('security.compliance_toggle', 'system', 'Admin', `Updated compliance item: ${id}`);
  };

  const handleSavePolicy = async () => {
    await updateSettingsSection?.('security', {
      ...securitySettings,
      minPasswordLength: passwordPolicy.minLength,
      requireSpecialChars: passwordPolicy.requireSpecial,
      passwordExpiryDays: passwordPolicy.expiryDays,
      twoFactorEnabled,
      compliance,
      sessions: activeSessions,
    });
    addAuditEntry?.('settings.update', 'system', 'Admin', 'Updated security policy settings');
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleLogoutSession = async (id) => {
    const updated = activeSessions.filter(s => s.id !== id);
    setActiveSessions(updated);
    await updateSettingsSection?.('security', {
      ...securitySettings,
      sessions: updated,
    });
    addAuditEntry?.('session.terminate', 'system', 'Admin', `Terminated active user session: ${id}`);
  };

  const handleDataExport = () => {
    addAuditEntry?.('gdpr.export_request', 'system', 'Admin', 'Generated full GDPR data export');
    const exportData = {
      exportDate: new Date().toISOString(),
      platform: 'Kitchgoo SaaS',
      users: getAll('users') || [],
      settings: settings || {},
    };
    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kitchgoo-gdpr-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
            Your payment processing meets PCI DSS Level 1 security standards. Last audit: 15 Feb 2026
          </div>
        </div>
        <Badge bg="rgba(34,197,94,0.12)" color="#16a34a" style={{ fontSize: '0.75rem', padding: '5px 14px' }}>
          Compliant
        </Badge>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        {/* GDPR / CCPA Compliance */}
        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={17} style={{ color: 'var(--primary)' }} /> GDPR / Privacy Compliance
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {compliance.map(item => (
              <div 
                key={item.id} 
                onClick={() => toggleComplianceItem(item.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '8px 12px', borderRadius: '8px', cursor: 'pointer',
                  background: item.done ? 'rgba(34,197,94,0.04)' : 'rgba(245,158,11,0.04)',
                  transition: 'background 0.15s ease',
                }}
              >
                {item.done
                  ? <CheckCircle size={16} style={{ color: 'var(--success)', flexShrink: 0 }} />
                  : <AlertTriangle size={16} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                }
                <span style={{
                  fontSize: '0.8rem', color: item.done ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: item.done ? 500 : 400, flex: 1
                }}>
                  {item.label}
                </span>
                <span style={{ fontSize: '0.7rem', color: item.done ? 'var(--success)' : 'var(--warning)', fontWeight: 700 }}>
                  {item.done ? 'Done' : 'Action Required'}
                </span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border-subtle)' }}>
            <button className="btn btn-secondary btn-sm" onClick={handleDataExport}
              style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Download size={14} /> Download System Data Export (GDPR)
            </button>
          </div>
        </div>

        {/* Password Policy */}
        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lock size={17} style={{ color: 'var(--primary)' }} /> Password Policy & Access
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
            <button className="btn btn-primary btn-sm" onClick={handleSavePolicy}>Save Security Policy</button>
            {saved && <span style={{ fontSize: '0.78rem', color: 'var(--success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Check size={14} /> Saved
            </span>}
          </div>
        </div>
      </div>

      {/* Active Sessions */}
      <div>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Monitor size={18} style={{ color: 'var(--accent-blue, #2563eb)' }} /> Active User Sessions
        </h3>
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          <div className="table-wrapper">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: 'rgba(30, 94, 74,0.04)' }}>
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
                          <LogOut size={12} /> Terminate
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
// ── PROFILE TAB ───────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

const ProfileTab = ({ user, updateProfile, addAuditEntry }) => {
  const [name, setName] = useState(user?.name || 'Platform Administrator');
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    if (user) {
      if (user.name) setName(user.name);
      if (user.email) setEmail(user.email);
    }
  }, [user]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setMessage({ type: 'error', text: 'Email is required.' });
      return;
    }
    if (password && password.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }
    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match.' });
      return;
    }

    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const payload = { name: name.trim(), email: email.trim() };
      if (password) {
        payload.password = password;
      }
      const res = await updateProfile(payload);
      if (res.success) {
        setMessage({ type: 'success', text: 'Profile updated successfully!' });
        setPassword('');
        setConfirmPassword('');
        addAuditEntry?.('profile.update', user?.id || 'system', user?.name || 'Admin', 'Updated platform administrator profile credentials');
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to update profile.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'An error occurred.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-up" style={{ display: 'flex', justifyContent: 'center' }}>
      <div className="card" style={{ padding: '28px', maxWidth: '480px', width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Settings size={18} style={{ color: 'var(--primary)' }} /> Edit Admin Profile
        </h3>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
          Update your platform administrator account details and login password.
        </p>

        {message.text && (
          <div style={{
            padding: '10px 14px',
            borderRadius: '10px',
            fontSize: '0.8rem',
            fontWeight: 500,
            background: message.type === 'success' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1.5px solid ${message.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
            color: message.type === 'success' ? '#16a34a' : '#dc2626',
          }}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="input-group">
            <label className="input-label">Full Name</label>
            <input className="input-field" value={name} onChange={e => setName(e.target.value)} required />
          </div>

          <div className="input-group">
            <label className="input-label">Email Address</label>
            <input className="input-field" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>

          <div className="input-group">
            <label className="input-label">New Password (leave blank to keep current)</label>
            <div style={{ position: 'relative' }}>
              <input
                className="input-field"
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="min. 6 characters"
                style={{ paddingRight: '40px', width: '100%', boxSizing: 'border-box' }}
              />
              <button
                type="button"
                onClick={() => setShowPwd(!showPwd)}
                style={{
                  position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
                  display: 'flex', alignItems: 'center'
                }}
              >
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Confirm New Password</label>
            <div style={{ position: 'relative' }}>
              <input
                className="input-field"
                type={showConfirmPwd ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                style={{ paddingRight: '40px', width: '100%', boxSizing: 'border-box' }}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                style={{
                  position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
                  display: 'flex', alignItems: 'center'
                }}
              >
                {showConfirmPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', marginTop: '8px' }}>
            {loading ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// ── MAIN PAGE COMPONENT ───────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

export default function PlatformAdmin() {
  const { settings, auditLog, orders, updateSettingsSection, addAuditEntry } = useApp();
  const { user, updateProfile } = useAuth();
  const [activeTab, setActiveTab] = useState('accounts');

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
      {activeTab === 'accounts' && <AccountsTab addAuditEntry={addAuditEntry} />}
      {activeTab === 'subscription' && <SubscriptionTab settings={settings} orders={orders} updateSettingsSection={updateSettingsSection} addAuditEntry={addAuditEntry} user={user} />}
      {activeTab === 'audit' && <AuditLogsTab auditLog={auditLog} addAuditEntry={addAuditEntry} />}
      {activeTab === 'api' && <ApiWebhooksTab settings={settings} updateSettingsSection={updateSettingsSection} addAuditEntry={addAuditEntry} />}
      {activeTab === 'integrations' && <IntegrationsTab settings={settings} updateSettingsSection={updateSettingsSection} addAuditEntry={addAuditEntry} />}
      {activeTab === 'security' && <SecurityTab settings={settings} updateSettingsSection={updateSettingsSection} addAuditEntry={addAuditEntry} />}
      {activeTab === 'profile' && <ProfileTab user={user} updateProfile={updateProfile} addAuditEntry={addAuditEntry} />}
    </div>
  );
}
