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
  X,
} from 'lucide-react';

import { useApp } from '../../db/AppContext';
import { useAuth } from '../../db/AuthContext';
import { usePermissions } from '../../db/usePermissions';

const Sidebar = ({ isOpen, onClose }) => {
  const { settings } = useApp();
  const { user } = useAuth();
  const can = usePermissions();
  const restName = settings?.restaurant?.name || 'Kitchgoo';
  const restLogo = settings?.restaurant?.logo;

  const isPlatformAdmin = user?.restaurantName?.toLowerCase() === 'kitchgoo' && !user.isImpersonated;

  const operationsNav = [
    { name: 'Dashboard',        path: '/',          icon: LayoutDashboard, perm: null },
    { name: 'POS & Billing',    path: '/pos',        icon: ShoppingCart,    perm: 'pos' },
    { name: 'Kitchen Display',  path: '/kds',        icon: Monitor,         perm: 'kds' },
    { name: 'Menu',             path: '/menu',       icon: MenuSquare,      perm: 'menu' },
    { name: 'Inventory',        path: '/inventory',  icon: Package,         perm: 'inventory' },
    { name: 'Delivery & Online',path: '/delivery',   icon: Truck,           perm: 'delivery' },
  ];

  const managementNav = [
    { name: 'Staff & Workforce', path: '/staff',        icon: Users,        perm: 'staff' },
    { name: 'Guests & CRM',      path: '/guests',       icon: UserCheck,    perm: 'guests' },
    { name: 'Reservations',      path: '/reservations', icon: CalendarDays, perm: 'reservations' },
    { name: 'Reports',           path: '/reports',      icon: BarChart3,    perm: 'reports' },
  ];

  const enterpriseNav = [
    { name: 'Multi-Location', path: '/multi-location', icon: Globe,   perm: null },
    { name: 'Platform Admin', path: '/platform-admin', icon: Shield,  perm: null },
  ];

  const renderNavItems = (items) =>
    items
      .filter(item => !item.perm || can(item.perm))
      .map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/'}
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          onClick={onClose}
        >
          <span className="nav-item-icon">
            <item.icon size={18} />
          </span>
          <span className="nav-item-label">{item.name}</span>
        </NavLink>
      ));

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      {/* Logo */}
      <div className="sidebar-logo" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px', padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {restLogo ? (
              <img src={restLogo} alt={restName} style={{ width: '36px', height: '36px', borderRadius: '10px', objectFit: 'contain', background: 'white', padding: '2px', border: '1px solid var(--border-subtle)' }} />
            ) : (
              <div className="sidebar-logo-icon">
                <ChefHat size={18} />
              </div>
            )}
            <span className="sidebar-logo-text" style={{ fontSize: '1.05rem', fontWeight: 800 }}>{restName}</span>
          </div>
          <button className="sidebar-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <span className="sidebar-logo-text" style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', paddingLeft: '46px', textTransform: 'uppercase', marginTop: '-4px' }}>
          Powered by Kitchgoo
        </span>
      </div>

      {isPlatformAdmin ? (
        <div className="sidebar-section">
          <div className="sidebar-section-label">Admin Platform</div>
          {renderNavItems([
            { name: 'Platform Admin', path: '/', icon: Shield, perm: null },
          ])}
        </div>
      ) : (
        <>
          {/* Operations */}
          <div className="sidebar-section">
            <div className="sidebar-section-label">Operations</div>
            {renderNavItems(operationsNav)}
          </div>

          {/* Management */}
          <div className="sidebar-section">
            <div className="sidebar-section-label">Management</div>
            {renderNavItems(managementNav)}
          </div>

          {/* Enterprise */}
          <div className="sidebar-section">
            <div className="sidebar-section-label">Enterprise</div>
            {renderNavItems(enterpriseNav.filter(n => n.name !== 'Platform Admin'))}
          </div>
        </>
      )}

      {can('settings.view') && (
        <div className="sidebar-footer">
          <NavLink to="/settings" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} onClick={onClose}>
            <span className="nav-item-icon">
              <Settings size={18} />
            </span>
            <span className="nav-item-label">Settings</span>
          </NavLink>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
