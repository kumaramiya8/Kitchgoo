import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Monitor,
  BarChart3,
  Menu,
  Shield,
} from 'lucide-react';
import { useAuth } from '../../db/AuthContext';

// Mobile-only tab bar for the four destinations staff reach for mid-service.
// Everything else stays one tap away behind "More" (opens the drawer).
const BottomNav = ({ onMoreClick }) => {
  const { user } = useAuth();
  const isPlatformAdmin = user?.restaurantName?.toLowerCase() === 'kitchgoo' && !user.isImpersonated;

  const items = isPlatformAdmin
    ? [{ name: 'Admin', path: '/', icon: Shield }]
    : [
        { name: 'Dashboard', path: '/', icon: LayoutDashboard },
        { name: 'POS', path: '/pos', icon: ShoppingCart },
        { name: 'Kitchen', path: '/kds', icon: Monitor },
        { name: 'Reports', path: '/reports', icon: BarChart3 },
      ];

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
