import { describe, it, expect } from 'vitest';
import { applyBootstrapPayload } from '../src/db/database';

function combineAdminAccounts(accounts = [], users = []) {
  const usersByAccount = {};
  (users || []).forEach(u => {
    const accId = u.account_id || u.accountId;
    if (!usersByAccount[accId]) usersByAccount[accId] = [];
    usersByAccount[accId].push(u);
  });

  const accountsList = [];
  const seenAccountIds = new Set();

  (accounts || []).forEach(acc => {
    const accId = acc.id || acc.name;
    seenAccountIds.add(String(accId).toLowerCase());
    const accUsers = usersByAccount[acc.id] || usersByAccount[acc.name] || [];
    const owner = accUsers.find(u => (u.role || '').toLowerCase() === 'owner') || accUsers[0] || null;

    accountsList.push({
      id: acc.id,
      name: acc.name || acc.id,
      restaurantName: acc.name || acc.id,
      ownerName: owner?.name || '',
      email: owner?.email || '',
      phone: owner?.phone || '',
      userId: owner?.id || '',
      status: acc.status || 'active',
      plan: acc.plan || 'pro',
      createdAt: acc.created_at || owner?.created_at || null,
      userCount: accUsers.length,
    });
  });

  Object.keys(usersByAccount).forEach(accId => {
    if (!seenAccountIds.has(String(accId).toLowerCase())) {
      const accUsers = usersByAccount[accId] || [];
      const owner = accUsers.find(u => (u.role || '').toLowerCase() === 'owner') || accUsers[0] || null;
      accountsList.push({
        id: accId,
        name: accId,
        restaurantName: accId,
        ownerName: owner?.name || '',
        email: owner?.email || '',
        phone: owner?.phone || '',
        userId: owner?.id || '',
        status: 'active',
        plan: 'pro',
        createdAt: owner?.created_at || null,
        userCount: accUsers.length,
      });
    }
  });

  accountsList.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return accountsList;
}

function filterTenantAccounts(accounts = [], search = '') {
  return accounts.filter(acc => {
    const name = (acc.restaurantName || acc.name || acc.id || '').toLowerCase();
    return name && name !== 'kitchgoo';
  }).filter(acc => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (acc.restaurantName || '').toLowerCase().includes(s) ||
      (acc.name || '').toLowerCase().includes(s) ||
      (acc.ownerName || '').toLowerCase().includes(s) ||
      (acc.email || '').toLowerCase().includes(s)
    );
  });
}

describe('Platform Admin Accounts Management', () => {
  const mockAccounts = [
    { id: 'kitchgoo', name: 'Kitchgoo', status: 'active', plan: 'platform' },
    { id: 'kiko_cafe', name: 'Kiko Cafe', status: 'active', plan: 'pro', created_at: '2026-10-01T10:00:00Z' },
    { id: 'tandoor_hub', name: 'Tandoor Hub', status: 'active', plan: 'enterprise', created_at: '2026-10-05T12:00:00Z' },
  ];

  const mockUsers = [
    { id: 'u_admin', account_id: 'kitchgoo', name: 'Super Admin', email: 'admin@kitchgoo.in', role: 'Owner' },
    { id: 'u_kiko_owner', account_id: 'kiko_cafe', name: 'Kiko Boss', email: 'owner@kikocafe.com', role: 'Owner', created_at: '2026-10-01T10:00:00Z' },
    { id: 'u_kiko_staff', account_id: 'kiko_cafe', name: 'Staff John', email: 'john@kikocafe.com', role: 'Cashier' },
    { id: 'u_tandoor_owner', account_id: 'tandoor_hub', name: 'Tandoor Chef', email: 'chef@tandoorhub.in', role: 'Owner', created_at: '2026-10-05T12:00:00Z' },
    // Account that only exists in users table
    { id: 'u_legacy', account_id: 'legacy_diner', name: 'Old Pete', email: 'pete@legacydiner.com', role: 'Owner', created_at: '2026-09-15T08:00:00Z' },
  ];

  it('combines accounts with owner user metadata and counts users', () => {
    const list = combineAdminAccounts(mockAccounts, mockUsers);
    expect(list).toHaveLength(4); // kitchgoo, kiko_cafe, tandoor_hub, legacy_diner

    const kiko = list.find(a => a.id === 'kiko_cafe');
    expect(kiko).toBeDefined();
    expect(kiko.ownerName).toBe('Kiko Boss');
    expect(kiko.email).toBe('owner@kikocafe.com');
    expect(kiko.userCount).toBe(2);

    const legacy = list.find(a => a.id === 'legacy_diner');
    expect(legacy).toBeDefined();
    expect(legacy.ownerName).toBe('Old Pete');
    expect(legacy.email).toBe('pete@legacydiner.com');
  });

  it('filters out the kitchgoo platform admin account from tenant list', () => {
    const combined = combineAdminAccounts(mockAccounts, mockUsers);
    const tenants = filterTenantAccounts(combined);

    expect(tenants).toHaveLength(3);
    expect(tenants.some(t => t.id === 'kitchgoo')).toBe(false);
    expect(tenants.map(t => t.id)).toEqual(
      expect.arrayContaining(['kiko_cafe', 'tandoor_hub', 'legacy_diner'])
    );
  });

  it('filters tenant accounts by search term (account name, owner, or email)', () => {
    const combined = combineAdminAccounts(mockAccounts, mockUsers);

    // Search by restaurant name
    const res1 = filterTenantAccounts(combined, 'kiko');
    expect(res1).toHaveLength(1);
    expect(res1[0].id).toBe('kiko_cafe');

    // Search by owner name
    const res2 = filterTenantAccounts(combined, 'Pete');
    expect(res2).toHaveLength(1);
    expect(res2[0].id).toBe('legacy_diner');

    // Search by email
    const res3 = filterTenantAccounts(combined, 'tandoorhub');
    expect(res3).toHaveLength(1);
    expect(res3[0].id).toBe('tandoor_hub');
  });

  it('applyBootstrapPayload rejects session responses that lack tenant data', () => {
    const sessionOnly = { success: true, user: { id: 'u1', restaurantName: 'Kitchgoo' } };
    expect(applyBootstrapPayload(sessionOnly)).toBe(false);
    expect(applyBootstrapPayload(null)).toBe(false);
    expect(applyBootstrapPayload({})).toBe(false);
  });
});
