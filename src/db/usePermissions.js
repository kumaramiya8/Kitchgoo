import { useApp } from './AppContext';
import { useAuth } from './AuthContext';

const FULL_ACCESS_ROLES = new Set(['Owner', 'Manager']);

// Mirrors DEFAULT_ROLE_PERMS in Staff.jsx — keep in sync if roles change
const DEFAULT_PERMS = {
  Chef: ['kds', 'inventory', 'menu'],
  Cashier: ['pos', 'comp.small', 'discount'],
  Waiter: ['pos', 'reservations', 'guests', 'comp.small'],
  'Delivery Boy': ['delivery'],
  Host: ['reservations', 'guests'],
};

/**
 * Returns a `can(perm)` function for the currently logged-in user.
 * Owner and Manager always return true. All other roles are checked
 * against settings.rolePermissions (saved by the Permissions tab),
 * falling back to DEFAULT_PERMS if the owner hasn't customised them yet.
 */
export function usePermissions() {
  const { settings } = useApp();
  const { user } = useAuth();

  const role = user?.role || 'Owner';

  if (FULL_ACCESS_ROLES.has(role)) return () => true;

  const stored = settings?.rolePermissions || {};
  const perms = stored[role] ?? DEFAULT_PERMS[role] ?? [];

  return (perm) => Array.isArray(perms) && perms.includes(perm);
}
