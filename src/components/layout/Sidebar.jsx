import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  MenuSquare,
  Truck,
  Users,
  BarChart3,
  Settings,
  ChefHat,
  UserCheck,
  CalendarDays,
  Globe,
  Monitor,
  Shield,
  Clock,
  Receipt,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

import { useApp } from '../../db/AppContext';
import { useAuth } from '../../db/AuthContext';
import { usePermissions } from '../../db/usePermissions';
import { isModuleEnabled } from '../../../shared/seeds';

const Sidebar = ({ isOpen, onClose, isCollapsed = false, onToggleCollapse }) => {
  const { settings } = useApp();
  const { user } = useAuth();
  const can = usePermissions();
  const restName = settings?.restaurant?.name || 'Kitchgoo';
  const restLogo = settings?.restaurant?.logo;

  const isPlatformAdmin = user?.restaurantName?.toLowerCase() === 'kitchgoo' && !user.isImpersonated;

  const operationsNav = [
    { name: 'Dashboard',        path: '/',          icon: LayoutDashboard, perm: null },
    { name: 'POS & Billing',    path: '/pos',        icon: ShoppingCart,    perm: 'pos' },
    { name: 'Kitchen Display',  path: '/kds',        icon: Monitor,         perm: 'kds', module: 'kds' },
    { name: 'Menu',             path: '/menu',       icon: MenuSquare,      perm: 'menu' },
    { name: 'Inventory',        path: '/inventory',  icon: Package,         perm: 'inventory' },
    { name: 'Delivery & Online',path: '/delivery',   icon: Truck,           perm: 'delivery', module: 'delivery' },
  ];

  const managementNav = [
    { name: 'Staff & Workforce', path: '/staff',        icon: Users,        perm: 'staff' },
    { name: 'Attendance',        path: '/attendance',   icon: Clock,        perm: null },
    { name: 'Expenses',          path: '/expenses',     icon: Receipt,      perm: 'expenses', module: 'expenses' },
    { name: 'Guests & CRM',      path: '/guests',       icon: UserCheck,    perm: 'guests' },
    { name: 'Reservations',      path: '/reservations', icon: CalendarDays, perm: 'reservations', module: 'reservations' },
    { name: 'Reports',           path: '/reports',      icon: BarChart3,    perm: 'reports' },
  ];

  const enterpriseNav = [
    { name: 'Multi-Location', path: '/multi-location', icon: Globe,   perm: null, module: 'multiLocation' },
    { name: 'Platform Admin', path: '/platform-admin', icon: Shield,  perm: null, module: 'platformAdmin' },
  ];

  const isItemVisible = (item) => {
    if (item.module && !isModuleEnabled(settings, item.module)) return false;
    if (item.perm && !can(item.perm)) return false;
    return true;
  };

  const renderNavItems = (items) =>
    items
      .filter(isItemVisible)
      .map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/'}
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          onClick={onClose}
          title={isCollapsed ? item.name : undefined}
        >
          <span className="nav-item-icon">
            <item.icon size={18} />
          </span>
          <span className="nav-item-label">{item.name}</span>
        </NavLink>
      ));

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''} ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-inner">
          <div
            className="sidebar-logo-brand"
            onClick={isCollapsed ? onToggleCollapse : undefined}
            title={isCollapsed ? `${restName} (Click to expand)` : undefined}
            style={{ cursor: isCollapsed ? 'pointer' : 'default' }}
          >
            {restLogo ? (
              <img src={restLogo} alt={restName} className="sidebar-logo-img" />
            ) : (
              <div className="sidebar-logo-icon">
                <ChefHat size={18} />
              </div>
            )}
            <span className="sidebar-logo-text">{restName}</span>
          </div>
          <div className="sidebar-header-actions">
            {onToggleCollapse && (
              <button
                type="button"
                className="sidebar-desktop-toggle"
                onClick={onToggleCollapse}
                title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {isCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
              </button>
            )}
            <button className="sidebar-close-btn" onClick={onClose} aria-label="Close sidebar">
              <X size={18} />
            </button>
          </div>
        </div>
        <span className="sidebar-logo-subtitle">
          Powered by Kitchgoo
        </span>
      </div>

      {isPlatformAdmin ? (
        <div className="sidebar-section">
          <div className="sidebar-section-label">Admin Platform</div>
          <div className="sidebar-section-divider" />
          {renderNavItems([
            { name: 'Platform Admin', path: '/', icon: Shield, perm: null },
          ])}
        </div>
      ) : (
        <>
          {/* Operations */}
          <div className="sidebar-section">
            <div className="sidebar-section-label">Operations</div>
            <div className="sidebar-section-divider" />
            {renderNavItems(operationsNav)}
          </div>

          {/* Management */}
          <div className="sidebar-section">
            <div className="sidebar-section-label">Management</div>
            <div className="sidebar-section-divider" />
            {renderNavItems(managementNav)}
          </div>

          {/* Enterprise */}
          {enterpriseNav.filter(n => n.name !== 'Platform Admin').some(isItemVisible) && (
            <div className="sidebar-section">
              <div className="sidebar-section-label">Enterprise</div>
              <div className="sidebar-section-divider" />
              {renderNavItems(enterpriseNav.filter(n => n.name !== 'Platform Admin'))}
            </div>
          )}
        </>
      )}

      <div className="sidebar-footer">
        {can('settings.view') && (
          <NavLink
            to="/settings"
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            onClick={onClose}
            title={isCollapsed ? "Settings" : undefined}
          >
            <span className="nav-item-icon">
              <Settings size={18} />
            </span>
            <span className="nav-item-label">Settings</span>
          </NavLink>
        )}
        {onToggleCollapse && (
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={onToggleCollapse}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <span className="nav-item-icon">
              {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </span>
            <span className="sidebar-collapse-label">Collapse</span>
          </button>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
