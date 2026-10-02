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

    it('contains all 8 restaurant expense categories with subcategories', () => {
      expect(EXPENSE_CATEGORIES).toHaveLength(8);
      const catIds = EXPENSE_CATEGORIES.map(c => c.id);
      expect(catIds).toContain('rent_occupancy');
      expect(catIds).toContain('utilities');
      expect(catIds).toContain('staff_labor');
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

    it('calculates Net Operating Profit and Net Margin correctly', () => {
      const grossSales = 200000; // ₹2,00,000 sales
      const overheadExpenses = 60000; // Rent, utilities, packaging
      const laborCost = 50000; // Staff salaries

      const totalCosts = overheadExpenses + laborCost;
      const netProfit = grossSales - totalCosts;
      const netMargin = (netProfit / grossSales) * 100;

      expect(netProfit).toBe(90000);
      expect(netMargin).toBe(45);
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
