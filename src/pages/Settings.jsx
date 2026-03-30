import React, { useState, useEffect } from 'react';
import { useApp } from '../db/AppContext';
import { useAuth } from '../db/AuthContext';
import { getAll, update as dbUpdate, remove as dbRemove } from '../db/database';
import {
  Store, CreditCard, Truck, Bell, Printer, Palette, Shield,
  Clock, Save, ToggleLeft, ToggleRight, X,
  MapPin, Phone, Mail, FileText, Percent, DollarSign,
  Wifi, WifiOff, Users, Plus, Trash2, AlertTriangle, Check,
  Eye, EyeOff, User, KeyRound, Layers, Type, Workflow,
  Receipt, Sparkles, Monitor, QrCode, Upload, Image,
  Apple, Smartphone, Globe, Package, Bike, Settings2,
  LayoutGrid, CalendarCheck, ChefHat, ShoppingBag,
  Heart, Megaphone, Building2, ShieldCheck, Lock
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
  { id: 'modules', label: 'Module Toggles', icon: Layers },
  { id: 'naming', label: 'Custom Naming', icon: Type },
  { id: 'workflow', label: 'Workflow Rules', icon: Workflow },
  { id: 'receipt', label: 'Receipt Builder', icon: Receipt },
  { id: 'roles', label: 'Roles & Permissions', icon: Shield },
  { id: 'team', label: 'Team Members', icon: Users },
  { id: 'appearance', label: 'Appearance', icon: Palette },
];

const Toggle = ({ value, onChange, label, description }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
    <div style={{ flex: 1, minWidth: 0 }}>
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
        <Select value={data.timezone} onChange={v => onChange('timezone', v)} options={['Asia/Kolkata', 'Asia/Dubai', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London', 'Asia/Singapore', 'Australia/Sydney']} />
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

    {/* Auto-gratuity settings */}
    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px', marginTop: '10px' }}>
      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>Auto-Gratuity</div>
      <Toggle label="Enable Auto-Gratuity" description="Automatically add gratuity for large parties" value={data.autoGratuityEnabled} onChange={v => onChange('autoGratuityEnabled', v)} />
      {data.autoGratuityEnabled && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', paddingTop: '10px' }}>
          <Field label="Party Size Threshold" hint="Minimum guests to trigger auto-gratuity">
            <Input value={data.autoGratuityThreshold} onChange={v => onChange('autoGratuityThreshold', parseInt(v) || 6)} type="number" min="1" />
          </Field>
          <Field label="Gratuity Percent (%)">
            <Input value={data.autoGratuityPercent} onChange={v => onChange('autoGratuityPercent', parseFloat(v) || 18)} type="number" min="0" max="50" step="0.5" />
          </Field>
          <div style={{ gridColumn: '1/-1' }}>
            <Toggle label="Calculate on Pre-Tax Amount" description="Apply gratuity before taxes rather than on the total" value={data.autoGratuityPreTax} onChange={v => onChange('autoGratuityPreTax', v)} />
          </div>
        </div>
      )}
    </div>
  </div>
);

const PaymentsSection = ({ data, onChange }) => {
  const methods = [
    { key: 'cash', label: 'Cash', desc: 'Accept cash payments at counter' },
    { key: 'upi', label: 'UPI / QR Code', desc: 'PhonePe, GPay, Paytm, etc.' },
    { key: 'card', label: 'Debit / Credit Card', desc: 'Swipe or tap card payments' },
    { key: 'wallet', label: 'Digital Wallet', desc: 'Amazon Pay, Mobikwik, etc.' },
    { key: 'applePay', label: 'Apple Pay', desc: 'Contactless Apple device payments' },
    { key: 'googlePay', label: 'Google Pay', desc: 'Google contactless payments' },
    { key: 'qrPayAtTable', label: 'QR Pay-at-Table', desc: 'Guests scan QR code at their table to pay' },
    { key: 'onlineGateway', label: 'Online Payment Gateway', desc: 'Razorpay, PayU, Stripe, etc.' },
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
        <Field label="Void Approval Threshold ($)" hint="Require manager approval for voids above this amount">
          <Input value={data.voidApprovalThreshold} onChange={v => onChange('voidApprovalThreshold', parseFloat(v) || 0)} type="number" min="0" step="1" />
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
        <Toggle label="Auto-Open Cash Drawer" description="Open cash drawer automatically on cash transactions" value={data.autoOpenCashDrawer} onChange={v => onChange('autoOpenCashDrawer', v)} />
        <Toggle label="Auto-Print Receipt" description="Print receipt automatically after payment completes" value={data.autoPrintReceipt} onChange={v => onChange('autoPrintReceipt', v)} />
      </div>
    </div>
  );
};

const DeliverySection = ({ data, onChange }) => {
  const platforms = [
    { key: 'zomato', label: 'Zomato', color: '#E23744', keyField: 'zomatoApiKey', idField: 'zomatoResId' },
    { key: 'swiggy', label: 'Swiggy', color: '#FC8019', keyField: 'swiggyApiKey', idField: 'swiggyResId' },
    { key: 'uberEats', label: 'Uber Eats', color: '#06C167', keyField: 'uberEatsApiKey', idField: 'uberEatsResId' },
    { key: 'doorDash', label: 'DoorDash', color: '#FF3008', keyField: 'doorDashApiKey', idField: 'doorDashResId' },
    { key: 'grubhub', label: 'Grubhub', color: '#F63440', keyField: 'grubhubApiKey', idField: 'grubhubResId' },
    { key: 'dunzo', label: 'Dunzo', color: '#00D09C', keyField: 'dunzoApiKey', idField: 'dunzoResId' },
  ];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
        <Field label="Packaging Charge" hint="Added per delivery order">
          <Input value={data.packagingCharge} onChange={v => onChange('packagingCharge', parseFloat(v) || 0)} type="number" min="0" />
        </Field>
      </div>

      <Toggle label="In-House Delivery" description="Enable your own delivery fleet management" value={data.inHouseDelivery} onChange={v => onChange('inHouseDelivery', v)} />

      <div style={{ marginTop: '14px' }}>
        {platforms.map(p => (
          <div key={p.key} style={{ padding: '16px', borderRadius: '14px', background: 'rgba(255,255,255,0.5)', border: '1px solid var(--border-subtle)', marginBottom: '12px' }}>
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
    { key: 'overtimeAlert', label: 'Overtime Alert', desc: 'Notify when staff exceed scheduled hours' },
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

// ─── Module Toggles ───────────────────────────────────────
const MODULE_DEFS = [
  { key: 'tableManagement', label: 'Table Management', desc: 'Visual floor plan editor, table assignments, and real-time occupancy tracking.', icon: LayoutGrid },
  { key: 'reservations', label: 'Reservations', desc: 'Online and phone-in reservation system with waitlist management.', icon: CalendarCheck },
  { key: 'kds', label: 'Kitchen Display System', desc: 'Digital ticket display for kitchen staff with bump-bar workflow and priority routing.', icon: ChefHat },
  { key: 'delivery', label: 'Delivery', desc: 'Third-party delivery platform integrations and in-house delivery fleet management.', icon: Truck },
  { key: 'onlineOrdering', label: 'Online Ordering', desc: 'Branded online ordering portal with direct pickup and delivery options.', icon: ShoppingBag },
  { key: 'loyalty', label: 'Loyalty Program', desc: 'Points-based loyalty system with tier rewards, birthday offers, and referral tracking.', icon: Heart },
  { key: 'campaigns', label: 'Campaigns & Marketing', desc: 'Email and SMS marketing campaigns, promo codes, and customer engagement tools.', icon: Megaphone },
  { key: 'multiLocation', label: 'Multi-Location', desc: 'Manage multiple restaurant locations from a single dashboard with consolidated reporting.', icon: Building2 },
  { key: 'platformAdmin', label: 'Platform Admin', desc: 'Advanced administrative controls, audit logs, and system-wide configuration.', icon: ShieldCheck },
];

const ModulesSection = ({ data, onChange }) => (
  <div>
    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
      Enable or disable entire feature modules. Disabled modules will be hidden from all users across the platform.
    </div>
    {MODULE_DEFS.map(m => {
      const Icon = m.icon;
      const enabled = data[m.key] !== false;
      return (
        <div key={m.key} style={{
          display: 'flex', alignItems: 'center', gap: '14px',
          padding: '14px 16px', borderRadius: '14px', marginBottom: '8px',
          background: enabled ? 'rgba(124,58,237,0.04)' : 'rgba(148,163,184,0.06)',
          border: `1px solid ${enabled ? 'rgba(124,58,237,0.15)' : 'var(--border-subtle)'}`,
          transition: 'all 0.2s',
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: '10px',
            background: enabled ? 'rgba(124,58,237,0.12)' : 'rgba(148,163,184,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: enabled ? 'var(--primary)' : 'var(--text-muted)', flexShrink: 0,
          }}>
            <Icon size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>{m.label}</div>
            <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.4 }}>{m.desc}</div>
          </div>
          <button onClick={() => onChange(m.key, !enabled)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: enabled ? 'var(--primary)' : 'var(--text-muted)', flexShrink: 0 }}>
            {enabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
          </button>
        </div>
      );
    })}
  </div>
);

// ─── Custom Naming ────────────────────────────────────────
const NAMING_DEFS = [
  { key: 'checks', defaultLabel: 'Checks', placeholder: 'e.g. Tabs, Bills, Orders' },
  { key: 'servers', defaultLabel: 'Servers', placeholder: 'e.g. Budtenders, Waitstaff, Associates' },
  { key: 'tables', defaultLabel: 'Tables', placeholder: 'e.g. Stations, Seats, Zones' },
  { key: 'guests', defaultLabel: 'Guests', placeholder: 'e.g. Clients, Customers, Patients' },
];

const NamingSection = ({ data, onChange }) => (
  <div>
    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
      Rename core concepts to match your business terminology. Changes apply throughout the entire platform.
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
      {NAMING_DEFS.map(n => (
        <div key={n.key} style={{
          padding: '16px', borderRadius: '14px',
          background: 'rgba(255,255,255,0.5)', border: '1px solid var(--border-subtle)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <div style={{
              padding: '3px 8px', borderRadius: '6px',
              background: 'rgba(124,58,237,0.08)', fontSize: '0.72rem',
              fontWeight: 700, color: 'var(--primary)',
            }}>
              DEFAULT
            </div>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{n.defaultLabel}</span>
          </div>
          <Field label={`Rename "${n.defaultLabel}" to`}>
            <Input value={data[n.key]} onChange={v => onChange(n.key, v)} placeholder={n.placeholder} />
          </Field>
        </div>
      ))}
    </div>
  </div>
);

// ─── Workflow Rules ───────────────────────────────────────
const WorkflowSection = ({ data, onChange }) => (
  <div>
    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
      Configure automated behaviors and approval requirements for your operation.
    </div>

    <Toggle label="Auto-Print Receipts on Payment" description="Automatically send receipt to printer when a payment is completed" value={data.autoPrintOnPayment} onChange={v => onChange('autoPrintOnPayment', v)} />
    <Toggle label="Cash Drawer Opens on Credit Split" description="Pop the cash drawer when a check is split with a credit card" value={data.cashDrawerOnCreditSplit} onChange={v => onChange('cashDrawerOnCreditSplit', v)} />
    <Toggle label="Require Reason Code for All Voids" description="Staff must select a reason code when voiding any item" value={data.requireVoidReason} onChange={v => onChange('requireVoidReason', v)} />
    <Toggle label="Require Reason Code for All Discounts" description="Staff must select a reason code when applying discounts" value={data.requireDiscountReason} onChange={v => onChange('requireDiscountReason', v)} />

    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px', marginTop: '8px' }}>
      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>Manager Approval Thresholds</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
        <Field label="Void Approval Over ($)" hint="Voids above this amount require a manager override">
          <Input value={data.voidApprovalAmount} onChange={v => onChange('voidApprovalAmount', parseFloat(v) || 0)} type="number" min="0" step="1" placeholder="e.g. 25" />
        </Field>
        <Field label="Comp Approval Over ($)" hint="Comps above this amount require a manager override">
          <Input value={data.compApprovalAmount} onChange={v => onChange('compApprovalAmount', parseFloat(v) || 0)} type="number" min="0" step="1" placeholder="e.g. 50" />
        </Field>
      </div>
    </div>
  </div>
);

// ─── Receipt Builder ─────────────────────────────────────
const ReceiptBuilderSection = ({ data, onChange }) => {
  const tipPcts = data.tipSuggestions || [15, 18, 20];

  const updateTip = (idx, val) => {
    const next = [...tipPcts];
    next[idx] = parseFloat(val) || 0;
    onChange('tipSuggestions', next);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '24px' }}>
      {/* Controls */}
      <div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
          Customize your printed and digital receipts. Changes are reflected in the live preview.
        </div>

        <div style={{
          padding: '20px', borderRadius: '14px', border: '2px dashed var(--border-subtle)',
          background: 'rgba(124,58,237,0.02)', textAlign: 'center', marginBottom: '16px', cursor: 'pointer',
        }}>
          <Upload size={28} style={{ color: 'var(--text-muted)', marginBottom: '6px' }} />
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Upload Logo</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>PNG, JPG up to 500KB. Recommended 200x80px.</div>
        </div>

        <Field label="Header Text">
          <Input value={data.headerText} onChange={v => onChange('headerText', v)} placeholder="Welcome to Kitchgoo!" />
        </Field>
        <Field label="Footer Text">
          <textarea className="input-field" rows={2} value={data.footerText || ''} onChange={e => onChange('footerText', e.target.value)} placeholder="Thank you for dining with us! WiFi: kitchgoo-guest / Pass: welcome123" style={{ resize: 'vertical', fontFamily: 'inherit' }} />
        </Field>

        <Toggle label="Show QR Code on Receipt" description="Display a QR code linking to your feedback form or website" value={data.showQrCode} onChange={v => onChange('showQrCode', v)} />

        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px', marginTop: '8px' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>Tip Suggestions (%)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            <Field label="Option 1">
              <Input value={tipPcts[0]} onChange={v => updateTip(0, v)} type="number" min="0" max="100" />
            </Field>
            <Field label="Option 2">
              <Input value={tipPcts[1]} onChange={v => updateTip(1, v)} type="number" min="0" max="100" />
            </Field>
            <Field label="Option 3">
              <Input value={tipPcts[2]} onChange={v => updateTip(2, v)} type="number" min="0" max="100" />
            </Field>
          </div>
        </div>
      </div>

      {/* Live Preview */}
      <div>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Live Preview</div>
        <div style={{
          background: '#fff', borderRadius: '12px', border: '1px solid var(--border-subtle)',
          padding: '20px 16px', fontFamily: "'Courier New', monospace", fontSize: '0.7rem',
          color: '#333', boxShadow: '0 4px 16px rgba(0,0,0,0.06)', lineHeight: 1.6,
        }}>
          {/* Logo placeholder */}
          <div style={{ textAlign: 'center', marginBottom: '8px' }}>
            <div style={{
              width: 60, height: 24, borderRadius: '4px', margin: '0 auto',
              background: 'rgba(124,58,237,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.55rem', color: 'var(--primary)', fontWeight: 700, fontFamily: 'inherit',
            }}>LOGO</div>
          </div>
          {/* Header */}
          <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.75rem', marginBottom: '4px' }}>
            {data.headerText || 'Welcome to Kitchgoo!'}
          </div>
          <div style={{ borderBottom: '1px dashed #ccc', margin: '8px 0' }} />
          {/* Sample items */}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>1x Margherita Pizza</span><span>$14.99</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>2x Craft Beer</span><span>$16.00</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>1x Tiramisu</span><span>$9.50</span></div>
          <div style={{ borderBottom: '1px dashed #ccc', margin: '8px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>$40.49</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Tax (8%)</span><span>$3.24</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '0.78rem', marginTop: '4px' }}>
            <span>TOTAL</span><span>$43.73</span>
          </div>
          <div style={{ borderBottom: '1px dashed #ccc', margin: '8px 0' }} />
          {/* Tip suggestions */}
          <div style={{ textAlign: 'center', fontSize: '0.65rem', marginBottom: '6px', fontWeight: 600 }}>Suggested Tip</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
            {tipPcts.map((t, i) => (
              <div key={i} style={{
                padding: '3px 10px', borderRadius: '6px', border: '1px solid #ccc',
                fontSize: '0.62rem', fontWeight: 700, textAlign: 'center',
              }}>
                {t}% = ${(43.73 * t / 100).toFixed(2)}
              </div>
            ))}
          </div>
          {/* QR */}
          {data.showQrCode && (
            <div style={{ textAlign: 'center', margin: '8px 0' }}>
              <div style={{
                width: 48, height: 48, margin: '0 auto', borderRadius: '4px',
                background: 'repeating-conic-gradient(#333 0% 25%, #fff 0% 50%) 50% / 8px 8px',
              }} />
              <div style={{ fontSize: '0.55rem', color: '#999', marginTop: '4px' }}>Scan for feedback</div>
            </div>
          )}
          {/* Footer */}
          <div style={{ borderBottom: '1px dashed #ccc', margin: '8px 0' }} />
          <div style={{ textAlign: 'center', fontSize: '0.6rem', color: '#888', whiteSpace: 'pre-wrap' }}>
            {data.footerText || 'Thank you for dining with us!'}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Roles & Permissions ──────────────────────────────────
const RolesSection = ({ data, onChange }) => {
  const [newRole, setNewRole] = useState('');
  const allPerms = ['pos', 'inventory', 'staff', 'reports', 'menu', 'delivery', 'settings'];

  const togglePerm = (roleId, perm) => {
    const updated = (data || []).map(r => {
      if (r.id !== roleId) return r;
      if (r.permissions.includes('all')) return r;
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
                <th key={p} style={{ padding: '10px 8px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'capitalize', fontSize: '0.7rem', textAlign: 'center' }}>{p}</th>
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

// ─── Appearance ───────────────────────────────────────────
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
        <input className="input-field" style={{ flex: 1 }} value={data.accentColor || '#7c3aed'} onChange={e => onChange('accentColor', e.target.value)} placeholder="#7c3aed" />
      </div>
    </Field>
    <Field label="Language">
      <Select value={data.language} onChange={v => onChange('language', v)} options={[
        { value: 'en', label: 'English' },
        { value: 'hi', label: 'Hindi' },
        { value: 'mr', label: 'Marathi' },
        { value: 'ta', label: 'Tamil' },
        { value: 'te', label: 'Telugu' },
        { value: 'es', label: 'Spanish' },
        { value: 'fr', label: 'French' },
        { value: 'de', label: 'German' },
        { value: 'zh', label: 'Chinese (Simplified)' },
        { value: 'ja', label: 'Japanese' },
      ]} />
    </Field>
    <Toggle label="Compact Mode" description="Reduce padding and font sizes for more content density" value={data.compactMode} onChange={v => onChange('compactMode', v)} />
  </div>
);

// ─── Team Members ─────────────────────────────────────────
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
    if (u?.role === 'Owner') return;
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
              {error}
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
      case 'modules': return <ModulesSection data={localSettings.modules || {}} onChange={(field, value) => handleChange('modules', field, value)} />;
      case 'naming': return <NamingSection data={localSettings.naming || {}} onChange={(field, value) => handleChange('naming', field, value)} />;
      case 'workflow': return <WorkflowSection data={localSettings.workflow || {}} onChange={(field, value) => handleChange('workflow', field, value)} />;
      case 'receipt': return <ReceiptBuilderSection data={localSettings.receipt || {}} onChange={(field, value) => handleChange('receipt', field, value)} />;
      case 'roles': return <RolesSection data={localSettings.roles || []} onChange={handleRolesChange} />;
      case 'team': return <TeamSection />;
      case 'appearance': return <AppearanceSection data={s} onChange={sectionChange} />;
      default: return null;
    }
  };

  const activeInfo = SECTIONS.find(s => s.id === activeSection);

  return (
    <div className="animate-fade-up" style={{ display: 'grid', gridTemplateColumns: '230px 1fr', gap: '16px', height: '100%' }}>
      {/* Left Nav */}
      <div className="card" style={{ padding: '10px', height: 'fit-content', position: 'sticky', top: 16 }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '6px 10px 10px' }}>
          Configuration
        </div>
        {SECTIONS.map((s, idx) => {
          const Icon = s.icon;
          const active = activeSection === s.id;
          // Group separators
          const showSep = idx === 7 || idx === 11;
          return (
            <React.Fragment key={s.id}>
              {showSep && (
                <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '6px 10px' }} />
              )}
              <button onClick={() => setActiveSection(s.id)}
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
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
              </button>
            </React.Fragment>
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
