/**
 * Kitchgoo — Database Layer (Supabase backend)
 *
 * Architecture:
 *  • All collections are stored in a single Supabase table: kitchgoo_store (key, value jsonb).
 *  • initDB() fetches every row into an in-memory cache so reads stay synchronous.
 *  • Writes update the cache immediately (sync) then persist to Supabase (async).
 *  • Call initDB() once before rendering the app (see main.jsx).
 */

import { supabase } from '../lib/supabase';

const NS = 'kitchgoo_';

// In-memory cache — populated by initDB()
const _cache = {};

// Offline queue for syncing when connection restores
const _offlineQueue = [];
let _isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { _isOnline = true; flushOfflineQueue(); });
  window.addEventListener('offline', () => { _isOnline = false; });
}

async function flushOfflineQueue() {
  while (_offlineQueue.length > 0) {
    const { key, value } = _offlineQueue.shift();
    await dbUpsert(key, value);
  }
}

// ─── Low-level Supabase helpers ────────────────────────────

async function dbFetchAll() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('kitchgoo_store')
    .select('key, value');
  if (error) {
    console.error('[DB] fetch error:', error.message);
    return [];
  }
  return data || [];
}

async function dbUpsert(key, value) {
  if (!supabase) return;
  if (!_isOnline) {
    _offlineQueue.push({ key, value });
    return;
  }
  const { error } = await supabase
    .from('kitchgoo_store')
    .upsert({ key: NS + key, value, updated_at: new Date().toISOString() });
  if (error) console.error('[DB] write error:', error.message);
}

export const genId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// ─── Seed Data ─────────────────────────────────────────────
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
      cash: true,
      upi: true,
      card: true,
      wallet: false,
      onlineGateway: false,
      upiId: 'kitchgoo@upi',
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
      accentColor: '#7c3aed',
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
      tableManagement: true,
      reservations: true,
      kds: true,
      delivery: true,
      onlineOrdering: true,
      loyalty: true,
      campaigns: true,
      multiLocation: false,
      platformAdmin: false,
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
  },

  staff: [
    { id: genId(), name: 'Anil Kumar',   role: 'Manager', phone: '+91 98765 43210', status: 'active',   shift: 'Morning', salary: 25000, joinDate: '2023-01-15', pin: '1234', emergencyContact: '', emergencyPhone: '', documents: [], wageHistory: [], hoursThisWeek: 32 },
    { id: genId(), name: 'Priya Sharma', role: 'Cashier', phone: '+91 98765 43211', status: 'active',   shift: 'Evening', salary: 18000, joinDate: '2023-03-01', pin: '2345', emergencyContact: '', emergencyPhone: '', documents: [], wageHistory: [], hoursThisWeek: 28 },
    { id: genId(), name: 'Rahul Verma',  role: 'Chef',    phone: '+91 98765 43212', status: 'off-duty', shift: 'Morning', salary: 22000, joinDate: '2022-11-10', pin: '3456', emergencyContact: '', emergencyPhone: '', documents: [], wageHistory: [], hoursThisWeek: 0 },
    { id: genId(), name: 'Sneha Gupta',  role: 'Waiter',  phone: '+91 98765 43213', status: 'active',   shift: 'Evening', salary: 14000, joinDate: '2023-06-20', pin: '4567', emergencyContact: '', emergencyPhone: '', documents: [], wageHistory: [], hoursThisWeek: 36 },
  ],

  inventory: [
    { id: genId(), name: 'Tomatoes',      category: 'Vegetables', stock: 15, unit: 'kg', min: 10, cost: 30,  supplier: 'Raj Suppliers',  lastUpdated: new Date().toISOString() },
    { id: genId(), name: 'Onions',        category: 'Vegetables', stock: 8,  unit: 'kg', min: 15, cost: 25,  supplier: 'Raj Suppliers',  lastUpdated: new Date().toISOString() },
    { id: genId(), name: 'Basmati Rice',  category: 'Grains',     stock: 50, unit: 'kg', min: 20, cost: 80,  supplier: 'Grain House',    lastUpdated: new Date().toISOString() },
    { id: genId(), name: 'Chicken Breast',category: 'Meat',       stock: 5,  unit: 'kg', min: 10, cost: 250, supplier: 'Fresh Meats Co.',lastUpdated: new Date().toISOString() },
    { id: genId(), name: 'Paneer',        category: 'Dairy',      stock: 2,  unit: 'kg', min: 5,  cost: 180, supplier: 'Dairy Fresh',    lastUpdated: new Date().toISOString() },
    { id: genId(), name: 'Milk',          category: 'Dairy',      stock: 12, unit: 'L',  min: 10, cost: 55,  supplier: 'Dairy Fresh',    lastUpdated: new Date().toISOString() },
    { id: genId(), name: 'Cooking Oil',   category: 'Pantry',     stock: 25, unit: 'L',  min: 15, cost: 120, supplier: 'Pantry Plus',    lastUpdated: new Date().toISOString() },
    { id: genId(), name: 'Salt',          category: 'Pantry',     stock: 10, unit: 'kg', min: 5,  cost: 20,  supplier: 'Pantry Plus',    lastUpdated: new Date().toISOString() },
  ],

  menu: [
    { id: genId(), name: 'Paneer Tikka',  price: 250, category: 'Starters', subcategory: '', reportingGroup: 'Food Sales', type: 'Veg', active: true, description: 'Grilled paneer with spices', preparationTime: 15, station: 'Grill', modifierGroups: [], taxGroup: 'food', calories: 320, allergens: ['dairy'], dietaryLabels: ['vegetarian'], costPrice: 80, sold86: false, priceTiers: { regular: 250, happyHour: 200, delivery: 280 } },
    { id: genId(), name: 'Chicken Wings', price: 300, category: 'Starters', subcategory: '', reportingGroup: 'Food Sales', type: 'Non-Veg', active: true, description: 'Crispy spiced wings', preparationTime: 20, station: 'Grill', modifierGroups: [], taxGroup: 'food', calories: 450, allergens: [], dietaryLabels: [], costPrice: 120, sold86: false, priceTiers: { regular: 300, happyHour: 240, delivery: 330 } },
    { id: genId(), name: 'Butter Chicken', price: 450, category: 'Main Course', subcategory: '', reportingGroup: 'Food Sales', type: 'Non-Veg', active: true, description: 'Classic creamy tomato gravy', preparationTime: 25, station: 'Main Kitchen', modifierGroups: [], taxGroup: 'food', calories: 550, allergens: ['dairy'], dietaryLabels: [], costPrice: 150, sold86: false, priceTiers: { regular: 450, happyHour: 380, delivery: 490 } },
    { id: genId(), name: 'Garlic Naan',   price: 60,  category: 'Breads', subcategory: '', reportingGroup: 'Food Sales', type: 'Veg', active: true, description: 'Tandoor-baked naan with garlic', preparationTime: 10, station: 'Tandoor', modifierGroups: [], taxGroup: 'food', calories: 260, allergens: ['gluten'], dietaryLabels: ['vegetarian'], costPrice: 15, sold86: false, priceTiers: { regular: 60, happyHour: 60, delivery: 70 } },
    { id: genId(), name: 'Dal Makhani',   price: 350, category: 'Main Course', subcategory: '', reportingGroup: 'Food Sales', type: 'Veg', active: false, description: 'Slow-cooked black lentils', preparationTime: 30, station: 'Main Kitchen', modifierGroups: [], taxGroup: 'food', calories: 380, allergens: ['dairy'], dietaryLabels: ['vegetarian'], costPrice: 90, sold86: false, priceTiers: { regular: 350, happyHour: 280, delivery: 380 } },
    { id: genId(), name: 'Gulab Jamun',   price: 120, category: 'Desserts', subcategory: '', reportingGroup: 'Food Sales', type: 'Veg', active: true, description: '2 pcs with rabdi', preparationTime: 5, station: 'Dessert', modifierGroups: [], taxGroup: 'food', calories: 300, allergens: ['dairy', 'gluten'], dietaryLabels: ['vegetarian'], costPrice: 30, sold86: false, priceTiers: { regular: 120, happyHour: 100, delivery: 140 } },
    { id: genId(), name: 'Cold Coffee',   price: 150, category: 'Beverages', subcategory: 'Non-Alcoholic', reportingGroup: 'Beverage Sales', type: 'Veg', active: true, description: 'Blended iced coffee', preparationTime: 7, station: 'Bar', modifierGroups: [], taxGroup: 'food', calories: 200, allergens: ['dairy'], dietaryLabels: ['vegetarian'], costPrice: 40, sold86: false, priceTiers: { regular: 150, happyHour: 120, delivery: 170 } },
    { id: genId(), name: 'Veg Biryani',   price: 280, category: 'Main Course', subcategory: '', reportingGroup: 'Food Sales', type: 'Veg', active: true, description: 'Fragrant basmati with vegetables', preparationTime: 30, station: 'Main Kitchen', modifierGroups: [], taxGroup: 'food', calories: 480, allergens: [], dietaryLabels: ['vegetarian'], costPrice: 70, sold86: false, priceTiers: { regular: 280, happyHour: 220, delivery: 310 } },
  ],

  orders:          [],
  delivery_orders: [],
  attendance:      [],
  users:           [],
  guests: [
    { id: genId(), name: 'Arjun Mehta',    phone: '+91 98101 23456', email: 'arjun@email.com',   notes: 'Prefers window seat',  visitCount: 8,  totalSpend: 6200,  loyaltyPoints: 620,  loyaltyTier: 'Gold', tags: ['regular', 'wine-lover'], birthday: '1990-03-15', anniversary: '', lastVisit: '2026-03-28', avgSpend: 775, channel: 'dine-in' },
    { id: genId(), name: 'Sunita Rao',     phone: '+91 97200 34567', email: 'sunita@email.com',  notes: 'Vegetarian only',      visitCount: 5,  totalSpend: 3800,  loyaltyPoints: 380,  loyaltyTier: 'Silver', tags: ['vegetarian'], birthday: '1985-07-22', anniversary: '', lastVisit: '2026-03-25', avgSpend: 760, channel: 'dine-in' },
    { id: genId(), name: 'Karan Malhotra', phone: '+91 99300 45678', email: '',                  notes: '',                     visitCount: 2,  totalSpend: 1400,  loyaltyPoints: 140,  loyaltyTier: 'Bronze', tags: [], birthday: '', anniversary: '', lastVisit: '2026-03-20', avgSpend: 700, channel: 'delivery' },
    { id: genId(), name: 'Priya Kapoor',   phone: '+91 96400 56789', email: 'priya.k@email.com', notes: 'Birthday on Feb 14',   visitCount: 12, totalSpend: 10500, loyaltyPoints: 1050, loyaltyTier: 'VIP', tags: ['regular', 'birthday-feb'], birthday: '1992-02-14', anniversary: '', lastVisit: '2026-03-29', avgSpend: 875, channel: 'dine-in' },
  ],

  // New collections
  kds_tickets: [],
  reservations: [],
  waitlist: [],
  online_orders: [],
  suppliers: [
    { id: genId(), name: 'Raj Suppliers', contact: 'Raj Kumar', phone: '+91 98765 11111', email: 'raj@suppliers.in', address: 'APMC Market, Bengaluru', minOrder: 500, deliveryDays: ['Mon', 'Wed', 'Fri'], cutoffTime: '18:00', category: 'Vegetables', rating: 4.5 },
    { id: genId(), name: 'Grain House', contact: 'Suresh Patel', phone: '+91 98765 22222', email: 'grainhouse@email.in', address: 'Wholesale Market, Bengaluru', minOrder: 2000, deliveryDays: ['Tue', 'Thu'], cutoffTime: '16:00', category: 'Grains', rating: 4.2 },
    { id: genId(), name: 'Fresh Meats Co.', contact: 'Ahmed Khan', phone: '+91 98765 33333', email: 'freshmeats@email.in', address: 'Industrial Area, Bengaluru', minOrder: 3000, deliveryDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], cutoffTime: '14:00', category: 'Meat', rating: 4.8 },
    { id: genId(), name: 'Dairy Fresh', contact: 'Lakshmi Devi', phone: '+91 98765 44444', email: 'dairy@fresh.in', address: 'Milk Colony, Bengaluru', minOrder: 1000, deliveryDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], cutoffTime: '06:00', category: 'Dairy', rating: 4.6 },
  ],
  purchase_orders: [],
  recipes: [
    { id: genId(), name: 'Marinara Sauce', type: 'batch', yield: 5, yieldUnit: 'L', ingredients: [{ inventoryItem: 'Tomatoes', qty: 3, unit: 'kg' }, { inventoryItem: 'Cooking Oil', qty: 0.2, unit: 'L' }, { inventoryItem: 'Salt', qty: 0.05, unit: 'kg' }], instructions: 'Blend tomatoes, saute with oil and salt, simmer 30 mins', costPerUnit: 22 },
    { id: genId(), name: 'Butter Chicken Recipe', type: 'menu-item', menuItemName: 'Butter Chicken', yield: 1, yieldUnit: 'portion', ingredients: [{ inventoryItem: 'Chicken Breast', qty: 0.25, unit: 'kg' }, { inventoryItem: 'Tomatoes', qty: 0.3, unit: 'kg' }, { inventoryItem: 'Cooking Oil', qty: 0.05, unit: 'L' }, { inventoryItem: 'Onions', qty: 0.15, unit: 'kg' }], instructions: 'Marinate chicken, grill, prepare gravy, combine', costPerUnit: 150 },
  ],
  waste_log: [],
  locations: [
    { id: genId(), name: 'Kitchgoo - MG Road (HQ)', address: '12, MG Road, Bengaluru', status: 'active', isHQ: true, manager: 'Anil Kumar', phone: '+91 80 1234 5678', revenue: 850000, orders: 1200 },
  ],
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
  modifiers: [
    { id: genId(), name: 'Meat Temperature', required: true, items: [{ name: 'Rare', price: 0 }, { name: 'Medium Rare', price: 0 }, { name: 'Medium', price: 0 }, { name: 'Medium Well', price: 0 }, { name: 'Well Done', price: 0 }] },
    { id: genId(), name: 'Spice Level', required: false, items: [{ name: 'Mild', price: 0 }, { name: 'Medium', price: 0 }, { name: 'Hot', price: 0 }, { name: 'Extra Hot', price: 0 }] },
    { id: genId(), name: 'Add-ons', required: false, items: [{ name: 'Extra Cheese', price: 50 }, { name: 'Extra Gravy', price: 30 }, { name: 'Add Bacon', price: 80 }, { name: 'Add Avocado', price: 60 }] },
    { id: genId(), name: 'Choose Side', required: true, items: [{ name: 'Fries', price: 0 }, { name: 'Salad', price: 0 }, { name: 'Rice', price: 0 }, { name: 'Bread', price: 0 }], nested: { 'Salad': { name: 'Dressing', items: [{ name: 'Ranch', price: 0 }, { name: 'Caesar', price: 0 }, { name: 'Vinaigrette', price: 0 }] } } },
  ],
  schedules: [],
  tip_pools: [
    { id: genId(), name: 'Standard Tip Pool', rules: [{ role: 'Waiter', share: 70 }, { role: 'Chef', share: 15 }, { role: 'Cashier', share: 10 }, { role: 'Manager', share: 5 }] },
  ],
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
  campaigns: [
    { id: genId(), name: 'Birthday Special', type: 'birthday', status: 'active', message: 'Happy Birthday! Enjoy 20% off your meal today!', discount: 20, segment: 'all', sentCount: 45, openRate: 72 },
    { id: genId(), name: 'Win-Back Campaign', type: 'win-back', status: 'active', message: 'We miss you! Come back and get a free appetizer.', discount: 0, segment: 'inactive-30d', sentCount: 120, openRate: 34 },
  ],
  cash_drawer: {
    openingBalance: 5000,
    currentBalance: 5000,
    drops: [],
    discrepancies: [],
    shiftStart: new Date().toISOString(),
  },
};

// ─── Init — load all data from Supabase into cache ─────────
export async function initDB() {
  const rows = await dbFetchAll();

  // Populate cache from Supabase
  rows.forEach(row => {
    const shortKey = row.key.startsWith(NS) ? row.key.slice(NS.length) : row.key;
    _cache[shortKey] = row.value;
  });

  // Seed collections that don't exist in Supabase yet
  const collections = [
    'settings', 'staff', 'inventory', 'menu', 'orders', 'delivery_orders',
    'attendance', 'users', 'guests', 'kds_tickets', 'reservations', 'waitlist',
    'online_orders', 'suppliers', 'purchase_orders', 'recipes', 'waste_log',
    'locations', 'audit_log', 'floor_plans', 'modifiers', 'schedules',
    'tip_pools', 'loyalty', 'campaigns', 'cash_drawer',
  ];
  for (const col of collections) {
    if (_cache[col] === undefined) {
      _cache[col] = SEEDS[col];
      await dbUpsert(col, SEEDS[col]);
    }
  }

  if (_cache['bill_counter'] === undefined) {
    _cache['bill_counter'] = 1001;
    await dbUpsert('bill_counter', 1001);
  }

  // Self-heal: if roles got corrupted to a non-array, reset to seed
  const settings = _cache['settings'];
  if (settings && !Array.isArray(settings.roles)) {
    const fixed = { ...settings, roles: SEEDS.settings.roles };
    _cache['settings'] = fixed;
    await dbUpsert('settings', fixed);
  }
}

// ─── Generic Collection CRUD ────────────────────────────────
export function getAll(collection) {
  return _cache[collection] || [];
}

export function getById(collection, id) {
  const data = getAll(collection);
  if (Array.isArray(data)) return data.find(i => i.id === id) || null;
  return null;
}

export async function insert(collection, data) {
  const items = getAll(collection);
  if (!Array.isArray(items)) return data;
  const newItem = { id: genId(), createdAt: new Date().toISOString(), ...data };
  const updated = [...items, newItem];
  _cache[collection] = updated;
  await dbUpsert(collection, updated);
  return newItem;
}

export async function update(collection, id, data) {
  const items = getAll(collection);
  if (!Array.isArray(items)) {
    const updated = { ...items, ...data };
    _cache[collection] = updated;
    await dbUpsert(collection, updated);
    return updated;
  }
  const updated = items.map(i =>
    i.id === id ? { ...i, ...data, updatedAt: new Date().toISOString() } : i
  );
  _cache[collection] = updated;
  await dbUpsert(collection, updated);
  return updated.find(i => i.id === id);
}

export async function remove(collection, id) {
  const items = getAll(collection).filter(i => i.id !== id);
  _cache[collection] = items;
  await dbUpsert(collection, items);
}

export async function setCollection(collection, data) {
  _cache[collection] = data;
  await dbUpsert(collection, data);
}

// ─── Settings ───────────────────────────────────────────────
export function getSettings() {
  return _cache['settings'] || SEEDS.settings;
}

export async function updateSettings(section, data) {
  const settings = getSettings();
  const newSectionValue = Array.isArray(data)
    ? data
    : typeof data === 'object' && !Array.isArray(settings[section])
      ? { ...settings[section], ...data }
      : data;
  const updated = { ...settings, [section]: newSectionValue };
  _cache['settings'] = updated;
  await dbUpsert('settings', updated);
  return updated;
}

// ─── Orders ─────────────────────────────────────────────────
export async function createOrder(tableId, items, paymentMethod, extra = {}) {
  const counter = _cache['bill_counter'] || 1001;
  const settings = getSettings();
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const tax = subtotal * (settings.billing.gstRate / 100);
  const serviceCharge = settings.billing.enableServiceCharge
    ? subtotal * (settings.billing.serviceCharge / 100) : 0;

  let autoGratuity = 0;
  if (settings.billing.autoGratuityEnabled && extra.partySize >= (settings.billing.autoGratuityThreshold || 6)) {
    const base = settings.billing.autoGratuityPreTax ? subtotal : (subtotal + tax);
    autoGratuity = base * ((settings.billing.autoGratuityPercent || 18) / 100);
  }

  const discount = extra.discount || 0;
  const comp = extra.comp || 0;
  const tip = extra.tip || 0;
  const total = subtotal + tax + serviceCharge + autoGratuity - discount - comp + tip;

  const order = {
    id: genId(),
    billNo: `${settings.billing.billPrefix}-${counter}`,
    tableId,
    items,
    subtotal,
    tax,
    taxRate: settings.billing.gstRate,
    serviceCharge,
    autoGratuity,
    discount,
    comp,
    tip,
    total,
    paymentMethod,
    orderType: extra.orderType || 'dine-in',
    guestId: extra.guestId || null,
    guestName: extra.guestName || '',
    serverId: extra.serverId || null,
    serverName: extra.serverName || '',
    partySize: extra.partySize || 1,
    status: 'paid',
    voidReason: '',
    compReason: '',
    discountReason: '',
    courseFiring: extra.courseFiring || [],
    timestamps: {
      ordered: new Date().toISOString(),
      ticketPrinted: null,
      foodBumped: null,
      paid: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
  };

  const newOrders = [...getAll('orders'), order];
  _cache['orders'] = newOrders;
  _cache['bill_counter'] = counter + 1;

  await Promise.all([
    dbUpsert('orders', newOrders),
    dbUpsert('bill_counter', counter + 1),
  ]);

  return order;
}

export function getOrdersByDate(dateStr) {
  return getAll('orders').filter(o => o.createdAt.startsWith(dateStr));
}

export function getTodayStats() {
  const today = new Date().toISOString().split('T')[0];
  const todayOrders = getOrdersByDate(today);
  const gross = todayOrders.reduce((s, o) => s + o.total, 0);
  const orderCount = todayOrders.length;
  const avg = orderCount > 0 ? gross / orderCount : 0;
  const tips = todayOrders.reduce((s, o) => s + (o.tip || 0), 0);
  const comps = todayOrders.reduce((s, o) => s + (o.comp || 0), 0);
  const discounts = todayOrders.reduce((s, o) => s + (o.discount || 0), 0);
  return { gross, orderCount, avg, tips, comps, discounts, orders: todayOrders };
}

// ─── Inventory Helpers ───────────────────────────────────────
export function computeStockStatus(stock, min) {
  if (stock <= 0) return 'critical';
  if (stock < min * 0.5) return 'critical';
  if (stock < min) return 'low';
  return 'good';
}

export async function receiveStock(id, quantity) {
  const item = getById('inventory', id);
  if (!item) return null;
  const newStock = item.stock + quantity;
  return update('inventory', id, {
    stock: newStock,
    status: computeStockStatus(newStock, item.min),
    lastUpdated: new Date().toISOString(),
  });
}

export async function depleteInventoryForOrder(orderItems) {
  const recipes = getAll('recipes');
  const inventory = getAll('inventory');
  for (const orderItem of orderItems) {
    const recipe = recipes.find(r => r.menuItemName === orderItem.name);
    if (recipe) {
      for (const ing of recipe.ingredients) {
        const invItem = inventory.find(i => i.name === ing.inventoryItem);
        if (invItem) {
          const newStock = Math.max(0, invItem.stock - ing.qty * orderItem.qty);
          await update('inventory', invItem.id, {
            stock: newStock,
            status: computeStockStatus(newStock, invItem.min),
            lastUpdated: new Date().toISOString(),
          });
        }
      }
    }
  }
}

// ─── Attendance ──────────────────────────────────────────────
export async function logAttendance(staffId, type) {
  return insert('attendance', {
    staffId,
    type,
    timestamp: new Date().toISOString(),
    date: new Date().toISOString().split('T')[0],
  });
}

export function getAttendanceForStaff(staffId) {
  return getAll('attendance').filter(a => a.staffId === staffId);
}

// ─── Delivery Orders ─────────────────────────────────────────
export async function addDeliveryOrder(order) {
  return insert('delivery_orders', { ...order, status: order.status || 'new' });
}

export async function updateDeliveryStatus(id, status) {
  return update('delivery_orders', id, { status });
}

// ─── KDS Tickets ─────────────────────────────────────────────
export async function createKDSTicket(orderId, items, tableId, orderType) {
  return insert('kds_tickets', {
    orderId,
    items: items.map(i => ({ ...i, status: 'pending', bumpedAt: null })),
    tableId,
    orderType: orderType || 'dine-in',
    status: 'active',
    station: 'all',
    priority: 'normal',
    allergyAlert: items.some(i => i.allergens?.length > 0),
    allergens: items.flatMap(i => i.allergens || []),
    courseFiring: [],
    firedAt: new Date().toISOString(),
  });
}

export async function bumpKDSItem(ticketId, itemIndex) {
  const ticket = getById('kds_tickets', ticketId);
  if (!ticket) return;
  const items = [...ticket.items];
  items[itemIndex] = { ...items[itemIndex], status: 'bumped', bumpedAt: new Date().toISOString() };
  const allBumped = items.every(i => i.status === 'bumped');
  return update('kds_tickets', ticketId, { items, status: allBumped ? 'completed' : 'active' });
}

export async function bumpKDSTicket(ticketId) {
  const ticket = getById('kds_tickets', ticketId);
  if (!ticket) return;
  const items = ticket.items.map(i => ({ ...i, status: 'bumped', bumpedAt: new Date().toISOString() }));
  return update('kds_tickets', ticketId, { items, status: 'completed' });
}

export async function recallKDSTicket(ticketId) {
  return update('kds_tickets', ticketId, { status: 'active' });
}

// ─── Reservations ────────────────────────────────────────────
export async function createReservation(data) {
  return insert('reservations', {
    ...data,
    status: 'confirmed',
    smsStatus: 'sent',
  });
}

export async function addToWaitlist(data) {
  return insert('waitlist', {
    ...data,
    status: 'waiting',
    addedAt: new Date().toISOString(),
    notifiedAt: null,
  });
}

// ─── Audit Log ───────────────────────────────────────────────
export async function logAudit(action, userId, userName, details) {
  return insert('audit_log', {
    action,
    userId,
    userName,
    details,
    timestamp: new Date().toISOString(),
    ip: 'local',
  });
}

// ─── Waste Log ───────────────────────────────────────────────
export async function logWaste(data) {
  return insert('waste_log', {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

// ─── Cash Drawer ─────────────────────────────────────────────
export async function updateCashDrawer(data) {
  const current = getAll('cash_drawer') || SEEDS.cash_drawer;
  const updated = { ...current, ...data };
  _cache['cash_drawer'] = updated;
  await dbUpsert('cash_drawer', updated);
  return updated;
}
