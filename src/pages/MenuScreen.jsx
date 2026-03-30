import React, { useState, useMemo } from 'react';
import {
  Plus, Edit2, Trash2, X, Save, Search, ToggleLeft, ToggleRight,
  QrCode, AlertOctagon, ChevronDown, ChevronUp, Filter, Star,
  TrendingUp, TrendingDown, Zap, Coffee, Layers, Tag, Clock,
  DollarSign, Flame, ShieldAlert, Check, Info, Grid3X3
} from 'lucide-react';
import { useApp } from '../db/AppContext';

/* ── Constants ─────────────────────────────────────────────────── */
const CATEGORIES = ['Starters', 'Main Course', 'Desserts', 'Beverages', 'Breads', 'Salads', 'Sides', 'Specials'];
const SUBCATEGORIES = {
  Starters: ['Soup', 'Appetizer', 'Finger Food'],
  'Main Course': ['Curry', 'Rice', 'Noodles', 'Grill'],
  Desserts: ['Cake', 'Ice Cream', 'Pastry', 'Traditional'],
  Beverages: ['Hot', 'Cold', 'Alcoholic', 'Mocktail'],
  Breads: ['Indian', 'Western'],
  Salads: ['Green', 'Grain', 'Protein'],
  Sides: ['Accompaniment', 'Extra'],
  Specials: ['Chef Special', 'Seasonal'],
};
const TYPES = ['Veg', 'Non-Veg', 'Vegan'];
const STATIONS = ['Grill', 'Fry', 'Cold', 'Bakery', 'Bar', 'Tandoor', 'Dessert'];
const ALLERGENS = ['dairy', 'gluten', 'nuts', 'shellfish', 'soy', 'eggs'];
const DIETARY_LABELS = ['vegetarian', 'vegan', 'gluten-free', 'keto', 'halal'];
const TAX_GROUPS = ['food', 'alcohol', 'takeout'];
const REPORTING_GROUPS = ['Food', 'Beverage', 'Dessert', 'Alcohol', 'Add-ons'];

const TYPE_COLORS = { Veg: '#22c55e', 'Non-Veg': '#ef4444', Vegan: '#16a34a' };
const ALLERGEN_COLORS = {
  dairy: '#3b82f6', gluten: '#f59e0b', nuts: '#92400e',
  shellfish: '#ef4444', soy: '#84cc16', eggs: '#f97316',
};

const TABS = ['Menu Items', 'Modifier Groups', 'Menu Engineering'];

const emptyForm = () => ({
  name: '', description: '', price: '', category: 'Starters', subcategory: '',
  reportingGroup: 'Food', type: 'Veg', station: 'Grill', preparationTime: '15',
  costPrice: '', calories: '', allergens: [], dietaryLabels: [], taxGroup: 'food',
  modifierGroups: [], priceTiers: { regular: '', happyHour: '', delivery: '' },
  active: true, sold86: false,
});

const emptyModifierForm = () => ({
  name: '', required: false, items: [{ name: '', price: '' }], nested: [],
});

/* ── Reusable Modal ────────────────────────────────────────────── */
const Modal = ({ title, onClose, children, wide }) => (
  <div className="modal-backdrop" onClick={onClose}>
    <div className="modal" onClick={e => e.stopPropagation()}
      style={wide ? { maxWidth: 720, width: '95%' } : undefined}>
      <div className="modal-header">
        <h3 className="modal-title">{title}</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
          <X size={20} />
        </button>
      </div>
      {children}
    </div>
  </div>
);

/* ── Small helpers ─────────────────────────────────────────────── */
const Badge = ({ children, color, bg }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', fontSize: '0.7rem', fontWeight: 600,
    padding: '2px 8px', borderRadius: 999, color: color || '#fff',
    background: bg || 'var(--primary)', whiteSpace: 'nowrap', lineHeight: 1.4,
  }}>{children}</span>
);

const TypeDot = ({ type }) => (
  <span style={{
    width: 10, height: 10, borderRadius: '50%', display: 'inline-block',
    background: TYPE_COLORS[type] || '#94a3b8', border: type === 'Vegan' ? '2px solid #15803d' : 'none',
    marginRight: 6, flexShrink: 0,
  }} title={type} />
);

const Toggle = ({ on, onToggle, label }) => (
  <button onClick={onToggle} title={label}
    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: on ? 'var(--success)' : 'var(--text-muted)' }}>
    {on ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
  </button>
);

const MultiSelect = ({ options, selected, onChange, colorMap }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
    {options.map(opt => {
      const active = selected.includes(opt);
      return (
        <button key={opt} type="button" onClick={() => {
          onChange(active ? selected.filter(s => s !== opt) : [...selected, opt]);
        }} style={{
          padding: '3px 10px', borderRadius: 999, fontSize: '0.74rem', fontWeight: 600,
          border: `1.5px solid ${active ? (colorMap?.[opt] || 'var(--primary)') : 'var(--border-subtle)'}`,
          background: active ? (colorMap?.[opt] ? colorMap[opt] + '18' : 'var(--primary-light)') : 'transparent',
          color: active ? (colorMap?.[opt] || 'var(--primary)') : 'var(--text-muted)',
          cursor: 'pointer', transition: 'all .15s',
        }}>
          {opt}
        </button>
      );
    })}
  </div>
);

/* ── QR Placeholder Modal ──────────────────────────────────────── */
const QRModal = ({ item, onClose }) => (
  <Modal title={`QR Code - ${item.name}`} onClose={onClose}>
    <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 32 }}>
      <div style={{
        width: 180, height: 180, background: 'var(--card-bg)', border: '2px solid var(--border-subtle)',
        borderRadius: 16, display: 'grid', gridTemplateColumns: 'repeat(9,1fr)', gridTemplateRows: 'repeat(9,1fr)',
        gap: 1, padding: 12, marginBottom: 16,
      }}>
        {Array.from({ length: 81 }).map((_, i) => (
          <div key={i} style={{
            background: (Math.random() > 0.45 || i < 18 || i % 9 < 2) ? 'var(--text-primary)' : 'transparent',
            borderRadius: 1,
          }} />
        ))}
      </div>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
        Scan to view <strong>{item.name}</strong> on the digital menu
      </p>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
        (Placeholder - integrate with your QR service)
      </p>
    </div>
  </Modal>
);

/* ── Nutrition Info Popover ─────────────────────────────────────── */
const NutritionPopover = ({ item }) => {
  const [open, setOpen] = useState(false);
  if (!item.calories && (!item.allergens || item.allergens.length === 0) && (!item.dietaryLabels || item.dietaryLabels.length === 0)) return null;
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button onClick={() => setOpen(!open)} style={{
        background: 'none', border: 'none', cursor: 'pointer', display: 'flex',
        color: 'var(--accent-blue)', padding: 2,
      }} title="Nutrition info">
        <Info size={15} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)',
          background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 12,
          padding: 14, minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100,
          fontSize: '0.78rem',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>Nutritional Info</div>
          {item.calories && <div style={{ marginBottom: 4 }}><Flame size={13} style={{ marginRight: 4 }} />{item.calories} kcal</div>}
          {item.allergens?.length > 0 && (
            <div style={{ marginBottom: 4 }}>
              <strong>Allergens:</strong>{' '}
              {item.allergens.map(a => (
                <Badge key={a} color={ALLERGEN_COLORS[a]} bg={ALLERGEN_COLORS[a] + '18'}>{a}</Badge>
              )).reduce((acc, el, i) => i === 0 ? [el] : [...acc, ' ', el], [])}
            </div>
          )}
          {item.dietaryLabels?.length > 0 && (
            <div><strong>Dietary:</strong> {item.dietaryLabels.join(', ')}</div>
          )}
        </div>
      )}
    </span>
  );
};

/* ══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════ */
const MenuScreen = () => {
  const {
    menu, modifiers, inventory, recipes, settings,
    addMenuItem, editMenuItem, deleteMenuItem, toggleMenuItemAvailability, toggle86,
    addModifier, editModifier, deleteModifier,
  } = useApp();

  const [activeTab, setActiveTab] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCat, setFilterCat] = useState('All');
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [qrItem, setQrItem] = useState(null);
  const [form, setForm] = useState(emptyForm());

  // Modifier state
  const [modAddModal, setModAddModal] = useState(false);
  const [modEditModal, setModEditModal] = useState(null);
  const [modForm, setModForm] = useState(emptyModifierForm());
  const [modDeleteConfirm, setModDeleteConfirm] = useState(null);

  const allCategories = ['All', ...CATEGORIES];

  const filtered = useMemo(() => menu.filter(i =>
    i.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (filterCat === 'All' || i.category === filterCat)
  ), [menu, searchTerm, filterCat]);

  const currency = settings?.general?.currency || '\u20B9';

  /* ── Menu Item Helpers ────────────────────────────────────────── */
  const calcMargin = (item) => {
    const price = parseFloat(item.price) || 0;
    const cost = parseFloat(item.costPrice) || 0;
    if (price <= 0) return 0;
    return Math.round(((price - cost) / price) * 100);
  };

  const priceTier = (price) => {
    const p = parseFloat(price) || 0;
    if (p >= 500) return { label: 'Premium', color: '#7c3aed' };
    if (p >= 250) return { label: 'Mid', color: '#3b82f6' };
    return { label: 'Value', color: '#22c55e' };
  };

  const openAdd = () => {
    setForm(emptyForm());
    setAddModal(true);
  };

  const openEdit = (item) => {
    setForm({
      name: item.name || '', description: item.description || '',
      price: item.price || '', category: item.category || 'Starters',
      subcategory: item.subcategory || '', reportingGroup: item.reportingGroup || 'Food',
      type: item.type || 'Veg', station: item.station || 'Grill',
      preparationTime: item.preparationTime || '15', costPrice: item.costPrice || '',
      calories: item.calories || '', allergens: item.allergens || [],
      dietaryLabels: item.dietaryLabels || [], taxGroup: item.taxGroup || 'food',
      modifierGroups: item.modifierGroups || [],
      priceTiers: item.priceTiers || { regular: item.price || '', happyHour: '', delivery: '' },
      active: item.active !== false, sold86: item.sold86 || false,
    });
    setEditModal(item);
  };

  const handleSaveNew = () => {
    if (!form.name.trim() || !form.price) return;
    addMenuItem({
      ...form,
      price: parseFloat(form.price),
      costPrice: parseFloat(form.costPrice) || 0,
      calories: parseInt(form.calories) || 0,
      preparationTime: parseInt(form.preparationTime) || 15,
      priceTiers: {
        regular: parseFloat(form.priceTiers.regular) || parseFloat(form.price) || 0,
        happyHour: parseFloat(form.priceTiers.happyHour) || 0,
        delivery: parseFloat(form.priceTiers.delivery) || 0,
      },
    });
    setAddModal(false);
  };

  const handleSaveEdit = () => {
    if (!form.name.trim() || !form.price) return;
    editMenuItem(editModal.id, {
      ...form,
      price: parseFloat(form.price),
      costPrice: parseFloat(form.costPrice) || 0,
      calories: parseInt(form.calories) || 0,
      preparationTime: parseInt(form.preparationTime) || 15,
      priceTiers: {
        regular: parseFloat(form.priceTiers.regular) || parseFloat(form.price) || 0,
        happyHour: parseFloat(form.priceTiers.happyHour) || 0,
        delivery: parseFloat(form.priceTiers.delivery) || 0,
      },
    });
    setEditModal(null);
  };

  /* ── Modifier Helpers ────────────────────────────────────────── */
  const openModAdd = () => {
    setModForm(emptyModifierForm());
    setModAddModal(true);
  };

  const openModEdit = (mod) => {
    setModForm({
      name: mod.name || '',
      required: mod.required || false,
      items: mod.items?.length ? mod.items.map(i => ({ name: i.name || '', price: i.price || '' })) : [{ name: '', price: '' }],
      nested: mod.nested || [],
    });
    setModEditModal(mod);
  };

  const handleSaveMod = () => {
    if (!modForm.name.trim()) return;
    const data = {
      ...modForm,
      items: modForm.items.filter(i => i.name.trim()).map(i => ({ name: i.name, price: parseFloat(i.price) || 0 })),
    };
    addModifier(data);
    setModAddModal(false);
  };

  const handleSaveModEdit = () => {
    if (!modForm.name.trim()) return;
    const data = {
      ...modForm,
      items: modForm.items.filter(i => i.name.trim()).map(i => ({ name: i.name, price: parseFloat(i.price) || 0 })),
    };
    editModifier(modEditModal.id, data);
    setModEditModal(null);
  };

  const getModUsedBy = (modId) => menu.filter(m => m.modifierGroups?.includes(modId));

  /* ── Item Form Shared ────────────────────────────────────────── */
  const ItemForm = ({ onSave, saveLabel }) => (
    <>
      <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
        {/* Row 1: Name + Description */}
        <div className="input-group">
          <label className="input-label">Item Name *</label>
          <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Butter Chicken" />
        </div>
        <div className="input-group">
          <label className="input-label">Description</label>
          <input className="input-field" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short description" />
        </div>

        {/* Row 2: Price + Cost + Prep */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div className="input-group">
            <label className="input-label">Price ({currency}) *</label>
            <input className="input-field" type="number" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00" />
          </div>
          <div className="input-group">
            <label className="input-label">Cost Price ({currency})</label>
            <input className="input-field" type="number" min="0" value={form.costPrice} onChange={e => setForm(f => ({ ...f, costPrice: e.target.value }))} placeholder="0.00" />
          </div>
          <div className="input-group">
            <label className="input-label">Prep Time (min)</label>
            <input className="input-field" type="number" min="1" value={form.preparationTime} onChange={e => setForm(f => ({ ...f, preparationTime: e.target.value }))} placeholder="15" />
          </div>
        </div>

        {/* Row 3: Category + Subcategory + Reporting Group */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div className="input-group">
            <label className="input-label">Category</label>
            <select className="input-field" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value, subcategory: '' }))}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="input-group">
            <label className="input-label">Subcategory</label>
            <select className="input-field" value={form.subcategory} onChange={e => setForm(f => ({ ...f, subcategory: e.target.value }))}>
              <option value="">-- None --</option>
              {(SUBCATEGORIES[form.category] || []).map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="input-group">
            <label className="input-label">Reporting Group</label>
            <select className="input-field" value={form.reportingGroup} onChange={e => setForm(f => ({ ...f, reportingGroup: e.target.value }))}>
              {REPORTING_GROUPS.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
        </div>

        {/* Row 4: Type + Station + Calories */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div className="input-group">
            <label className="input-label">Type</label>
            <select className="input-field" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              {TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="input-group">
            <label className="input-label">Station</label>
            <select className="input-field" value={form.station} onChange={e => setForm(f => ({ ...f, station: e.target.value }))}>
              {STATIONS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="input-group">
            <label className="input-label">Calories (kcal)</label>
            <input className="input-field" type="number" min="0" value={form.calories} onChange={e => setForm(f => ({ ...f, calories: e.target.value }))} placeholder="0" />
          </div>
        </div>

        {/* Tax Group */}
        <div className="input-group">
          <label className="input-label">Tax Group</label>
          <select className="input-field" value={form.taxGroup} onChange={e => setForm(f => ({ ...f, taxGroup: e.target.value }))}>
            {TAX_GROUPS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>

        {/* Allergens */}
        <div className="input-group">
          <label className="input-label">Allergens</label>
          <MultiSelect options={ALLERGENS} selected={form.allergens} onChange={v => setForm(f => ({ ...f, allergens: v }))} colorMap={ALLERGEN_COLORS} />
        </div>

        {/* Dietary Labels */}
        <div className="input-group">
          <label className="input-label">Dietary Labels</label>
          <MultiSelect options={DIETARY_LABELS} selected={form.dietaryLabels} onChange={v => setForm(f => ({ ...f, dietaryLabels: v }))} />
        </div>

        {/* Price Tiers */}
        <div className="input-group">
          <label className="input-label" style={{ marginBottom: 6 }}>Price Tiers ({currency})</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Regular</span>
              <input className="input-field" type="number" min="0" value={form.priceTiers.regular}
                onChange={e => setForm(f => ({ ...f, priceTiers: { ...f.priceTiers, regular: e.target.value } }))} placeholder={form.price || '0'} />
            </div>
            <div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Happy Hour</span>
              <input className="input-field" type="number" min="0" value={form.priceTiers.happyHour}
                onChange={e => setForm(f => ({ ...f, priceTiers: { ...f.priceTiers, happyHour: e.target.value } }))} placeholder="0" />
            </div>
            <div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Delivery</span>
              <input className="input-field" type="number" min="0" value={form.priceTiers.delivery}
                onChange={e => setForm(f => ({ ...f, priceTiers: { ...f.priceTiers, delivery: e.target.value } }))} placeholder="0" />
            </div>
          </div>
        </div>

        {/* Modifier Groups */}
        {modifiers?.length > 0 && (
          <div className="input-group">
            <label className="input-label">Modifier Groups</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {modifiers.map(mod => {
                const checked = form.modifierGroups.includes(mod.id);
                return (
                  <label key={mod.id} style={{
                    display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem',
                    padding: '4px 10px', borderRadius: 8,
                    background: checked ? 'var(--primary-light)' : 'transparent',
                    border: `1px solid ${checked ? 'var(--primary)' : 'var(--border-subtle)'}`,
                    cursor: 'pointer',
                  }}>
                    <input type="checkbox" checked={checked} onChange={() => {
                      setForm(f => ({
                        ...f,
                        modifierGroups: checked
                          ? f.modifierGroups.filter(id => id !== mod.id)
                          : [...f.modifierGroups, mod.id],
                      }));
                    }} style={{ accentColor: 'var(--primary)' }} />
                    {mod.name}
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div className="modal-footer">
        <button className="btn btn-primary" onClick={onSave}><Save size={15} /> {saveLabel}</button>
      </div>
    </>
  );

  /* ── Modifier Form ───────────────────────────────────────────── */
  const ModifierForm = ({ onSave, saveLabel }) => (
    <>
      <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
        <div className="input-group">
          <label className="input-label">Group Name *</label>
          <input className="input-field" value={modForm.name} onChange={e => setModForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Spice Level" />
        </div>
        <div className="input-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={modForm.required} onChange={e => setModForm(f => ({ ...f, required: e.target.checked }))} style={{ accentColor: 'var(--primary)' }} />
            Required (customer must select at least one)
          </label>
        </div>
        <div className="input-group">
          <label className="input-label">Modifier Items</label>
          {modForm.items.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
              <input className="input-field" value={item.name} placeholder="Item name"
                onChange={e => {
                  const items = [...modForm.items];
                  items[idx] = { ...items[idx], name: e.target.value };
                  setModForm(f => ({ ...f, items }));
                }} style={{ flex: 2 }} />
              <input className="input-field" type="number" min="0" value={item.price} placeholder="+Price"
                onChange={e => {
                  const items = [...modForm.items];
                  items[idx] = { ...items[idx], price: e.target.value };
                  setModForm(f => ({ ...f, items }));
                }} style={{ flex: 1 }} />
              {modForm.items.length > 1 && (
                <button onClick={() => setModForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}
                  style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 4 }}>
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
          <button className="btn btn-secondary btn-sm" onClick={() => setModForm(f => ({ ...f, items: [...f.items, { name: '', price: '' }] }))}>
            <Plus size={14} /> Add Item
          </button>
        </div>
        {/* Nested modifiers placeholder */}
        <div className="input-group">
          <label className="input-label">Nested Modifiers</label>
          <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: 0 }}>
            Nested modifier groups can reference other modifier groups for complex customizations.
            Attach them via the Menu Items form.
          </p>
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-primary" onClick={onSave}><Save size={15} /> {saveLabel}</button>
      </div>
    </>
  );

  /* ══════════════════════════════════════════════════════════════
     TAB 1 — MENU ITEMS
     ══════════════════════════════════════════════════════════════ */
  const renderMenuItems = () => (
    <>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input-field" value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search menu items..."
            style={{ paddingLeft: 34, margin: 0 }} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {allCategories.map(cat => (
            <button key={cat} onClick={() => setFilterCat(cat)}
              className={`btn btn-sm ${filterCat === cat ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.74rem' }}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="table-wrapper" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ background: 'rgba(124,58,237,0.04)' }}>
              {['Name', 'Category', 'Type', 'Price', 'Prep', 'Station', 'Cost', 'Margin', 'Cal', 'Allergens', 'Dietary', '86\'d', 'Active', 'Actions'].map(h => (
                <th key={h} style={{
                  padding: '10px 8px', fontWeight: 700, color: 'var(--text-secondary)',
                  textAlign: 'left', fontSize: '0.72rem', textTransform: 'uppercase',
                  letterSpacing: '0.05em', borderBottom: '2px solid var(--border-subtle)',
                  whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={14} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No menu items found</td></tr>
            )}
            {filtered.map(item => {
              const margin = calcMargin(item);
              const tier = priceTier(item.price);
              return (
                <tr key={item.id} style={{
                  borderBottom: '1px solid var(--border-subtle)',
                  opacity: item.sold86 ? 0.55 : 1,
                  background: item.sold86 ? 'rgba(239,68,68,0.03)' : 'transparent',
                  transition: 'background .15s',
                }}>
                  {/* Name */}
                  <td style={{ padding: '10px 8px', fontWeight: 600, color: 'var(--text-primary)', maxWidth: 180 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {item.name}
                      <NutritionPopover item={item} />
                    </div>
                    {item.description && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                        {item.description}
                      </div>
                    )}
                  </td>
                  {/* Category */}
                  <td style={{ padding: '10px 8px' }}>
                    <div style={{ fontSize: '0.78rem' }}>{item.category}</div>
                    {item.subcategory && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{item.subcategory}</div>}
                  </td>
                  {/* Type */}
                  <td style={{ padding: '10px 8px' }}>
                    <span style={{ display: 'flex', alignItems: 'center' }}>
                      <TypeDot type={item.type} />
                      <span style={{ fontSize: '0.74rem' }}>{item.type}</span>
                    </span>
                  </td>
                  {/* Price */}
                  <td style={{ padding: '10px 8px' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{currency}{parseFloat(item.price || 0).toFixed(0)}</span>
                    <Badge color={tier.color} bg={tier.color + '14'}>{tier.label}</Badge>
                  </td>
                  {/* Prep */}
                  <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>
                    {item.preparationTime || '-'}m
                  </td>
                  {/* Station */}
                  <td style={{ padding: '10px 8px' }}>
                    <Badge color="var(--text-secondary)" bg="rgba(100,116,139,0.08)">{item.station || '-'}</Badge>
                  </td>
                  {/* Cost */}
                  <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>
                    {item.costPrice ? `${currency}${parseFloat(item.costPrice).toFixed(0)}` : '-'}
                  </td>
                  {/* Margin */}
                  <td style={{ padding: '10px 8px' }}>
                    <span style={{
                      fontWeight: 600,
                      color: margin >= 60 ? 'var(--success)' : margin >= 30 ? 'var(--warning)' : 'var(--danger)',
                    }}>{item.costPrice ? `${margin}%` : '-'}</span>
                  </td>
                  {/* Calories */}
                  <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>
                    {item.calories || '-'}
                  </td>
                  {/* Allergens */}
                  <td style={{ padding: '10px 8px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      {(item.allergens || []).map(a => (
                        <Badge key={a} color={ALLERGEN_COLORS[a]} bg={ALLERGEN_COLORS[a] + '18'}>{a}</Badge>
                      ))}
                      {(!item.allergens || item.allergens.length === 0) && <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>-</span>}
                    </div>
                  </td>
                  {/* Dietary */}
                  <td style={{ padding: '10px 8px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      {(item.dietaryLabels || []).map(d => (
                        <Badge key={d} color="var(--primary)" bg="var(--primary-light)">{d}</Badge>
                      ))}
                      {(!item.dietaryLabels || item.dietaryLabels.length === 0) && <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>-</span>}
                    </div>
                  </td>
                  {/* 86 */}
                  <td style={{ padding: '10px 8px' }}>
                    {item.sold86 ? (
                      <Badge color="#fff" bg="var(--danger)">86'd</Badge>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>-</span>
                    )}
                  </td>
                  {/* Active */}
                  <td style={{ padding: '10px 8px' }}>
                    <Toggle on={item.active !== false} onToggle={() => toggleMenuItemAvailability(item.id)} label="Toggle availability" />
                  </td>
                  {/* Actions */}
                  <td style={{ padding: '10px 8px' }}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <button onClick={() => toggle86(item.id)} title={item.sold86 ? 'Un-86' : '86 item'}
                        className="btn btn-sm" style={{
                          padding: '4px 6px', fontSize: '0.68rem', fontWeight: 700,
                          background: item.sold86 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.08)',
                          color: item.sold86 ? 'var(--success)' : 'var(--danger)',
                          border: `1px solid ${item.sold86 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.25)'}`,
                        }}>
                        <AlertOctagon size={13} /> {item.sold86 ? 'Un-86' : '86'}
                      </button>
                      <button onClick={() => setQrItem(item)} title="QR Code"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-blue)', padding: 4 }}>
                        <QrCode size={16} />
                      </button>
                      <button onClick={() => openEdit(item)} title="Edit"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', padding: 4 }}>
                        <Edit2 size={15} />
                      </button>
                      <button onClick={() => setDeleteConfirm(item)} title="Delete"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 4 }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
          {filtered.length} item{filtered.length !== 1 ? 's' : ''} shown
        </div>
        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
          {menu.filter(i => i.sold86).length} item{menu.filter(i => i.sold86).length !== 1 ? 's' : ''} 86'd
        </div>
        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
          Avg price: {currency}{menu.length > 0 ? (menu.reduce((s, i) => s + (parseFloat(i.price) || 0), 0) / menu.length).toFixed(0) : '0'}
        </div>
      </div>
    </>
  );

  /* ══════════════════════════════════════════════════════════════
     TAB 2 — MODIFIER GROUPS
     ══════════════════════════════════════════════════════════════ */
  const renderModifiers = () => (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={openModAdd}>
          <Plus size={15} /> Add Modifier Group
        </button>
      </div>

      {(!modifiers || modifiers.length === 0) ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <Layers size={40} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>No modifier groups yet. Add one to get started.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {modifiers.map(mod => {
            const usedBy = getModUsedBy(mod.id);
            return (
              <div key={mod.id} className="card" style={{ padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{mod.name}</span>
                      {mod.required && <Badge color="var(--danger)" bg="rgba(239,68,68,0.08)">Required</Badge>}
                      <Badge color="var(--text-secondary)" bg="rgba(100,116,139,0.08)">{(mod.items || []).length} option{(mod.items || []).length !== 1 ? 's' : ''}</Badge>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => openModEdit(mod)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', padding: 4 }}>
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => setModDeleteConfirm(mod)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 4 }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Modifier items list */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  {(mod.items || []).map((item, idx) => (
                    <div key={idx} style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
                      borderRadius: 10, background: 'rgba(124,58,237,0.04)',
                      border: '1px solid var(--border-subtle)', fontSize: '0.8rem',
                    }}>
                      <span style={{ fontWeight: 500 }}>{item.name}</span>
                      {item.price > 0 && (
                        <span style={{ color: 'var(--primary)', fontWeight: 700, fontSize: '0.74rem' }}>+{currency}{item.price}</span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Used by */}
                {usedBy.length > 0 && (
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    <strong>Used by:</strong>{' '}
                    {usedBy.map(m => m.name).join(', ')}
                  </div>
                )}
                {usedBy.length === 0 && (
                  <div style={{ fontSize: '0.74rem', color: 'var(--warning)' }}>Not attached to any menu items</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  /* ══════════════════════════════════════════════════════════════
     TAB 3 — MENU ENGINEERING
     ══════════════════════════════════════════════════════════════ */
  const renderEngineering = () => {
    const items = menu.filter(i => parseFloat(i.price) > 0);

    // Compute metrics
    const withMetrics = items.map(item => {
      const price = parseFloat(item.price) || 0;
      const cost = parseFloat(item.costPrice) || 0;
      const margin = price > 0 ? ((price - cost) / price) * 100 : 0;
      const ordered = item.timesOrdered || Math.floor(Math.random() * 120) + 5; // fallback demo data
      return { ...item, margin, ordered };
    });

    const avgMargin = withMetrics.length > 0 ? withMetrics.reduce((s, i) => s + i.margin, 0) / withMetrics.length : 0;
    const avgOrdered = withMetrics.length > 0 ? withMetrics.reduce((s, i) => s + i.ordered, 0) / withMetrics.length : 0;

    const classify = (item) => {
      const highPop = item.ordered >= avgOrdered;
      const highProfit = item.margin >= avgMargin;
      if (highPop && highProfit) return 'star';
      if (!highPop && highProfit) return 'puzzle';
      if (highPop && !highProfit) return 'plowhorse';
      return 'dog';
    };

    const classified = withMetrics.map(i => ({ ...i, quad: classify(i) }));

    const quadrantMeta = {
      star: { label: 'Stars', icon: <Star size={16} />, color: '#f59e0b', desc: 'High Profit & High Popularity' },
      puzzle: { label: 'Puzzles', icon: <Zap size={16} />, color: '#7c3aed', desc: 'High Profit, Low Popularity' },
      plowhorse: { label: 'Plowhorses', icon: <Coffee size={16} />, color: '#3b82f6', desc: 'Low Profit, High Popularity' },
      dog: { label: 'Dogs', icon: <TrendingDown size={16} />, color: '#ef4444', desc: 'Low Profit & Low Popularity' },
    };

    const bestSeller = withMetrics.length > 0 ? withMetrics.reduce((a, b) => a.ordered > b.ordered ? a : b) : null;
    const highestMarginItem = withMetrics.length > 0 ? withMetrics.reduce((a, b) => a.margin > b.margin ? a : b) : null;

    const maxOrdered = Math.max(...withMetrics.map(i => i.ordered), 1);
    const maxMargin = Math.max(...withMetrics.map(i => i.margin), 1);

    return (
      <>
        {/* Summary Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
          {[
            { label: 'Total Items', value: items.length, icon: <Grid3X3 size={18} />, color: 'var(--primary)' },
            { label: 'Avg Margin', value: `${avgMargin.toFixed(1)}%`, icon: <TrendingUp size={18} />, color: 'var(--success)' },
            { label: 'Best Seller', value: bestSeller?.name || '-', icon: <Star size={18} />, color: '#f59e0b' },
            { label: 'Highest Margin', value: highestMarginItem?.name || '-', icon: <DollarSign size={18} />, color: 'var(--accent-blue)' },
          ].map((stat, idx) => (
            <div key={idx} className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: stat.color + '14', color: stat.color,
              }}>
                {stat.icon}
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{stat.label}</div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{stat.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Quadrant Visualization */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>
            Menu Engineering Matrix
          </h3>

          {withMetrics.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              Add menu items with cost prices to see the engineering matrix.
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              {/* Axis labels */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Popularity (times ordered) &rarr;
                </span>
              </div>

              <div style={{ display: 'flex' }}>
                {/* Y axis label */}
                <div style={{
                  writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                  fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  paddingRight: 8,
                }}>
                  Profitability (margin %) &rarr;
                </div>

                {/* Grid */}
                <div style={{
                  flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr',
                  gap: 2, minHeight: 380, borderRadius: 16, overflow: 'hidden',
                }}>
                  {/* Puzzles (top-left): High profit, Low pop */}
                  <div style={{ background: 'rgba(124,58,237,0.05)', padding: 14, position: 'relative', borderRight: '2px dashed var(--border-subtle)', borderBottom: '2px dashed var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: quadrantMeta.puzzle.color, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {quadrantMeta.puzzle.icon} Puzzles
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 10 }}>High Profit, Low Popularity</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {classified.filter(i => i.quad === 'puzzle').map(i => (
                        <div key={i.id} style={{
                          padding: '4px 10px', borderRadius: 8, background: '#fff',
                          border: `1px solid ${quadrantMeta.puzzle.color}30`, fontSize: '0.72rem',
                          fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                        }}>
                          <TypeDot type={i.type} />
                          <span>{i.name}</span>
                          <span style={{ color: quadrantMeta.puzzle.color, fontWeight: 700, fontSize: '0.66rem' }}>{i.margin.toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Stars (top-right): High profit, High pop */}
                  <div style={{ background: 'rgba(245,158,11,0.05)', padding: 14, position: 'relative', borderBottom: '2px dashed var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: quadrantMeta.star.color, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {quadrantMeta.star.icon} Stars
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 10 }}>High Profit & High Popularity</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {classified.filter(i => i.quad === 'star').map(i => (
                        <div key={i.id} style={{
                          padding: '4px 10px', borderRadius: 8, background: '#fff',
                          border: `1px solid ${quadrantMeta.star.color}30`, fontSize: '0.72rem',
                          fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                        }}>
                          <TypeDot type={i.type} />
                          <span>{i.name}</span>
                          <span style={{ color: quadrantMeta.star.color, fontWeight: 700, fontSize: '0.66rem' }}>{i.margin.toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Dogs (bottom-left): Low profit, Low pop */}
                  <div style={{ background: 'rgba(239,68,68,0.04)', padding: 14, position: 'relative', borderRight: '2px dashed var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: quadrantMeta.dog.color, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {quadrantMeta.dog.icon} Dogs
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 10 }}>Low Profit & Low Popularity</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {classified.filter(i => i.quad === 'dog').map(i => (
                        <div key={i.id} style={{
                          padding: '4px 10px', borderRadius: 8, background: '#fff',
                          border: `1px solid ${quadrantMeta.dog.color}30`, fontSize: '0.72rem',
                          fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                        }}>
                          <TypeDot type={i.type} />
                          <span>{i.name}</span>
                          <span style={{ color: quadrantMeta.dog.color, fontWeight: 700, fontSize: '0.66rem' }}>{i.margin.toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Plowhorses (bottom-right): Low profit, High pop */}
                  <div style={{ background: 'rgba(59,130,246,0.04)', padding: 14, position: 'relative' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: quadrantMeta.plowhorse.color, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {quadrantMeta.plowhorse.icon} Plowhorses
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 10 }}>Low Profit, High Popularity</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {classified.filter(i => i.quad === 'plowhorse').map(i => (
                        <div key={i.id} style={{
                          padding: '4px 10px', borderRadius: 8, background: '#fff',
                          border: `1px solid ${quadrantMeta.plowhorse.color}30`, fontSize: '0.72rem',
                          fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                        }}>
                          <TypeDot type={i.type} />
                          <span>{i.name}</span>
                          <span style={{ color: quadrantMeta.plowhorse.color, fontWeight: 700, fontSize: '0.66rem' }}>{i.margin.toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Scatter plot overlay */}
              <div style={{ marginTop: 20 }}>
                <h4 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Scatter Plot</h4>
                <div style={{
                  position: 'relative', width: '100%', height: 280,
                  background: 'linear-gradient(135deg, rgba(124,58,237,0.02), rgba(59,130,246,0.02))',
                  border: '1px solid var(--border-subtle)', borderRadius: 12,
                  overflow: 'hidden',
                }}>
                  {/* Grid lines */}
                  <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--border-subtle)', opacity: 0.6 }} />
                  <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'var(--border-subtle)', opacity: 0.6 }} />

                  {/* Quadrant labels */}
                  <span style={{ position: 'absolute', top: 6, left: 8, fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600 }}>PUZZLES</span>
                  <span style={{ position: 'absolute', top: 6, right: 8, fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600 }}>STARS</span>
                  <span style={{ position: 'absolute', bottom: 6, left: 8, fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600 }}>DOGS</span>
                  <span style={{ position: 'absolute', bottom: 6, right: 8, fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600 }}>PLOWHORSES</span>

                  {/* Dots */}
                  {classified.map(item => {
                    const x = maxOrdered > 0 ? (item.ordered / maxOrdered) * 90 + 5 : 50;
                    const y = maxMargin > 0 ? 95 - (item.margin / maxMargin) * 90 : 50;
                    const qColor = quadrantMeta[item.quad].color;
                    return (
                      <div key={item.id} title={`${item.name}\nOrdered: ${item.ordered}\nMargin: ${item.margin.toFixed(1)}%`}
                        style={{
                          position: 'absolute', left: `${x}%`, top: `${y}%`,
                          transform: 'translate(-50%, -50%)', width: 12, height: 12,
                          borderRadius: '50%', background: qColor, border: '2px solid #fff',
                          boxShadow: `0 0 0 1px ${qColor}40, 0 2px 6px rgba(0,0,0,0.15)`,
                          cursor: 'pointer', transition: 'transform .15s',
                          zIndex: 2,
                        }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'translate(-50%,-50%) scale(1.6)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'translate(-50%,-50%) scale(1)'}
                      />
                    );
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Low Popularity</span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>High Popularity</span>
                </div>
              </div>

              {/* Quadrant counts */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 16 }}>
                {['star', 'puzzle', 'plowhorse', 'dog'].map(q => {
                  const count = classified.filter(i => i.quad === q).length;
                  const meta = quadrantMeta[q];
                  return (
                    <div key={q} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                      borderRadius: 12, background: meta.color + '08', border: `1px solid ${meta.color}20`,
                    }}>
                      <span style={{ color: meta.color }}>{meta.icon}</span>
                      <div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{meta.label}</div>
                        <div style={{ fontWeight: 700, fontSize: '1rem', color: meta.color }}>{count}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </>
    );
  };

  /* ══════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════ */
  return (
    <div className="animate-fade-up">
      <div className="page-title-row">
        <h1 className="page-title">Menu Management</h1>
        {activeTab === 0 && (
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={15} /> Add Item
          </button>
        )}
        {activeTab === 1 && (
          <button className="btn btn-primary" onClick={openModAdd}>
            <Plus size={15} /> Add Modifier
          </button>
        )}
      </div>

      {/* Tab Bar */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 20,
        borderBottom: '2px solid var(--border-subtle)',
      }}>
        {TABS.map((tab, idx) => (
          <button key={tab} onClick={() => setActiveTab(idx)}
            style={{
              padding: '10px 20px', fontSize: '0.84rem', fontWeight: activeTab === idx ? 700 : 500,
              color: activeTab === idx ? 'var(--primary)' : 'var(--text-secondary)',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: activeTab === idx ? '2px solid var(--primary)' : '2px solid transparent',
              marginBottom: -2, transition: 'all .15s',
            }}>
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 0 && renderMenuItems()}
      {activeTab === 1 && renderModifiers()}
      {activeTab === 2 && renderEngineering()}

      {/* ── Modals ─────────────────────────────────────────────── */}

      {/* Add Menu Item */}
      {addModal && (
        <Modal title="Add Menu Item" onClose={() => setAddModal(false)} wide>
          <ItemForm onSave={handleSaveNew} saveLabel="Add Item" />
        </Modal>
      )}

      {/* Edit Menu Item */}
      {editModal && (
        <Modal title={`Edit: ${editModal.name}`} onClose={() => setEditModal(null)} wide>
          <ItemForm onSave={handleSaveEdit} saveLabel="Save Changes" />
        </Modal>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <Modal title="Delete Item" onClose={() => setDeleteConfirm(null)}>
          <div className="modal-body">
            <p style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>
              Are you sure you want to delete <strong>{deleteConfirm.name}</strong>? This action cannot be undone.
            </p>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => { deleteMenuItem(deleteConfirm.id); setDeleteConfirm(null); }}>
              <Trash2 size={15} /> Delete
            </button>
          </div>
        </Modal>
      )}

      {/* QR Modal */}
      {qrItem && <QRModal item={qrItem} onClose={() => setQrItem(null)} />}

      {/* Add Modifier Modal */}
      {modAddModal && (
        <Modal title="Add Modifier Group" onClose={() => setModAddModal(false)}>
          <ModifierForm onSave={handleSaveMod} saveLabel="Add Group" />
        </Modal>
      )}

      {/* Edit Modifier Modal */}
      {modEditModal && (
        <Modal title={`Edit: ${modEditModal.name}`} onClose={() => setModEditModal(null)}>
          <ModifierForm onSave={handleSaveModEdit} saveLabel="Save Changes" />
        </Modal>
      )}

      {/* Delete Modifier Confirm */}
      {modDeleteConfirm && (
        <Modal title="Delete Modifier Group" onClose={() => setModDeleteConfirm(null)}>
          <div className="modal-body">
            <p style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>
              Are you sure you want to delete <strong>{modDeleteConfirm.name}</strong>?
            </p>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setModDeleteConfirm(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => { deleteModifier(modDeleteConfirm.id); setModDeleteConfirm(null); }}>
              <Trash2 size={15} /> Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default MenuScreen;
