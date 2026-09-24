import { describe, it, expect } from 'vitest';
import { DEFAULT_MODULES, isModuleEnabled } from '../shared/seeds';

describe('Module Toggles System', () => {
  it('defines correct defaults for all modules', () => {
    expect(DEFAULT_MODULES.tableManagement).toBe(true);
    expect(DEFAULT_MODULES.reservations).toBe(true);
    expect(DEFAULT_MODULES.kds).toBe(true);
    expect(DEFAULT_MODULES.delivery).toBe(true);
    expect(DEFAULT_MODULES.onlineOrdering).toBe(true);
    expect(DEFAULT_MODULES.qrAiOrdering).toBe(true);
    expect(DEFAULT_MODULES.loyalty).toBe(true);
    expect(DEFAULT_MODULES.campaigns).toBe(true);
    expect(DEFAULT_MODULES.multiLocation).toBe(false);
    expect(DEFAULT_MODULES.platformAdmin).toBe(false);
  });

  it('correctly determines module enablement with isModuleEnabled', () => {
    // Null/undefined fallback to defaults
    expect(isModuleEnabled(null, 'kds')).toBe(true);
    expect(isModuleEnabled({}, 'multiLocation')).toBe(false);
    expect(isModuleEnabled({ modules: {} }, 'multiLocation')).toBe(false);
    expect(isModuleEnabled({ modules: {} }, 'kds')).toBe(true);

    // Explicit overrides
    expect(isModuleEnabled({ kds: false }, 'kds')).toBe(false);
    expect(isModuleEnabled({ modules: { kds: false } }, 'kds')).toBe(false);
    expect(isModuleEnabled({ modules: { multiLocation: true } }, 'multiLocation')).toBe(true);
    expect(isModuleEnabled({ modules: { delivery: false } }, 'delivery')).toBe(false);
    expect(isModuleEnabled({ modules: { reservations: false } }, 'reservations')).toBe(false);
    expect(isModuleEnabled({ modules: { tableManagement: false } }, 'tableManagement')).toBe(false);
    expect(isModuleEnabled({ modules: { loyalty: false } }, 'loyalty')).toBe(false);
    expect(isModuleEnabled({ modules: { campaigns: false } }, 'campaigns')).toBe(false);
  });

  it('correctly filters navigation items when modules are disabled', () => {
    const navItems = [
      { name: 'Dashboard', path: '/', module: null },
      { name: 'POS & Billing', path: '/pos', module: null },
      { name: 'Kitchen Display', path: '/kds', module: 'kds' },
      { name: 'Delivery & Online', path: '/delivery', module: 'delivery' },
      { name: 'Reservations', path: '/reservations', module: 'reservations' },
      { name: 'Multi-Location', path: '/multi-location', module: 'multiLocation' },
    ];

    const settingsWithDisabled = {
      modules: {
        kds: false,
        delivery: false,
        reservations: true,
        multiLocation: false,
      }
    };

    const visibleItems = navItems.filter(item => !item.module || isModuleEnabled(settingsWithDisabled, item.module));
    const visibleNames = visibleItems.map(i => i.name);

    expect(visibleNames).toContain('Dashboard');
    expect(visibleNames).toContain('POS & Billing');
    expect(visibleNames).toContain('Reservations');
    expect(visibleNames).not.toContain('Kitchen Display');
    expect(visibleNames).not.toContain('Delivery & Online');
    expect(visibleNames).not.toContain('Multi-Location');
  });

  it('correctly filters guest CRM tabs based on loyalty and campaign modules', () => {
    const tabs = [
      { id: 'directory', label: 'Guest Directory' },
      { id: 'loyalty', label: 'Loyalty Program', module: 'loyalty' },
      { id: 'campaigns', label: 'Campaigns', module: 'campaigns' },
      { id: 'segmentation', label: 'Segmentation' },
    ];

    const settings = {
      modules: {
        loyalty: false,
        campaigns: false,
      }
    };

    const visibleTabs = tabs.filter(t => !t.module || isModuleEnabled(settings, t.module));
    expect(visibleTabs.map(t => t.id)).toEqual(['directory', 'segmentation']);
  });

  it('correctly filters delivery tabs when online ordering is disabled', () => {
    const deliveryTabs = [
      { key: 'live', label: 'Live Orders' },
      { key: 'thirdparty', label: 'Third-Party' },
      { key: 'online', label: 'Online Ordering', module: 'onlineOrdering' },
      { key: 'dispatch', label: 'Driver Dispatch' },
    ];

    const settings = {
      modules: {
        onlineOrdering: false,
      }
    };

    const visibleTabs = deliveryTabs.filter(t => !t.module || isModuleEnabled(settings, t.module));
    expect(visibleTabs.map(t => t.key)).toEqual(['live', 'thirdparty', 'dispatch']);
  });

  it('correctly switches POS initial view when table management is disabled', () => {
    const getInitialPosView = (settings) => {
      const isTableManagementEnabled = isModuleEnabled(settings, 'tableManagement');
      return isTableManagementEnabled ? 'floor' : 'order';
    };

    expect(getInitialPosView({ modules: { tableManagement: true } })).toBe('floor');
    expect(getInitialPosView({ modules: { tableManagement: false } })).toBe('order');
    expect(getInitialPosView({})).toBe('floor'); // default is true
  });
});
