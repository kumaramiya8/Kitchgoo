import React, { useState } from 'react';
import { Package, AlertTriangle, Plus, X, Edit2, Save, Download, Trash2 } from 'lucide-react';
import { useApp } from '../db/AppContext';

const CATEGORIES = ['Vegetables', 'Grains', 'Meat', 'Dairy', 'Pantry', 'Spices', 'Other'];
const UNITS = ['kg', 'g', 'L', 'ml', 'pcs'];

const Modal = ({ title, onClose, children }) => (
  <div className="modal-backdrop" onClick={onClose}>
    <div className="modal" onClick={e => e.stopPropagation()}>
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
  const map = { good: 'badge-success', low: 'badge-warning', critical: 'badge-danger' };
  return <span className={`badge ${map[status] || 'badge-neutral'}`}>{status}</span>;
};

const Inventory = () => {
  const { inventory, addInventoryItem, editInventoryItem, orderMoreInventory, deleteInventoryItem } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [receiveModal, setReceiveModal] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [orderingId, setOrderingId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [receiveForm, setReceiveForm] = useState({ name: '', category: 'Vegetables', stock: '', unit: 'kg', min: '', cost: '', supplier: '' });
  const [editForm, setEditForm] = useState({});

  const alertItems = inventory.filter(i => i.status !== 'good');
  const filtered = inventory.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const handleReceive = () => {
    if (!receiveForm.name.trim() || !receiveForm.stock) return;
    addInventoryItem(receiveForm);
    setReceiveModal(false);
    setReceiveForm({ name: '', category: 'Vegetables', stock: '', unit: 'kg', min: '', cost: '', supplier: '' });
  };

  const openEdit = (item) => {
    setEditForm({ ...item });
    setEditModal(item.id);
  };

  const handleSaveEdit = () => {
    editInventoryItem(editModal, editForm);
    setEditModal(null);
  };

  const handleExport = () => {
    const csv = [
      'Name,Category,Stock,Unit,Reorder Level,Status,Cost,Supplier',
      ...inventory.map(i => `${i.name},${i.category},${i.stock},${i.unit},${i.min},${i.status},${i.cost || ''},${i.supplier || ''}`)
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventory.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleOrderMore = (item) => {
    setOrderingId(item.id);
    setTimeout(() => {
      orderMoreInventory(item.id);
      setOrderingId(null);
    }, 1200);
  };

  return (
    <div className="animate-fade-up">
      <div className="page-title-row">
        <h1 className="page-title">Inventory</h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={handleExport}>
            <Download size={15} /> Export CSV
          </button>
          <button className="btn btn-primary" onClick={() => setReceiveModal(true)}>
            <Plus size={15} /> Receive Stock
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '14px' }}>
        {/* Alerts Panel */}
        <div className="card" style={{ padding: '16px', height: 'fit-content' }}>
          <h3 style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--danger)' }}>
            <AlertTriangle size={16} /> Critical Alerts ({alertItems.length})
          </h3>
          {alertItems.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>All stock levels OK ✓</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {alertItems.map(item => (
                <div key={item.id} style={{
                  padding: '10px', borderRadius: '10px',
                  background: item.status === 'critical' ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)',
                  border: `1px solid ${item.status === 'critical' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`,
                }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>{item.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    {item.stock} {item.unit} left (min: {item.min})
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ width: '100%', fontSize: '0.75rem', padding: '5px' }}
                    onClick={() => handleOrderMore(item)}
                    disabled={orderingId === item.id}
                  >
                    {orderingId === item.id ? 'Ordering...' : '+ Order More'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Main Table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Package size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
            <input
              className="input-field"
              style={{ flex: 1, margin: 0 }}
              placeholder="Search ingredients..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', flexShrink: 0 }}>{inventory.length} items</span>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Category</th>
                  <th style={{ textAlign: 'right' }}>In Stock</th>
                  <th style={{ textAlign: 'right' }}>Reorder At</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>No items found.</td></tr>
                )}
                {filtered.map(item => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600 }}>{item.name}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{item.category}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{item.stock} {item.unit}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{item.min} {item.unit}</td>
                    <td><StatusBadge status={item.status} /></td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)} style={{ gap: '5px' }}>
                          <Edit2 size={13} /> Edit
                        </button>
                        <button className="btn btn-danger btn-sm btn-icon" onClick={() => setDeleteConfirm(item)} title="Delete">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Receive Stock Modal */}
      {receiveModal && (
        <Modal title="Receive Stock / Add Item" onClose={() => setReceiveModal(false)}>
          <div className="modal-body">
            <div className="input-group">
              <label className="input-label">Ingredient Name</label>
              <input className="input-field" value={receiveForm.name} onChange={e => setReceiveForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Tomatoes" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="input-group">
                <label className="input-label">Category</label>
                <select className="input-field" value={receiveForm.category} onChange={e => setReceiveForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Unit</label>
                <select className="input-field" value={receiveForm.unit} onChange={e => setReceiveForm(f => ({ ...f, unit: e.target.value }))}>
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Quantity Received</label>
                <input className="input-field" type="number" min="0" value={receiveForm.stock} onChange={e => setReceiveForm(f => ({ ...f, stock: e.target.value }))} placeholder="0" />
              </div>
              <div className="input-group">
                <label className="input-label">Reorder Level</label>
                <input className="input-field" type="number" min="0" value={receiveForm.min} onChange={e => setReceiveForm(f => ({ ...f, min: e.target.value }))} placeholder="0" />
              </div>
              <div className="input-group">
                <label className="input-label">Cost per Unit (₹)</label>
                <input className="input-field" type="number" min="0" value={receiveForm.cost} onChange={e => setReceiveForm(f => ({ ...f, cost: e.target.value }))} placeholder="0" />
              </div>
              <div className="input-group">
                <label className="input-label">Supplier</label>
                <input className="input-field" value={receiveForm.supplier} onChange={e => setReceiveForm(f => ({ ...f, supplier: e.target.value }))} placeholder="Supplier name" />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setReceiveModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleReceive}>Save Stock</button>
          </div>
        </Modal>
      )}

      {/* Edit Modal */}
      {editModal && (
        <Modal title="Edit Stock Item" onClose={() => setEditModal(null)}>
          <div className="modal-body">
            <div className="input-group">
              <label className="input-label">Item Name</label>
              <input className="input-field" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="input-group">
                <label className="input-label">Category</label>
                <select className="input-field" value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Unit</label>
                <select className="input-field" value={editForm.unit} onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))}>
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Current Stock</label>
                <input className="input-field" type="number" min="0" value={editForm.stock} onChange={e => setEditForm(f => ({ ...f, stock: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">Reorder Level</label>
                <input className="input-field" type="number" min="0" value={editForm.min} onChange={e => setEditForm(f => ({ ...f, min: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">Cost per Unit (₹)</label>
                <input className="input-field" type="number" min="0" value={editForm.cost || ''} onChange={e => setEditForm(f => ({ ...f, cost: e.target.value }))} />
              </div>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label className="input-label">Supplier</label>
                <input className="input-field" value={editForm.supplier || ''} onChange={e => setEditForm(f => ({ ...f, supplier: e.target.value }))} />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setEditModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSaveEdit}><Save size={14} /> Save Changes</button>
          </div>
        </Modal>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <Modal title="Delete Item" onClose={() => setDeleteConfirm(null)}>
          <div className="modal-body">
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Are you sure you want to delete <strong>{deleteConfirm.name}</strong>? This cannot be undone.
            </p>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => { deleteInventoryItem(deleteConfirm.id); setDeleteConfirm(null); }}>
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Inventory;
