/**
 * Kitchgoo — Relational Database Seeding Script
 * Seeds the platform admin "Kitchgoo" account and default datasets.
 * Run: node migrate-db.mjs
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || 'https://vokfkqzyocguxiaqnjhw.supabase.co';
const key = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZva2ZrcXp5b2NndXhpYXFuamh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMjM5OTMsImV4cCI6MjA4OTg5OTk5M30.7AAAafUY__yZGTa7xAntqsTbJBsUNxEIQ4axSVt1ecs';

const supabase = createClient(url, key);

const genId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const simpleHash = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash.toString(16);
};

// Generic Mapper helpers: CamelCase <--> snake_case
function toSnakeCase(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toSnakeCase);
  if (typeof obj !== 'object') return obj;
  
  const snake = {};
  for (const [key, value] of Object.entries(obj)) {
    let sKey = key.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/_([0-9])/, "_$1");
    if (key === 'sold86') sKey = 'sold_86';
    if (key !== 'items' && key !== 'modifierGroups' && key !== 'allergens' && key !== 'dietaryLabels' && key !== 'priceTiers' && key !== 'timestamps' && key !== 'courseFiring') {
      snake[sKey] = (typeof value === 'object' && value !== null) ? toSnakeCase(value) : value;
    } else {
      snake[sKey] = value;
    }
  }
  return snake;
}

function sanitizeInsertPayload(table, data) {
  const tableColumns = {
    users: ['id', 'accountId', 'name', 'email', 'password', 'role', 'avatar', 'phone', 'createdAt'],
    menu: ['id', 'accountId', 'name', 'price', 'category', 'subcategory', 'reportingGroup', 'type', 'active', 'description', 'preparationTime', 'station', 'modifierGroups', 'taxGroup', 'calories', 'allergens', 'dietaryLabels', 'costPrice', 'sold86', 'priceTiers', 'image', 'ingredients', 'createdAt'],
    inventory: ['id', 'accountId', 'name', 'category', 'stock', 'unit', 'min', 'cost', 'supplier', 'lastUpdated'],
    orders: ['id', 'accountId', 'billNo', 'tableId', 'items', 'subtotal', 'tax', 'taxRate', 'serviceCharge', 'autoGratuity', 'discount', 'comp', 'tip', 'total', 'paymentMethod', 'orderType', 'guestId', 'guestName', 'serverId', 'serverName', 'partySize', 'status', 'voidReason', 'compReason', 'discountReason', 'courseFiring', 'timestamps', 'createdAt']
  };

  const allowed = tableColumns[table];
  if (!allowed) return toSnakeCase(data);

  const filtered = {};
  for (const key of allowed) {
    if (data[key] !== undefined) {
      filtered[key] = data[key];
    }
  }
  return toSnakeCase(filtered);
}

// ─── Full Seed Data (matches database.js SEEDS) ──────────────

const SEEDS = {
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
      cash: true, upi: true, card: true, wallet: false,
      onlineGateway: false, upiId: 'kitchgoo@upi',
      upiPayeeName: '', upiRemarks: '', showUpiQr: false,
      applePay: false, googlePay: false, qrPayAtTable: false,
    },
    delivery: {
      zomatoEnabled: false, zomatoApiKey: '', zomatoResId: '',
      swiggyEnabled: false, swiggyApiKey: '', swiggyResId: '',
      dunzoEnabled: false, uberEatsEnabled: false, doordashEnabled: false, grubhubEnabled: false,
      packagingCharge: 20, deliveryZones: [], inHouseDelivery: false,
    },
    operations: {
      tables: 20, openingTime: '09:00', closingTime: '23:00',
      workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      autoKOT: false, offlineMode: true, lowStockThreshold: 5,
      voidApprovalThreshold: 0, autoOpenCashDrawer: true, autoPrintReceipt: false,
    },
    notifications: {
      lowStock: true, newDeliveryOrder: true, orderReady: true,
      dailySummary: false, emailAlerts: false, alertEmail: '', overtimeAlert: true,
    },
    printer: {
      kotPrinter: 'Default', billPrinter: 'Default',
      autoPrintKOT: false, autoPrintBill: false, paperSize: '80mm', copies: 1,
    },
    appearance: { theme: 'light', accentColor: '#7c3aed', compactMode: false, language: 'en' },
    roles: [
      { id: 'owner', name: 'Owner', permissions: ['all'] },
      { id: 'manager', name: 'Manager', permissions: ['pos', 'inventory', 'staff', 'reports', 'menu', 'delivery', 'kds', 'reservations', 'guests', 'settings.view'] },
      { id: 'cashier', name: 'Cashier', permissions: ['pos', 'delivery', 'guests.view'] },
      { id: 'chef', name: 'Chef', permissions: ['inventory', 'menu', 'kds'] },
      { id: 'waiter', name: 'Waiter', permissions: ['pos', 'kds.view', 'reservations.view'] },
    ],
    modules: {
      tableManagement: true, reservations: true, kds: true, delivery: true,
      onlineOrdering: true, loyalty: true, campaigns: true, multiLocation: false, platformAdmin: false,
    },
    naming: { checks: 'Checks', servers: 'Servers', tables: 'Tables', guests: 'Guests' },
    receipt: {
      logo: '', headerText: 'Thank you for visiting!',
      footerText: 'For feedback: feedback@kitchgoo.in',
      showQR: false, tipSuggestions: [10, 15, 20],
    },
    subscription: {
      tier: 'pro', maxLocations: 5, smsCredits: 1000, smsUsed: 0, onlineOrderFeePercent: 2.5,
    },
  },

  staff: [],

  inventory: [],

  menu: [],

  guests: [],

  suppliers: [],
  recipes: [],

  modifiers: [],

  tip_pools: [],

  loyalty: {
    enabled: true, pointsPerDollar: 1, pointsPerVisit: 10, redemptionRate: 100,
    tiers: [
      { name: 'Bronze', minPoints: 0, perks: 'Earn 1 point per ₹1 spent' },
      { name: 'Silver', minPoints: 200, perks: '5% discount on all orders' },
      { name: 'Gold', minPoints: 500, perks: '10% discount + free dessert on birthday' },
      { name: 'VIP', minPoints: 1000, perks: '15% discount + skip-the-line + hidden menu access' },
    ],
  },

  campaigns: [],

  locations: [],

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

  cash_drawer: {
    openingBalance: 0, currentBalance: 0,
    drops: [], discrepancies: [], shiftStart: null, isClosed: true,
  },
  register_closures: [],

  // Reset empty collections
  orders: [],
  delivery_orders: [],
  attendance: [],
  kds_tickets: [],
  reservations: [],
  waitlist: [],
  online_orders: [],
  purchase_orders: [],
  waste_log: [],
  audit_log: [],
  schedules: [],
};

async function migrate() {
  console.log('🔄 Starting Kitchgoo relational database seeding...\n');

  // 1. Check if the accounts table exists (sanity check)
  const { error: testError } = await supabase.from('accounts').select('id').limit(1);
  if (testError) {
    console.error('❌ Error connecting to "accounts" table. Have you run the SQL schema in the Supabase editor?');
    console.error('Error details:', testError.message);
    process.exit(1);
  }

  console.log('🧹 Cleaning existing data for tenant "Kitchgoo"...');
  
  // Delete "Kitchgoo" user/records so we can seed fresh
  const { error: deleteError } = await supabase.from('accounts').delete().eq('id', 'Kitchgoo');
  if (deleteError) {
    console.warn('⚠️  Could not clean up tenant "Kitchgoo" (it might not exist yet):', deleteError.message);
  } else {
    console.log('  ✅ Cleaned up existing "Kitchgoo" tenant rows.');
  }

  // 2. Insert Kitchgoo account
  console.log('🌱 Seeding "Kitchgoo" tenant...');
  const { error: accError } = await supabase.from('accounts').insert({
    id: 'Kitchgoo',
    name: 'Kitchgoo',
    status: 'active',
    plan: 'pro'
  });
  if (accError) {
    console.error('❌ Failed to create Kitchgoo account:', accError.message);
    process.exit(1);
  }
  console.log('  ✅ Created Kitchgoo tenant account.');

  // 3. Insert Admin user
  const adminUser = {
    id: 'admin_seed_user',
    accountId: 'Kitchgoo',
    name: 'Admin',
    email: 'admin@kitchgoo.in',
    password: simpleHash('admin123'),
    role: 'Owner',
    avatar: 'A',
    phone: '',
    createdAt: new Date().toISOString()
  };
  const { error: userError } = await supabase.from('users').insert(sanitizeInsertPayload('users', adminUser));
  if (userError) {
    console.error('❌ Failed to create admin user:', userError.message);
    process.exit(1);
  }
  console.log('  ✅ Created admin user (admin@kitchgoo.in / admin123).');

  // 4. Seed Settings section by section
  console.log('⚙️  Seeding Kitchgoo Settings...');
  const settingsPromises = Object.entries(SEEDS.settings).map(([section, val]) =>
    supabase.from('settings').insert({
      account_id: 'Kitchgoo',
      section_name: section,
      value: val
    })
  );
  const settingsResults = await Promise.all(settingsPromises);
  const settingsFail = settingsResults.find(r => r.error);
  if (settingsFail) {
    console.error('❌ Failed to seed settings:', settingsFail.error.message);
    process.exit(1);
  }
  console.log('  ✅ Settings seeded successfully.');

  // 5. Seed Menu items
  console.log('🍔 Seeding Kitchgoo Menu...');
  const menuPromises = SEEDS.menu.map(item =>
    supabase.from('menu').insert(sanitizeInsertPayload('menu', { ...item, accountId: 'Kitchgoo' }))
  );
  const menuResults = await Promise.all(menuPromises);
  const menuFail = menuResults.find(r => r.error);
  if (menuFail) {
    console.error('❌ Failed to seed menu:', menuFail.error.message);
    process.exit(1);
  }
  console.log(`  ✅ Menu seeded successfully (${SEEDS.menu.length} items).`);

  // 6. Seed Inventory items
  console.log('📦 Seeding Kitchgoo Inventory...');
  const invPromises = SEEDS.inventory.map(item =>
    supabase.from('inventory').insert(sanitizeInsertPayload('inventory', { ...item, accountId: 'Kitchgoo' }))
  );
  const invResults = await Promise.all(invPromises);
  const invFail = invResults.find(r => r.error);
  if (invFail) {
    console.error('❌ Failed to seed inventory:', invFail.error.message);
    process.exit(1);
  }
  console.log(`  ✅ Inventory seeded successfully (${SEEDS.inventory.length} items).`);

  // 7. Seed tenant_data flex collections
  console.log('📂 Seeding Kitchgoo supporting collections in tenant_data...');
  const flexCollections = [
    'staff', 'guests', 'suppliers', 'recipes', 'floor_plans',
    'modifiers', 'tip_pools', 'loyalty', 'campaigns', 'cash_drawer',
    'kds_tickets', 'reservations', 'waitlist', 'online_orders', 'purchase_orders',
    'waste_log', 'audit_log', 'schedules', 'orders', 'delivery_orders', 'attendance', 'register_closures'
  ];
  const flexPromises = flexCollections.map(col =>
    supabase.from('tenant_data').insert({
      account_id: 'Kitchgoo',
      collection_name: col,
      value: SEEDS[col] || []
    })
  );
  
  // also seed bill_counter as 1001
  flexPromises.push(supabase.from('tenant_data').insert({
    account_id: 'Kitchgoo',
    collection_name: 'bill_counter',
    value: { counter: 1001 }
  }));

  const flexResults = await Promise.all(flexPromises);
  const flexFail = flexResults.find(r => r.error);
  if (flexFail) {
    console.error('❌ Failed to seed tenant_data:', flexFail.error.message);
    process.exit(1);
  }
  console.log(`  ✅ Supporting collections seeded successfully (${flexCollections.length} tables).`);

  console.log('\n🎉 Relational database seeding complete! "Kitchgoo" tenant is fully set up.');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
