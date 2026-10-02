import { describe, it, expect, beforeEach } from 'vitest';
import { EXPENSE_CATEGORIES, FLEX_COLLECTIONS, DEFAULT_MODULES } from '../shared/seeds';
import { setLocalCollection, getAll, insert, update, remove } from '../src/db/database';
import { generateDailyOperationsWorkbook } from '../src/utils/excelExport';

describe('Expenses & Overhead Manager', () => {
  beforeEach(() => {
    setLocalCollection('expenses', []);
  });

  describe('Category Registry & Configuration', () => {
    it('registers expenses in FLEX_COLLECTIONS and DEFAULT_MODULES', () => {
      expect(FLEX_COLLECTIONS).toContain('expenses');
      expect(DEFAULT_MODULES.expenses).toBe(true);
    });

    it('contains all 9 restaurant expense categories with subcategories', () => {
      expect(EXPENSE_CATEGORIES).toHaveLength(9);
      const catIds = EXPENSE_CATEGORIES.map(c => c.id);
      expect(catIds).toContain('rent_occupancy');
      expect(catIds).toContain('utilities');
      expect(catIds).toContain('staff_labor');
      expect(catIds).toContain('inventory_cogs');
      expect(catIds).toContain('supplies_packaging');
      expect(catIds).toContain('repairs_maintenance');
      expect(catIds).toContain('marketing_advertising');
      expect(catIds).toContain('compliance_legal');
      expect(catIds).toContain('petty_cash');

      // Check subcategories exist
      const rentCat = EXPENSE_CATEGORIES.find(c => c.id === 'rent_occupancy');
      expect(rentCat.subcategories).toContain('Property Rent / Lease');
      expect(rentCat.subcategories).toContain('CAM & Society Charges');

      const utilCat = EXPENSE_CATEGORIES.find(c => c.id === 'utilities');
      expect(utilCat.subcategories).toContain('Electricity Bill');
      expect(utilCat.subcategories).toContain('Commercial LPG Gas / Piped Gas');

      const cogsCat = EXPENSE_CATEGORIES.find(c => c.id === 'inventory_cogs');
      expect(cogsCat.subcategories).toContain('Supplier Purchase Orders');
      expect(cogsCat.subcategories).toContain('Fresh Produce & Vegetables');
    });
  });

  describe('Database CRUD Operations for Expenses', () => {
    it('creates, reads, updates, and deletes an expense entry', async () => {
      // 1. Insert Rent expense
      const rentExpense = await insert('expenses', {
        title: 'October Shop Rent',
        amount: 45000,
        date: '2026-10-01',
        category: 'rent_occupancy',
        subcategory: 'Property Rent / Lease',
        payee: 'MG Road Landlord',
        paymentMethod: 'Bank Transfer / NEFT',
        status: 'paid',
        isRecurring: true,
        recurringFrequency: 'monthly',
      });

      expect(rentExpense.id).toBeDefined();
      expect(rentExpense.amount).toBe(45000);

      let allExpenses = getAll('expenses');
      expect(allExpenses).toHaveLength(1);
      expect(allExpenses[0].title).toBe('October Shop Rent');

      // 2. Insert Electricity Bill as pending
      const electricityExpense = await insert('expenses', {
        title: 'Electricity Bill - Sept',
        amount: 14200,
        date: '2026-10-02',
        category: 'utilities',
        subcategory: 'Electricity Bill',
        payee: 'BESCOM',
        paymentMethod: 'UPI',
        status: 'pending',
      });

      allExpenses = getAll('expenses');
      expect(allExpenses).toHaveLength(2);

      // 3. Update Electricity status to paid
      await update('expenses', electricityExpense.id, {
        status: 'paid',
        invoiceNumber: 'BESCOM-984321',
      });

      const updatedElec = getAll('expenses').find(e => e.id === electricityExpense.id);
      expect(updatedElec.status).toBe('paid');
      expect(updatedElec.invoiceNumber).toBe('BESCOM-984321');

      // 4. Remove Rent expense
      await remove('expenses', rentExpense.id);
      allExpenses = getAll('expenses');
      expect(allExpenses).toHaveLength(1);
      expect(allExpenses[0].id).toBe(electricityExpense.id);
    });
  });

  describe('Financial Calculations & P&L Aggregations', () => {
    it('computes total period expenses, category distribution, and accounts payable', () => {
      const mockExpenses = [
        { id: 'e1', title: 'Rent', amount: 50000, category: 'rent_occupancy', status: 'paid', date: '2026-10-01' },
        { id: 'e2', title: 'Power', amount: 15000, category: 'utilities', status: 'paid', date: '2026-10-02' },
        { id: 'e3', title: 'LPG Gas', amount: 8000, category: 'utilities', status: 'pending', date: '2026-10-02' },
        { id: 'e4', title: 'Paper Bags', amount: 4000, category: 'supplies_packaging', status: 'paid', date: '2026-10-02' },
      ];

      const totalPeriod = mockExpenses.reduce((s, e) => s + e.amount, 0);
      expect(totalPeriod).toBe(77000);

      const pendingExpenses = mockExpenses.filter(e => e.status === 'pending');
      const pendingTotal = pendingExpenses.reduce((s, e) => s + e.amount, 0);
      expect(pendingExpenses).toHaveLength(1);
      expect(pendingTotal).toBe(8000);

      // Category breakdown
      const utilitiesTotal = mockExpenses
        .filter(e => e.category === 'utilities')
        .reduce((s, e) => s + e.amount, 0);
      expect(utilitiesTotal).toBe(23000); // 15000 + 8000
      const utilitiesPercent = (utilitiesTotal / totalPeriod) * 100;
      expect(utilitiesPercent.toFixed(1)).toBe('29.9');
    });

    it('calculates 4-tier restaurant P&L with Gross Margin, Overheads, and Net Margin', () => {
      const grossSales = 300000; // ₹3,00,000 sales
      const cogsPurchases = 90000; // ₹90,000 inventory POs / ingredients
      const grossMargin = grossSales - cogsPurchases; // ₹2,10,000
      const grossMarginPercent = (grossMargin / grossSales) * 100;

      const overheadExpenses = 50000; // Rent, utilities, maintenance, packaging
      const laborCost = 60000; // Staff salaries & contractor
      const totalOutflows = cogsPurchases + overheadExpenses + laborCost; // ₹2,00,000
      const netProfit = grossSales - totalOutflows; // ₹1,00,000
      const netMarginPercent = (netProfit / grossSales) * 100;

      expect(grossMargin).toBe(210000);
      expect(grossMarginPercent).toBe(70);
      expect(totalOutflows).toBe(200000);
      expect(netProfit).toBe(100000);
      expect(Number(netMarginPercent.toFixed(2))).toBe(33.33);
    });
  });

  describe('Purchase Order (COGS) Integration & Outflow Scoping', () => {
    const mockPurchaseOrders = [
      {
        id: 'po-001',
        poNumber: 'PO-2026-001',
        supplier: 'Metro Cash & Carry',
        total: 18500,
        status: 'received',
        date: '2026-10-01',
        items: [
          { name: 'Basmati Rice', qty: 25, unit: 'kg' },
          { name: 'Refined Oil', qty: 15, unit: 'L' },
          { name: 'Paneer', qty: 10, unit: 'kg' },
          { name: 'Garam Masala', qty: 2, unit: 'kg' },
        ],
      },
      {
        id: 'po-002',
        poNumber: 'PO-2026-002',
        supplier: 'FarmFresh Organic',
        total: 7200,
        status: 'sent',
        date: '2026-10-02',
        items: [
          { name: 'Tomatoes', qty: 20, unit: 'kg' },
          { name: 'Onions', qty: 30, unit: 'kg' },
        ],
      },
    ];

    it('normalizes purchase orders into the unified outflow stream', () => {
      const normalized = mockPurchaseOrders.map(po => {
        const itemCount = Array.isArray(po.items) ? po.items.length : 0;
        const itemsPreview = Array.isArray(po.items)
          ? po.items.slice(0, 3).map(i => `${i.name || 'Item'} (${i.qty || 1}${i.unit || ''})`).join(', ') + (itemCount > 3 ? ` +${itemCount - 3} more` : '')
          : '';
        const isReceived = po.status === 'received';
        const isCancelled = po.status === 'cancelled';

        return {
          id: `po_${po.id}`,
          originalPoId: po.id,
          poNumber: po.poNumber,
          isPurchaseOrder: true,
          title: `Purchase Order #${po.poNumber}`,
          subtitle: itemsPreview,
          amount: Number(po.total || 0),
          date: po.date,
          category: 'inventory_cogs',
          subcategory: 'Supplier Purchase Orders',
          payee: po.supplier,
          status: isReceived ? 'paid' : (isCancelled ? 'cancelled' : 'pending'),
          rawPoStatus: po.status,
          itemCount,
        };
      });

      expect(normalized).toHaveLength(2);
      expect(normalized[0].isPurchaseOrder).toBe(true);
      expect(normalized[0].category).toBe('inventory_cogs');
      expect(normalized[0].status).toBe('paid'); // received -> paid
      expect(normalized[0].subtitle).toContain('Basmati Rice (25kg)');
      expect(normalized[0].subtitle).toContain('+1 more');

      expect(normalized[1].isPurchaseOrder).toBe(true);
      expect(normalized[1].status).toBe('pending'); // sent -> pending
      expect(normalized[1].subtitle).toBe('Tomatoes (20kg), Onions (30kg)');
    });

    it('filters outflows by scope (all, overheads, purchases)', () => {
      const mockOverheads = [
        { id: 'exp-1', title: 'Office Rent', amount: 35000, category: 'rent_occupancy', isPurchaseOrder: false },
        { id: 'exp-2', title: 'High-speed Internet', amount: 2000, category: 'utilities', isPurchaseOrder: false },
      ];
      const mockPurchases = [
        { id: 'po-1', title: 'PO #101', amount: 15000, category: 'inventory_cogs', isPurchaseOrder: true },
      ];

      const getScopedOutflows = (scope) => {
        if (scope === 'overheads') return mockOverheads;
        if (scope === 'purchases') return mockPurchases;
        return [...mockOverheads, ...mockPurchases];
      };

      expect(getScopedOutflows('all')).toHaveLength(3);
      expect(getScopedOutflows('overheads')).toHaveLength(2);
      expect(getScopedOutflows('purchases')).toHaveLength(1);
      expect(getScopedOutflows('purchases')[0].title).toBe('PO #101');
    });
  });

  describe('Excel Operational Report Integration', () => {
    it('generates multi-sheet workbook with 9 sheets including Expenses & Overheads', () => {
      const mockExpenses = [
        {
          id: 'exp-1',
          title: 'Commercial LPG Cylinder (2x)',
          category: 'utilities',
          subcategory: 'Commercial LPG Gas / Piped Gas',
          payee: 'Indane Gas Agency',
          amount: 3800,
          paymentMethod: 'UPI',
          status: 'paid',
          date: '2026-10-02',
          invoiceNumber: 'INV-GAS-901',
        },
      ];

      const xml = generateDailyOperationsWorkbook({
        dateStr: '2026-10-02',
        orders: [],
        cashDrawer: { openingBalance: 5000, currentBalance: 5000 },
        expenses: mockExpenses,
      });

      expect(xml).toContain('Worksheet ss:Name="Daily Summary"');
      expect(xml).toContain('Worksheet ss:Name="Expenses &amp; Overheads"');
      expect(xml).toContain('Commercial LPG Cylinder (2x)');
      expect(xml).toContain('Indane Gas Agency');
      expect(xml).toContain('General Operating Overheads');
      expect(xml).toContain('TOTAL OVERHEAD EXPENSES');
      expect(xml).toContain('3800');
    });
  });
});
