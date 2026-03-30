import React, { useState, useMemo, useCallback } from 'react';
import {
  Package, AlertTriangle, Plus, X, Edit2, Save, Download, Trash2,
  Search, Filter, ShoppingCart, ChefHat, Truck, FileText, BarChart3,
  Star, Phone, Mail, Clock, CheckCircle, XCircle, ArrowRight,
  TrendingUp, TrendingDown, Minus, RefreshCw, Eye, Send, Archive,
  Flame, Droplets, AlertCircle, IndianRupee, Layers, ChevronDown
} from 'lucide-react';
import { useApp } from '../db/AppContext';

// ─── Constants ──────────────────────────────────────────────
const CATEGORIES = ['Vegetables', 'Grains', 'Meat', 'Dairy', 'Pantry', 'Spices', 'Beverages', 'Oils', 'Other'];
const UNITS = ['kg', 'g', 'L', 'ml', 'pcs', 'dozen', 'bunch', 'can', 'bag', 'box'];
const WASTE_REASONS = ['Expired', 'Dropped', 'Burned', 'Spillage', 'Contaminated', 'Over-production', 'Other'];
const TABS = [
  { key: 'stock', label: 'Stock', icon: Package },
  { key: 'recipes', label: 'Recipes', icon: ChefHat },
  { key: 'suppliers', label: 'Suppliers', icon: Truck },
  { key: 'orders', label: 'Purchase Orders', icon: FileText },
  { key: 'waste', label: 'Waste Log', icon: Trash2 },
  { key: 'analytics', label: 'Cost Analytics', icon: BarChart3 },
];

// ─── Helpers ────────────────────────────────────────────────
const fmt = (n) => {
  if (n == null || isNaN(n)) return '\u20B90';
  if (n >= 10000000) return `\u20B9${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `\u20B9${(n / 100000).toFixed(1)}L`;
  return `\u20B9${Math.round(n).toLocaleString('en-IN')}`;
};
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '--';
const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '--';
const genLocalId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// ─── Shared Components ──────────────────────────────────────
const Modal = ({ title, onClose, children, wide }) => (
  <div className="modal-backdrop" onClick={onClose}>
    <div className="modal" onClick={e => e.stopPropagation()} style={wide ? { maxWidth: 720, width: '95vw' } : {}}>
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

const StatusBadge = ({ status }) => {
  const map = { good: 'badge-success', low: 'badge-warning', critical: 'badge-danger', draft: 'badge-warning', sent: 'badge-info', received: 'badge-success' };
  return <span className={`badge ${map[status] || 'badge-neutral'}`}>{status}</span>;
};

const StatCard = ({ icon: Icon, label, value, color, sub }) => (
  <div className="stat-card" style={{ flex: 1, minWidth: 160 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} color={color} />
      </div>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
    </div>
    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
  </div>
);

const ParLevelBar = ({ stock, min }) => {
  const pct = min > 0 ? Math.min((stock / min) * 100, 150) : 100;
  const color = pct < 50 ? 'var(--danger)' : pct < 100 ? 'var(--warning)' : 'var(--success)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 80 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--border-subtle)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 30, textAlign: 'right' }}>{Math.round(pct)}%</span>
    </div>
  );
};

// ─── Tab styles ─────────────────────────────────────────────
const tabBarStyle = {
  display: 'flex', gap: 4, padding: 4, background: 'var(--card-bg)', borderRadius: 14,
  border: '1px solid var(--border-subtle)', marginBottom: 20, overflowX: 'auto',
  backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
};
const tabStyle = (active) => ({
  padding: '10px 18px', borderRadius: 10, cursor: 'pointer', fontWeight: 600,
  fontSize: 13, display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
  border: 'none', transition: 'all 0.2s',
  background: active ? 'var(--primary)' : 'transparent',
  color: active ? '#fff' : 'var(--text-secondary)',
});

const cellStyle = { padding: '10px 12px', fontSize: 13, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)' };
const thStyle = { ...cellStyle, fontWeight: 600, color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', position: 'sticky', top: 0, background: 'rgba(255,255,255,0.95)', zIndex: 1 };

// ═══════════════════════════════════════════════════════════
// STOCK TAB
// ═══════════════════════════════════════════════════════════
const StockTab = () => {
  const { inventory, suppliers, addInventoryItem, editInventoryItem, orderMoreInventory, deleteInventoryItem } = useApp();
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [modal, setModal] = useState(null); // 'add' | item object for edit
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [form, setForm] = useState({ name: '', category: 'Vegetables', stock: '', unit: 'kg', min: '', cost: '', supplier: '' });

  const filtered = useMemo(() => {
    return inventory.filter(i => {
      if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (catFilter !== 'All' && i.category !== catFilter) return false;
      if (statusFilter !== 'All' && i.status !== statusFilter.toLowerCase()) return false;
      return true;
    });
  }, [inventory, search, catFilter, statusFilter]);

  const stats = useMemo(() => ({
    total: inventory.length,
    low: inventory.filter(i => i.status === 'low').length,
    critical: inventory.filter(i => i.status === 'critical').length,
    value: inventory.reduce((s, i) => s + (parseFloat(i.cost) || 0) * (parseFloat(i.stock) || 0), 0),
  }), [inventory]);

  const openAdd = () => {
    setForm({ name: '', category: 'Vegetables', stock: '', unit: 'kg', min: '5', cost: '', supplier: '' });
    setModal('add');
  };

  const openEdit = (item) => {
    setForm({ name: item.name, category: item.category, stock: String(item.stock), unit: item.unit, min: String(item.min), cost: String(item.cost || ''), supplier: item.supplier || '' });
    setModal(item);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.stock) return;
    if (modal === 'add') {
      addInventoryItem({ ...form, stock: parseFloat(form.stock), min: parseFloat(form.min) || 5, cost: parseFloat(form.cost) || 0 });
    } else {
      editInventoryItem(modal.id, { ...form, stock: parseFloat(form.stock), min: parseFloat(form.min) || 5, cost: parseFloat(form.cost) || 0 });
    }
    setModal(null);
  };

  const handleExport = () => {
    const csv = [
      'Name,Category,Stock,Unit,Min Level,Status,Cost/Unit,Supplier,Last Updated',
      ...inventory.map(i => `"${i.name}","${i.category}",${i.stock},"${i.unit}",${i.min},"${i.status}",${i.cost || 0},"${i.supplier || ''}","${i.lastUpdated || ''}"`)
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'inventory.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const supplierNames = useMemo(() => suppliers.map(s => s.name), [suppliers]);

  return (
    <>
      {/* Stats */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
        <StatCard icon={Package} label="Total Items" value={stats.total} color="var(--primary)" />
        <StatCard icon={AlertTriangle} label="Low Stock" value={stats.low} color="var(--warning)" />
        <StatCard icon={XCircle} label="Critical" value={stats.critical} color="var(--danger)" />
        <StatCard icon={IndianRupee} label="Total Value" value={fmt(stats.value)} color="var(--success)" />
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input-field" placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 36, width: '100%' }} />
        </div>
        <select className="input-field" value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ width: 'auto', minWidth: 130 }}>
          <option value="All">All Categories</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <select className="input-field" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: 'auto', minWidth: 110 }}>
          {['All', 'Good', 'Low', 'Critical'].map(s => <option key={s}>{s}</option>)}
        </select>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Add Item</button>
        <button className="btn btn-secondary" onClick={handleExport}><Download size={16} /> CSV</button>
      </div>

      {/* Table */}
      <div className="table-wrapper" style={{ maxHeight: 520, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Name', 'Category', 'Stock', 'Unit', 'Par Level', 'Cost/Unit', 'Supplier', 'Status', 'Last Updated', 'Actions'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={10} style={{ ...cellStyle, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>No items found</td></tr>
            )}
            {filtered.map(item => (
              <tr key={item.id} style={{ transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(124,58,237,0.04)'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                <td style={{ ...cellStyle, fontWeight: 600 }}>{item.name}</td>
                <td style={cellStyle}>{item.category}</td>
                <td style={{ ...cellStyle, fontWeight: 600 }}>{item.stock}</td>
                <td style={cellStyle}>{item.unit}</td>
                <td style={{ ...cellStyle, minWidth: 120 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Min: {item.min}</div>
                  <ParLevelBar stock={item.stock} min={item.min} />
                </td>
                <td style={cellStyle}>{item.cost ? fmt(item.cost) : '--'}</td>
                <td style={cellStyle}>{item.supplier || '--'}</td>
                <td style={cellStyle}><StatusBadge status={item.status} /></td>
                <td style={{ ...cellStyle, fontSize: 11, color: 'var(--text-muted)' }}>{fmtDate(item.lastUpdated)}</td>
                <td style={cellStyle}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => openEdit(item)} title="Edit"><Edit2 size={14} /></button>
                    {item.status !== 'good' && (
                      <button className="btn btn-sm btn-primary" onClick={() => orderMoreInventory(item.id)} title="Reorder"><RefreshCw size={14} /></button>
                    )}
                    <button className="btn btn-sm btn-danger" onClick={() => setDeleteConfirm(item)} title="Delete"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {modal && (
        <Modal title={modal === 'add' ? 'Add Inventory Item' : 'Edit Item'} onClose={() => setModal(null)}>
          <div className="modal-body">
            <div className="input-group">
              <label className="input-label">Item Name</label>
              <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Tomatoes" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="input-group">
                <label className="input-label">Category</label>
                <select className="input-field" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Unit</label>
                <select className="input-field" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Current Stock</label>
                <input className="input-field" type="number" min="0" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">Min Level (Par)</label>
                <input className="input-field" type="number" min="0" value={form.min} onChange={e => setForm(f => ({ ...f, min: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">Cost per Unit</label>
                <input className="input-field" type="number" min="0" step="0.01" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">Supplier</label>
                <select className="input-field" value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))}>
                  <option value="">-- Select --</option>
                  {supplierNames.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave}><Save size={16} /> {modal === 'add' ? 'Add Item' : 'Save Changes'}</button>
          </div>
        </Modal>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <Modal title="Delete Item" onClose={() => setDeleteConfirm(null)}>
          <div className="modal-body">
            <p style={{ color: 'var(--text-secondary)' }}>Are you sure you want to delete <strong>{deleteConfirm.name}</strong>? This action cannot be undone.</p>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => { deleteInventoryItem(deleteConfirm.id); setDeleteConfirm(null); }}><Trash2 size={16} /> Delete</button>
          </div>
        </Modal>
      )}
    </>
  );
};

// ═══════════════════════════════════════════════════════════
// RECIPES TAB
// ═══════════════════════════════════════════════════════════
const RecipesTab = () => {
  const { recipes, inventory, menu, addRecipe, editRecipe, deleteRecipe, editInventoryItem, addInventoryItem } = useApp();
  const [modal, setModal] = useState(null); // 'add' | recipe obj
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [produceConfirm, setProduceConfirm] = useState(null);
  const blankForm = { name: '', type: 'batch', yield: '1', yieldUnit: 'pcs', linkedMenuItem: '', ingredients: [], instructions: '' };
  const [form, setForm] = useState(blankForm);

  const calcCost = useCallback((ingredients) => {
    return ingredients.reduce((sum, ing) => {
      const item = inventory.find(i => i.id === ing.itemId);
      return sum + (item ? (parseFloat(item.cost) || 0) * (parseFloat(ing.qty) || 0) : 0);
    }, 0);
  }, [inventory]);

  const openAdd = () => { setForm({ ...blankForm, ingredients: [] }); setModal('add'); };
  const openEdit = (r) => {
    setForm({ name: r.name, type: r.type || 'batch', yield: String(r.yield || 1), yieldUnit: r.yieldUnit || 'pcs', linkedMenuItem: r.linkedMenuItem || '', ingredients: r.ingredients || [], instructions: r.instructions || '' });
    setModal(r);
  };

  const addIngredient = () => {
    setForm(f => ({ ...f, ingredients: [...f.ingredients, { itemId: '', qty: '', unit: 'kg' }] }));
  };
  const updateIngredient = (idx, field, val) => {
    setForm(f => {
      const ings = [...f.ingredients];
      ings[idx] = { ...ings[idx], [field]: val };
      if (field === 'itemId') {
        const item = inventory.find(i => i.id === val);
        if (item) ings[idx].unit = item.unit;
      }
      return { ...f, ingredients: ings };
    });
  };
  const removeIngredient = (idx) => {
    setForm(f => ({ ...f, ingredients: f.ingredients.filter((_, i) => i !== idx) }));
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    const data = { ...form, yield: parseFloat(form.yield) || 1, cost: calcCost(form.ingredients) };
    if (modal === 'add') addRecipe(data);
    else editRecipe(modal.id, data);
    setModal(null);
  };

  const handleProduce = (recipe) => {
    // Check sufficient stock
    const shortages = (recipe.ingredients || []).filter(ing => {
      const item = inventory.find(i => i.id === ing.itemId);
      return !item || item.stock < parseFloat(ing.qty);
    });
    if (shortages.length > 0) {
      alert('Insufficient stock for: ' + shortages.map(s => {
        const item = inventory.find(i => i.id === s.itemId);
        return item ? item.name : 'Unknown';
      }).join(', '));
      return;
    }
    // Deduct ingredients
    (recipe.ingredients || []).forEach(ing => {
      const item = inventory.find(i => i.id === ing.itemId);
      if (item) {
        editInventoryItem(item.id, { ...item, stock: item.stock - parseFloat(ing.qty) });
      }
    });
    setProduceConfirm(null);
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{recipes.length} recipe{recipes.length !== 1 ? 's' : ''}</div>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Add Recipe</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320, 1fr))', gap: 16 }}>
        {recipes.map(r => {
          const cost = calcCost(r.ingredients || []);
          const costPerUnit = r.yield > 0 ? cost / r.yield : 0;
          return (
            <div key={r.id} className="card" style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{r.name}</div>
                  <span className={`badge ${r.type === 'batch' ? 'badge-info' : 'badge-success'}`} style={{ marginTop: 4, display: 'inline-block' }}>{r.type || 'batch'}</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => openEdit(r)}><Edit2 size={14} /></button>
                  <button className="btn btn-sm btn-danger" onClick={() => setDeleteConfirm(r)}><Trash2 size={14} /></button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
                <div>Yield: <strong>{r.yield || 1} {r.yieldUnit || 'pcs'}</strong></div>
                <div>Ingredients: <strong>{(r.ingredients || []).length}</strong></div>
                <div>Total Cost: <strong>{fmt(cost)}</strong></div>
                <div>Cost/Unit: <strong>{fmt(costPerUnit)}</strong></div>
              </div>
              {r.linkedMenuItem && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Linked: {menu.find(m => m.id === r.linkedMenuItem)?.name || '--'}</div>}
              <button className="btn btn-sm btn-primary" style={{ width: '100%' }} onClick={() => setProduceConfirm(r)}>
                <ChefHat size={14} /> Produce Batch
              </button>
            </div>
          );
        })}
        {recipes.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
            <ChefHat size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
            <div>No recipes yet. Add your first recipe to start tracking costs.</div>
          </div>
        )}
      </div>

      {/* Produce Confirm */}
      {produceConfirm && (
        <Modal title="Produce Batch" onClose={() => setProduceConfirm(null)}>
          <div className="modal-body">
            <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
              Producing <strong>{produceConfirm.name}</strong> will deduct the following from stock:
            </p>
            <div style={{ background: 'rgba(124,58,237,0.04)', borderRadius: 10, padding: 12, marginBottom: 8 }}>
              {(produceConfirm.ingredients || []).map((ing, i) => {
                const item = inventory.find(it => it.id === ing.itemId);
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                    <span>{item?.name || 'Unknown'}</span>
                    <span style={{ fontWeight: 600 }}>-{ing.qty} {ing.unit || item?.unit}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Output: <strong>{produceConfirm.yield || 1} {produceConfirm.yieldUnit || 'pcs'}</strong></div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setProduceConfirm(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => handleProduce(produceConfirm)}><ChefHat size={16} /> Produce</button>
          </div>
        </Modal>
      )}

      {/* Add/Edit Recipe Modal */}
      {modal && (
        <Modal title={modal === 'add' ? 'Add Recipe' : 'Edit Recipe'} onClose={() => setModal(null)} wide>
          <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="input-group" style={{ gridColumn: '1/-1' }}>
                <label className="input-label">Recipe Name</label>
                <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Tikka Masala Sauce" />
              </div>
              <div className="input-group">
                <label className="input-label">Type</label>
                <select className="input-field" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="batch">Batch</option>
                  <option value="menu-item">Menu Item</option>
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Linked Menu Item</label>
                <select className="input-field" value={form.linkedMenuItem} onChange={e => setForm(f => ({ ...f, linkedMenuItem: e.target.value }))}>
                  <option value="">-- None --</option>
                  {menu.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Yield</label>
                <input className="input-field" type="number" min="1" value={form.yield} onChange={e => setForm(f => ({ ...f, yield: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">Yield Unit</label>
                <select className="input-field" value={form.yieldUnit} onChange={e => setForm(f => ({ ...f, yieldUnit: e.target.value }))}>
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
            </div>

            {/* Ingredients */}
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label className="input-label" style={{ marginBottom: 0 }}>Ingredients</label>
                <button className="btn btn-sm btn-secondary" onClick={addIngredient}><Plus size={14} /> Add</button>
              </div>
              {form.ingredients.map((ing, idx) => {
                const item = inventory.find(i => i.id === ing.itemId);
                return (
                  <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <select className="input-field" style={{ flex: 2 }} value={ing.itemId} onChange={e => updateIngredient(idx, 'itemId', e.target.value)}>
                      <option value="">-- Select Item --</option>
                      {inventory.map(i => <option key={i.id} value={i.id}>{i.name} ({i.stock} {i.unit})</option>)}
                    </select>
                    <input className="input-field" type="number" min="0" step="0.1" style={{ flex: 1 }} placeholder="Qty" value={ing.qty} onChange={e => updateIngredient(idx, 'qty', e.target.value)} />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 30 }}>{ing.unit || item?.unit || ''}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 60 }}>{item ? fmt(parseFloat(item.cost || 0) * parseFloat(ing.qty || 0)) : '--'}</span>
                    <button className="btn btn-sm btn-danger" onClick={() => removeIngredient(idx)}><X size={14} /></button>
                  </div>
                );
              })}
              {form.ingredients.length > 0 && (
                <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 700, color: 'var(--primary)', marginTop: 4 }}>
                  Total Cost: {fmt(calcCost(form.ingredients))}
                </div>
              )}
            </div>

            <div className="input-group" style={{ marginTop: 16 }}>
              <label className="input-label">Instructions</label>
              <textarea className="input-field" rows={4} value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} placeholder="Step-by-step preparation instructions..." />
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave}><Save size={16} /> {modal === 'add' ? 'Add Recipe' : 'Save Changes'}</button>
          </div>
        </Modal>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <Modal title="Delete Recipe" onClose={() => setDeleteConfirm(null)}>
          <div className="modal-body">
            <p style={{ color: 'var(--text-secondary)' }}>Delete <strong>{deleteConfirm.name}</strong>? This cannot be undone.</p>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => { deleteRecipe(deleteConfirm.id); setDeleteConfirm(null); }}><Trash2 size={16} /> Delete</button>
          </div>
        </Modal>
      )}
    </>
  );
};

// ═══════════════════════════════════════════════════════════
// SUPPLIERS TAB
// ═══════════════════════════════════════════════════════════
const SuppliersTab = () => {
  const { suppliers, inventory, addSupplier, editSupplier, deleteSupplier } = useApp();
  const [modal, setModal] = useState(null);
  const [detail, setDetail] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const blankForm = { name: '', contact: '', phone: '', email: '', categories: '', deliveryDays: '', moq: '', cutoffTime: '', rating: '3', notes: '' };
  const [form, setForm] = useState(blankForm);

  const openAdd = () => { setForm({ ...blankForm }); setModal('add'); };
  const openEdit = (s) => {
    setForm({ name: s.name, contact: s.contact || '', phone: s.phone || '', email: s.email || '', categories: s.categories || '', deliveryDays: s.deliveryDays || '', moq: s.moq || '', cutoffTime: s.cutoffTime || '', rating: String(s.rating || 3), notes: s.notes || '' });
    setModal(s);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    const data = { ...form, rating: parseInt(form.rating) || 3 };
    if (modal === 'add') addSupplier(data);
    else editSupplier(modal.id, data);
    setModal(null);
  };

  const getLinkedItems = (supplierName) => inventory.filter(i => i.supplier === supplierName);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{suppliers.length} supplier{suppliers.length !== 1 ? 's' : ''}</div>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Add Supplier</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310, 1fr))', gap: 16 }}>
        {suppliers.map(s => (
          <div key={s.id} className="card" style={{ padding: 18, cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' }}
            onClick={() => setDetail(s)}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(124,58,237,0.12)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{s.name}</div>
              <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                <button className="btn btn-sm btn-secondary" onClick={() => openEdit(s)}><Edit2 size={14} /></button>
                <button className="btn btn-sm btn-danger" onClick={() => setDeleteConfirm(s)}><Trash2 size={14} /></button>
              </div>
            </div>
            {s.contact && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>{s.contact}</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              {s.phone && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Phone size={12} /> {s.phone}</span>}
              {s.email && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Mail size={12} /> {s.email}</span>}
            </div>
            {s.categories && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Categories: {s.categories}</div>}
            <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-muted)' }}>
              {s.deliveryDays && <span>Delivery: {s.deliveryDays}</span>}
              {s.moq && <span>MOQ: {s.moq}</span>}
              {s.cutoffTime && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Clock size={11} /> Cutoff: {s.cutoffTime}</span>}
            </div>
            <div style={{ display: 'flex', gap: 2, marginTop: 8 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <Star key={n} size={14} fill={n <= (s.rating || 0) ? 'var(--warning)' : 'none'} color={n <= (s.rating || 0) ? 'var(--warning)' : 'var(--border-subtle)'} />
              ))}
            </div>
          </div>
        ))}
        {suppliers.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
            <Truck size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
            <div>No suppliers yet. Add your first supplier to manage your supply chain.</div>
          </div>
        )}
      </div>

      {/* Supplier Detail */}
      {detail && (
        <Modal title={detail.name} onClose={() => setDetail(null)}>
          <div className="modal-body">
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
              {detail.contact && <div>Contact: {detail.contact}</div>}
              {detail.phone && <div>Phone: {detail.phone}</div>}
              {detail.email && <div>Email: {detail.email}</div>}
              {detail.categories && <div>Categories: {detail.categories}</div>}
              {detail.deliveryDays && <div>Delivery Days: {detail.deliveryDays}</div>}
              {detail.moq && <div>MOQ: {detail.moq}</div>}
              {detail.cutoffTime && <div>Order Cutoff: {detail.cutoffTime}</div>}
              {detail.notes && <div style={{ marginTop: 8 }}>Notes: {detail.notes}</div>}
            </div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 8 }}>Linked Inventory Items</div>
            {getLinkedItems(detail.name).length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No items linked to this supplier.</div>
            ) : (
              <div style={{ background: 'rgba(124,58,237,0.04)', borderRadius: 10, padding: 12 }}>
                {getLinkedItems(detail.name).map(item => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                    <span>{item.name}</span>
                    <span>{item.stock} {item.unit} <StatusBadge status={item.status} /></span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setDetail(null)}>Close</button>
          </div>
        </Modal>
      )}

      {/* Add/Edit Modal */}
      {modal && (
        <Modal title={modal === 'add' ? 'Add Supplier' : 'Edit Supplier'} onClose={() => setModal(null)}>
          <div className="modal-body">
            <div className="input-group">
              <label className="input-label">Supplier Name</label>
              <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Fresh Farms Ltd" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="input-group">
                <label className="input-label">Contact Person</label>
                <input className="input-field" value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">Phone</label>
                <input className="input-field" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">Email</label>
                <input className="input-field" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">Categories</label>
                <input className="input-field" value={form.categories} onChange={e => setForm(f => ({ ...f, categories: e.target.value }))} placeholder="Vegetables, Dairy" />
              </div>
              <div className="input-group">
                <label className="input-label">Delivery Days</label>
                <input className="input-field" value={form.deliveryDays} onChange={e => setForm(f => ({ ...f, deliveryDays: e.target.value }))} placeholder="Mon, Wed, Fri" />
              </div>
              <div className="input-group">
                <label className="input-label">Min Order Qty</label>
                <input className="input-field" value={form.moq} onChange={e => setForm(f => ({ ...f, moq: e.target.value }))} placeholder="e.g. 50 kg" />
              </div>
              <div className="input-group">
                <label className="input-label">Order Cutoff Time</label>
                <input className="input-field" type="time" value={form.cutoffTime} onChange={e => setForm(f => ({ ...f, cutoffTime: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">Rating (1-5)</label>
                <select className="input-field" value={form.rating} onChange={e => setForm(f => ({ ...f, rating: e.target.value }))}>
                  {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} Star{n > 1 ? 's' : ''}</option>)}
                </select>
              </div>
            </div>
            <div className="input-group" style={{ marginTop: 4 }}>
              <label className="input-label">Notes</label>
              <textarea className="input-field" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave}><Save size={16} /> {modal === 'add' ? 'Add Supplier' : 'Save'}</button>
          </div>
        </Modal>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <Modal title="Delete Supplier" onClose={() => setDeleteConfirm(null)}>
          <div className="modal-body">
            <p style={{ color: 'var(--text-secondary)' }}>Delete <strong>{deleteConfirm.name}</strong>?</p>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => { deleteSupplier(deleteConfirm.id); setDeleteConfirm(null); }}><Trash2 size={16} /> Delete</button>
          </div>
        </Modal>
      )}
    </>
  );
};

// ═══════════════════════════════════════════════════════════
// PURCHASE ORDERS TAB
// ═══════════════════════════════════════════════════════════
const PurchaseOrdersTab = () => {
  const { purchaseOrders, inventory, suppliers, addPurchaseOrder, editPurchaseOrder } = useApp();
  const [detail, setDetail] = useState(null);

  const autoGenerate = () => {
    const belowPar = inventory.filter(i => i.status === 'low' || i.status === 'critical');
    if (belowPar.length === 0) { alert('All items are above par level. No PO needed.'); return; }

    // Group by supplier
    const grouped = {};
    belowPar.forEach(item => {
      const sup = item.supplier || 'Unassigned';
      if (!grouped[sup]) grouped[sup] = [];
      const orderQty = Math.max((item.min * 2) - item.stock, item.min);
      grouped[sup].push({ itemId: item.id, name: item.name, qty: Math.round(orderQty * 10) / 10, unit: item.unit, unitCost: parseFloat(item.cost) || 0 });
    });

    Object.entries(grouped).forEach(([supplierName, items]) => {
      const supplier = suppliers.find(s => s.name === supplierName);
      const total = items.reduce((s, i) => s + i.qty * i.unitCost, 0);
      addPurchaseOrder({
        poNumber: `PO-${Date.now().toString(36).toUpperCase().slice(-6)}`,
        supplier: supplierName,
        supplierId: supplier?.id || null,
        items,
        total,
        status: 'draft',
        createdAt: new Date().toISOString(),
        notes: 'Auto-generated from par level check',
      });
    });
  };

  const advanceStatus = (po) => {
    const flow = { draft: 'sent', sent: 'received' };
    if (!flow[po.status]) return;
    const updates = { status: flow[po.status] };
    if (flow[po.status] === 'received') {
      updates.receivedAt = new Date().toISOString();
    }
    editPurchaseOrder(po.id, updates);
  };

  const statusIcon = (s) => {
    if (s === 'draft') return <FileText size={14} />;
    if (s === 'sent') return <Send size={14} />;
    return <CheckCircle size={14} />;
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{purchaseOrders.length} order{purchaseOrders.length !== 1 ? 's' : ''}</div>
        <button className="btn btn-primary" onClick={autoGenerate}><RefreshCw size={16} /> Auto-Generate PO</button>
      </div>

      <div className="table-wrapper" style={{ maxHeight: 520, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['PO #', 'Supplier', 'Items', 'Total', 'Status', 'Date', 'Actions'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {purchaseOrders.length === 0 && (
              <tr><td colSpan={7} style={{ ...cellStyle, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                No purchase orders yet. Use "Auto-Generate PO" to create orders for items below par level.
              </td></tr>
            )}
            {[...purchaseOrders].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).map(po => (
              <tr key={po.id} style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                onClick={() => setDetail(po)}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(124,58,237,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <td style={{ ...cellStyle, fontWeight: 600, fontFamily: 'monospace' }}>{po.poNumber || '--'}</td>
                <td style={cellStyle}>{po.supplier}</td>
                <td style={cellStyle}>{(po.items || []).length}</td>
                <td style={{ ...cellStyle, fontWeight: 600 }}>{fmt(po.total || 0)}</td>
                <td style={cellStyle}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {statusIcon(po.status)}
                    <StatusBadge status={po.status} />
                  </span>
                </td>
                <td style={{ ...cellStyle, fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(po.createdAt)}</td>
                <td style={cellStyle} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {po.status !== 'received' && (
                      <button className="btn btn-sm btn-primary" onClick={() => advanceStatus(po)} title={po.status === 'draft' ? 'Mark as Sent' : 'Mark as Received'}>
                        {po.status === 'draft' ? <Send size={14} /> : <CheckCircle size={14} />}
                      </button>
                    )}
                    <button className="btn btn-sm btn-secondary" onClick={() => setDetail(po)}><Eye size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* PO Detail */}
      {detail && (
        <Modal title={`Purchase Order ${detail.poNumber || ''}`} onClose={() => setDetail(null)} wide>
          <div className="modal-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
              <div>Supplier: <strong>{detail.supplier}</strong></div>
              <div>Status: <StatusBadge status={detail.status} /></div>
              <div>Created: <strong>{fmtDate(detail.createdAt)}</strong></div>
              {detail.receivedAt && <div>Received: <strong>{fmtDate(detail.receivedAt)}</strong></div>}
            </div>
            {detail.notes && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, fontStyle: 'italic' }}>{detail.notes}</div>}

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Item', 'Qty', 'Unit', 'Unit Cost', 'Line Total'].map(h => (
                    <th key={h} style={{ ...thStyle, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(detail.items || []).map((item, i) => (
                  <tr key={i}>
                    <td style={cellStyle}>{item.name}</td>
                    <td style={{ ...cellStyle, fontWeight: 600 }}>{item.qty}</td>
                    <td style={cellStyle}>{item.unit}</td>
                    <td style={cellStyle}>{fmt(item.unitCost)}</td>
                    <td style={{ ...cellStyle, fontWeight: 600 }}>{fmt(item.qty * item.unitCost)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ ...cellStyle, textAlign: 'right', fontWeight: 700 }}>Total</td>
                  <td style={{ ...cellStyle, fontWeight: 700, color: 'var(--primary)' }}>{fmt(detail.total || 0)}</td>
                </tr>
              </tfoot>
            </table>

            {detail.status !== 'received' && (
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn btn-primary" onClick={() => { advanceStatus(detail); setDetail(null); }}>
                  {detail.status === 'draft' ? <><Send size={14} /> Mark as Sent</> : <><CheckCircle size={14} /> Mark as Received</>}
                </button>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setDetail(null)}>Close</button>
          </div>
        </Modal>
      )}
    </>
  );
};

// ═══════════════════════════════════════════════════════════
// WASTE LOG TAB
// ═══════════════════════════════════════════════════════════
const WasteLogTab = () => {
  const { wasteLog, inventory, addWasteEntry } = useApp();
  const [form, setForm] = useState({ itemId: '', qty: '', reason: 'Expired', notes: '' });

  const handleAdd = () => {
    if (!form.itemId || !form.qty) return;
    const item = inventory.find(i => i.id === form.itemId);
    addWasteEntry({
      itemId: form.itemId,
      itemName: item?.name || 'Unknown',
      qty: parseFloat(form.qty),
      unit: item?.unit || 'pcs',
      reason: form.reason,
      notes: form.notes,
      costImpact: (parseFloat(item?.cost) || 0) * parseFloat(form.qty),
      loggedBy: 'Manager',
      createdAt: new Date().toISOString(),
    });
    setForm({ itemId: '', qty: '', reason: 'Expired', notes: '' });
  };

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const wasteToday = useMemo(() => wasteLog.filter(w => (w.createdAt || '').startsWith(todayStr)).reduce((s, w) => s + (w.costImpact || 0), 0), [wasteLog, todayStr]);
  const wasteWeek = useMemo(() => wasteLog.filter(w => new Date(w.createdAt) >= weekAgo).reduce((s, w) => s + (w.costImpact || 0), 0), [wasteLog]);
  const wasteMonth = useMemo(() => wasteLog.filter(w => new Date(w.createdAt) >= monthStart).reduce((s, w) => s + (w.costImpact || 0), 0), [wasteLog]);

  return (
    <>
      {/* Summary Stats */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
        <StatCard icon={Flame} label="Waste Today" value={fmt(wasteToday)} color="var(--danger)" />
        <StatCard icon={Flame} label="This Week" value={fmt(wasteWeek)} color="var(--warning)" />
        <StatCard icon={Flame} label="This Month" value={fmt(wasteMonth)} color="var(--primary)" />
      </div>

      {/* Quick Entry */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 12 }}>Quick Waste Entry</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="input-group" style={{ flex: 2, minWidth: 160, marginBottom: 0 }}>
            <label className="input-label">Item</label>
            <select className="input-field" value={form.itemId} onChange={e => setForm(f => ({ ...f, itemId: e.target.value }))}>
              <option value="">-- Select Item --</option>
              {inventory.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div className="input-group" style={{ flex: 1, minWidth: 80, marginBottom: 0 }}>
            <label className="input-label">Qty</label>
            <input className="input-field" type="number" min="0" step="0.1" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} />
          </div>
          <div className="input-group" style={{ flex: 1, minWidth: 120, marginBottom: 0 }}>
            <label className="input-label">Reason</label>
            <select className="input-field" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}>
              {WASTE_REASONS.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div className="input-group" style={{ flex: 2, minWidth: 140, marginBottom: 0 }}>
            <label className="input-label">Notes</label>
            <input className="input-field" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
          </div>
          <button className="btn btn-danger" onClick={handleAdd} style={{ height: 40 }}><Plus size={16} /> Log Waste</button>
        </div>
      </div>

      {/* Waste Log Table */}
      <div className="table-wrapper" style={{ maxHeight: 420, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Date', 'Item', 'Qty', 'Reason', 'Logged By', 'Cost Impact', 'Notes'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {wasteLog.length === 0 && (
              <tr><td colSpan={7} style={{ ...cellStyle, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>No waste entries logged yet.</td></tr>
            )}
            {[...wasteLog].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).map((w, i) => (
              <tr key={w.id || i}>
                <td style={{ ...cellStyle, fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDateTime(w.createdAt)}</td>
                <td style={{ ...cellStyle, fontWeight: 600 }}>{w.itemName || 'Unknown'}</td>
                <td style={cellStyle}>{w.qty} {w.unit}</td>
                <td style={cellStyle}>
                  <span className="badge badge-danger" style={{ fontSize: 11 }}>{w.reason}</span>
                </td>
                <td style={cellStyle}>{w.loggedBy || '--'}</td>
                <td style={{ ...cellStyle, fontWeight: 600, color: 'var(--danger)' }}>{fmt(w.costImpact || 0)}</td>
                <td style={{ ...cellStyle, fontSize: 12, color: 'var(--text-muted)' }}>{w.notes || '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

// ═══════════════════════════════════════════════════════════
// COST ANALYTICS TAB
// ═══════════════════════════════════════════════════════════
const CostAnalyticsTab = () => {
  const { inventory, recipes, menu, orders, wasteLog } = useApp();

  // Total revenue from orders
  const totalRevenue = useMemo(() => orders.reduce((s, o) => s + (parseFloat(o.total) || 0), 0), [orders]);

  // Total ingredient cost (from inventory value)
  const totalIngredientCost = useMemo(() => inventory.reduce((s, i) => s + (parseFloat(i.cost) || 0) * (parseFloat(i.stock) || 0), 0), [inventory]);

  // Food cost percentage
  const foodCostPct = totalRevenue > 0 ? (totalIngredientCost / totalRevenue * 100) : 0;

  // Recipe costing
  const recipeCosting = useMemo(() => {
    return recipes.map(r => {
      const cost = (r.ingredients || []).reduce((sum, ing) => {
        const item = inventory.find(i => i.id === ing.itemId);
        return sum + (item ? (parseFloat(item.cost) || 0) * (parseFloat(ing.qty) || 0) : 0);
      }, 0);
      const costPerUnit = r.yield > 0 ? cost / r.yield : cost;
      return { ...r, totalCost: cost, costPerUnit };
    });
  }, [recipes, inventory]);

  // Margin tracking per menu item
  const menuMargins = useMemo(() => {
    return menu.filter(m => m.active !== false).map(item => {
      // Find linked recipe
      const recipe = recipes.find(r => r.linkedMenuItem === item.id);
      let costPrice = 0;
      if (recipe) {
        costPrice = (recipe.ingredients || []).reduce((sum, ing) => {
          const inv = inventory.find(i => i.id === ing.itemId);
          return sum + (inv ? (parseFloat(inv.cost) || 0) * (parseFloat(ing.qty) || 0) : 0);
        }, 0);
        if (recipe.yield > 1) costPrice = costPrice / recipe.yield;
      }
      const sellingPrice = parseFloat(item.price) || 0;
      const margin = sellingPrice - costPrice;
      const marginPct = sellingPrice > 0 ? (margin / sellingPrice) * 100 : 0;
      return { ...item, costPrice, margin, marginPct };
    });
  }, [menu, recipes, inventory]);

  // Actual vs Theoretical variance
  const varianceData = useMemo(() => {
    return inventory.slice(0, 20).map(item => {
      const actualStock = parseFloat(item.stock) || 0;
      // Theoretical: assume stock should be at par level minus estimated usage
      const theoreticalStock = parseFloat(item.min) || 0;
      const diff = actualStock - theoreticalStock;
      const variance = theoreticalStock > 0 ? ((diff) / theoreticalStock * 100) : 0;
      return { ...item, actualStock, theoreticalStock, variance: Math.round(variance * 10) / 10, diff: Math.round(diff * 10) / 10 };
    });
  }, [inventory]);

  // Total waste cost
  const totalWasteCost = useMemo(() => wasteLog.reduce((s, w) => s + (w.costImpact || 0), 0), [wasteLog]);

  const barWidth = (val, max) => max > 0 ? `${Math.min((val / max) * 100, 100)}%` : '0%';

  return (
    <>
      {/* Top stats */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
        <StatCard icon={IndianRupee} label="Total Revenue" value={fmt(totalRevenue)} color="var(--success)" />
        <StatCard icon={Package} label="Inventory Value" value={fmt(totalIngredientCost)} color="var(--primary)" />
        <StatCard
          icon={TrendingUp}
          label="Food Cost %"
          value={`${foodCostPct.toFixed(1)}%`}
          color={foodCostPct > 35 ? 'var(--danger)' : foodCostPct > 28 ? 'var(--warning)' : 'var(--success)'}
          sub={foodCostPct > 35 ? 'Above target (35%)' : 'Within target'}
        />
        <StatCard icon={Flame} label="Total Waste" value={fmt(totalWasteCost)} color="var(--danger)" />
      </div>

      {/* Food Cost Gauge */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 12 }}>Food Cost Percentage</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ flex: 1, height: 20, background: 'var(--border-subtle)', borderRadius: 10, overflow: 'hidden', position: 'relative' }}>
            <div style={{
              width: `${Math.min(foodCostPct, 100)}%`, height: '100%', borderRadius: 10, transition: 'width 0.5s',
              background: foodCostPct > 35 ? 'var(--danger)' : foodCostPct > 28 ? 'var(--warning)' : 'var(--success)',
            }} />
            {/* Target line at 30% */}
            <div style={{ position: 'absolute', left: '30%', top: 0, bottom: 0, width: 2, background: 'var(--text-primary)', opacity: 0.3 }} />
          </div>
          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', minWidth: 60 }}>{foodCostPct.toFixed(1)}%</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          <span>0%</span>
          <span>Target: 30%</span>
          <span>100%</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Recipe Costing */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 12 }}>Recipe Costing</div>
          {recipeCosting.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: 20, textAlign: 'center' }}>No recipes to analyze</div>
          ) : (
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {recipeCosting.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Yield: {r.yield} {r.yieldUnit}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>{fmt(r.totalCost)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmt(r.costPerUnit)}/unit</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actual vs Theoretical Variance */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 12 }}>Actual vs Par Level Variance</div>
          {varianceData.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: 20, textAlign: 'center' }}>No inventory data</div>
          ) : (
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {varianceData.map(v => (
                <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{v.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Actual: {v.actualStock} | Par: {v.theoreticalStock} {v.unit}</div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 80 }}>
                    <div style={{
                      fontWeight: 700, fontSize: 13,
                      color: v.diff >= 0 ? 'var(--success)' : 'var(--danger)',
                      display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2,
                    }}>
                      {v.diff >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {v.diff >= 0 ? '+' : ''}{v.diff} {v.unit}
                    </div>
                    <div style={{ fontSize: 11, color: v.variance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {v.variance >= 0 ? '+' : ''}{v.variance}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Margin Tracking per Menu Item */}
      <div className="card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 12 }}>Menu Item Margin Tracking</div>
        <div className="table-wrapper" style={{ maxHeight: 400, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Item', 'Selling Price', 'Cost Price', 'Margin', 'Margin %', 'Visual'].map(h => (
                  <th key={h} style={{ ...thStyle, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {menuMargins.length === 0 && (
                <tr><td colSpan={6} style={{ ...cellStyle, textAlign: 'center', color: 'var(--text-muted)', padding: 30 }}>No menu items to analyze. Link recipes to menu items for margin tracking.</td></tr>
              )}
              {menuMargins.sort((a, b) => b.marginPct - a.marginPct).map(item => (
                <tr key={item.id}>
                  <td style={{ ...cellStyle, fontWeight: 600 }}>{item.name}</td>
                  <td style={cellStyle}>{fmt(item.price)}</td>
                  <td style={cellStyle}>{item.costPrice > 0 ? fmt(item.costPrice) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No recipe</span>}</td>
                  <td style={{ ...cellStyle, fontWeight: 600, color: item.margin >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmt(item.margin)}</td>
                  <td style={{ ...cellStyle, fontWeight: 700, color: item.marginPct >= 65 ? 'var(--success)' : item.marginPct >= 50 ? 'var(--warning)' : 'var(--danger)' }}>
                    {item.marginPct.toFixed(1)}%
                  </td>
                  <td style={{ ...cellStyle, minWidth: 100 }}>
                    <div style={{ height: 6, background: 'var(--border-subtle)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.min(Math.max(item.marginPct, 0), 100)}%`, height: '100%', borderRadius: 3,
                        background: item.marginPct >= 65 ? 'var(--success)' : item.marginPct >= 50 ? 'var(--warning)' : 'var(--danger)',
                        transition: 'width 0.3s',
                      }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

// ═══════════════════════════════════════════════════════════
// MAIN INVENTORY PAGE
// ═══════════════════════════════════════════════════════════
const Inventory = () => {
  const [activeTab, setActiveTab] = useState('stock');

  return (
    <div className="animate-fade-up">
      <div className="page-title-row" style={{ marginBottom: 18 }}>
        <h1 className="page-title">Inventory & Supply Chain</h1>
      </div>

      {/* Tab Bar */}
      <div style={tabBarStyle}>
        {TABS.map(t => (
          <button key={t.key} style={tabStyle(activeTab === t.key)} onClick={() => setActiveTab(t.key)}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'stock' && <StockTab />}
      {activeTab === 'recipes' && <RecipesTab />}
      {activeTab === 'suppliers' && <SuppliersTab />}
      {activeTab === 'orders' && <PurchaseOrdersTab />}
      {activeTab === 'waste' && <WasteLogTab />}
      {activeTab === 'analytics' && <CostAnalyticsTab />}
    </div>
  );
};

export default Inventory;
