import { useApp } from './AppContext';
import { useAuth } from './AuthContext';
import { isModuleEnabled } from '../../shared/seeds';

const FULL_ACCESS_ROLES = new Set(['Owner']);

// Hard-coded safety net — used only when neither settings store has data for a role
const DEFAULT_PERMS = {
  Chef: ['kds', 'inventory', 'menu'],
  Cashier: ['pos', 'comp.small', 'discount'],
  Waiter: ['pos', 'reservations', 'guests', 'comp.small'],
  'Delivery Boy': ['delivery'],
  Host: ['reservations', 'guests'],
};

/**
 * Returns the default landing path for a user based on their permitted roles.
 */
export function getDefaultLandingPath(can, settings) {
  if (typeof can !== 'function') return '/';
  if (can('dashboard')) return '/';
  if (can('pos')) return '/pos';
  if (can('kds') && isModuleEnabled(settings, 'kds')) return '/kds';
  if (can('menu')) return '/menu';
  if (can('inventory')) return '/inventory';
  if (can('delivery') && isModuleEnabled(settings, 'delivery')) return '/delivery';
  if (can('reservations') && isModuleEnabled(settings, 'reservations')) return '/reservations';
  if (can('guests')) return '/guests';
  if (can('staff')) return '/staff';
  if (can('expenses') && isModuleEnabled(settings, 'expenses')) return '/expenses';
  if (can('reports')) return '/reports';
  return '/attendance';
}

/**
 * Returns a `can(perm)` function for the currently logged-in user.
 *
 * Priority:
 *  1. Owner → always full access
 *  2. settings.rolePermissions[role]  (Staff → Permissions tab)
 *  3. settings.roles[role].permissions (Settings → Roles & Permissions UI)
 *  4. Hard-coded defaults fallback (Manager full access fallback, others from DEFAULT_PERMS)
 *
 * Reading from both stores means either UI actually works.
 */
export function usePermissions() {
  const { settings } = useApp();
  const { user } = useAuth();

  const role = user?.role || 'Owner';

  if (FULL_ACCESS_ROLES.has(role)) return () => true;

  // 1. New format: { RoleName: ['perm1', 'perm2'] } (Staff → Permissions tab)
  const newStore = settings?.rolePermissions || {};
  if (newStore[role] !== undefined) {
    const perms = newStore[role];
    return (perm) => {
      if (!Array.isArray(perms)) return false;
      // Backward compatibility for existing databases:
      // If Manager's stored permissions were saved prior to adding 'dashboard' permission
      // (and haven't been saved via the new UI which sets _migratedDashboard),
      // keep 'dashboard' allowed for Manager so they aren't unexpectedly locked out.
      if (role === 'Manager' && perm === 'dashboard' && !newStore._migratedDashboard) {
        return true;
      }
      return perms.includes(perm);
    };
  }

  // 2. Legacy format: [{ id, name, permissions[] }]  (Settings → Roles section)
  const legacyRoles = settings?.roles || [];
  const legacyRole = legacyRoles.find(
    r => r.name === role || r.id === role?.toLowerCase().replace(/\s+/g, '_'),
  );
  if (legacyRole) {
    const perms = legacyRole.permissions || [];
    return (perm) => perms.includes('all') || perms.includes(perm) || (perm.startsWith('settings.') && perms.includes('settings'));
  }

  // 3. Hard-coded defaults
  if (role === 'Manager') return () => true;
  const perms = DEFAULT_PERMS[role] ?? [];
  return (perm) => perms.includes(perm);
}
