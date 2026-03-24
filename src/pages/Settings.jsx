import React, { useState, useEffect } from 'react';
import { useApp } from '../db/AppContext';
import { useAuth } from '../db/AuthContext';
import { getAll, update as dbUpdate, remove as dbRemove } from '../db/database';
import {
  Store, CreditCard, Truck, Bell, Printer, Palette, Shield,
  Clock, Save, ToggleLeft, ToggleRight, X,
  MapPin, Phone, Mail, FileText, Percent, DollarSign,
  Wifi, WifiOff, Users, Plus, Trash2, AlertTriangle, Check,
  Eye, EyeOff, User, KeyRound
} from 'lucide-react';

// ─── Section IDs ─────────────────────────────────────────
const SECTIONS = [
  { id: 'restaurant', label: 'Restaurant Profile', icon: Store },
  { id: 'billing', label: 'Billing & Taxes', icon: CreditCard },
  { id: 'payments', label: 'Payment Methods', icon: DollarSign },
  { id: 'operations', label: 'Operations', icon: Clock },
  { id: 'delivery', label: 'Delivery Platforms', icon: Truck },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'printer', label: 'Printer & Receipt', icon: Printer },
  { id: 'roles', label: 'Roles & Permissions', icon: Shield },
  { id: 'team', label: 'Team Members', icon: Users },
  { id: 'appearance', label: 'Appearance', icon: Palette },
];

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

const Field = ({ label, children, hint }) => (
  <div style={{ marginBottom: '14px' }}>
    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '5px' }}>{label}</label>
    {children}
    {hint && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>{hint}</div>}
  </div>
);

const Input = ({ value, onChange, ...rest }) => (
  <input className="input-field" value={value || ''} onChange={e => onChange(e.target.value)} {...rest} />
);

const Select = ({ value, onChange, options, ...rest }) => (
  <select className="input-field" value={value || ''} onChange={e => onChange(e.target.value)} {...rest}>
    {options.map(o => typeof o === 'string'
      ? <option key={o} value={o}>{o}</option>
      : <option key={o.value} value={o.value}>{o.label}</option>
    )}
  </select>
);

const SaveBanner = ({ saved }) => saved ? (
  <div style={{
    position: 'fixed', bottom: 24, right: 24, background: 'linear-gradient(135deg, #22c55e, #16a34a)',
    color: 'white', padding: '10px 18px', borderRadius: '12px', zIndex: 999,
    display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600,
    boxShadow: '0 8px 24px rgba(34,197,94,0.35)', fontSize: '0.88rem',
  }}>
    <Check size={16} /> Settings saved!
  </div>
) : null;

// ═══ SECTION COMPONENTS ═══════════════════════════════════

const RestaurantSection = ({ data, onChange }) => (
  <div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
      <Field label="Restaurant Name">
        <Input value={data.name} onChange={v => onChange('name', v)} placeholder="Kitchgoo" />
      </Field>
      <Field label="Tagline">
        <Input value={data.tagline} onChange={v => onChange('tagline', v)} placeholder="A Fine Dining Experience" />
      </Field>
    </div>
    <Field label="Full Address">
      <textarea className="input-field" rows={2} value={data.address || ''} onChange={e => onChange('address', e.target.value)} placeholder="Street, City, State, ZIP" style={{ resize: 'vertical', fontFamily: 'inherit' }} />
    </Field>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
      <Field label="Phone Number">
        <Input value={data.phone} onChange={v => onChange('phone', v)} placeholder="+91 XXXXX XXXXX" />
      </Field>
      <Field label="Email">
        <Input value={data.email} onChange={v => onChange('email', v)} placeholder="info@restaurant.com" type="email" />
      </Field>
      <Field label="GSTIN" hint="15-digit GST registration number">
        <Input value={data.gstin} onChange={v => onChange('gstin', v)} placeholder="29AABCT1332L1ZY" />
      </Field>
      <Field label="FSSAI License Number">
        <Input value={data.fssai} onChange={v => onChange('fssai', v)} placeholder="10012345678901" />
      </Field>
      <Field label="Currency Symbol">
        <Select value={data.currency} onChange={v => onChange('currency', v)} options={['₹', '$', '€', '£', '¥']} />
      </Field>
      <Field label="Timezone">
        <Select value={data.timezone} onChange={v => onChange('timezone', v)} options={['Asia/Kolkata', 'Asia/Dubai', 'America/New_York', 'Europe/London', 'Asia/Singapore']} />
      </Field>
    </div>
  </div>
);

const BillingSection = ({ data, onChange }) => (
  <div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
      <Field label="GST Rate (%)" hint="Applied on all dine-in orders">
        <Input value={data.gstRate} onChange={v => onChange('gstRate', parseFloat(v) || 0)} type="number" min="0" max="100" step="0.5" />
      </Field>
      <Field label="Bill Number Prefix">
        <Input value={data.billPrefix} onChange={v => onChange('billPrefix', v)} placeholder="INV" />
      </Field>
      <Field label="Starting Bill Number">
        <Input value={data.billStartNumber} onChange={v => onChange('billStartNumber', parseInt(v) || 1000)} type="number" min="1" />
      </Field>
      <Field label="Amount Rounding">
        <Select value={data.roundingMode} onChange={v => onChange('roundingMode', v)} options={[
          { value: 'none', label: 'No rounding' },
          { value: 'nearest', label: 'Round to nearest ₹1' },
          { value: 'up', label: 'Always round up' },
        ]} />
      </Field>
    </div>

    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px', marginBottom: '14px' }}>
      <Toggle label="Enable Service Charge" description="Add a fixed % service charge to bills" value={data.enableServiceCharge} onChange={v => onChange('enableServiceCharge', v)} />
      {data.enableServiceCharge && (
        <div style={{ paddingTop: '10px' }}>
          <Field label="Service Charge (%)">
            <Input value={data.serviceCharge} onChange={v => onChange('serviceCharge', parseFloat(v) || 0)} type="number" min="0" max="30" step="0.5" />
          </Field>
        </div>
      )}
      <Toggle label="Show GST Breakdown on Bill" description="Print CGST & SGST separately on receipts" value={data.showGstBreakdown} onChange={v => onChange('showGstBreakdown', v)} />
    </div>

    <Field label="Receipt Header Message">
      <Input value={data.receiptHeader} onChange={v => onChange('receiptHeader', v)} placeholder="Thank you for visiting!" />
    </Field>
    <Field label="Receipt Footer Message">
      <Input value={data.receiptFooter} onChange={v => onChange('receiptFooter', v)} placeholder="Feedback, WIFI password, etc." />
    </Field>
  </div>
);

const PaymentsSection = ({ data, onChange }) => {
  const methods = [
    { key: 'cash', label: 'Cash', desc: 'Accept cash payments at counter' },
    { key: 'upi', label: 'UPI / QR Code', desc: 'PhonePe, GPay, Paytm, etc.' },
    { key: 'card', label: 'Debit / Credit Card', desc: 'Swipe or tap card payments' },
    { key: 'wallet', label: 'Digital Wallet', desc: 'Amazon Pay, Mobikwik, etc.' },
    { key: 'onlineGateway', label: 'Online Payment Gateway', desc: 'Razorpay, PayU, etc.' },
  ];
  return (
    <div>
      {methods.map(m => (
        <Toggle key={m.key} label={m.label} description={m.desc} value={data[m.key]} onChange={v => onChange(m.key, v)} />
      ))}
      {data.upi && (
        <div style={{ paddingTop: '14px' }}>
          <Field label="UPI ID" hint="e.g. restaurant@okicici">
            <Input value={data.upiId} onChange={v => onChange('upiId', v)} placeholder="yourname@upi" />
          </Field>
        </div>
      )}
    </div>
  );
};

const OperationsSection = ({ data, onChange }) => {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const toggleDay = (day) => {
    const curr = data.workingDays || [];
    const next = curr.includes(day) ? curr.filter(d => d !== day) : [...curr, day];
    onChange('workingDays', next);
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
        <Field label="Total Tables / Seats">
          <Input value={data.tables} onChange={v => onChange('tables', parseInt(v) || 1)} type="number" min="1" />
        </Field>
        <Field label="Low Stock Alert Threshold">
          <Input value={data.lowStockThreshold} onChange={v => onChange('lowStockThreshold', parseInt(v) || 1)} type="number" min="1" />
        </Field>
        <Field label="Opening Time">
          <Input value={data.openingTime} onChange={v => onChange('openingTime', v)} type="time" />
        </Field>
        <Field label="Closing Time">
          <Input value={data.closingTime} onChange={v => onChange('closingTime', v)} type="time" />
        </Field>
      </div>

      <Field label="Working Days">
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
          {days.map(d => {
            const active = (data.workingDays || []).includes(d);
            return (
              <button key={d} onClick={() => toggleDay(d)}
                className={active ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                style={{ minWidth: '46px' }}
              >{d}</button>
            );
          })}
        </div>
      </Field>

      <div style={{ marginTop: '14px' }}>
        <Toggle label="Auto-print KOT" description="Automatically send KOT to kitchen printer on order" value={data.autoKOT} onChange={v => onChange('autoKOT', v)} />
        <Toggle label="Offline Mode Support" description="Allow POS to operate without internet" value={data.offlineMode} onChange={v => onChange('offlineMode', v)} />
      </div>
    </div>
  );
};

const DeliverySection = ({ data, onChange }) => {
  const platforms = [
    { key: 'zomato', label: 'Zomato', color: '#E23744', keyField: 'zomatoApiKey', idField: 'zomatoResId' },
    { key: 'swiggy', label: 'Swiggy', color: '#FC8019', keyField: 'swiggyApiKey', idField: 'swiggyResId' },
    { key: 'dunzo', label: 'Dunzo', color: '#00D09C', keyField: null, idField: null },
  ];

  return (
    <div>
      <Field label="Packaging Charge (₹)" hint="Added per delivery order">
        <Input value={data.packagingCharge} onChange={v => onChange('packagingCharge', parseFloat(v) || 0)} type="number" min="0" />
      </Field>

      <div style={{ marginTop: '8px' }}>
        {platforms.map(p => (
          <div key={p.key} style={{ padding: '16px', borderRadius: '14px', background: 'rgba(255,255,255,0.5)', border: '1px solid var(--border)', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: data[`${p.key}Enabled`] ? '12px' : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: 32, height: 32, borderRadius: '8px', background: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Truck size={16} color="white" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{p.label}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{data[`${p.key}Enabled`] ? 'Connected' : 'Not connected'}</div>
                </div>
              </div>
              <button onClick={() => onChange(`${p.key}Enabled`, !data[`${p.key}Enabled`])}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: data[`${p.key}Enabled`] ? 'var(--primary)' : 'var(--text-muted)' }}>
                {data[`${p.key}Enabled`] ? <ToggleRight size={30} /> : <ToggleLeft size={30} />}
              </button>
            </div>
            {data[`${p.key}Enabled`] && p.keyField && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <Field label="API Key">
                  <Input value={data[p.keyField]} onChange={v => onChange(p.keyField, v)} placeholder="API Key" type="password" />
                </Field>
                <Field label="Restaurant ID">
                  <Input value={data[p.idField]} onChange={v => onChange(p.idField, v)} placeholder="Restaurant ID" />
                </Field>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const NotificationsSection = ({ data, onChange }) => {
  const notifs = [
    { key: 'lowStock', label: 'Low Stock Alerts', desc: 'Get notified when ingredients run low' },
    { key: 'newDeliveryOrder', label: 'New Delivery Order', desc: 'Alert for new Zomato / Swiggy orders' },
    { key: 'orderReady', label: 'Order Ready', desc: 'Notify when KOT is marked as ready' },
    { key: 'dailySummary', label: 'Daily Summary', desc: 'End-of-day revenue and operations summary' },
    { key: 'emailAlerts', label: 'Email Alerts', desc: 'Send alerts to email (requires address below)' },
  ];
  return (
    <div>
      {notifs.map(n => (
        <Toggle key={n.key} label={n.label} description={n.desc} value={data[n.key]} onChange={v => onChange(n.key, v)} />
      ))}
      {data.emailAlerts && (
        <div style={{ paddingTop: '14px' }}>
          <Field label="Alert Email Address">
            <Input value={data.alertEmail} onChange={v => onChange('alertEmail', v)} placeholder="alerts@restaurant.com" type="email" />
          </Field>
        </div>
      )}
    </div>
  );
};

const PrinterSection = ({ data, onChange }) => (
  <div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
      <Field label="KOT Printer">
        <Select value={data.kotPrinter} onChange={v => onChange('kotPrinter', v)} options={['Default', 'Kitchen Printer', 'Bar Printer', 'None']} />
      </Field>
      <Field label="Bill Printer">
        <Select value={data.billPrinter} onChange={v => onChange('billPrinter', v)} options={['Default', 'Counter Printer', 'None']} />
      </Field>
      <Field label="Paper Size">
        <Select value={data.paperSize} onChange={v => onChange('paperSize', v)} options={['58mm', '80mm', 'A4']} />
      </Field>
      <Field label="Number of Copies">
        <Input value={data.copies} onChange={v => onChange('copies', parseInt(v) || 1)} type="number" min="1" max="5" />
      </Field>
    </div>
    <Toggle label="Auto-print KOT" description="Send KOT to printer automatically on order" value={data.autoPrintKOT} onChange={v => onChange('autoPrintKOT', v)} />
    <Toggle label="Auto-print Bill" description="Print bill automatically after payment" value={data.autoPrintBill} onChange={v => onChange('autoPrintBill', v)} />
  </div>
);

const RolesSection = ({ data, onChange }) => {
  const [newRole, setNewRole] = useState('');
  const allPerms = ['pos', 'inventory', 'staff', 'reports', 'menu', 'delivery', 'settings'];

  const togglePerm = (roleId, perm) => {
    const updated = (data || []).map(r => {
      if (r.id !== roleId) return r;
      if (r.permissions.includes('all')) return r; // owner
      const has = r.permissions.includes(perm);
      return { ...r, permissions: has ? r.permissions.filter(p => p !== perm) : [...r.permissions, perm] };
    });
    onChange(updated);
  };

  const addRole = () => {
    if (!newRole.trim()) return;
    onChange([...data, { id: newRole.toLowerCase().replace(/\s+/g, '_'), name: newRole, permissions: [] }]);
    setNewRole('');
  };

  const removeRole = (id) => onChange(data.filter(r => r.id !== id));

  return (
    <div>
      <div style={{ marginBottom: '16px', display: 'flex', gap: '10px' }}>
        <input className="input-field" style={{ flex: 1 }} value={newRole} onChange={e => setNewRole(e.target.value)} placeholder="New role name..." onKeyDown={e => e.key === 'Enter' && addRole()} />
        <button className="btn btn-primary" onClick={addRole}><Plus size={15} /> Add Role</button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem' }}>Role</th>
              {allPerms.map(p => (
                <th key={p} style={{ padding: '10px 8px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', textAlign: 'center', textTransform: 'capitalize' }}>{p}</th>
              ))}
              <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border-subtle)' }} />
            </tr>
          </thead>
          <tbody>
            {(data || []).map(role => (
              <tr key={role.id}>
                <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text-primary)' }}>{role.name}</td>
                {allPerms.map(perm => {
                  const has = role.permissions.includes('all') || role.permissions.includes(perm);
                  return (
                    <td key={perm} style={{ padding: '10px 8px', textAlign: 'center' }}>
                      <button
                        disabled={role.permissions.includes('all')}
                        onClick={() => togglePerm(role.id, perm)}
                        style={{
                          width: 22, height: 22, borderRadius: '6px',
                          background: has ? 'var(--primary)' : 'rgba(255,255,255,0.6)',
                          border: has ? 'none' : '1.5px solid var(--border-subtle)',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          cursor: role.permissions.includes('all') ? 'default' : 'pointer',
                        }}
                      >
                        {has && <Check size={13} color="white" />}
                      </button>
                    </td>
                  );
                })}
                <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                  {role.id !== 'owner' && (
                    <button onClick={() => removeRole(role.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const AppearanceSection = ({ data, onChange }) => (
  <div>
    <Field label="Theme">
      <div style={{ display: 'flex', gap: '10px' }}>
        {['light', 'dark', 'auto'].map(t => (
          <button key={t} onClick={() => onChange('theme', t)}
            className={data.theme === t ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ textTransform: 'capitalize' }}
          >{t}</button>
        ))}
      </div>
    </Field>
    <Field label="Accent Color" hint="Primary brand color for the platform">
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <input type="color" value={data.accentColor || '#7c3aed'} onChange={e => onChange('accentColor', e.target.value)}
          style={{ width: 44, height: 36, border: 'none', borderRadius: '8px', cursor: 'pointer', padding: 0 }} />
        <input className="input-field" style={{ flex: 1 }} value={data.accentColor} onChange={e => onChange('accentColor', e.target.value)} placeholder="#7c3aed" />
      </div>
    </Field>
    <Field label="Language">
      <Select value={data.language} onChange={v => onChange('language', v)} options={[
        { value: 'en', label: 'English' },
        { value: 'hi', label: 'हिन्दी (Hindi)' },
        { value: 'mr', label: 'मराठी (Marathi)' },
        { value: 'ta', label: 'தமிழ் (Tamil)' },
        { value: 'te', label: 'తెలుగు (Telugu)' },
      ]} />
    </Field>
    <Toggle label="Compact Mode" description="Reduce padding and font sizes for more content density" value={data.compactMode} onChange={v => onChange('compactMode', v)} />
  </div>
);

// ─── Team Members Section ────────────────────────────────────────
const ROLE_OPTIONS = ['Owner', 'Manager', 'Cashier', 'Chef', 'Waiter'];

const TeamSection = () => {
  const { register } = useAuth();
  const [users, setUsers] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'Cashier', phone: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const refresh = () => setUsers(getAll('users') || []);
  useEffect(() => { refresh(); }, []);

  const handleAdd = async () => {
    setError('');
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setError('Name, email and password are required.'); return;
    }
    if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    const result = await register(form);
    if (!result.success) { setError(result.error); return; }
    setSuccess('User created successfully!');
    setTimeout(() => setSuccess(''), 2500);
    setForm({ name: '', email: '', password: '', role: 'Cashier', phone: '' });
    setShowAdd(false);
    refresh();
  };

  const handleRoleChange = async (id, role) => {
    await dbUpdate('users', id, { role, avatar: undefined });
    refresh();
  };

  const handleDelete = async (id) => {
    const u = users.find(u => u.id === id);
    if (u?.role === 'Owner') return; // protect owner
    await dbRemove('users', id);
    refresh();
  };

  const inpStyle = { width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1.5px solid var(--border-subtle)', background: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', fontFamily: 'inherit', outline: 'none', color: 'var(--text-primary)' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{users.length} team member{users.length !== 1 ? 's' : ''}</div>
        <button className="btn btn-primary" onClick={() => setShowAdd(v => !v)}>
          <Plus size={14} /> {showAdd ? 'Cancel' : 'Add User'}
        </button>
      </div>

      {success && (
        <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '10px', padding: '10px 14px', marginBottom: '14px', fontSize: '0.82rem', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Check size={15} /> {success}
        </div>
      )}

      {showAdd && (
        <div style={{ background: 'rgba(124,58,237,0.04)', border: '1.5px solid rgba(124,58,237,0.15)', borderRadius: '14px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '12px', color: 'var(--text-primary)' }}>New Team Member</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '5px', color: 'var(--text-secondary)' }}>Full Name *</label>
              <input style={inpStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Priya Sharma" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '5px', color: 'var(--text-secondary)' }}>Role</label>
              <select style={{ ...inpStyle }} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '5px', color: 'var(--text-secondary)' }}>Email Address *</label>
              <input style={inpStyle} value={form.email} type="email" onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="staff@restaurant.com" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '5px', color: 'var(--text-secondary)' }}>Password *</label>
              <div style={{ position: 'relative' }}>
                <input style={{ ...inpStyle, paddingRight: '36px' }} value={form.password} type={showPwd ? 'text' : 'password'} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="min. 6 characters" />
                <button type="button" onClick={() => setShowPwd(v => !v)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '5px', color: 'var(--text-secondary)' }}>Phone (optional)</label>
              <input style={inpStyle} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 XXXXX XXXXX" /></div>
          </div>
          {error && (
            <div style={{ marginTop: '10px', padding: '8px 12px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', fontSize: '0.78rem', color: '#dc2626' }}>
              ⚠ {error}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
            <button className="btn btn-primary" onClick={handleAdd}><KeyRound size={14} /> Create Account</button>
          </div>
        </div>
      )}

      {/* User list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {users.map(u => (
          <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: 'rgba(255,255,255,0.6)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.9rem', flexShrink: 0 }}>
              {u.name?.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{u.name}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{u.email}</div>
            </div>
            <select
              value={u.role}
              onChange={e => handleRoleChange(u.id, e.target.value)}
              style={{ padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'rgba(124,58,237,0.05)', color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            {u.role !== 'Owner' && (
              <button onClick={() => handleDelete(u.id)} style={{ width: 28, height: 28, borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.04)', color: 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
        {users.length === 0 && (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>No team members found. Add your first user above.</div>
        )}
      </div>
    </div>
  );
};

// ═══ MAIN SETTINGS PAGE ═══════════════════════════════════
const Settings = () => {
  const { settings, updateSettingsSection } = useApp();
  const [activeSection, setActiveSection] = useState('restaurant');
  const [localSettings, setLocalSettings] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) setLocalSettings(JSON.parse(JSON.stringify(settings)));
  }, [settings]);

  if (!localSettings) return null;

  const handleChange = (section, field, value) => {
    setLocalSettings(prev => ({
      ...prev,
      [section]: { ...prev[section], [field]: value }
    }));
  };

  const handleRolesChange = (updatedRoles) => {
    setLocalSettings(prev => ({ ...prev, roles: updatedRoles }));
  };

  const handleSave = () => {
    // Save all modified sections
    Object.keys(localSettings).forEach(section => {
      updateSettingsSection(section, localSettings[section]);
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const sectionChange = (field, value) => handleChange(activeSection, field, value);

  const renderSection = () => {
    const s = localSettings[activeSection] || {};
    switch (activeSection) {
      case 'restaurant': return <RestaurantSection data={s} onChange={sectionChange} />;
      case 'billing': return <BillingSection data={s} onChange={sectionChange} />;
      case 'payments': return <PaymentsSection data={s} onChange={sectionChange} />;
      case 'operations': return <OperationsSection data={s} onChange={sectionChange} />;
      case 'delivery': return <DeliverySection data={s} onChange={sectionChange} />;
      case 'notifications': return <NotificationsSection data={s} onChange={sectionChange} />;
      case 'printer': return <PrinterSection data={s} onChange={sectionChange} />;
      case 'roles': return <RolesSection data={localSettings.roles || []} onChange={handleRolesChange} />;
      case 'team': return <TeamSection />;
      case 'appearance': return <AppearanceSection data={s} onChange={sectionChange} />;
      default: return null;
    }
  };

  const activeInfo = SECTIONS.find(s => s.id === activeSection);

  return (
    <div className="animate-fade-up" style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '16px', height: '100%' }}>
      {/* Left Nav */}
      <div className="card" style={{ padding: '10px', height: 'fit-content' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '6px 10px 10px' }}>
          Configuration
        </div>
        {SECTIONS.map(s => {
          const Icon = s.icon;
          const active = activeSection === s.id;
          return (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                padding: '9px 12px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                background: active ? 'white' : 'transparent',
                boxShadow: active ? 'var(--shadow-md)' : 'none',
                color: active ? 'var(--primary)' : 'var(--text-secondary)',
                fontWeight: active ? 700 : 500, fontSize: '0.82rem',
                marginBottom: '2px', textAlign: 'left',
                transition: 'all 0.15s',
              }}
              onMouseOver={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.6)'; }}
              onMouseOut={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              <Icon size={16} style={{ flexShrink: 0 }} />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Right Content */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {activeInfo && (
              <div style={{ width: 40, height: 40, borderRadius: '12px', background: 'rgba(124,58,237,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                <activeInfo.icon size={20} />
              </div>
            )}
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '2px' }}>{activeInfo?.label}</h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Configure {activeInfo?.label.toLowerCase()} for your restaurant</p>
            </div>
          </div>
          <button className="btn btn-primary" onClick={handleSave}>
            <Save size={15} /> Save Changes
          </button>
        </div>

        <div style={{ maxHeight: 'calc(100vh - 260px)', overflowY: 'auto', paddingRight: '4px' }}>
          {renderSection()}
        </div>
      </div>

      <SaveBanner saved={saved} />
    </div>
  );
};

export default Settings;
