/**
 * Kitchgoo — Relational Database Client & Adapter (Supabase & local Demo Mode)
 *
 * Architecture:
 *  • Core transactional tables (accounts, users, settings, menu, inventory, orders)
 *    are stored as standard database rows in Supabase.
 *  • Other supporting collections are stored in the flexible tenant_data table.
 *  • Front-end read operations remain synchronous by loading the active tenant's datasets
 *    into an in-memory cache (_cache) at login/switch.
 *  • Writes update the cache immediately and launch targeted SQL queries to Supabase.
 */

import { supabase } from '../lib/supabase';

export function genId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function getSessionUser() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('kitchgoo_session');
      if (saved) {
        return JSON.parse(saved);
      }
    }
  } catch {}
  return { id: 'system', name: 'System / Guest' };
}

const NS = 'kitchgoo_';

// Local Storage backup helpers for Demo Mode
function localBackup(key, value) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('kitchgoo_local_' + key, JSON.stringify(value));
    }
  } catch (e) {
    console.error('[DB] localBackup error:', e);
  }
}

function localRestore(key) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const data = window.localStorage.getItem('kitchgoo_local_' + key);
      return data ? JSON.parse(data) : undefined;
    }
  } catch (e) {
    console.error('[DB] localRestore error:', e);
  }
  return undefined;
}

// Hashing helper for admin seed
export const simpleHash = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash.toString(16);
};

// Check if we are running in local demo mode
function isDemoMode() {
  if (typeof window !== 'undefined') {
    return window.localStorage.getItem('kitchgoo_demo_mode') === 'true';
  }
  return true;
}

// In-memory cache — populated from Supabase or LocalStorage
const _cache = {};

let _currentTenant = 'Kitchgoo';

export function setCurrentTenant(tenant) {
  if (tenant) {
    _currentTenant = tenant;
  }
}

export function getCurrentTenant() {
  return _currentTenant;
}

export function getTenantCode(tenant) {
  if (!tenant) return 'KIT';
  const cleaned = tenant.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (cleaned.length >= 3) {
    let hash = 0;
    for (let i = 0; i < tenant.length; i++) {
      hash = (hash << 5) - hash + tenant.charCodeAt(i);
      hash |= 0;
    }
    const hashStr = Math.abs(hash).toString(36).toUpperCase();
    const prefix = cleaned.substring(0, 3);
    const suffix = hashStr.substring(0, 2);
    return `${prefix}${suffix}`;
  }
  return cleaned.padEnd(3, 'X');
}


// Generic Mapper helpers: CamelCase <--> snake_case
function toSnakeCase(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toSnakeCase);
  if (typeof obj !== 'object') return obj;
  
  const snake = {};
  for (const [key, value] of Object.entries(obj)) {
    let sKey = key.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/_([0-9])/, "_$1");
    if (key === 'sold86') sKey = 'sold_86';
    // If value is an array of objects or an object, convert recursively (excluding jsonb columns we want to keep raw)
    if (key !== 'items' && key !== 'modifierGroups' && key !== 'allergens' && key !== 'dietaryLabels' && key !== 'priceTiers' && key !== 'timestamps' && key !== 'courseFiring') {
      snake[sKey] = (typeof value === 'object' && value !== null) ? toSnakeCase(value) : value;
    } else {
      snake[sKey] = value;
    }
  }
  return snake;
}

function toCamelCase(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  if (typeof obj !== 'object') return obj;

  const camel = {};
  for (const [key, value] of Object.entries(obj)) {
    let cKey = key.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
    if (key === 'sold_86') cKey = 'sold86';
    if (key !== 'items' && key !== 'modifier_groups' && key !== 'allergens' && key !== 'dietary_labels' && key !== 'price_tiers' && key !== 'timestamps' && key !== 'course_firing') {
      camel[cKey] = (typeof value === 'object' && value !== null) ? toCamelCase(value) : value;
    } else {
      camel[cKey] = value;
    }
  }
  return camel;
}

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

  // New collections
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
};

// ─── Asynchronous Helper to load tenant data from Supabase ────
async function loadTenantDataFromSupabase(tenantName) {
  const collections = [
    'staff', 'delivery_orders', 'attendance', 'guests', 'kds_tickets',
    'reservations', 'waitlist', 'online_orders', 'suppliers', 'purchase_orders',
    'recipes', 'waste_log', 'locations', 'floor_plans', 'modifiers',
    'schedules', 'tip_pools', 'loyalty', 'campaigns', 'cash_drawer',
    'pos_tables', 'pos_saved_orders', 'register_closures'
  ];

  // Core tables queries
  const [menuRes, inventoryRes, ordersRes, settingsRes, flexRes] = await Promise.all([
    supabase.from('menu').select('*').eq('account_id', tenantName),
    supabase.from('inventory').select('*').eq('account_id', tenantName),
    supabase.from('orders').select('*').eq('account_id', tenantName),
    supabase.from('settings').select('*').eq('account_id', tenantName),
    supabase.from('tenant_data').select('*').eq('account_id', tenantName)
  ]);

  // Load menu
  _cache['menu'] = (menuRes.data || []).map(toCamelCase);

  // Load inventory
  _cache['inventory'] = (inventoryRes.data || []).map(toCamelCase);

  // Load orders
  _cache['orders'] = (ordersRes.data || []).map(toCamelCase);

  // Load settings (reassemble from section rows)
  const settingsObj = JSON.parse(JSON.stringify(SEEDS.settings));
  if (settingsRes.data && settingsRes.data.length > 0) {
    settingsRes.data.forEach(row => {
      settingsObj[row.section_name] = row.value;
    });
  }
  _cache['settings'] = settingsObj;

  // Load flex data collections with fallback seeds
  collections.forEach(col => {
    _cache[col] = SEEDS[col] || [];
  });
  if (flexRes.data && flexRes.data.length > 0) {
    flexRes.data.forEach(row => {
      _cache[row.collection_name] = row.value;
    });
  }
}

export async function syncTenantDataFromSupabase(tenantName) {
  if (!supabase || isDemoMode()) return;
  try {
    const collections = [
      'staff', 'delivery_orders', 'attendance', 'guests', 'kds_tickets',
      'reservations', 'waitlist', 'online_orders', 'suppliers', 'purchase_orders',
      'recipes', 'waste_log', 'locations', 'floor_plans', 'modifiers',
      'schedules', 'tip_pools', 'loyalty', 'campaigns', 'cash_drawer',
      'pos_tables', 'pos_saved_orders', 'register_closures'
    ];

    const [menuRes, inventoryRes, ordersRes, settingsRes, flexRes] = await Promise.all([
      supabase.from('menu').select('*').eq('account_id', tenantName),
      supabase.from('inventory').select('*').eq('account_id', tenantName),
      supabase.from('orders').select('*').eq('account_id', tenantName),
      supabase.from('settings').select('*').eq('account_id', tenantName),
      supabase.from('tenant_data').select('*').eq('account_id', tenantName)
    ]);

    if (menuRes.data) _cache['menu'] = menuRes.data.map(toCamelCase);
    if (inventoryRes.data) _cache['inventory'] = inventoryRes.data.map(toCamelCase);
    if (ordersRes.data) _cache['orders'] = ordersRes.data.map(toCamelCase);

    if (settingsRes.data && settingsRes.data.length > 0) {
      const settingsObj = JSON.parse(JSON.stringify(SEEDS.settings));
      settingsRes.data.forEach(row => {
        settingsObj[row.section_name] = row.value;
      });
      _cache['settings'] = settingsObj;
    }

    if (flexRes.data) {
      collections.forEach(col => {
        const found = flexRes.data.find(row => row.collection_name === col);
        if (found) {
          _cache[col] = found.value;
        }
      });
    }
  } catch (err) {
    console.error('[DB] syncTenantDataFromSupabase error:', err);
  }
}

// ─── Sanitization Helpers for Supabase Relational Tables ───────
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

function sanitizeUpdatePayload(table, data) {
  const tableColumns = {
    users: ['name', 'email', 'password', 'role', 'avatar', 'phone', 'accountId'],
    menu: ['name', 'price', 'category', 'subcategory', 'reportingGroup', 'type', 'active', 'description', 'preparationTime', 'station', 'modifierGroups', 'taxGroup', 'calories', 'allergens', 'dietaryLabels', 'costPrice', 'sold86', 'priceTiers', 'image', 'ingredients'],
    inventory: ['name', 'category', 'stock', 'unit', 'min', 'cost', 'supplier', 'lastUpdated'],
    orders: ['billNo', 'tableId', 'items', 'subtotal', 'tax', 'taxRate', 'serviceCharge', 'autoGratuity', 'discount', 'comp', 'tip', 'total', 'paymentMethod', 'orderType', 'guestId', 'guestName', 'serverId', 'serverName', 'partySize', 'status', 'voidReason', 'compReason', 'discountReason', 'courseFiring', 'timestamps']
  };


  const allowed = tableColumns[table];
  if (!allowed) return toSnakeCase(data);

  const filtered = {};
  for (const [key, value] of Object.entries(data)) {
    if (allowed.includes(key)) {
      filtered[key] = value;
    }
  }
  return toSnakeCase(filtered);
}

// ─── Init — load accounts and active user session ─────────
export async function initDB() {
  if (!supabase || isDemoMode()) {
    // Demo mode initialization
    const collections = [
      'settings', 'staff', 'inventory', 'menu', 'orders', 'delivery_orders',
      'attendance', 'users', 'guests', 'kds_tickets', 'reservations', 'waitlist',
      'online_orders', 'suppliers', 'purchase_orders', 'recipes', 'waste_log',
      'locations', 'audit_log', 'floor_plans', 'modifiers', 'schedules',
      'tip_pools', 'loyalty', 'campaigns', 'cash_drawer', 'register_closures'
    ];
    for (const col of collections) {
      const key = `Kitchgoo_${col}`;
      const localVal = localRestore(key);
      if (localVal !== undefined) {
        _cache[col] = localVal;
      } else {
        _cache[col] = SEEDS[col];
        localBackup(key, SEEDS[col]);
      }
    }
    _cache['users'] = localRestore('users') || [];
    if (_cache['users'].length === 0) {
      const defaultAdmin = {
        id: genId(),
        name: 'Admin',
        email: 'admin@kitchgoo.in',
        password: simpleHash('admin123'),
        role: 'Owner',
        avatar: 'A',
        restaurantName: 'Kitchgoo',
        createdAt: new Date().toISOString(),
      };
      _cache['users'] = [defaultAdmin];
      localBackup('users', _cache['users']);
    }
    _cache['bill_counter'] = localRestore('Kitchgoo_bill_counter') || 1001;
    return;
  }

  try {
    // 1. Load accounts and global users list
    const { data: accounts } = await supabase.from('accounts').select('*');
    const { data: users } = await supabase.from('users').select('*');
    
    _cache['accounts'] = accounts || [];
    _cache['users'] = (users || []).map(row => {
      const u = toCamelCase(row);
      u.restaurantName = u.accountId; // Keep frontend compatibility
      return u;
    });

    // 2. Ensure default Kitchgoo admin exists in the database
    let adminAccount = _cache['accounts'].find(a => a.name.toLowerCase() === 'kitchgoo');
    if (!adminAccount) {
      const newAcc = { id: 'Kitchgoo', name: 'Kitchgoo', status: 'active', plan: 'pro' };
      await supabase.from('accounts').insert(newAcc);
      _cache['accounts'].push(newAcc);
    }

    let adminUser = _cache['users'].find(u => u.email.toLowerCase() === 'admin@kitchgoo.in');
    if (!adminUser) {
      const newAdmin = {
        id: genId(),
        account_id: 'Kitchgoo',
        name: 'Admin',
        email: 'admin@kitchgoo.in',
        password: simpleHash('admin123'),
        role: 'Owner',
        avatar: 'A',
        created_at: new Date().toISOString()
      };
      await supabase.from('users').insert(newAdmin);
      const adminCamel = toCamelCase(newAdmin);
      adminCamel.restaurantName = adminCamel.accountId;
      _cache['users'].push(adminCamel);
    }

    // 3. Load active Kitchgoo tenant data into cache
    _currentTenant = 'Kitchgoo';
    await loadTenantDataFromSupabase('Kitchgoo');

  } catch (err) {
    console.error('[DB] initDB error:', err);
  }
}

// ─── Tenant DB Initializer ─────────────────────────────────
export async function initTenantDB(tenantName) {
  if (!tenantName) return;
  
  _currentTenant = tenantName;

  if (!supabase || isDemoMode()) {
    // Restore from localStorage under prefix, fallback to SEEDS
    const collections = [
      'settings', 'staff', 'inventory', 'menu', 'orders', 'delivery_orders',
      'attendance', 'guests', 'kds_tickets', 'reservations', 'waitlist',
      'online_orders', 'suppliers', 'purchase_orders', 'recipes', 'waste_log',
      'locations', 'floor_plans', 'modifiers', 'schedules',
      'tip_pools', 'loyalty', 'campaigns', 'cash_drawer',
      'pos_tables', 'pos_saved_orders', 'register_closures'
    ];
    for (const col of collections) {
      const key = `${tenantName}_${col}`;
      const localVal = localRestore(key);
      if (localVal !== undefined) {
        _cache[col] = localVal;
      } else {
        let val = JSON.parse(JSON.stringify(SEEDS[col] || []));
        if (col === 'settings') {
          val = {
            ...SEEDS.settings,
            restaurant: {
              ...SEEDS.settings.restaurant,
              name: tenantName,
              email: `contact@${tenantName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
            }
          };
        }
        _cache[col] = val;
        localBackup(key, val);
      }
    }
    _cache['bill_counter'] = localRestore(`${tenantName}_bill_counter`) || 1001;
    return;
  }

  try {
    // 1. Ensure account exists in the accounts table
    const { data: existingAccounts } = await supabase.from('accounts').select('*').eq('id', tenantName);
    if (!existingAccounts || existingAccounts.length === 0) {
      await supabase.from('accounts').insert({ id: tenantName, name: tenantName, status: 'active', plan: 'pro' });
    }

    // 2. Fetch all rows for this tenant
    await loadTenantDataFromSupabase(tenantName);

    // 3. If no settings sections exist, it's a new tenant! Seed standard templates
    const { data: existingSettings } = await supabase.from('settings').select('section_name').eq('account_id', tenantName);
    if (!existingSettings || existingSettings.length === 0) {
      console.log(`[DB] Seeding new tenant: ${tenantName}`);
      
      // Seed Settings
      const settingsObj = {
        ...SEEDS.settings,
        restaurant: {
          ...SEEDS.settings.restaurant,
          name: tenantName,
          email: `contact@${tenantName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
        }
      };
      
      const settingsPromises = Object.entries(settingsObj).map(([section, val]) =>
         supabase.from('settings').insert({ account_id: tenantName, section_name: section, value: val })
      );
      await Promise.all(settingsPromises);

      // Seed Menu
      const menuPromises = SEEDS.menu.map(item =>
        supabase.from('menu').insert(sanitizeInsertPayload('menu', { ...item, accountId: tenantName }))
      );
      await Promise.all(menuPromises);

      // Seed Inventory
      const invPromises = SEEDS.inventory.map(item =>
        supabase.from('inventory').insert(sanitizeInsertPayload('inventory', { ...item, accountId: tenantName }))
      );
      await Promise.all(invPromises);

      // Seed flex data
      const flexCollections = ['staff', 'suppliers', 'recipes', 'floor_plans', 'modifiers', 'tip_pools', 'loyalty', 'campaigns', 'cash_drawer', 'register_closures'];
      const flexPromises = flexCollections.map(col =>
        supabase.from('tenant_data').insert({ account_id: tenantName, collection_name: col, value: SEEDS[col] })
      );
      await Promise.all(flexPromises);

      // Reload tenant data to make sure cache holds seeded values
      await loadTenantDataFromSupabase(tenantName);
    }
  } catch (err) {
    console.error('[DB] initTenantDB error:', err);
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
  const newItem = { createdAt: new Date().toISOString(), ...data };
  if (!newItem.id || String(newItem.id).trim() === '') {
    newItem.id = genId();
  }
  
  if (collection === 'users') {
    newItem.accountId = newItem.restaurantName || 'Kitchgoo';
    newItem.restaurantName = newItem.accountId; // Keep compatibility
  }
  
  const items = getAll(collection);
  _cache[collection] = [...items, newItem];
  
  localBackup(`${_currentTenant}_${collection}`, _cache[collection]);
  
  if (supabase && !isDemoMode()) {
    try {
      if (collection === 'users') {
        const tenantName = newItem.restaurantName || 'Kitchgoo';
        const { data: existing, error: existErr } = await supabase.from('accounts').select('id').eq('id', tenantName);
        if (existErr) throw existErr;
        if (!existing || existing.length === 0) {
          const { error: accError } = await supabase.from('accounts').insert({ id: tenantName, name: tenantName, status: 'active', plan: 'pro' });
          if (accError) throw accError;
        }
        const { error: userError } = await supabase.from('users').insert(sanitizeInsertPayload('users', { ...newItem, accountId: tenantName }));
        if (userError) throw userError;
      } else if (collection === 'menu') {
        const { error: menuError } = await supabase.from('menu').insert(sanitizeInsertPayload('menu', { ...newItem, accountId: _currentTenant }));
        if (menuError) throw menuError;
      } else if (collection === 'inventory') {
        const { error: invError } = await supabase.from('inventory').insert(sanitizeInsertPayload('inventory', { ...newItem, accountId: _currentTenant }));
        if (invError) throw invError;
      } else if (collection === 'orders') {
        const { error: orderError } = await supabase.from('orders').insert(sanitizeInsertPayload('orders', { ...newItem, accountId: _currentTenant }));
        if (orderError) throw orderError;
      } else {
        const { error: tdError } = await supabase.from('tenant_data').upsert({
          account_id: _currentTenant,
          collection_name: collection,
          value: _cache[collection]
        });
        if (tdError) throw tdError;
      }
    } catch (err) {
      console.error(`[DB] Error inserting to ${collection}:`, err);
    }
  }

  if (collection !== 'audit_log') {
    try {
      const user = getSessionUser();
      const displayName = newItem.name || newItem.billNo || newItem.title || newItem.id;
      logAudit(
        `${collection}.create`,
        user.id,
        user.name,
        `Added new ${collection}: ${displayName}`
      ).catch(err => console.error('[DB] Failed to log insert audit:', err));
    } catch (e) {
      console.error('[DB] Insert audit logging error:', e);
    }
  }

  return newItem;
}

export async function update(collection, id, data) {
  const items = getAll(collection);
  let updatedItem = null;

  if (!Array.isArray(items)) {
    const updated = { ...items, ...data };
    _cache[collection] = updated;
    localBackup(`${_currentTenant}_${collection}`, updated);
    
    if (supabase && !isDemoMode()) {
      try {
        await supabase.from('tenant_data').upsert({
          account_id: _currentTenant,
          collection_name: collection,
          value: updated
        });
      } catch (err) {
        console.error(`[DB] Error updating non-array ${collection}:`, err);
      }
    }
    return updated;
  }

  const updated = items.map(i => {
    if (i.id === id) {
      updatedItem = { ...i, ...data, updatedAt: new Date().toISOString() };
      if (collection === 'users') {
        updatedItem.accountId = updatedItem.restaurantName || updatedItem.accountId || 'Kitchgoo';
        updatedItem.restaurantName = updatedItem.accountId;
      }
      return updatedItem;
    }
    return i;
  });

  _cache[collection] = updated;
  localBackup(`${_currentTenant}_${collection}`, updated);

  if (supabase && !isDemoMode() && updatedItem) {
    try {
      if (collection === 'users') {
        await supabase.from('users').update(sanitizeUpdatePayload('users', data)).eq('id', id);
      } else if (collection === 'menu') {
        await supabase.from('menu').update(sanitizeUpdatePayload('menu', data)).eq('id', id);
      } else if (collection === 'inventory') {
        await supabase.from('inventory').update(sanitizeUpdatePayload('inventory', data)).eq('id', id);
      } else if (collection === 'orders') {
        await supabase.from('orders').update(sanitizeUpdatePayload('orders', data)).eq('id', id);
      } else {
        await supabase.from('tenant_data').upsert({
          account_id: _currentTenant,
          collection_name: collection,
          value: updated
        });
      }
    } catch (err) {
      console.error(`[DB] Error updating ${collection}:`, err);
    }
  }
  return updatedItem;
}

export async function remove(collection, id) {
  const items = getAll(collection).filter(i => i.id !== id);
  _cache[collection] = items;
  localBackup(`${_currentTenant}_${collection}`, items);

  if (supabase && !isDemoMode()) {
    try {
      if (collection === 'users') {
        await supabase.from('users').delete().eq('id', id);
      } else if (collection === 'menu') {
        await supabase.from('menu').delete().eq('id', id);
      } else if (collection === 'inventory') {
        await supabase.from('inventory').delete().eq('id', id);
      } else if (collection === 'orders') {
        await supabase.from('orders').delete().eq('id', id);
      } else {
        await supabase.from('tenant_data').upsert({
          account_id: _currentTenant,
          collection_name: collection,
          value: items
        });
      }
    } catch (err) {
      console.error(`[DB] Error deleting from ${collection}:`, err);
    }
  }

  if (collection !== 'audit_log') {
    try {
      const user = getSessionUser();
      logAudit(
        `${collection}.delete`,
        user.id,
        user.name,
        `Deleted entry from ${collection} with ID: ${id}`
      ).catch(err => console.error('[DB] Failed to log delete audit:', err));
    } catch (e) {
      console.error('[DB] Delete audit logging error:', e);
    }
  }
}

export async function clearCollection(collection) {
  _cache[collection] = [];
  localBackup(`${_currentTenant}_${collection}`, []);

  if (supabase && !isDemoMode()) {
    try {
      if (collection === 'menu') {
        const { error } = await supabase.from('menu').delete().eq('account_id', _currentTenant);
        if (error) throw error;
      } else if (collection === 'inventory') {
        const { error } = await supabase.from('inventory').delete().eq('account_id', _currentTenant);
        if (error) throw error;
      } else if (collection === 'orders') {
        const { error } = await supabase.from('orders').delete().eq('account_id', _currentTenant);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('tenant_data').upsert({
          account_id: _currentTenant,
          collection_name: collection,
          value: []
        });
        if (error) throw error;
      }
    } catch (err) {
      console.error(`[DB] Error clearing ${collection}:`, err);
    }
  }
}

export async function setCollection(collection, data) {
  _cache[collection] = data;
  localBackup(`${_currentTenant}_${collection}`, data);

  if (supabase && !isDemoMode()) {
    try {
      let payload = data;
      const isGuestDevice = typeof window !== 'undefined' && !window.localStorage.getItem('kitchgoo_session');
      const guestTableId = typeof window !== 'undefined' ? window.sessionStorage.getItem('kitchgoo_guest_table') : null;

      if (isGuestDevice && guestTableId) {
        if (collection === 'pos_tables') {
          const { data: latestRow } = await supabase
            .from('tenant_data')
            .select('value')
            .eq('account_id', _currentTenant)
            .eq('collection_name', collection)
            .maybeSingle();

          if (latestRow && Array.isArray(latestRow.value)) {
            const dbTables = latestRow.value;
            payload = dbTables.map(dbTable => {
              if (String(dbTable.id) === String(guestTableId)) {
                const localTable = data.find(t => String(t.id) === String(guestTableId));
                return localTable || dbTable;
              }
              return dbTable;
            });
          }
        } else if (collection === 'pos_saved_orders') {
          const { data: latestRow } = await supabase
            .from('tenant_data')
            .select('value')
            .eq('account_id', _currentTenant)
            .eq('collection_name', collection)
            .maybeSingle();

          if (latestRow && latestRow.value && typeof latestRow.value === 'object' && !Array.isArray(latestRow.value)) {
            const dbOrders = latestRow.value;
            payload = { ...dbOrders };
            if (data[guestTableId]) {
              payload[guestTableId] = data[guestTableId];
            } else {
              delete payload[guestTableId];
            }
          }
        }
      }

      const { error } = await supabase.from('tenant_data').upsert({
        account_id: _currentTenant,
        collection_name: collection,
        value: payload
      });
      if (error) throw error;
      
      // Update cache and localStorage with the merged payload
      _cache[collection] = payload;
      localBackup(`${_currentTenant}_${collection}`, payload);
    } catch (err) {
      console.error(`[DB] Error setCollection ${collection}:`, err);
      throw err;
    }
  }

  if (collection !== 'audit_log') {
    try {
      const user = getSessionUser();
      logAudit(
        `${collection}.update`,
        user.id,
        user.name,
        `Updated collection: ${collection}`
      ).catch(err => console.error('[DB] Failed to log collection update audit:', err));
    } catch (e) {
      console.error('[DB] Collection audit logging error:', e);
    }
  }
}

// ─── Settings ───────────────────────────────────────────────
export function getSettings() {
  const current = _cache['settings'] || SEEDS.settings;
  if (!current.menuCategories) {
    current.menuCategories = SEEDS.settings.menuCategories;
  }
  return current;
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
  
  localBackup(`${_currentTenant}_settings`, updated);

  if (supabase && !isDemoMode()) {
    try {
      const { error } = await supabase.from('settings').upsert({
        account_id: _currentTenant,
        section_name: section,
        value: newSectionValue
      });
      if (error) throw error;
    } catch (err) {
      console.error('[DB] Error updating settings row:', err);
    }
  }

  try {
    const user = getSessionUser();
    logAudit(
      'settings.update',
      user.id,
      user.name,
      `Updated settings section: ${section}`
    ).catch(err => console.error('[DB] Failed to log settings update audit:', err));
  } catch (e) {
    console.error('[DB] Settings audit logging error:', e);
  }

  return updated;
}

// ─── Orders / Transactions ──────────────────────────────────
export async function createOrder(tableId, items, paymentMethod, extra = {}) {
  const bcKey = `${_currentTenant}_bill_counter`;
  const counter = (_cache['bill_counter'] = (localRestore(bcKey) || 1001));
  
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
    billNo: `${settings.billing.billPrefix}-${getTenantCode(_currentTenant)}-${counter}`,
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

  localBackup(`${_currentTenant}_orders`, newOrders);
  localBackup(bcKey, counter + 1);

  if (supabase && !isDemoMode()) {
    try {
      await Promise.all([
        supabase.from('orders').insert(toSnakeCase({ ...order, accountId: _currentTenant })),
        supabase.from('tenant_data').upsert({
          account_id: _currentTenant,
          collection_name: 'bill_counter',
          value: { counter: counter + 1 }
        })
      ]);
    } catch (err) {
      console.error('[DB] createOrder Supabase error:', err);
    }
  }

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
  const menu = getAll('menu');
  const inventory = getAll('inventory');
  const recipes = getAll('recipes');
  for (const orderItem of orderItems) {
    const menuItem = menu.find(m => m.name === orderItem.name);
    if (menuItem && menuItem.ingredients && menuItem.ingredients.length > 0) {
      for (const ing of menuItem.ingredients) {
        const invItem = inventory.find(i => i.id === ing.itemId);
        if (invItem) {
          const newStock = Math.max(0, invItem.stock - ing.qty * orderItem.qty);
          await update('inventory', invItem.id, {
            stock: newStock,
            status: computeStockStatus(newStock, invItem.min),
            lastUpdated: new Date().toISOString(),
          });
        }
      }
    } else {
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
  let ip = 'local';
  try {
    if (typeof window !== 'undefined') {
      if (!window.__clientIp) {
        const res = await fetch('https://api.ipify.org?format=json');
        const data = await res.json();
        if (data && data.ip) {
          window.__clientIp = data.ip;
        }
      }
      ip = window.__clientIp || 'local';
    }
  } catch (err) {
    console.warn('[DB] Failed to fetch public IP:', err);
  }

  return insert('audit_log', {
    action,
    userId,
    userName,
    details,
    timestamp: new Date().toISOString(),
    ip,
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
  
  localBackup(`${_currentTenant}_cash_drawer`, updated);

  if (supabase && !isDemoMode()) {
    try {
      await supabase.from('tenant_data').upsert({
        account_id: _currentTenant,
        collection_name: 'cash_drawer',
        value: updated
      });
    } catch (err) {
      console.error('[DB] Error updating cash drawer:', err);
    }
  }
  return updated;
}
