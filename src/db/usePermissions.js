import { useApp } from './AppContext';
import { useAuth } from './AuthContext';

const FULL_ACCESS_ROLES = new Set(['Owner']);

// Hard-coded safety net — used only when neither settings store has data for a role
const DEFAULT_PERMS = {
  Manager: ['dashboard', 'pos', 'kds', 'inventory', 'menu', 'delivery', 'staff', 'guests', 'reservations', 'reports', 'settings', 'settings.view'],
  Chef: ['kds', 'inventory', 'menu'],
  Cashier: ['dashboard', 'pos', 'comp.small', 'discount', 'guests'],
  Waiter: ['pos', 'reservations', 'guests', 'comp.small'],
  'Delivery Boy': ['delivery'],
  Host: ['reservations', 'guests'],
};

/**
 * Returns a `can(perm)` function for the currently logged-in user.
 *
 * Priority:
 *  1. Owner → always full access (super-admin safety net)
 *  2. settings.roles (from Settings → Roles & Permissions UI)
 *  3. settings.rolePermissions (from Staff → Permissions tab)
 *  4. Hard-coded DEFAULT_PERMS fallback
 */
export function usePermissions() {
  const { settings } = useApp();
  const { user } = useAuth();

  const role = user?.role || 'Owner';
  const roleLower = String(role).toLowerCase().trim();

  // Owner always has full access (case-insensitive)
  if (roleLower === 'owner') return () => true;

  const checkPermList = (permsList) => (perm) => {
    if (!perm) return true;
    if (permsList.includes('all') || permsList.includes(perm)) return true;
    // Prefix matching so 'settings.view' matches if role has 'settings' or 'settings.view'
    if (perm.startsWith('settings.') && (permsList.includes('settings') || permsList.includes('settings.view'))) return true;
    if (perm.startsWith('reports.') && (permsList.includes('reports') || permsList.includes('reports.export'))) return true;
    if (perm.startsWith('kds.') && permsList.includes('kds')) return true;
    if (perm.startsWith('guests.') && permsList.includes('guests')) return true;
    return false;
  };

  // 1. Settings -> Roles & Permissions: [{ id, name, permissions[] }]
  const legacyRoles = settings?.roles || [];
  const legacyRole = legacyRoles.find(
    r => (r.name && r.name.toLowerCase() === roleLower) ||
         (r.id && r.id.toLowerCase() === roleLower.replace(/\s+/g, '_')),
  );
  if (legacyRole && Array.isArray(legacyRole.permissions)) {
    let perms = legacyRole.permissions;
    // If role does not have 'settings' (and not 'all'), strip any legacy 'settings.view' from seeds
    if (!perms.includes('all') && !perms.includes('settings')) {
      perms = perms.filter(p => !p.startsWith('settings.'));
    }
    return checkPermList(perms);
  }

  // 2. Staff -> Permissions tab: { RoleName: ['perm1', 'perm2'] }
  const newStore = settings?.rolePermissions || {};
  const newStoreKey = Object.keys(newStore).find(k => k.toLowerCase().trim() === roleLower);
  if (newStoreKey && Array.isArray(newStore[newStoreKey])) {
    return checkPermList(newStore[newStoreKey]);
  }

  // 3. Hard-coded defaults (case-insensitive)
  const defaultEntry = Object.entries(DEFAULT_PERMS).find(([k]) => k.toLowerCase() === roleLower);
  const perms = defaultEntry ? defaultEntry[1] : [];
  return checkPermList(perms);
}
