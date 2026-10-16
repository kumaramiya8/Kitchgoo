import { useApp } from './AppContext';
import { useAuth } from './AuthContext';

const FULL_ACCESS_ROLES = new Set(['Owner', 'Manager']);

// Hard-coded safety net — used only when neither settings store has data for a role
const DEFAULT_PERMS = {
  Chef: ['kds', 'inventory', 'menu'],
  Cashier: ['pos', 'comp.small', 'discount'],
  Waiter: ['pos', 'reservations', 'guests', 'comp.small'],
  'Delivery Boy': ['delivery'],
  Host: ['reservations', 'guests'],
};

/**
 * Returns a `can(perm)` function for the currently logged-in user.
 *
 * Priority:
 *  1. Owner / Manager → always full access
 *  2. settings.rolePermissions[role]  (Staff → Permissions tab)
 *  3. settings.roles[role].permissions (Settings → Roles & Permissions UI)
 *  4. Hard-coded DEFAULT_PERMS fallback
 *
 * Reading from both stores means either UI actually works.
 */
export function usePermissions() {
  const { settings } = useApp();
  const { user } = useAuth();

  const role = user?.role || 'Owner';

  if (FULL_ACCESS_ROLES.has(role)) return () => true;

  // 1. New format: { RoleName: ['perm1', 'perm2'] }
  const newStore = settings?.rolePermissions || {};
  if (newStore[role] !== undefined) {
    const perms = newStore[role];
    return (perm) => Array.isArray(perms) && perms.includes(perm);
  }

  // 2. Legacy format: [{ id, name, permissions[] }]  (Settings → Roles section)
  const legacyRoles = settings?.roles || [];
  const legacyRole = legacyRoles.find(
    r => r.name === role || r.id === role?.toLowerCase().replace(/\s+/g, '_'),
  );
  if (legacyRole) {
    const perms = legacyRole.permissions || [];
    return (perm) => perms.includes('all') || perms.includes(perm);
  }

  // 3. Hard-coded defaults
  const perms = DEFAULT_PERMS[role] ?? [];
  return (perm) => perms.includes(perm);
}
