import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Monitor,
  BarChart3,
  Menu,
  Shield,
  Clock,
} from 'lucide-react';
import { useAuth } from '../../db/AuthContext';
import { usePermissions } from '../../db/usePermissions';

// Mobile-only tab bar. Items with a perm field are hidden when the user's role
// lacks that permission. Attendance is always visible — every staff member
// needs to clock in/out regardless of role.
const BottomNav = ({ onMoreClick }) => {
  const { user } = useAuth();
  const can = usePermissions();
  const isPlatformAdmin = user?.restaurantName?.toLowerCase() === 'kitchgoo' && !user.isImpersonated;

  const allItems = [
    { name: 'Dashboard',  path: '/',           icon: LayoutDashboard, perm: null },
    { name: 'POS',        path: '/pos',         icon: ShoppingCart,    perm: 'pos' },
    { name: 'Kitchen',    path: '/kds',         icon: Monitor,         perm: 'kds' },
    { name: 'Attendance', path: '/attendance',  icon: Clock,           perm: null },
    { name: 'Reports',    path: '/reports',     icon: BarChart3,       perm: 'reports' },
  ];

  const items = isPlatformAdmin
    ? [{ name: 'Admin', path: '/', icon: Shield, perm: null }]
    : allItems.filter(item => !item.perm || can(item.perm));

  return (
    <nav className="bottom-nav">
      {items.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/'}
          className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}
        >
          <item.icon size={20} />
          <span>{item.name}</span>
        </NavLink>
      ))}
      <button className="bottom-nav-item" onClick={onMoreClick}>
        <Menu size={20} />
        <span>More</span>
      </button>
    </nav>
  );
};

export default BottomNav;
