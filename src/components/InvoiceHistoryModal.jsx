import React, { useMemo } from 'react';
import ReactDOM from 'react-dom';
import {
  X, History, ShoppingCart, PlusCircle, Trash2, Tag, Percent,
  ArrowRightLeft, CreditCard, Ban, RotateCcw, Edit3, User, Calendar,
  Clock, ShieldAlert, CheckCircle2, DollarSign
} from 'lucide-react';

export function getInvoiceHistoryRecords(order) {
  if (!order) return [];

  const rawHistory = Array.isArray(order.history) ? [...order.history] : [];
  const records = [];

  // Helper to add record with unique key
  const seen = new Set();
  const add = (rec) => {
    const key = `${rec.action}_${rec.timestamp}_${rec.description}`;
    if (!seen.has(key)) {
      seen.add(key);
      records.push(rec);
    }
  };

  // Add all explicit records from order.history
  rawHistory.forEach(h => {
    add({
      id: h.id || `h_${Math.random().toString(36).substring(2, 9)}`,
      action: h.action || 'activity',
      title: h.title || getActionTitle(h.action),
      description: h.description || h.text || 'Action recorded on order',
      timestamp: h.timestamp || order.createdAt || new Date().toISOString(),
      staffName: h.by || h.staffName || order.serverName || 'Staff',
      details: h.details || null,
    });
  });

  // Synthesize standard chronological events if not already in rawHistory
  const hasAction = (act) => rawHistory.some(h => h.action === act);

  // 1. Order Creation
  if (!hasAction('created')) {
    const itemsCount = (order.items || []).reduce((s, i) => s + (i.qty || i.quantity || 1), 0);
    const tableInfo = order.tableId ? `Table ${order.tableId}` : (order.orderType ? order.orderType.toUpperCase() : 'Order');
    add({
      id: 'synth_created',
      action: 'created',
      title: 'Order Created',
      description: `Order #${order.billNo || order.id?.slice(0, 8)} created with ${itemsCount} ${itemsCount === 1 ? 'item' : 'items'} (${tableInfo})`,
      timestamp: order.orderPlacedAt || order.createdAt || new Date().toISOString(),
      staffName: order.serverName || 'Staff',
      details: {
        items: (order.items || []).map(i => `${i.qty || 1}x ${i.name} (₹${i.price})`),
        orderType: order.orderType || 'dine-in',
        tableId: order.tableId || null,
        guestName: order.guestName || null,
      }
    });
  }

  // 2. Custom Price / Custom Amount on items
  (order.items || []).forEach((item, idx) => {
    if (item.customPrice || (item.originalPrice !== undefined && item.originalPrice !== item.price)) {
      const orig = item.originalPrice !== undefined ? item.originalPrice : 'menu price';
      add({
        id: `synth_custom_${idx}`,
        action: 'custom_amount',
        title: 'Custom Amount Entered',
        description: `Price override on "${item.name}": ₹${orig} → ₹${item.price} each (Qty: ${item.qty || 1})`,
        timestamp: item.customPriceAt || order.createdAt || new Date().toISOString(),
        staffName: item.customPriceBy || order.serverName || 'Staff',
        details: { item: item.name, originalPrice: orig, customPrice: item.price, reason: item.customPriceReason || 'Price check override' }
      });
    }
  });

  // 3. Table Shifting / Transfer
  if (order.tableShiftHistory && Array.isArray(order.tableShiftHistory)) {
    order.tableShiftHistory.forEach((shift, sIdx) => {
      add({
        id: `synth_shift_${sIdx}`,
        action: 'table_shifted',
        title: 'Table Shifted',
        description: `Shifted from Table ${shift.fromTable} to Table ${shift.toTable} (${shift.itemsCount || 0} items)`,
        timestamp: shift.timestamp || order.createdAt,
        staffName: shift.by || order.serverName || 'Staff',
        details: shift
      });
    });
  } else if (order.transferredFrom) {
    add({
      id: 'synth_shift_single',
      action: 'table_shifted',
      title: 'Table Shifted',
      description: `Shifted from Table ${order.transferredFrom} to Table ${order.tableId || 'New Table'}`,
      timestamp: order.transferredAt || order.createdAt,
      staffName: order.transferredBy || order.serverName || 'Staff',
      details: { fromTable: order.transferredFrom, toTable: order.tableId }
    });
  }

  // 4. Discount
  if (parseFloat(order.discount || 0) > 0 && !hasAction('discount') && !hasAction('discount_applied')) {
    add({
      id: 'synth_discount',
      action: 'discount_applied',
      title: 'Discount Applied',
      description: `Discount of ₹${parseFloat(order.discount).toFixed(2)} applied${order.discountReason ? ` (${order.discountReason})` : ''}`,
      timestamp: order.discountAppliedAt || order.paidAt || order.createdAt,
      staffName: order.discountAppliedBy || order.serverName || 'Staff',
      details: { amount: parseFloat(order.discount), reason: order.discountReason || 'Discount' }
    });
  }

  // 5. Payment Settled
  const statusLower = (order.status || '').toLowerCase();
  const isPaidOrClosed = statusLower === 'paid' || statusLower === 'closed' || statusLower === 'completed' || !!order.paidAt || !!order.settledAt || (Boolean(order.paymentMethod) && statusLower !== 'voided' && statusLower !== 'cancelled');
  if (isPaidOrClosed && !hasAction('payment_settled')) {
    let paymentText = `Settled via ${order.paymentMethod || 'Cash'} for ₹${parseFloat(order.total || 0).toFixed(2)}`;
    const splits = order.paymentSplits || order.timestamps?.paymentSplits;
    if (Array.isArray(splits) && splits.length > 0) {
      paymentText = `Settled via Split: ${splits.map(s => `${s.method}: ₹${s.amount}`).join(', ')} (Total: ₹${parseFloat(order.total || 0).toFixed(2)})`;
    }
    add({
      id: 'synth_paid',
      action: 'payment_settled',
      title: 'Payment Completed',
      description: paymentText,
      timestamp: order.paidAt || order.settledAt || order.createdAt,
      staffName: order.serverName || 'Cashier',
      details: {
        total: parseFloat(order.total || 0),
        paymentMethod: order.paymentMethod,
        paymentSplits: splits || null,
        tip: order.tip || 0,
      }
    });
  }

  // 6. Payment Method Changed
  if (order.paymentMethodChangedAt && !hasAction('payment_method_changed')) {
    add({
      id: 'synth_pm_change',
      action: 'payment_method_changed',
      title: 'Payment Method Changed',
      description: `Payment method updated to ${order.paymentMethod || 'New Method'}`,
      timestamp: order.paymentMethodChangedAt,
      staffName: order.paymentMethodChangedBy || 'Staff',
      details: { paymentMethod: order.paymentMethod }
    });
  }

  // 7. Order Revised
  if (order.editedAt && !hasAction('edited') && !hasAction('order_edited')) {
    add({
      id: 'synth_edited',
      action: 'order_edited',
      title: 'Order Revised',
      description: `Invoice edited. New total: ₹${parseFloat(order.total || 0).toFixed(2)}`,
      timestamp: order.editedAt,
      staffName: order.editedBy || 'Staff',
      details: { total: order.total }
    });
  }

  // 8. Order Voided
  if (((order.status || '').toLowerCase() === 'voided' || (order.status || '').toLowerCase() === 'cancelled') && !hasAction('voided')) {
    add({
      id: 'synth_voided',
      action: 'voided',
      title: 'Order Voided',
      description: `Order marked as voided. ${order.voidReason ? `Reason: ${order.voidReason}` : ''} (Amount: ₹${parseFloat(order.total || 0).toFixed(2)})`,
      timestamp: order.voidedAt || order.updatedAt || order.createdAt,
      staffName: order.voidedBy || 'Staff',
      details: { reason: order.voidReason || 'Voided', amount: order.total }
    });
  }

  // 9. Order Reopened
  if ((order.status || '').toLowerCase() === 'reopened' && !hasAction('reopened')) {
    add({
      id: 'synth_reopened',
      action: 'reopened',
      title: 'Order Re-opened',
      description: `Order reopened back to table cart`,
      timestamp: order.reopenedAt || order.updatedAt || order.createdAt,
      staffName: order.reopenedBy || 'Staff',
      details: {}
    });
  }

  // Sort chronological order (oldest to newest)
  return records.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function getActionTitle(action) {
  switch (action) {
    case 'created': return 'Order Created';
    case 'item_added': return 'Item Added';
    case 'item_removed': return 'Item Removed';
    case 'custom_amount':
    case 'custom_price': return 'Custom Amount Entered';
    case 'discount_applied':
    case 'discount': return 'Discount Applied';
    case 'discount_removed': return 'Discount Removed';
    case 'table_shifted': return 'Table Shifted';
    case 'payment_settled': return 'Payment Settled';
    case 'payment_method_changed': return 'Payment Method Changed';
    case 'order_edited':
    case 'edited': return 'Order Revised';
    case 'voided': return 'Order Voided';
    case 'reopened': return 'Order Re-opened';
    default: return 'Invoice Activity';
  }
}

function getActionIcon(action) {
  switch (action) {
    case 'created': return <ShoppingCart size={15} color="#1e5e4a" />;
    case 'item_added': return <PlusCircle size={15} color="#22c55e" />;
    case 'item_removed': return <Trash2 size={15} color="#ef4444" />;
    case 'custom_amount':
    case 'custom_price': return <DollarSign size={15} color="#f59e0b" />;
    case 'discount_applied':
    case 'discount': return <Percent size={15} color="#22c55e" />;
    case 'discount_removed': return <Percent size={15} color="#ef4444" />;
    case 'table_shifted': return <ArrowRightLeft size={15} color="#6366f1" />;
    case 'payment_settled': return <CreditCard size={15} color="#22c55e" />;
    case 'payment_method_changed': return <CreditCard size={15} color="#3b82f6" />;
    case 'order_edited':
    case 'edited': return <Edit3 size={15} color="#8b5cf6" />;
    case 'voided': return <Ban size={15} color="#dc2626" />;
    case 'reopened': return <RotateCcw size={15} color="#7c3aed" />;
    default: return <History size={15} color="var(--primary)" />;
  }
}

function getActionBadgeStyle(action) {
  switch (action) {
    case 'voided':
      return { background: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', border: '1px solid rgba(239, 68, 68, 0.2)' };
    case 'payment_settled':
    case 'item_added':
      return { background: 'rgba(34, 197, 94, 0.1)', color: '#16a34a', border: '1px solid rgba(34, 197, 94, 0.2)' };
    case 'custom_amount':
    case 'custom_price':
      return { background: 'rgba(245, 158, 11, 0.1)', color: '#d97706', border: '1px solid rgba(245, 158, 11, 0.2)' };
    case 'table_shifted':
    case 'payment_method_changed':
      return { background: 'rgba(99, 102, 241, 0.1)', color: '#4f46e5', border: '1px solid rgba(99, 102, 241, 0.2)' };
    case 'reopened':
    case 'order_edited':
    case 'edited':
      return { background: 'rgba(139, 92, 246, 0.1)', color: '#7c3aed', border: '1px solid rgba(139, 92, 246, 0.2)' };
    default:
      return { background: 'rgba(30, 94, 74, 0.08)', color: 'var(--primary)', border: '1px solid rgba(30, 94, 74, 0.2)' };
  }
}

const InvoiceHistoryModal = ({ order, onClose }) => {
  if (!order) return null;

  const historyRecords = useMemo(() => getInvoiceHistoryRecords(order), [order]);

  const fmtDateTime = (iso) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      return d.toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: true
      });
    } catch {
      return String(iso);
    }
  };

  return ReactDOM.createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(5px)',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 18,
          maxWidth: 680, width: '94vw', maxHeight: '88vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 48px rgba(0,0,0,0.22)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border-subtle, #e2e8f0)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(248, 250, 252, 0.9)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(30, 94, 74, 0.1)', color: 'var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <History size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                Invoice Audit History
              </h3>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2 }}>
                Bill No: <strong style={{ color: 'var(--text-primary)' }}>{order.billNo || order.id}</strong> · Total: <strong>₹{(order.total || 0).toFixed(2)}</strong>
                {order.status && <span style={{ marginLeft: 8, textTransform: 'capitalize', fontWeight: 700, color: order.status === 'voided' ? '#dc2626' : '#16a34a' }}>({order.status})</span>}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)' }}
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Invoice Summary Strip */}
        <div style={{
          padding: '10px 20px', background: 'rgba(30, 94, 74, 0.04)',
          borderBottom: '1px solid var(--border-subtle, #e2e8f0)',
          display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.76rem', color: 'var(--text-secondary)'
        }}>
          <div><span>Table: </span><strong>{order.tableId ? `Table ${order.tableId}` : (order.orderType || 'Dine-in')}</strong></div>
          <div><span>Primary Staff: </span><strong>{order.serverName || 'Staff'}</strong></div>
          <div>
            <span>Payment: </span>
            <strong>
              {(() => {
                const splits = order.paymentSplits || order.timestamps?.paymentSplits;
                if (Array.isArray(splits) && splits.length > 1) {
                  return `Split (${splits.map(s => `${s.method}: ₹${parseFloat(s.amount || 0).toFixed(0)}`).join(', ')})`;
                }
                const walletAmt = parseFloat(order.walletRedeemed || 0) || (Array.isArray(order.history) ? (order.history.find(h => h.action === 'wallet_redeemed')?.amount || 0) : 0);
                if (walletAmt > 0 && order.paymentMethod && !order.paymentMethod.toLowerCase().includes('wallet')) {
                  const rem = Math.max(0, (parseFloat(order.total || 0) - walletAmt));
                  return `Split (${order.paymentMethod}: ₹${rem.toFixed(0)}, Wallet: ₹${walletAmt.toFixed(0)})`;
                }
                return order.paymentMethod || '—';
              })()}
            </strong>
          </div>
          <div><span>Initial Date: </span><strong>{fmtDateTime(order.createdAt)}</strong></div>
        </div>

        {/* Timeline Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {historyRecords.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
              <History size={32} strokeWidth={1.2} style={{ marginBottom: 8, opacity: 0.5 }} />
              <p style={{ fontSize: '0.85rem' }}>No activity history recorded for this invoice.</p>
            </div>
          ) : (
            <div style={{ position: 'relative', paddingLeft: 24 }}>
              {/* Vertical timeline line */}
              <div style={{
                position: 'absolute', left: 11, top: 12, bottom: 12,
                width: 2, background: 'var(--border-subtle, #e2e8f0)'
              }} />

              {historyRecords.map((item, index) => {
                const badgeStyle = getActionBadgeStyle(item.action);
                return (
                  <div key={item.id || index} style={{ position: 'relative', marginBottom: 20 }}>
                    {/* Timeline Node Icon */}
                    <div style={{
                      position: 'absolute', left: -24, top: 2,
                      width: 24, height: 24, borderRadius: '50%',
                      background: 'white', border: '2px solid var(--border-subtle, #cbd5e1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)', zIndex: 1
                    }}>
                      {getActionIcon(item.action)}
                    </div>

                    {/* Timeline Card */}
                    <div style={{
                      background: '#ffffff',
                      border: '1px solid var(--border-subtle, #e2e8f0)',
                      borderRadius: 12, padding: '12px 14px',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                            {item.title}
                          </span>
                          <span style={{
                            fontSize: '0.66rem', fontWeight: 700, padding: '1px 7px', borderRadius: 12,
                            ...badgeStyle
                          }}>
                            {item.action}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={11} /> {fmtDateTime(item.timestamp)}
                        </div>
                      </div>

                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.45, marginTop: 4 }}>
                        {item.description}
                      </div>

                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 6,
                        borderTop: '1px dashed var(--border-subtle, #f1f5f9)', fontSize: '0.72rem', color: 'var(--text-muted)'
                      }}>
                        <User size={11} />
                        <span>Action performed by: <strong style={{ color: 'var(--text-primary)' }}>{item.staffName || 'Staff'}</strong></span>
                      </div>

                      {/* Extra Details preview if available */}
                      {item.details && typeof item.details === 'object' && Object.keys(item.details).length > 0 && (
                        <div style={{
                          marginTop: 6, padding: '6px 10px', background: 'rgba(248, 250, 252, 0.8)',
                          borderRadius: 8, fontSize: '0.72rem', border: '1px solid rgba(226, 232, 240, 0.8)'
                        }}>
                          {Object.entries(item.details).map(([k, v]) => {
                            if (v === null || v === undefined || (Array.isArray(v) && v.length === 0)) return null;
                            const valStr = typeof v === 'object' ? JSON.stringify(v) : String(v);
                            return (
                              <div key={k} style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
                                <span style={{ color: 'var(--text-muted)', textTransform: 'capitalize' }}>{k}:</span>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{valStr}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--border-subtle, #e2e8f0)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white'
        }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Total {historyRecords.length} logged actions recorded
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            style={{ padding: '6px 16px', fontSize: '0.8rem' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default InvoiceHistoryModal;
