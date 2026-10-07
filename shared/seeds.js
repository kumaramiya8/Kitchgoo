/**
 * Shared seed data + collection registry.
 * Imported by BOTH the browser data layer (src/db/database.js) and the
 * serverless API (api/), so it must stay free of env access and side effects.
 */

// Flexible collections persisted as tenant_data rows (one JSON blob per collection)
export const FLEX_COLLECTIONS = [
  'staff', 'delivery_orders', 'attendance', 'guests', 'kds_tickets',
  'reservations', 'waitlist', 'online_orders', 'suppliers', 'purchase_orders',
  'recipes', 'waste_log', 'locations', 'floor_plans', 'modifiers',
  'schedules', 'tip_pools', 'loyalty', 'campaigns', 'cash_drawer',
  'pos_tables', 'pos_saved_orders', 'register_closures', 'audit_log',
  'expenses', 'gift_cards',
];

// Relational tables with real columns
export const ROW_TABLES = ['users', 'menu', 'inventory', 'orders'];

export const DEFAULT_MODULES = {
  tableManagement: true,
  reservations: true,
  kds: true,
  delivery: true,
  onlineOrdering: true,
  qrAiOrdering: true,
  loyalty: true,
  campaigns: true,
  expenses: true,
  multiLocation: false,
  platformAdmin: false,
};

export const EXPENSE_CATEGORIES = [
  {
    id: 'rent_occupancy',
    name: 'Rent & Occupancy',
    icon: 'Building2',
    color: '#3b82f6',
    subcategories: ['Property Rent / Lease', 'CAM & Society Charges', 'Property Tax', 'Security Deposit'],
  },
  {
    id: 'utilities',
    name: 'Utilities',
    icon: 'Zap',
    color: '#f59e0b',
    subcategories: ['Electricity Bill', 'Commercial LPG Gas / Piped Gas', 'Water Supply', 'Wi-Fi & Broadband', 'Telephone'],
  },
  {
    id: 'staff_labor',
    name: 'Staff & Labor Overheads',
    icon: 'Users',
    color: '#8b5cf6',
    subcategories: ['Staff Bonuses & Incentives', 'Staff Overtime', 'Staff Meals & Groceries', 'Uniforms & Aprons', 'Security / Valet Contractor', 'Staff Welfare & First Aid'],
  },
  {
    id: 'inventory_cogs',
    name: 'Raw Materials & Inventory (COGS)',
    icon: 'Package',
    color: '#059669',
    subcategories: ['Supplier Purchase Orders', 'Fresh Produce & Vegetables', 'Dairy, Meat & Poultry', 'Dry Goods & Spices', 'Beverages & Syrups'],
  },
  {
    id: 'supplies_packaging',
    name: 'Supplies & Packaging',
    icon: 'Package',
    color: '#10b981',
    subcategories: ['Delivery Packaging Boxes & Bags', 'Disposable Cutlery & Straws', 'Cleaning Chemicals & Detergents', 'Kitchen Smallwares & Utensils', 'Glassware & Crockery Breakage', 'Thermal Paper Rolls'],
  },
  {
    id: 'repairs_maintenance',
    name: 'Repairs & Maintenance (AMC)',
    icon: 'Wrench',
    color: '#ec4899',
    subcategories: ['Exhaust / Chimney Duct Cleaning', 'Refrigeration & Deep Freezer AMC', 'Gas Burner & Oven Servicing', 'Plumbing & Drainage', 'Electrical Repairs', 'HVAC / AC Servicing'],
  },
  {
    id: 'marketing_advertising',
    name: 'Marketing & Technology',
    icon: 'Megaphone',
    color: '#6366f1',
    subcategories: ['Meta & Instagram Ads', 'Google Ads & Local SEO', 'Zomato & Swiggy Platform Ads', 'Food Photography & Menu Design', 'Influencer & PR', 'Software SaaS & Music Licenses', 'Print Flyers & Signboards'],
  },
  {
    id: 'compliance_legal',
    name: 'Legal, Taxes & Admin',
    icon: 'FileText',
    color: '#14b8a6',
    subcategories: ['FSSAI Food License Renewal', 'Trade License & Fire NOC', 'CA / Audit / Accounting Fees', 'Bank & Payment Gateway Charges', 'Music & Entertainment Licenses (PPL/IPRS)', 'Insurance Premiums'],
  },
  {
    id: 'petty_cash',
    name: 'Petty Cash & Daily Misc',
    icon: 'Wallet',
    color: '#64748b',
    subcategories: ['Emergency Dairy / Milk / Ice', 'Daily Delivery Fuel / Auto Fare', 'Emergency Hardware & Fasteners', 'Courier & Postal', 'Miscellaneous Sundry'],
  },
];

export function isModuleEnabled(modulesOrSettings, key) {
  if (!key) return true;
  const modules = (modulesOrSettings && typeof modulesOrSettings === 'object' && 'modules' in modulesOrSettings)
    ? modulesOrSettings.modules
    : modulesOrSettings;
  if (!modules || typeof modules !== 'object') {
    return DEFAULT_MODULES[key] ?? true;
  }
  if (modules[key] !== undefined) {
    return modules[key] === true;
  }
  return DEFAULT_MODULES[key] ?? true;
}

export const SEEDS = {
  settings: {
    restaurant: {
      name: 'Kitchgoo',
      tagline: 'A Fine Dining Experience',
      address: '12, MG Road, Bengaluru, Karnataka 560001',
      phone: '+91 80 1234 5678',
      email: 'hello@kitchgoo.in',
      gstin: '29AABCT1332L1ZY',
      fssai: '10012345678901',
      currency: '₹',
      timezone: 'Asia/Kolkata',
    },
    billing: {
      gstRate: 5,
      pricesIncludeGst: true,
      serviceCharge: 0,
      enableServiceCharge: false,
      roundingMode: 'nearest',
      billPrefix: 'INV',
      billStartNumber: 1001,
      receiptHeader: 'Thank you for visiting Kitchgoo!',
      receiptFooter: 'For feedback: feedback@kitchgoo.in',
      showGstBreakdown: true,
      autoGratuityEnabled: true,
      autoGratuityThreshold: 6,
      autoGratuityPercent: 18,
      autoGratuityPreTax: true,
    },
    payments: {
      cash: true,
      upi: true,
      card: true,
      wallet: false,
      onlineGateway: false,
      upiId: 'kitchgoo@upi',
      upiPayeeName: '',
      upiRemarks: '',
      showUpiQr: false,
      applePay: false,
      googlePay: false,
      qrPayAtTable: false,
    },
    delivery: {
      zomatoEnabled: false,
      zomatoApiKey: '',
      zomatoResId: '',
      swiggyEnabled: false,
      swiggyApiKey: '',
      swiggyResId: '',
      dunzoEnabled: false,
      uberEatsEnabled: false,
      doordashEnabled: false,
      grubhubEnabled: false,
      packagingCharge: 20,
      deliveryZones: [],
      inHouseDelivery: false,
    },
    operations: {
      tables: 20,
      openingTime: '09:00',
      closingTime: '23:00',
      workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      autoKOT: false,
      offlineMode: true,
      lowStockThreshold: 5,
      voidApprovalThreshold: 0,
      autoOpenCashDrawer: true,
      autoPrintReceipt: false,
      enhancedRegisterEnabled: false,
      mandatoryOpeningEnabled: false,
      autoCloseEnabled: false,
      autoCloseTime: '23:59',
      blockPaymentsIfPrevNotClosed: false,
      blockClosureIfOpenInvoices: true,
    },
    notifications: {
      lowStock: true,
      newDeliveryOrder: true,
      orderReady: true,
      dailySummary: false,
      emailAlerts: false,
      alertEmail: '',
      overtimeAlert: true,
    },
    printer: {
      kotPrinter: 'Default',
      billPrinter: 'Default',
      autoPrintKOT: false,
      autoPrintBill: false,
      paperSize: '80mm',
      copies: 1,
    },
    appearance: {
      theme: 'light',
      accentColor: '#1e5e4a',
      compactMode: false,
      language: 'en',
    },
    roles: [
      { id: 'owner',   name: 'Owner',   permissions: ['all'] },
      { id: 'manager', name: 'Manager', permissions: ['pos', 'inventory', 'staff', 'reports', 'menu', 'delivery', 'kds', 'reservations', 'guests', 'settings.view'] },
      { id: 'cashier', name: 'Cashier', permissions: ['pos', 'delivery', 'guests.view'] },
      { id: 'chef',    name: 'Chef',    permissions: ['inventory', 'menu', 'kds'] },
      { id: 'waiter',  name: 'Waiter',  permissions: ['pos', 'kds.view', 'reservations.view'] },
    ],
    modules: {
      ...DEFAULT_MODULES,
    },
    naming: {
      checks: 'Checks',
      servers: 'Servers',
      tables: 'Tables',
      guests: 'Guests',
    },
    receipt: {
      logo: '',
      headerText: 'Thank you for visiting!',
      footerText: 'For feedback: feedback@kitchgoo.in',
      showQR: false,
      tipSuggestions: [10, 15, 20],
    },
    subscription: {
      tier: 'pro',
      maxLocations: 5,
      smsCredits: 1000,
      smsUsed: 0,
      onlineOrderFeePercent: 2.5,
    },
    menuCategories: {
      categories: ['Starters', 'Main Course', 'Desserts', 'Beverages', 'Breads', 'Salads', 'Sides', 'Specials'],
      subcategories: {
        'Starters': ['Soup', 'Appetizer', 'Finger Food'],
        'Main Course': ['Curry', 'Rice', 'Noodles', 'Grill'],
        'Desserts': ['Cake', 'Ice Cream', 'Pastry', 'Traditional'],
        'Beverages': ['Hot', 'Cold', 'Alcoholic', 'Mocktail'],
        'Breads': ['Indian', 'Western'],
        'Salads': ['Green', 'Grain', 'Protein'],
        'Sides': ['Accompaniment', 'Extra'],
        'Specials': ['Chef Special', 'Seasonal']
      }
    }
  },

  staff: [],

  inventory: [],

  menu: [],

  orders:          [],
  delivery_orders: [],
  attendance:      [],
  users:           [],
  guests: [],

  kds_tickets: [],
  reservations: [],
  waitlist: [],
  online_orders: [],
  suppliers: [],
  purchase_orders: [],
  recipes: [],
  waste_log: [],
  locations: [],
  audit_log: [],
  floor_plans: {
    tables: Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      label: `Table ${i + 1}`,
      shape: i < 12 ? 'square' : i < 16 ? 'round' : 'bar',
      seats: i < 12 ? 4 : i < 16 ? 6 : 2,
      x: (i % 5) * 120 + 20,
      y: Math.floor(i / 5) * 120 + 20,
      section: i < 10 ? 'Main Dining' : i < 16 ? 'Private' : 'Bar',
      server: '',
    })),
    sections: ['Main Dining', 'Private', 'Bar', 'Patio'],
  },
  modifiers: [],
  schedules: [],
  tip_pools: [],
  loyalty: {
    enabled: true,
    pointsPerDollar: 1,
    pointsPerVisit: 10,
    redemptionRate: 100,
    tiers: [
      { name: 'Bronze', minPoints: 0, perks: 'Earn 1 point per ₹1 spent' },
      { name: 'Silver', minPoints: 200, perks: '5% discount on all orders' },
      { name: 'Gold', minPoints: 500, perks: '10% discount + free dessert on birthday' },
      { name: 'VIP', minPoints: 1000, perks: '15% discount + skip-the-line + hidden menu access' },
    ],
  },
  campaigns: [],
  cash_drawer: {
    openingBalance: 0,
    currentBalance: 0,
    drops: [],
    discrepancies: [],
    shiftStart: null,
    isClosed: true,
  },
  register_closures: [],
  pos_tables: [],
  pos_saved_orders: {},
  expenses: [],
  gift_cards: [],
};
