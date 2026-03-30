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
} from 'lucide-react';

const Sidebar = () => {
  const operationsNav = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'POS & Billing', path: '/pos', icon: ShoppingCart },
    { name: 'Kitchen Display', path: '/kds', icon: Monitor },
    { name: 'Menu', path: '/menu', icon: MenuSquare },
    { name: 'Inventory', path: '/inventory', icon: Package },
    { name: 'Delivery & Online', path: '/delivery', icon: Truck },
  ];

  const managementNav = [
    { name: 'Staff & Workforce', path: '/staff', icon: Users },
    { name: 'Guests & CRM', path: '/guests', icon: UserCheck },
    { name: 'Reservations', path: '/reservations', icon: CalendarDays },
    { name: 'Reports', path: '/reports', icon: BarChart3 },
  ];

  const enterpriseNav = [
    { name: 'Multi-Location', path: '/multi-location', icon: Globe },
    { name: 'Platform Admin', path: '/platform-admin', icon: Shield },
  ];

  const renderNavItems = (items) =>
    items.map((item) => (
      <NavLink
        key={item.path}
        to={item.path}
        end={item.path === '/'}
        className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
      >
        <span className="nav-item-icon">
          <item.icon size={18} />
        </span>
        <span className="nav-item-label">{item.name}</span>
      </NavLink>
    ));

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <ChefHat size={18} />
        </div>
        <span className="sidebar-logo-text">Kitchgoo</span>
      </div>

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
        {renderNavItems(enterpriseNav)}
      </div>

      <div className="sidebar-footer">
        <NavLink to="/settings" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <span className="nav-item-icon">
            <Settings size={18} />
          </span>
          <span className="nav-item-label">Settings</span>
        </NavLink>
      </div>
    </aside>
  );
};

export default Sidebar;
