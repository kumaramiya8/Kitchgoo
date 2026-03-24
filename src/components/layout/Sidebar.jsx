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
  UserCheck
} from 'lucide-react';

const Sidebar = () => {
  const mainNav = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'POS & Billing', path: '/pos', icon: ShoppingCart },
    { name: 'Inventory', path: '/inventory', icon: Package },
    { name: 'Menu', path: '/menu', icon: MenuSquare },
    { name: 'Delivery', path: '/delivery', icon: Truck },
  ];

  const teamNav = [
    { name: 'Staff', path: '/staff', icon: Users },
    { name: 'Guests', path: '/guests', icon: UserCheck },
    { name: 'Reports', path: '/reports', icon: BarChart3 },
  ];

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <ChefHat size={18} />
        </div>
        <span className="sidebar-logo-text">Kitchgoo</span>
      </div>

      {/* Main Navigation */}
      <div className="sidebar-section">
        <div className="sidebar-section-label">Operations</div>
        {mainNav.map((item) => (
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
        ))}
      </div>

      {/* Team Navigation */}
      <div className="sidebar-section">
        <div className="sidebar-section-label">Management</div>
        {teamNav.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <span className="nav-item-icon">
              <item.icon size={18} />
            </span>
            <span className="nav-item-label">{item.name}</span>
          </NavLink>
        ))}
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
