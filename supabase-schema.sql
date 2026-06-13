-- Kitchgoo — Relational Database Schema
-- ─────────────────────────────────────────────────────────────
-- Run this once in your Supabase project's SQL Editor:
--   https://supabase.com → your project → SQL Editor → New query
-- ─────────────────────────────────────────────────────────────

-- 1. Accounts Table (SaaS Tenants)
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'active',
    plan TEXT DEFAULT 'pro',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Users Table (Global logins, linked to accounts)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    avatar TEXT,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. Settings Table
CREATE TABLE IF NOT EXISTS settings (
    account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
    section_name TEXT NOT NULL,
    value JSONB NOT NULL,
    PRIMARY KEY (account_id, section_name)
);

-- 4. Menu Table (Relational items)
CREATE TABLE IF NOT EXISTS menu (
    id TEXT PRIMARY KEY,
    account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price NUMERIC NOT NULL,
    category TEXT NOT NULL,
    subcategory TEXT DEFAULT '',
    reporting_group TEXT DEFAULT 'Food Sales',
    type TEXT NOT NULL,
    active BOOLEAN DEFAULT true,
    description TEXT DEFAULT '',
    preparation_time INTEGER DEFAULT 15,
    station TEXT DEFAULT 'Main Kitchen',
    modifier_groups JSONB DEFAULT '[]'::jsonb,
    tax_group TEXT DEFAULT 'food',
    calories INTEGER,
    allergens JSONB DEFAULT '[]'::jsonb,
    dietary_labels JSONB DEFAULT '[]'::jsonb,
    cost_price NUMERIC,
    sold_86 BOOLEAN DEFAULT false,
    image TEXT DEFAULT '',
    price_tiers JSONB DEFAULT '{}'::jsonb,
    ingredients JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 5. Inventory Table (Relational stock)
CREATE TABLE IF NOT EXISTS inventory (
    id TEXT PRIMARY KEY,
    account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    stock NUMERIC NOT NULL,
    unit TEXT NOT NULL,
    min NUMERIC DEFAULT 5,
    cost NUMERIC DEFAULT 0,
    supplier TEXT DEFAULT '',
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 6. Orders Table (Relational transactions)
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
    bill_no TEXT NOT NULL,
    table_id INTEGER,
    items JSONB NOT NULL,
    subtotal NUMERIC NOT NULL,
    tax NUMERIC NOT NULL,
    tax_rate NUMERIC NOT NULL,
    service_charge NUMERIC NOT NULL,
    auto_gratuity NUMERIC NOT NULL,
    discount NUMERIC NOT NULL,
    comp NUMERIC NOT NULL,
    tip NUMERIC NOT NULL,
    total NUMERIC NOT NULL,
    payment_method TEXT NOT NULL,
    order_type TEXT NOT NULL,
    guest_id TEXT,
    guest_name TEXT DEFAULT '',
    server_id TEXT,
    server_name TEXT DEFAULT '',
    party_size INTEGER DEFAULT 1,
    status TEXT DEFAULT 'paid',
    void_reason TEXT DEFAULT '',
    comp_reason TEXT DEFAULT '',
    discount_reason TEXT DEFAULT '',
    course_firing JSONB DEFAULT '[]'::jsonb,
    timestamps JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 7. Flex Tenant Store Table (For other collections like waitlist, KDS tickets, reservations, staff, etc.)
CREATE TABLE IF NOT EXISTS tenant_data (
    account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
    collection_name TEXT NOT NULL,
    value JSONB NOT NULL,
    PRIMARY KEY (account_id, collection_name)
);

-- Indexes for performance & query speed
CREATE INDEX IF NOT EXISTS idx_users_account_id ON users(account_id);
CREATE INDEX IF NOT EXISTS idx_menu_account_id ON menu(account_id);
CREATE INDEX IF NOT EXISTS idx_inventory_account_id ON inventory(account_id);
CREATE INDEX IF NOT EXISTS idx_orders_account_id ON orders(account_id);
CREATE INDEX IF NOT EXISTS idx_tenant_data_account_id ON tenant_data(account_id);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_data ENABLE ROW LEVEL SECURITY;

-- Allow full public access policies for single-restaurant SaaS (to keep simplicity matching original design,
-- but scoped at tenant level when required/supported by client logins)
CREATE POLICY "accounts_public_access" ON accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "users_public_access" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "settings_public_access" ON settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "menu_public_access" ON menu FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "inventory_public_access" ON inventory FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "orders_public_access" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "tenant_data_public_access" ON tenant_data FOR ALL USING (true) WITH CHECK (true);

-- Enable Realtime Replication for tables that require real-time updates
-- (e.g. KDS ticket alerts, POS table/order updates, QR Menu orders)
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE menu;
ALTER PUBLICATION supabase_realtime ADD TABLE inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE settings;
ALTER PUBLICATION supabase_realtime ADD TABLE tenant_data;
