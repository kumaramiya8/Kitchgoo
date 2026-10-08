import { describe, it, expect } from 'vitest';
import { getDefaultLandingPath } from '../src/db/usePermissions';
import { SEEDS } from '../shared/seeds';

describe('Role-Based Dashboard Access & Permissions', () => {
  describe('getDefaultLandingPath()', () => {
    it('returns root "/" when user has dashboard permission', () => {
      const can = (perm) => perm === 'dashboard' || perm === 'pos';
      expect(getDefaultLandingPath(can, {})).toBe('/');
    });

    it('returns "/pos" for Waiter lacking dashboard permission', () => {
      const waiterPerms = new Set(['pos', 'reservations', 'guests']);
      const can = (perm) => waiterPerms.has(perm);
      expect(getDefaultLandingPath(can, {})).toBe('/pos');
    });

    it('returns "/kds" for Chef lacking dashboard permission', () => {
      const chefPerms = new Set(['kds', 'inventory', 'menu']);
      const can = (perm) => chefPerms.has(perm);
      expect(getDefaultLandingPath(can, { modules: { kds: true } })).toBe('/kds');
    });

    it('returns "/inventory" or "/menu" for Chef when KDS module is disabled', () => {
      const chefPerms = new Set(['kds', 'inventory', 'menu']);
      const can = (perm) => chefPerms.has(perm);
      expect(getDefaultLandingPath(can, { modules: { kds: false } })).toBe('/menu');
    });

    it('returns "/delivery" for Delivery role', () => {
      const can = (perm) => perm === 'delivery';
      expect(getDefaultLandingPath(can, { modules: { delivery: true } })).toBe('/delivery');
    });

    it('returns "/reservations" for Host role', () => {
      const can = (perm) => perm === 'reservations' || perm === 'guests';
      expect(getDefaultLandingPath(can, { modules: { reservations: true } })).toBe('/reservations');
    });

    it('falls back safely to "/attendance" for users with no modules or permissions', () => {
      const can = () => false;
      expect(getDefaultLandingPath(can, {})).toBe('/attendance');
    });

    it('handles non-function gracefully', () => {
      expect(getDefaultLandingPath(null, {})).toBe('/');
    });
  });

  describe('Seeds and Default Roles Configuration', () => {
    it('ensures seeds roles do not grant dashboard to waiter, chef, or cashier', () => {
      const roles = SEEDS.settings.roles;
      const waiter = roles.find(r => r.id === 'waiter');
      const chef = roles.find(r => r.id === 'chef');
      const cashier = roles.find(r => r.id === 'cashier');
      const manager = roles.find(r => r.id === 'manager');
      const owner = roles.find(r => r.id === 'owner');

      expect(waiter.permissions).not.toContain('dashboard');
      expect(chef.permissions).not.toContain('dashboard');
      expect(cashier.permissions).not.toContain('dashboard');
      expect(manager.permissions).toContain('dashboard');
      expect(owner.permissions).toContain('all');
    });
  });

  describe('Navigation Filtering for Dashboard', () => {
    const navItems = [
      { name: 'Dashboard', path: '/', perm: 'dashboard' },
      { name: 'POS & Billing', path: '/pos', perm: 'pos' },
      { name: 'Kitchen Display', path: '/kds', perm: 'kds' },
      { name: 'Attendance', path: '/attendance', perm: null },
    ];

    it('hides Dashboard item when can("dashboard") is false', () => {
      const waiterCan = (perm) => perm === 'pos';
      const visible = navItems.filter(item => !item.perm || waiterCan(item.perm));
      const visibleNames = visible.map(i => i.name);

      expect(visibleNames).not.toContain('Dashboard');
      expect(visibleNames).toContain('POS & Billing');
      expect(visibleNames).toContain('Attendance');
    });

    it('shows Dashboard item when can("dashboard") is true', () => {
      const managerCan = (perm) => ['dashboard', 'pos', 'kds'].includes(perm);
      const visible = navItems.filter(item => !item.perm || managerCan(item.perm));
      const visibleNames = visible.map(i => i.name);

      expect(visibleNames).toContain('Dashboard');
      expect(visibleNames).toContain('POS & Billing');
      expect(visibleNames).toContain('Kitchen Display');
      expect(visibleNames).toContain('Attendance');
    });
  });
});
