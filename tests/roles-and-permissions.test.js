import { describe, it, expect, vi } from 'vitest';
import { SEEDS } from '../shared/seeds';

// Mock AppContext and AuthContext for testing usePermissions
let mockSettings = null;
let mockUser = null;

vi.mock('../src/db/AppContext', () => ({
  useApp: () => ({ settings: mockSettings }),
}));

vi.mock('../src/db/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

import { usePermissions } from '../src/db/usePermissions';

describe('Roles and Permissions System', () => {
  it('grants Owner full access to every permission', () => {
    mockUser = { role: 'Owner' };
    mockSettings = { roles: [] };

    const can = usePermissions();
    expect(can('dashboard')).toBe(true);
    expect(can('settings')).toBe(true);
    expect(can('settings.view')).toBe(true);
    expect(can('non_existent_perm')).toBe(true);
  });

  it('allows customizing Manager permissions instead of hardcoding full access', () => {
    mockUser = { role: 'Manager' };
    mockSettings = {
      roles: [
        {
          id: 'manager',
          name: 'Manager',
          permissions: ['pos', 'reports'], // dashboard, inventory, settings disabled
        },
      ],
    };

    const can = usePermissions();
    expect(can('pos')).toBe(true);
    expect(can('reports')).toBe(true);
    expect(can('reports.export')).toBe(true); // prefix match
    expect(can('dashboard')).toBe(false);
    expect(can('inventory')).toBe(false);
    expect(can('settings')).toBe(false);
    expect(can('settings.view')).toBe(false);
  });

  it('allows disabling dashboard view for any role', () => {
    mockUser = { role: 'Cashier' };
    mockSettings = {
      roles: [
        {
          id: 'cashier',
          name: 'Cashier',
          permissions: ['pos'], // dashboard removed
        },
      ],
    };

    const canWithoutDashboard = usePermissions();
    expect(canWithoutDashboard('dashboard')).toBe(false);
    expect(canWithoutDashboard('pos')).toBe(true);

    // Now re-enable dashboard
    mockSettings = {
      roles: [
        {
          id: 'cashier',
          name: 'Cashier',
          permissions: ['dashboard', 'pos'],
        },
      ],
    };

    const canWithDashboard = usePermissions();
    expect(canWithDashboard('dashboard')).toBe(true);
    expect(canWithDashboard('pos')).toBe(true);
  });

  it('supports custom roles created in Settings', () => {
    mockUser = { role: 'Floor Supervisor' };
    mockSettings = {
      roles: [
        {
          id: 'floor_supervisor',
          name: 'Floor Supervisor',
          permissions: ['dashboard', 'pos', 'guests', 'reservations'],
        },
      ],
    };

    const can = usePermissions();
    expect(can('dashboard')).toBe(true);
    expect(can('pos')).toBe(true);
    expect(can('guests')).toBe(true);
    expect(can('reservations')).toBe(true);
    expect(can('inventory')).toBe(false);
    expect(can('reports')).toBe(false);
    expect(can('settings')).toBe(false);
  });

  it('prioritizes Settings -> Roles & Permissions over legacy stores', () => {
    mockUser = { role: 'Chef' };
    mockSettings = {
      roles: [
        {
          id: 'chef',
          name: 'Chef',
          permissions: ['kds', 'menu'], // inventory removed in Settings
        },
      ],
      rolePermissions: {
        Chef: ['kds', 'menu', 'inventory'], // old store still has inventory
      },
    };

    const can = usePermissions();
    expect(can('kds')).toBe(true);
    expect(can('menu')).toBe(true);
    expect(can('inventory')).toBe(false); // Settings take priority!
  });

  it('matches permission prefixes correctly', () => {
    mockUser = { role: 'Cashier' };
    mockSettings = {
      roles: [
        {
          id: 'cashier',
          name: 'Cashier',
          permissions: ['settings', 'reports'],
        },
      ],
    };

    const can = usePermissions();
    expect(can('settings.view')).toBe(true);
    expect(can('reports.export')).toBe(true);
  });

  it('has dashboard in default seed permissions for Manager and Cashier', () => {
    const roles = SEEDS.settings.roles;
    const manager = roles.find(r => r.name === 'Manager');
    const cashier = roles.find(r => r.name === 'Cashier');
    const chef = roles.find(r => r.name === 'Chef');

    expect(manager.permissions).toContain('dashboard');
    expect(cashier.permissions).toContain('dashboard');
    expect(chef.permissions).not.toContain('dashboard');
  });

  it('filters navigation items based on dashboard permission', () => {
    const navItems = [
      { name: 'Dashboard', path: '/', perm: 'dashboard' },
      { name: 'POS', path: '/pos', perm: 'pos' },
      { name: 'KDS', path: '/kds', perm: 'kds' },
    ];

    // Case 1: Dashboard disabled
    const canNoDash = (perm) => perm === 'pos';
    const visible1 = navItems.filter(item => !item.perm || canNoDash(item.perm));
    expect(visible1.map(i => i.name)).toEqual(['POS']);

    // Case 2: Dashboard enabled
    const canWithDash = (perm) => perm === 'dashboard' || perm === 'pos';
    const visible2 = navItems.filter(item => !item.perm || canWithDash(item.perm));
    expect(visible2.map(i => i.name)).toEqual(['Dashboard', 'POS']);
  });
});
