import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Zap,
  Users,
  Package,
  Wrench,
  Megaphone,
  FileText,
  Wallet,
  Plus,
  Search,
  Filter,
  Download,
  Calendar,
  ArrowUpRight,
  TrendingDown,
  TrendingUp,
  CheckCircle2,
  Clock,
  AlertCircle,
  Edit2,
  Trash2,
  X,
  IndianRupee,
  RefreshCw,
  Repeat,
  Layers,
  ChevronRight,
  ExternalLink,
  ShoppingCart,
  Boxes,
} from 'lucide-react';
import { useApp } from '../db/AppContext';
import { useAuth } from '../db/AuthContext';
import { EXPENSE_CATEGORIES } from '../../shared/seeds';

const CATEGORY_ICON_MAP = {
  Building2,
  Zap,
  Users,
  Package,
  Wrench,
  Megaphone,
  FileText,
  Wallet,
};

const PAYMENT_METHODS = [
  'UPI',
  'Cash',
  'Bank Transfer / NEFT',
  'Debit / Credit Card',
  'Petty Cash',
  'Cheque',
  'Other',
];

const RECURRING_FREQUENCIES = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Annually' },
  { value: 'weekly', label: 'Weekly' },
];

export default function Expenses() {
  const {
    expenses = [],
    addExpense,
    editExpense,
    deleteExpense,
    purchaseOrders = [],
    orders = [],
    staff = [],
    settings,
  } = useApp();
  const { user } = useAuth();

  // Filters & State
  const [period, setPeriod] = useState('month'); // 'all', 'today', 'week', 'month', 'year'
  const [outflowScope, setOutflowScope] = useState('all'); // 'all', 'overheads', 'purchases'
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all'); // 'all', 'paid', 'pending'
  const [selectedMethod, setSelectedMethod] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('ledger'); // 'ledger', 'breakdown', 'recurring'

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Form State
  const initialForm = {
    date: new Date().toISOString().split('T')[0],
    category: EXPENSE_CATEGORIES[0]?.id || 'rent_occupancy',
    subcategory: EXPENSE_CATEGORIES[0]?.subcategories[0] || '',
    title: '',
    amount: '',
    payee: '',
    paymentMethod: 'UPI',
    status: 'paid',
    isRecurring: false,
    recurringFrequency: 'monthly',
    recurringDueDay: '1',
    invoiceNumber: '',
    gstin: '',
    taxAmount: '',
    notes: '',
  };
  const [form, setForm] = useState(initialForm);

  // Category Map for quick lookup
  const categoryMap = useMemo(() => {
    const map = {};
    EXPENSE_CATEGORIES.forEach(cat => {
      map[cat.id] = cat;
    });
    return map;
  }, []);

  // Normalize Purchase Orders from Inventory into the expense structure
  const normalizedPurchaseOrders = useMemo(() => {
    return (purchaseOrders || []).map(po => {
      const itemCount = Array.isArray(po.items) ? po.items.length : 0;
      const itemsPreview = Array.isArray(po.items)
        ? po.items.slice(0, 3).map(i => `${i.name || 'Item'} (${i.qty || 1}${i.unit || ''})`).join(', ') + (itemCount > 3 ? ` +${itemCount - 3} more` : '')
        : '';
      const isReceived = po.status === 'received';
      const isCancelled = po.status === 'cancelled';

      return {
        id: `po_${po.id || po.poNumber || Math.random()}`,
        originalPoId: po.id,
        poNumber: po.poNumber || 'DRAFT',
        isPurchaseOrder: true,
        title: `Purchase Order #${po.poNumber || 'Draft'}`,
        subtitle: itemsPreview || `${itemCount} ingredients/items`,
        amount: Number(po.total || po.totalAmount || 0),
        date: po.date || (po.createdAt ? po.createdAt.split('T')[0] : new Date().toISOString().split('T')[0]),
        category: 'inventory_cogs',
        subcategory: 'Supplier Purchase Orders',
        payee: po.supplier || 'Supplier',
        paymentMethod: po.paymentMethod || 'Supplier Invoicing',
        status: isReceived ? 'paid' : (isCancelled ? 'cancelled' : 'pending'),
        rawPoStatus: po.status,
        invoiceNumber: po.poNumber || '',
        notes: po.notes || '',
        itemCount,
      };
    });
  }, [purchaseOrders]);

  // Combined Outflows based on Scope (All Outflows vs Overheads vs Purchases)
  const allOutflows = useMemo(() => {
    if (outflowScope === 'overheads') return expenses;
    if (outflowScope === 'purchases') return normalizedPurchaseOrders;
    return [...expenses, ...normalizedPurchaseOrders];
  }, [expenses, normalizedPurchaseOrders, outflowScope]);

  // Filter Expenses & Outflows by Period and Filters
  const filteredExpenses = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    return allOutflows.filter(item => {
      // Date filter
      if (period !== 'all') {
        const itemDate = new Date(item.date || item.createdAt);
        if (isNaN(itemDate.getTime())) return true;

        if (period === 'today') {
          const itemDateStr = itemDate.toISOString().split('T')[0];
          if (itemDateStr !== todayStr) return false;
        } else if (period === 'week') {
          const oneWeekAgo = new Date();
          oneWeekAgo.setDate(now.getDate() - 7);
          if (itemDate < oneWeekAgo) return false;
        } else if (period === 'month') {
          if (
            itemDate.getFullYear() !== now.getFullYear() ||
            itemDate.getMonth() !== now.getMonth()
          ) {
            return false;
          }
        } else if (period === 'year') {
          if (itemDate.getFullYear() !== now.getFullYear()) return false;
        }
      }

      // Category filter
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }

      // Status filter
      if (selectedStatus !== 'all' && item.status !== selectedStatus) {
        return false;
      }

      // Payment Method filter
      if (selectedMethod !== 'all' && item.paymentMethod !== selectedMethod) {
        return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = (item.title || '').toLowerCase().includes(q);
        const matchesSubtitle = (item.subtitle || '').toLowerCase().includes(q);
        const matchesPayee = (item.payee || '').toLowerCase().includes(q);
        const matchesInvoice = (item.invoiceNumber || '').toLowerCase().includes(q);
        const matchesNotes = (item.notes || '').toLowerCase().includes(q);
        const matchesSubcat = (item.subcategory || '').toLowerCase().includes(q);
        if (!matchesTitle && !matchesSubtitle && !matchesPayee && !matchesInvoice && !matchesNotes && !matchesSubcat) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
  }, [allOutflows, period, selectedCategory, selectedStatus, selectedMethod, searchQuery]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const now = new Date();
    let totalPeriod = 0;
    let periodOverheads = 0;
    let periodPurchases = 0;
    let thisMonthTotal = 0;
    let pendingTotal = 0;
    let pendingCount = 0;
    const catTotals = {};

    allOutflows.forEach(e => {
      const amt = Number(e.amount) || 0;
      const d = new Date(e.date || e.createdAt);

      // This month total
      if (
        !isNaN(d.getTime()) &&
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth()
      ) {
        thisMonthTotal += amt;
      }

      // Pending
      if (e.status === 'pending') {
        pendingTotal += amt;
        pendingCount += 1;
      }
    });

    // Period specific breakdown
    filteredExpenses.forEach(e => {
      const amt = Number(e.amount) || 0;
      totalPeriod += amt;
      if (e.isPurchaseOrder) {
        periodPurchases += amt;
      } else {
        periodOverheads += amt;
      }
      catTotals[e.category] = (catTotals[e.category] || 0) + amt;
    });

    // Top Category in period
    let topCatId = null;
    let topCatAmt = 0;
    Object.entries(catTotals).forEach(([catId, sum]) => {
      if (sum > topCatAmt) {
        topCatAmt = sum;
        topCatId = catId;
      }
    });

    return {
      totalPeriod,
      periodOverheads,
      periodPurchases,
      countPeriod: filteredExpenses.length,
      thisMonthTotal,
      pendingTotal,
      pendingCount,
      topCategory: topCatId ? categoryMap[topCatId]?.name : 'N/A',
      topCategoryAmount: topCatAmt,
      categoryTotals: catTotals,
    };
  }, [allOutflows, filteredExpenses, categoryMap]);

  // P&L calculation for current period
  const pnlMetrics = useMemo(() => {
    const now = new Date();
    // Filter orders in current period
    const periodOrders = (orders || []).filter(o => {
      if (period === 'all') return true;
      const d = new Date(o.createdAt);
      if (isNaN(d.getTime())) return false;
      if (period === 'today') {
        return d.toISOString().split('T')[0] === now.toISOString().split('T')[0];
      }
      if (period === 'week') {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(now.getDate() - 7);
        return d >= oneWeekAgo;
      }
      if (period === 'month') {
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }
      if (period === 'year') {
        return d.getFullYear() === now.getFullYear();
      }
      return true;
    });

    // Filter purchase orders in period for COGS
    const periodPOs = normalizedPurchaseOrders.filter(po => {
      if (period === 'all') return true;
      const d = new Date(po.date);
      if (isNaN(d.getTime())) return true;
      if (period === 'today') {
        return d.toISOString().split('T')[0] === now.toISOString().split('T')[0];
      }
      if (period === 'week') {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(now.getDate() - 7);
        return d >= oneWeekAgo;
      }
      if (period === 'month') {
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }
      if (period === 'year') {
        return d.getFullYear() === now.getFullYear();
      }
      return true;
    });

    // Filter direct overhead expenses in period
    const periodDirectExpenses = (expenses || []).filter(e => {
      if (period === 'all') return true;
      const d = new Date(e.date || e.createdAt);
      if (isNaN(d.getTime())) return true;
      if (period === 'today') {
        return d.toISOString().split('T')[0] === now.toISOString().split('T')[0];
      }
      if (period === 'week') {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(now.getDate() - 7);
        return d >= oneWeekAgo;
      }
      if (period === 'month') {
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }
      if (period === 'year') {
        return d.getFullYear() === now.getFullYear();
      }
      return true;
    });

    const grossSales = periodOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const cogsPurchases = periodPOs.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const grossProfit = grossSales - cogsPurchases;
    const grossMarginPercent = grossSales > 0 ? (grossProfit / grossSales) * 100 : 0;

    const overheadExpenses = periodDirectExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    // Monthly labor cost approximation from staff salaries
    const monthlyLabor = (staff || []).reduce((sum, s) => sum + (Number(s.salary) || 0), 0);
    let periodLabor = monthlyLabor;
    if (period === 'today') periodLabor = monthlyLabor / 30;
    else if (period === 'week') periodLabor = (monthlyLabor / 30) * 7;
    else if (period === 'year') periodLabor = monthlyLabor * 12;

    const totalOutflow = cogsPurchases + overheadExpenses + periodLabor;
    const netProfit = grossSales - totalOutflow;
    const profitMargin = grossSales > 0 ? (netProfit / grossSales) * 100 : 0;

    return {
      grossSales,
      ordersCount: periodOrders.length,
      cogsPurchases,
      poCount: periodPOs.length,
      grossProfit,
      grossMarginPercent,
      overheadExpenses,
      periodLabor,
      netProfit,
      profitMargin,
    };
  }, [orders, normalizedPurchaseOrders, expenses, staff, period]);

  // Recurring Expenses
  const recurringExpenses = useMemo(() => {
    return (expenses || []).filter(e => e.isRecurring);
  }, [expenses]);

  // Open Log/Edit Modal
  const handleOpenModal = (expenseToEdit = null) => {
    if (expenseToEdit && !expenseToEdit.isPurchaseOrder) {
      setEditingExpense(expenseToEdit);
      setForm({
        date: expenseToEdit.date || new Date().toISOString().split('T')[0],
        category: expenseToEdit.category || EXPENSE_CATEGORIES[0]?.id,
        subcategory: expenseToEdit.subcategory || '',
        title: expenseToEdit.title || '',
        amount: String(expenseToEdit.amount || ''),
        payee: expenseToEdit.payee || '',
        paymentMethod: expenseToEdit.paymentMethod || 'UPI',
        status: expenseToEdit.status || 'paid',
        isRecurring: Boolean(expenseToEdit.isRecurring),
        recurringFrequency: expenseToEdit.recurringFrequency || 'monthly',
        recurringDueDay: String(expenseToEdit.recurringDueDay || '1'),
        invoiceNumber: expenseToEdit.invoiceNumber || '',
        gstin: expenseToEdit.gstin || '',
        taxAmount: String(expenseToEdit.taxAmount || ''),
        notes: expenseToEdit.notes || '',
      });
    } else {
      setEditingExpense(null);
      setForm({
        ...initialForm,
        date: new Date().toISOString().split('T')[0],
      });
    }
    setModalOpen(true);
  };

  // Submit Expense
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.amount) return;

    const payload = {
      title: form.title.trim(),
      amount: parseFloat(form.amount) || 0,
      date: form.date || new Date().toISOString().split('T')[0],
      category: form.category,
      subcategory: form.subcategory,
      payee: form.payee.trim(),
      paymentMethod: form.paymentMethod,
      status: form.status,
      isRecurring: Boolean(form.isRecurring),
      recurringFrequency: form.recurringFrequency,
      recurringDueDay: parseInt(form.recurringDueDay, 10) || 1,
      invoiceNumber: form.invoiceNumber.trim(),
      gstin: form.gstin.trim(),
      taxAmount: parseFloat(form.taxAmount) || 0,
      notes: form.notes.trim(),
      loggedBy: user?.name || 'Staff',
    };

    if (editingExpense) {
      await editExpense(editingExpense.id, payload);
    } else {
      await addExpense(payload);
    }
    setModalOpen(false);
  };

  // Mark Recurring as Paid Today
  const handleMarkRecurringPaid = async (recExp) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const newPaidExpense = {
      title: `${recExp.title} (${new Date().toLocaleString('default', { month: 'short' })} ${new Date().getFullYear()})`,
      amount: recExp.amount,
      date: todayStr,
      category: recExp.category,
      subcategory: recExp.subcategory,
      payee: recExp.payee,
      paymentMethod: recExp.paymentMethod,
      status: 'paid',
      isRecurring: false,
      invoiceNumber: recExp.invoiceNumber,
      notes: `Generated from recurring rule: ${recExp.title}`,
      loggedBy: user?.name || 'Staff',
    };
    await addExpense(newPaidExpense);
  };

  // Export CSV
  const handleExportCSV = () => {
    if (filteredExpenses.length === 0) {
      alert('No expense records to export.');
      return;
    }

    const headers = [
      'Type',
      'Date',
      'Title / Description',
      'Category',
      'Subcategory',
      'Payee / Vendor',
      'Amount (INR)',
      'Payment Method',
      'Status',
      'Invoice / Ref No',
      'Tax Amount',
      'GSTIN',
      'Notes',
    ];

    const escapeCell = (str) => `"${String(str || '').replace(/"/g, '""')}"`;

    const rows = filteredExpenses.map(e => [
      escapeCell(e.isPurchaseOrder ? 'Purchase Order (COGS)' : 'General Overhead'),
      e.date || '',
      escapeCell(e.title),
      escapeCell(categoryMap[e.category]?.name || e.category),
      escapeCell(e.subcategory || ''),
      escapeCell(e.payee || ''),
      Number(e.amount || 0).toFixed(2),
      escapeCell(e.paymentMethod || ''),
      escapeCell(e.status || ''),
      escapeCell(e.invoiceNumber || ''),
      Number(e.taxAmount || 0).toFixed(2),
      escapeCell(e.gstin || ''),
      escapeCell(e.notes || ''),
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kitchgoo_expenses_${outflowScope}_${period}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1440px', margin: '0 auto' }}>
      {/* ─── Top Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.5px' }}>
            Expenses & Overheads
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: '4px 0 0 0' }}>
            Unified ledger for operating overheads, utility bills, rent, and inventory purchase orders (COGS).
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleExportCSV}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', fontSize: '0.85rem', fontWeight: 600 }}
          >
            <Download size={16} /> Export CSV
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => handleOpenModal()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 18px', fontSize: '0.88rem', fontWeight: 700 }}
          >
            <Plus size={18} /> Log Overhead Expense
          </button>
        </div>
      </div>

      {/* ─── KPI Metrics Cards ──────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {/* Period Expenses */}
        <div className="card" style={{ padding: '20px', borderRadius: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Total Outflows ({period.toUpperCase()})
            </span>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingDown size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 900, color: 'var(--text-primary)' }}>
            ₹{metrics.totalPeriod.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            <span>₹{metrics.periodOverheads.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Overheads</span>
            {' • '}
            <span style={{ color: '#059669', fontWeight: 600 }}>₹{metrics.periodPurchases.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Purchases</span>
          </div>
        </div>

        {/* This Month's Overheads */}
        <div className="card" style={{ padding: '20px', borderRadius: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              This Month's Burn
            </span>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 900, color: 'var(--text-primary)' }}>
            ₹{metrics.thisMonthTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Total overheads & purchases this month
          </div>
        </div>

        {/* Pending Bills & Unpaid POs */}
        <div className="card" style={{ padding: '20px', borderRadius: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Accounts Payable (Pending)
            </span>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 900, color: metrics.pendingTotal > 0 ? '#d97706' : 'var(--text-primary)' }}>
            ₹{metrics.pendingTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {metrics.pendingCount} pending bill{metrics.pendingCount !== 1 ? 's' : ''} & POs
          </div>
        </div>

        {/* Top Cost Driver */}
        <div className="card" style={{ padding: '20px', borderRadius: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Top Cost Driver
            </span>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(30, 94, 74, 0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowUpRight size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {metrics.topCategory}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            ₹{metrics.topCategoryAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })} in this period
          </div>
        </div>
      </div>

      {/* ─── Navigation Tabs & Outflow Scope Selector ───────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'ledger' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: '8px', fontWeight: 700, padding: '8px 16px' }}
            onClick={() => setActiveTab('ledger')}
          >
            All Outflows ({filteredExpenses.length})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'breakdown' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: '8px', fontWeight: 700, padding: '8px 16px' }}
            onClick={() => setActiveTab('breakdown')}
          >
            Category Breakdown & P&L
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'recurring' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: '8px', fontWeight: 700, padding: '8px 16px' }}
            onClick={() => setActiveTab('recurring')}
          >
            Recurring Schedule ({recurringExpenses.length})
          </button>
        </div>

        {/* Period Selector Pills */}
        <div style={{ display: 'flex', background: 'var(--card-bg, #ffffff)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '3px' }}>
          {[
            { id: 'today', label: 'Today' },
            { id: 'week', label: '7 Days' },
            { id: 'month', label: 'This Month' },
            { id: 'year', label: 'This Year' },
            { id: 'all', label: 'All Time' },
          ].map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              style={{
                background: period === p.id ? 'var(--primary)' : 'transparent',
                color: period === p.id ? 'white' : 'var(--text-secondary)',
                border: 'none',
                padding: '5px 12px',
                borderRadius: '7px',
                fontSize: '0.78rem',
                fontWeight: period === p.id ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Filter Bar with Outflow Scope (Overheads vs POs) ──── */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Scope Pill Toggle */}
        <div style={{ display: 'flex', background: 'var(--card-bg, #ffffff)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '2px' }}>
          <button
            type="button"
            onClick={() => setOutflowScope('all')}
            style={{
              background: outflowScope === 'all' ? 'rgba(30, 94, 74, 0.12)' : 'transparent',
              color: outflowScope === 'all' ? 'var(--primary)' : 'var(--text-secondary)',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: outflowScope === 'all' ? 700 : 500,
              cursor: 'pointer',
            }}
          >
            All Outflows ({allOutflows.length})
          </button>
          <button
            type="button"
            onClick={() => setOutflowScope('overheads')}
            style={{
              background: outflowScope === 'overheads' ? 'rgba(30, 94, 74, 0.12)' : 'transparent',
              color: outflowScope === 'overheads' ? 'var(--primary)' : 'var(--text-secondary)',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: outflowScope === 'overheads' ? 700 : 500,
              cursor: 'pointer',
            }}
          >
            Overheads Only ({expenses.length})
          </button>
          <button
            type="button"
            onClick={() => setOutflowScope('purchases')}
            style={{
              background: outflowScope === 'purchases' ? 'rgba(5, 150, 105, 0.12)' : 'transparent',
              color: outflowScope === 'purchases' ? '#059669' : 'var(--text-secondary)',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: outflowScope === 'purchases' ? 700 : 500,
              cursor: 'pointer',
            }}
          >
            Inventory POs ({normalizedPurchaseOrders.length})
          </button>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="input-field"
            placeholder="Search title, supplier, invoice #, items..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '38px', margin: 0, height: '38px', fontSize: '0.84rem' }}
          />
        </div>

        {/* Category Dropdown */}
        <select
          className="input-field"
          value={selectedCategory}
          onChange={e => setSelectedCategory(e.target.value)}
          style={{ width: 'auto', minWidth: '170px', margin: 0, height: '38px', fontSize: '0.82rem' }}
        >
          <option value="all">All Categories</option>
          {EXPENSE_CATEGORIES.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>

        {/* Status Dropdown */}
        <select
          className="input-field"
          value={selectedStatus}
          onChange={e => setSelectedStatus(e.target.value)}
          style={{ width: 'auto', minWidth: '120px', margin: 0, height: '38px', fontSize: '0.82rem' }}
        >
          <option value="all">All Statuses</option>
          <option value="paid">Paid / Received</option>
          <option value="pending">Pending / Due</option>
        </select>

        {/* Payment Method */}
        <select
          className="input-field"
          value={selectedMethod}
          onChange={e => setSelectedMethod(e.target.value)}
          style={{ width: 'auto', minWidth: '130px', margin: 0, height: '38px', fontSize: '0.82rem' }}
        >
          <option value="all">All Modes</option>
          {PAYMENT_METHODS.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        {(selectedCategory !== 'all' || selectedStatus !== 'all' || selectedMethod !== 'all' || outflowScope !== 'all' || searchQuery) && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setOutflowScope('all');
              setSelectedCategory('all');
              setSelectedStatus('all');
              setSelectedMethod('all');
              setSearchQuery('');
            }}
            style={{ padding: '6px 12px', fontSize: '0.78rem' }}
          >
            Reset
          </button>
        )}
      </div>

      {/* ─── Tab Content ────────────────────────────────────────── */}

      {/* TAB 1: LEDGER */}
      {activeTab === 'ledger' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: '16px' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'var(--canvas, #f8fafc)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <th style={{ padding: '14px 18px', fontWeight: 700 }}>Date</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700 }}>Type & Description</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700 }}>Category</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700 }}>Payee / Supplier</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700 }}>Payment Mode</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700, textAlign: 'right' }}>Amount (₹)</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px auto' }}>
                        <Wallet size={24} />
                      </div>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '4px' }}>
                        No Records Found
                      </div>
                      <p style={{ fontSize: '0.82rem', margin: '0 auto 16px auto', maxWidth: 360 }}>
                        {allOutflows.length === 0
                          ? 'No overhead expenses or purchase orders recorded yet.'
                          : 'No expenses or purchase orders match the selected filters.'}
                      </p>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => handleOpenModal()}
                      >
                        <Plus size={15} /> Log Overhead Expense
                      </button>
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map((item, idx) => {
                    const cat = categoryMap[item.category];
                    const CatIcon = cat?.icon && CATEGORY_ICON_MAP[cat.icon] ? CATEGORY_ICON_MAP[cat.icon] : (item.isPurchaseOrder ? Package : Wallet);
                    const catColor = cat?.color || (item.isPurchaseOrder ? '#059669' : 'var(--primary)');

                    return (
                      <tr
                        key={item.id || idx}
                        style={{
                          borderBottom: '1px solid var(--border-subtle)',
                          transition: 'background 0.15s ease',
                          background: item.isPurchaseOrder ? 'rgba(5, 150, 105, 0.02)' : 'transparent',
                        }}
                      >
                        {/* Date */}
                        <td style={{ padding: '14px 18px', whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {item.date || (item.createdAt ? item.createdAt.split('T')[0] : '--')}
                        </td>

                        {/* Title & Details */}
                        <td style={{ padding: '14px 18px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                              {item.title}
                            </span>
                            {item.isPurchaseOrder && (
                              <span style={{ fontSize: '0.65rem', background: 'rgba(5, 150, 105, 0.12)', color: '#059669', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
                                COGS • PO
                              </span>
                            )}
                            {item.isRecurring && (
                              <span style={{ fontSize: '0.65rem', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                RECURRING
                              </span>
                            )}
                          </div>

                          {/* Subtitle / Items / Notes */}
                          {item.subtitle && (
                            <div style={{ fontSize: '0.73rem', color: '#059669', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Boxes size={12} /> <span>{item.subtitle}</span>
                            </div>
                          )}
                          {!item.isPurchaseOrder && (item.subcategory || item.invoiceNumber) && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                              {item.subcategory}{item.subcategory && item.invoiceNumber ? ' • ' : ''}
                              {item.invoiceNumber && <span>Inv: #{item.invoiceNumber}</span>}
                            </div>
                          )}
                          {item.notes && !item.isPurchaseOrder && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: 2 }}>
                              "{item.notes}"
                            </div>
                          )}
                        </td>

                        {/* Category */}
                        <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 6, background: `${catColor}14`, color: catColor, fontSize: '0.75rem', fontWeight: 700 }}>
                            <CatIcon size={13} />
                            <span>{cat?.name || (item.isPurchaseOrder ? 'Raw Materials (COGS)' : item.category)}</span>
                          </div>
                        </td>

                        {/* Payee / Supplier */}
                        <td style={{ padding: '14px 18px', color: 'var(--text-primary)', fontWeight: 600 }}>
                          {item.payee || '--'}
                        </td>

                        {/* Payment Mode */}
                        <td style={{ padding: '14px 18px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                          {item.paymentMethod || 'Cash'}
                        </td>

                        {/* Status */}
                        <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            background: item.status === 'paid' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                            color: item.status === 'paid' ? '#16a34a' : '#d97706',
                          }}>
                            {item.isPurchaseOrder
                              ? (item.rawPoStatus ? item.rawPoStatus.toUpperCase() : item.status.toUpperCase())
                              : (item.status === 'paid' ? 'PAID' : 'PENDING')}
                          </span>
                        </td>

                        {/* Amount */}
                        <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                          ₹{Number(item.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '14px 18px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {item.isPurchaseOrder ? (
                            <Link
                              to="/inventory"
                              className="btn btn-secondary btn-sm"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 8px', fontSize: '0.72rem', color: '#059669' }}
                              title="Manage in Inventory > Purchase Orders"
                            >
                              <ExternalLink size={12} /> Inventory
                            </Link>
                          ) : (
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '6px 8px' }}
                                onClick={() => handleOpenModal(item)}
                                title="Edit Expense"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '6px 8px', color: 'var(--danger, #ef4444)' }}
                                onClick={() => setDeleteConfirmId(item.id)}
                                title="Delete Expense"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: CATEGORY BREAKDOWN & COMPLETE P&L */}
      {activeTab === 'breakdown' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>
          {/* Complete 4-Tier P&L Snapshot */}
          <div className="card" style={{ padding: '24px', borderRadius: '16px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
              Profit & Loss Statement ({period.toUpperCase()})
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              True restaurant margin calculation accounting for Sales Revenue, Raw Materials (COGS), Overheads, and Labor.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* 1. Gross Revenue */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>1. Gross Sales Revenue</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{pnlMetrics.ordersCount} POS invoices completed</div>
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#16a34a' }}>
                  + ₹{pnlMetrics.grossSales.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </div>
              </div>

              {/* 2. COGS (Purchase Orders) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#059669' }}>2. Cost of Goods Sold (COGS)</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{pnlMetrics.poCount} supplier purchase orders in period</div>
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ef4444' }}>
                  - ₹{pnlMetrics.cogsPurchases.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </div>
              </div>

              {/* Gross Margin Subtotal */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: 'rgba(5, 150, 105, 0.05)', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#059669' }}>
                  Gross Profit (Sales - COGS)
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#059669' }}>
                  ₹{pnlMetrics.grossProfit.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ({pnlMetrics.grossMarginPercent.toFixed(1)}%)
                </div>
              </div>

              {/* 3. Operating Overheads */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>3. Operating Overheads</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Rent, electricity, packaging, marketing, repairs</div>
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ef4444' }}>
                  - ₹{pnlMetrics.overheadExpenses.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </div>
              </div>

              {/* 4. Staff Labor */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>4. Staff Labor Payroll</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{staff.length} staff members (period salary share)</div>
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ef4444' }}>
                  - ₹{pnlMetrics.periodLabor.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </div>
              </div>

              {/* Net Profit */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '2px dashed var(--border-subtle)' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)' }}>Net Operating Profit</div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: pnlMetrics.netProfit >= 0 ? '#16a34a' : '#ef4444' }}>
                    Net Margin: {pnlMetrics.profitMargin.toFixed(1)}%
                  </div>
                </div>
                <div style={{ fontSize: '1.55rem', fontWeight: 900, color: pnlMetrics.netProfit >= 0 ? '#16a34a' : '#ef4444' }}>
                  ₹{pnlMetrics.netProfit.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>

          {/* Category Breakdown Progress */}
          <div className="card" style={{ padding: '24px', borderRadius: '16px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
              Category Distribution
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Spending breakdown across inventory COGS and overhead pillars.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {EXPENSE_CATEGORIES.map(cat => {
                const CatIcon = CATEGORY_ICON_MAP[cat.icon] || Wallet;
                const amt = metrics.categoryTotals[cat.id] || 0;
                const percentage = metrics.totalPeriod > 0 ? (amt / metrics.totalPeriod) * 100 : 0;

                return (
                  <div key={cat.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', fontSize: '0.82rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: 'var(--text-primary)' }}>
                        <div style={{ width: 24, height: 24, borderRadius: 6, background: `${cat.color}15`, color: cat.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <CatIcon size={14} />
                        </div>
                        <span>{cat.name}</span>
                      </div>
                      <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
                        ₹{amt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}{' '}
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                          ({percentage.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'var(--border-subtle, #e2e8f0)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${percentage}%`, height: '100%', background: cat.color, borderRadius: '4px', transition: 'width 0.3s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: RECURRING SCHEDULE */}
      {activeTab === 'recurring' && (
        <div className="card" style={{ padding: '24px', borderRadius: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                Scheduled & Recurring Overheads
              </h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                Recurring overheads like monthly rent, society dues, Wi-Fi, and software subscriptions.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                handleOpenModal();
                setForm(f => ({ ...f, isRecurring: true }));
              }}
              style={{ fontWeight: 700 }}
            >
              <Plus size={15} /> Add Recurring Rule
            </button>
          </div>

          {recurringExpenses.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Repeat size={32} style={{ margin: '0 auto 8px auto', opacity: 0.5 }} />
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>No Recurring Expenses Set</div>
              <p style={{ fontSize: '0.8rem', maxWidth: 360, margin: '0 auto' }}>
                When logging an expense (such as Rent or Wi-Fi), toggle "Recurring" to keep it scheduled here.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
              {recurringExpenses.map(rec => {
                const cat = categoryMap[rec.category];
                const CatIcon = cat?.icon && CATEGORY_ICON_MAP[cat.icon] ? CATEGORY_ICON_MAP[cat.icon] : Wallet;

                return (
                  <div
                    key={rec.id}
                    style={{
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '12px',
                      padding: '16px',
                      background: 'var(--canvas, #f8fafc)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 8px', borderRadius: 6, background: `${cat?.color || '#3b82f6'}15`, color: cat?.color || '#3b82f6', fontSize: '0.72rem', fontWeight: 700 }}>
                          <CatIcon size={12} />
                          <span>{cat?.name || rec.category}</span>
                        </div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--primary)', background: 'rgba(30, 94, 74, 0.1)', padding: '2px 8px', borderRadius: '12px' }}>
                          {rec.recurringFrequency || 'Monthly'}
                        </span>
                      </div>

                      <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>
                        {rec.title}
                      </div>
                      {rec.payee && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          Payee: {rec.payee}
                        </div>
                      )}
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Due on day {rec.recurringDueDay || 1} of the cycle
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Amount</div>
                        <div style={{ fontWeight: 900, fontSize: '1.15rem', color: 'var(--text-primary)' }}>
                          ₹{Number(rec.amount || 0).toLocaleString('en-IN')}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => handleMarkRecurringPaid(rec)}
                        style={{ fontSize: '0.75rem', fontWeight: 700, padding: '6px 12px' }}
                        title="Records a paid entry for this cycle"
                      >
                        <CheckCircle2 size={13} /> Mark Paid Today
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── Add / Edit Modal ───────────────────────────────────── */}
      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '20px',
          }}
          onClick={() => setModalOpen(false)}
        >
          <div
            className="card animate-fade-in"
            style={{
              width: '100%',
              maxWidth: '560px',
              maxHeight: '90vh',
              overflowY: 'auto',
              borderRadius: '20px',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '14px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  {editingExpense ? 'Edit Expense' : 'Log New Expense'}
                </h2>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Record operational overhead, vendor bill, or petty cash expense.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setModalOpen(false)}
                style={{ padding: '6px', borderRadius: '50%' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Row 1: Title */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>
                  Expense Description / Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. October Shop Rent, Commercial LPG (2 Cylinders), Wi-Fi"
                  className="input-field"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  style={{ margin: 0 }}
                />
              </div>

              {/* Row 2: Category & Subcategory */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>
                    Category *
                  </label>
                  <select
                    className="input-field"
                    value={form.category}
                    onChange={e => {
                      const newCatId = e.target.value;
                      const catObj = categoryMap[newCatId];
                      setForm(f => ({
                        ...f,
                        category: newCatId,
                        subcategory: catObj?.subcategories[0] || '',
                      }));
                    }}
                    style={{ margin: 0 }}
                  >
                    {EXPENSE_CATEGORIES.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>
                    Subcategory
                  </label>
                  <select
                    className="input-field"
                    value={form.subcategory}
                    onChange={e => setForm(f => ({ ...f, subcategory: e.target.value }))}
                    style={{ margin: 0 }}
                  >
                    {(categoryMap[form.category]?.subcategories || []).map(sub => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 3: Amount & Date */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>
                    Amount (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="0.00"
                    className="input-field"
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    style={{ margin: 0, fontWeight: 700 }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>
                    Expense Date *
                  </label>
                  <input
                    type="date"
                    required
                    className="input-field"
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    style={{ margin: 0 }}
                  />
                </div>
              </div>

              {/* Row 4: Payee & Payment Method */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>
                    Payee / Vendor Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Landlord, Electricity Board, Vendor"
                    className="input-field"
                    value={form.payee}
                    onChange={e => setForm(f => ({ ...f, payee: e.target.value }))}
                    style={{ margin: 0 }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>
                    Payment Mode
                  </label>
                  <select
                    className="input-field"
                    value={form.paymentMethod}
                    onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}
                    style={{ margin: 0 }}
                  >
                    {PAYMENT_METHODS.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 5: Status & Recurring */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'center' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>
                    Payment Status
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, status: 'paid' }))}
                      style={{
                        flex: 1,
                        padding: '8px',
                        borderRadius: '8px',
                        border: '1px solid',
                        borderColor: form.status === 'paid' ? '#16a34a' : 'var(--border-subtle)',
                        background: form.status === 'paid' ? 'rgba(34, 197, 94, 0.12)' : 'transparent',
                        color: form.status === 'paid' ? '#16a34a' : 'var(--text-secondary)',
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                      }}
                    >
                      Paid
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, status: 'pending' }))}
                      style={{
                        flex: 1,
                        padding: '8px',
                        borderRadius: '8px',
                        border: '1px solid',
                        borderColor: form.status === 'pending' ? '#d97706' : 'var(--border-subtle)',
                        background: form.status === 'pending' ? 'rgba(245, 158, 11, 0.12)' : 'transparent',
                        color: form.status === 'pending' ? '#d97706' : 'var(--text-secondary)',
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                      }}
                    >
                      Pending / Due
                    </button>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>
                    Invoice / Receipt No. (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. INV-2026-904"
                    className="input-field"
                    value={form.invoiceNumber}
                    onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))}
                    style={{ margin: 0 }}
                  />
                </div>
              </div>

              {/* Recurring Toggle */}
              <div style={{ background: 'var(--canvas, #f8fafc)', padding: '12px 14px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', margin: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Repeat size={16} style={{ color: 'var(--primary)' }} />
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Recurring Expense
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.isRecurring}
                    onChange={e => setForm(f => ({ ...f, isRecurring: e.target.checked }))}
                    style={{ width: 18, height: 18, accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                </label>

                {form.isRecurring && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed var(--border-subtle)' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        Frequency
                      </label>
                      <select
                        className="input-field"
                        value={form.recurringFrequency}
                        onChange={e => setForm(f => ({ ...f, recurringFrequency: e.target.value }))}
                        style={{ margin: 0, padding: '6px 10px', fontSize: '0.8rem' }}
                      >
                        {RECURRING_FREQUENCIES.map(rf => (
                          <option key={rf.value} value={rf.value}>{rf.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        Due Day of Month
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        className="input-field"
                        value={form.recurringDueDay}
                        onChange={e => setForm(f => ({ ...f, recurringDueDay: e.target.value }))}
                        style={{ margin: 0, padding: '6px 10px', fontSize: '0.8rem' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>
                  Notes & Remarks (Optional)
                </label>
                <textarea
                  className="input-field"
                  rows={2}
                  placeholder="Additional context, cheque details, or approval note..."
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  style={{ margin: 0, resize: 'none' }}
                />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalOpen(false)}
                  style={{ fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ fontWeight: 700, padding: '10px 20px' }}
                >
                  {editingExpense ? 'Update Expense' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Delete Confirmation Modal ──────────────────────────── */}
      {deleteConfirmId && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1200,
            padding: 20,
          }}
          onClick={() => setDeleteConfirmId(null)}
        >
          <div
            className="card animate-fade-in"
            style={{ width: '100%', maxWidth: '380px', padding: '24px', borderRadius: '16px', textAlign: 'center' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px auto' }}>
              <AlertCircle size={26} />
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '6px' }}>Delete Expense?</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Are you sure you want to permanently delete this expense record? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteConfirmId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: '#ef4444', borderColor: '#ef4444', color: 'white' }}
                onClick={async () => {
                  await deleteExpense(deleteConfirmId);
                  setDeleteConfirmId(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
