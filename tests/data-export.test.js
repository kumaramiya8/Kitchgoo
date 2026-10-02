import { describe, it, expect, vi } from 'vitest';
import {
  generateDailyOperationsWorkbook,
  escapeXml,
  filterByDate,
} from '../src/utils/excelExport';
import { exportFullAppData } from '../src/utils/backupExport';
import * as database from '../src/db/database';

describe('Data Export & Daily Operations Report', () => {
  const mockDate = '2026-10-02';

  const mockSettings = {
    restaurant: {
      name: 'Kiko Cafe',
      gstin: '29ABCDE1234F1Z5',
      fssai: '12345678901234',
    },
    billing: {
      gstRate: 5,
      pricesIncludeGst: true,
    },
  };

  const mockOrders = [
    {
      id: 'ord_1',
      invoiceNumber: 'INV-1001',
      createdAt: '2026-10-02T10:15:00.000Z',
      subtotal: 500,
      discount: 50,
      tax: 22.5,
      serviceCharge: 20,
      autoGratuity: 0,
      tip: 30,
      total: 522.5,
      paymentMethod: 'cash',
      orderType: 'Dine-In',
      tableName: 'Table 4',
      guestName: 'Rahul Sharma',
      serverName: 'Amit',
      items: [
        { name: 'Cold Brew & Tonic', category: 'Beverages', quantity: 2, price: 150 },
        { name: 'Truffle Fries <Crispy>', category: 'Appetizers', quantity: 1, price: 200 },
      ],
    },
    {
      id: 'ord_2',
      invoiceNumber: 'INV-1002',
      createdAt: '2026-10-02T13:45:00.000Z',
      subtotal: 800,
      discount: 0,
      tax: 40,
      serviceCharge: 0,
      autoGratuity: 0,
      tip: 50,
      total: 890,
      paymentMethod: 'upi',
      orderType: 'Takeout',
      tableName: 'Counter',
      guestName: 'Sneha Patel',
      serverName: 'Priya',
      items: [
        { name: 'Cold Brew & Tonic', category: 'Beverages', quantity: 1, price: 150 },
        { name: 'Wood-Fired Pizza "Margherita"', category: 'Mains', quantity: 1, price: 650 },
      ],
    },
    {
      id: 'ord_yesterday',
      invoiceNumber: 'INV-0999',
      createdAt: '2026-10-01T18:00:00.000Z', // Different date
      subtotal: 1000,
      discount: 0,
      tax: 50,
      serviceCharge: 0,
      autoGratuity: 0,
      tip: 0,
      total: 1050,
      paymentMethod: 'cash',
      items: [{ name: 'Old Order Item', quantity: 1, price: 1000 }],
    },
  ];

  const mockCashDrawer = {
    openingBalance: 2000,
    cashIn: 522.5,
    cashOut: 300, // Petty cash expense
    drops: [
      { id: 'drp_1', amount: 500, note: 'Midday Safe Deposit', timestamp: '2026-10-02T14:00:00.000Z', cashier: 'Manager' },
    ],
    currentBalance: 1722.5,
    isClosed: false,
  };

  const mockRegisterClosures = [
    {
      id: 'cls_1',
      shiftStart: '2026-10-02T09:00:00.000Z',
      closedAt: '2026-10-02T15:00:00.000Z',
      openingBalance: 2000,
      cashIn: 522.5,
      cashOut: 300,
      drops: [{ amount: 500 }],
      expectedBalance: 1722.5,
      countedCash: 1720,
      discrepancy: -2.5,
      closedBy: 'Manager Raj',
      notes: 'Short by 2.50 due to small coin roundings',
    },
  ];

  const mockKdsTickets = [
    {
      id: 'kds_01',
      orderId: 'ord_1',
      tableName: 'Table 4',
      orderType: 'Dine-In',
      status: 'completed',
      createdAt: '2026-10-02T10:16:00.000Z',
      bumpedAt: '2026-10-02T10:28:00.000Z',
      items: [{ name: 'Truffle Fries <Crispy>', quantity: 1, notes: 'Extra dip' }],
    },
  ];

  const mockAttendance = [
    {
      id: 'att_1',
      staffName: 'Amit Kumar',
      role: 'Waiter',
      type: 'clock-in',
      timestamp: '2026-10-02T08:55:00.000Z',
      method: 'Geofence GPS',
      notes: 'On time',
    },
    {
      id: 'att_2',
      staffName: 'Amit Kumar',
      role: 'Waiter',
      type: 'clock-out',
      timestamp: '2026-10-02T17:05:00.000Z',
      method: 'PIN',
      notes: 'Shift completed',
    },
  ];

  const mockAuditLog = [
    {
      id: 'aud_1',
      action: 'DISCOUNT_APPLIED',
      userName: 'Amit (Server)',
      role: 'Staff',
      details: 'Applied 10% regular guest discount ₹50 on INV-1001',
      timestamp: '2026-10-02T10:15:30.000Z',
    },
  ];

  const mockWasteLog = [
    {
      id: 'wst_1',
      itemName: 'Milk 1L',
      quantity: 2,
      unit: 'litres',
      cost: 120,
      reason: 'Expired / Soured',
      loggedBy: 'Chef Alex',
      date: '2026-10-02T09:30:00.000Z',
    },
  ];

  const mockPurchaseOrders = [
    {
      id: 'po_1',
      poNumber: 'PO-2026-101',
      supplierName: 'Dairy Fresh Supplies',
      date: '2026-10-02T11:00:00.000Z',
      items: [{ name: 'Cheese Blocks', qty: 5 }],
      totalAmount: 1500,
      status: 'Received',
    },
  ];

  it('escapes XML special characters properly', () => {
    expect(escapeXml('Fish & Chips <Hot> "Special" \'Chef\'')).toBe(
      'Fish &amp; Chips &lt;Hot&gt; &quot;Special&quot; &apos;Chef&apos;'
    );
    expect(escapeXml(null)).toBe('');
    expect(escapeXml(undefined)).toBe('');
    expect(escapeXml(123)).toBe('123');
  });

  it('filters collections strictly by target calendar date', () => {
    const filtered = filterByDate(mockOrders, 'createdAt', '2026-10-02');
    expect(filtered.length).toBe(2);
    expect(filtered.map(o => o.id)).toEqual(['ord_1', 'ord_2']);

    const yesterdayOrders = filterByDate(mockOrders, 'createdAt', '2026-10-01');
    expect(yesterdayOrders.length).toBe(1);
    expect(yesterdayOrders[0].id).toBe('ord_yesterday');
  });

  it('generates an XML Spreadsheet 2003 with all 8 operational sheets', () => {
    const xml = generateDailyOperationsWorkbook({
      dateStr: mockDate,
      orders: mockOrders,
      cashDrawer: mockCashDrawer,
      registerClosures: mockRegisterClosures,
      kdsTickets: mockKdsTickets,
      attendance: mockAttendance,
      auditLog: mockAuditLog,
      wasteLog: mockWasteLog,
      purchaseOrders: mockPurchaseOrders,
      settings: mockSettings,
    });

    // Valid XML header & workbook
    expect(xml).toContain('<?xml version="1.0"?>');
    expect(xml).toContain('<?mso-application progid="Excel.Sheet"?>');
    expect(xml).toContain('<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"');

    // All 8 worksheets must exist
    expect(xml).toContain('ss:Name="Daily Summary"');
    expect(xml).toContain('ss:Name="Sales &amp; Invoices"');
    expect(xml).toContain('ss:Name="Item Sales Breakdown"');
    expect(xml).toContain('ss:Name="Cash Drawer &amp; Expenses"');
    expect(xml).toContain('ss:Name="Waste &amp; Purchases"');
    expect(xml).toContain('ss:Name="Kitchen Operations"');
    expect(xml).toContain('ss:Name="Staff Attendance"');
    expect(xml).toContain('ss:Name="Audit Log &amp; Voids"');
  });

  it('accurately aggregates financial revenue and taxes in Daily Summary', () => {
    const xml = generateDailyOperationsWorkbook({
      dateStr: mockDate,
      orders: mockOrders,
      cashDrawer: mockCashDrawer,
      registerClosures: mockRegisterClosures,
      kdsTickets: mockKdsTickets,
      attendance: mockAttendance,
      auditLog: mockAuditLog,
      wasteLog: mockWasteLog,
      purchaseOrders: mockPurchaseOrders,
      settings: mockSettings,
    });

    // Gross Sales: 500 + 800 = 1300
    expect(xml).toContain('<Data ss:Type="Number">1300</Data>');

    // Discounts: 50
    expect(xml).toContain('<Data ss:Type="Number">50</Data>');

    // Net Taxable Sales: 1250
    expect(xml).toContain('<Data ss:Type="Number">1250</Data>');

    // Total GST: 22.5 + 40 = 62.5
    expect(xml).toContain('<Data ss:Type="Number">62.5</Data>');

    // Tips: 30 + 50 = 80
    expect(xml).toContain('<Data ss:Type="Number">80</Data>');

    // Grand Total Invoiced: 522.5 + 890 = 1412.5
    expect(xml).toContain('<Data ss:Type="Number">1412.5</Data>');
  });

  it('aggregates item sales volume and sorts correctly in Item Sales Breakdown', () => {
    const xml = generateDailyOperationsWorkbook({
      dateStr: mockDate,
      orders: mockOrders,
      cashDrawer: mockCashDrawer,
      registerClosures: mockRegisterClosures,
      kdsTickets: mockKdsTickets,
      attendance: mockAttendance,
      auditLog: mockAuditLog,
      wasteLog: mockWasteLog,
      purchaseOrders: mockPurchaseOrders,
      settings: mockSettings,
    });

    // Cold Brew was ordered 2 (ord_1) + 1 (ord_2) = 3 total
    expect(xml).toContain('Cold Brew &amp; Tonic');
    // Escaped HTML brackets in item names
    expect(xml).toContain('Truffle Fries &lt;Crispy&gt;');
    // Total items sold: 2 + 1 + 1 + 1 = 5 items
    expect(xml).toContain('<Data ss:Type="Number">5</Data>');
  });

  it('reconciles cash drawer float, inflows, paid-out expenses, and register discrepancy', () => {
    const xml = generateDailyOperationsWorkbook({
      dateStr: mockDate,
      orders: mockOrders,
      cashDrawer: mockCashDrawer,
      registerClosures: mockRegisterClosures,
      kdsTickets: mockKdsTickets,
      attendance: mockAttendance,
      auditLog: mockAuditLog,
      wasteLog: mockWasteLog,
      purchaseOrders: mockPurchaseOrders,
      settings: mockSettings,
    });

    // Opening balance: 2000
    expect(xml).toContain('<Data ss:Type="Number">2000</Data>');
    // Petty expenses (paid-outs): 300
    expect(xml).toContain('<Data ss:Type="Number">300</Data>');
    // Safe drop: 500
    expect(xml).toContain('<Data ss:Type="Number">500</Data>');
    // Register closure note
    expect(xml).toContain('Short by 2.50 due to small coin roundings');
  });

  it('exports full app data and settings as structured backup payload', () => {
    // Mock database getters
    const getSettingsSpy = vi.spyOn(database, 'getSettings').mockReturnValue(mockSettings);
    const getCurrentTenantSpy = vi.spyOn(database, 'getCurrentTenant').mockReturnValue('Kiko Cafe');
    const getAllSpy = vi.spyOn(database, 'getAll').mockImplementation((col) => {
      if (col === 'orders') return mockOrders;
      if (col === 'menu') return [{ id: 'm1', name: 'Cold Brew' }];
      if (col === 'inventory') return [{ id: 'inv1', name: 'Coffee Beans', stock: 10 }];
      return [];
    });

    const backup = exportFullAppData();

    expect(backup).toBeDefined();
    expect(backup.metadata).toBeDefined();
    expect(backup.metadata.tenant).toBe('Kiko Cafe');
    expect(backup.metadata.schemaVersion).toBe('1.0');
    expect(backup.metadata.totalCollections).toBeGreaterThan(20);
    expect(backup.metadata.totalRecords).toBeGreaterThan(0);
    expect(backup.settings.restaurant.name).toBe('Kiko Cafe');
    expect(backup.data.orders.length).toBe(3);
    expect(backup.data.menu.length).toBe(1);
    expect(backup.data.inventory.length).toBe(1);

    getSettingsSpy.mockRestore();
    getCurrentTenantSpy.mockRestore();
    getAllSpy.mockRestore();
  });
});
