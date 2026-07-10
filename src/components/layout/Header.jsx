import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Search, ChevronLeft, LogOut, Settings, Users, Menu, Sparkles, Sun, Moon } from 'lucide-react';
import { useAuth } from '../../db/AuthContext';
import { useApp } from '../../db/AppContext';
import { useNavigate } from 'react-router-dom';
import HelpDrawer from '../ui/HelpDrawer';
import Tooltip from '../ui/Tooltip';
import { toggleThemeWithReveal } from '../../lib/theme';

const SEARCHABLE_ITEMS = [
  // Pages
  { name: 'Dashboard', type: 'page', path: '/', allowedRoles: ['Owner', 'Manager', 'Cashier', 'Chef', 'Waiter'] },
  { name: 'POS & Billing', type: 'page', path: '/pos', allowedRoles: ['Owner', 'Manager', 'Cashier', 'Waiter'] },
  { name: 'Kitchen Display System', type: 'page', path: '/kds', allowedRoles: ['Owner', 'Manager', 'Chef'] },
  { name: 'Menu Management', type: 'page', path: '/menu', allowedRoles: ['Owner', 'Manager', 'Chef'] },
  { name: 'Inventory & Supply Chain', type: 'page', path: '/inventory', allowedRoles: ['Owner', 'Manager', 'Chef'] },
  { name: 'Delivery & Online Ordering', type: 'page', path: '/delivery', allowedRoles: ['Owner', 'Manager', 'Cashier'] },
  { name: 'Staff & Workforce', type: 'page', path: '/staff', allowedRoles: ['Owner', 'Manager'] },
  { name: 'Guests & CRM', type: 'page', path: '/guests', allowedRoles: ['Owner', 'Manager', 'Cashier'] },
  { name: 'Reservations & Waitlist', type: 'page', path: '/reservations', allowedRoles: ['Owner', 'Manager', 'Cashier', 'Waiter'] },
  { name: 'Reports & Analytics', type: 'page', path: '/reports', allowedRoles: ['Owner', 'Manager'] },
  
  // Settings Sections
  { name: 'Settings: Restaurant Profile', type: 'setting', path: '/settings?tab=restaurant', allowedRoles: ['Owner', 'Manager'] },
  { name: 'Settings: Billing & Taxes', type: 'setting', path: '/settings?tab=billing', allowedRoles: ['Owner'] },
  { name: 'Settings: Payment Methods', type: 'setting', path: '/settings?tab=payments', allowedRoles: ['Owner'] },
  { name: 'Settings: Operations', type: 'setting', path: '/settings?tab=operations', allowedRoles: ['Owner', 'Manager', 'Cashier', 'Chef', 'Waiter'] },
  { name: 'Settings: Menu Categories', type: 'setting', path: '/settings?tab=menuConfig', allowedRoles: ['Owner', 'Manager'] },
  { name: 'Settings: Delivery Platforms', type: 'setting', path: '/settings?tab=delivery', allowedRoles: ['Owner', 'Manager'] },
  { name: 'Settings: Notifications', type: 'setting', path: '/settings?tab=notifications', allowedRoles: ['Owner', 'Manager'] },
  { name: 'Settings: Printer & Receipt', type: 'setting', path: '/settings?tab=printer', allowedRoles: ['Owner', 'Manager', 'Cashier', 'Chef'] },
  { name: 'Settings: Module Toggles', type: 'setting', path: '/settings?tab=modules', allowedRoles: ['Owner', 'Manager'] },
  { name: 'Settings: Custom Naming', type: 'setting', path: '/settings?tab=naming', allowedRoles: ['Owner', 'Manager'] },
  { name: 'Settings: Workflow Rules', type: 'setting', path: '/settings?tab=workflow', allowedRoles: ['Owner', 'Manager'] },
  { name: 'Settings: Receipt Builder', type: 'setting', path: '/settings?tab=receipt', allowedRoles: ['Owner', 'Manager', 'Cashier'] },
  { name: 'Settings: Roles & Permissions', type: 'setting', path: '/settings?tab=roles', allowedRoles: ['Owner'] },
  { name: 'Settings: Team Members', type: 'setting', path: '/settings?tab=team', allowedRoles: ['Owner', 'Manager'] },
  { name: 'Settings: Appearance', type: 'setting', path: '/settings?tab=appearance', allowedRoles: ['Owner', 'Manager'] },
];

const Header = ({ title = 'Dashboard', onMenuClick }) => {
  const { user, logout } = useAuth();
  const { settings, updateSettingsSection } = useApp();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const currentTheme = settings?.appearance?.theme || 'light';
  const isDark = currentTheme === 'dark'
    || (currentTheme === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const handleThemeToggle = (e) => {
    const next = isDark ? 'light' : 'dark';
    toggleThemeWithReveal(next, e.currentTarget);   // animated DOM swap now
    updateSettingsSection('appearance', { theme: next }); // persist
  };
  const btnRef = useRef(null);
  const dropRef = useRef(null);
  const [dropPos, setDropPos] = useState({ top: 0, right: 0 });

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchWrapperRef = useRef(null);

  // Close search dropdown on clicking outside
  useEffect(() => {
    const clickHandler = (e) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', clickHandler);
    return () => document.removeEventListener('mousedown', clickHandler);
  }, []);

  // Update search results when query or user changes
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const query = searchQuery.toLowerCase().trim();
    const userRole = (user?.role || 'Owner').toLowerCase();

    const filtered = SEARCHABLE_ITEMS.filter(item => {
      // 1. Match search query
      const nameMatches = item.name.toLowerCase().includes(query);
      if (!nameMatches) return false;

      // 2. Match role permission
      return item.allowedRoles.some(r => r.toLowerCase() === userRole);
    });

    setSearchResults(filtered);
  }, [searchQuery, user]);

  // Position dropdown relative to button
  const openDropdown = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setDropdownOpen(v => !v);
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (
        dropRef.current && !dropRef.current.contains(e.target) &&
        btnRef.current && !btnRef.current.contains(e.target)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => {
    setDropdownOpen(false);
    logout();
    navigate('/login');
  };

  const avatarInitial = user?.avatar || user?.name?.charAt(0).toUpperCase() || 'A';

  // Dropdown rendered as a portal so it's NEVER clipped by any overflow:hidden ancestor
  const dropdown = dropdownOpen ? ReactDOM.createPortal(
    <div
      ref={dropRef}
      className="animate-menu"
      style={{
        position: 'fixed',
        top: dropPos.top,
        right: dropPos.right,
        background: 'var(--modal-bg)',
        border: '1px solid var(--border)',
        borderRadius: '18px',
        boxShadow: '0 16px 48px rgba(0,0,0,0.14), 0 4px 16px rgba(30, 94, 74,0.08)',
        minWidth: '220px',
        padding: '8px',
        zIndex: 9999,
      }}
    >
      {/* User info */}
      <div style={{ padding: '10px 14px 12px', borderBottom: '1px solid rgba(0,0,0,0.06)', marginBottom: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'linear-gradient(135deg, #1e5e4a, #2e7d5b)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.95rem', flexShrink: 0 }}>
            {avatarInitial}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#111' }}>{user?.name || 'Admin'}</div>
            <div style={{ fontSize: '0.72rem', color: '#888' }}>{user?.email}</div>
          </div>
        </div>
        <div style={{ marginTop: '8px', display: 'inline-block', padding: '2px 8px', borderRadius: '6px', background: 'rgba(30, 94, 74,0.08)', color: '#1e5e4a', fontSize: '0.7rem', fontWeight: 700 }}>
          {user?.role || 'Owner'}
        </div>
      </div>

      <DropItem icon={<Settings size={15} />} label="Settings" onClick={() => { navigate('/settings'); setDropdownOpen(false); }} />
      <DropItem icon={<Users size={15} />} label="Team Members" onClick={() => { navigate('/settings?tab=team'); setDropdownOpen(false); }} />
      <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', marginTop: '4px', paddingTop: '4px' }} />
      <DropItem icon={<LogOut size={15} />} label="Sign Out" onClick={handleLogout} danger />
    </div>,
    document.body
  ) : null;

  return (
    <header className="page-header">
      <Tooltip label="Menu" side="bottom">
        <button className="header-menu-btn" onClick={onMenuClick}>
          <Menu size={18} />
        </button>
      </Tooltip>

      <Tooltip label="Back" side="bottom">
        <button className="header-back-btn" onClick={() => navigate(-1)}>
          <ChevronLeft size={16} />
        </button>
      </Tooltip>

      <div className="header-search-wrapper" ref={searchWrapperRef}>
        <Search size={15} className="header-search-icon" />
        <input 
          type="text" 
          placeholder="Search pages & settings..." 
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          className="header-search" 
        />
        {searchFocused && searchResults.length > 0 && (
          <div
            className="animate-menu animate-menu-left"
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              left: 0,
              right: 0,
              background: 'rgba(255,255,255,0.96)',
              backdropFilter: 'blur(24px)',
              border: '1px solid rgba(226, 232, 240, 0.9)',
              borderRadius: '16px',
              boxShadow: '0 16px 48px rgba(0,0,0,0.12), 0 4px 12px rgba(30, 94, 74,0.04)',
              maxHeight: '300px',
              overflowY: 'auto',
              padding: '6px',
              zIndex: 10000
            }}
          >
            {searchResults.map((item, idx) => (
              <button
                key={idx}
                onClick={() => {
                  navigate(item.path);
                  setSearchQuery('');
                  setSearchFocused(false);
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.2s',
                }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(30, 94, 74,0.06)'}
                onMouseOut={e => e.currentTarget.style.background = 'none'}
              >
                <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {item.name}
                </span>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '2px', letterSpacing: '0.5px' }}>
                  {item.type === 'setting' ? 'Settings section' : 'Page'}
                </span>
              </button>
            ))}
          </div>
        )}
        {searchFocused && searchQuery.trim() && searchResults.length === 0 && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              left: 0,
              right: 0,
              background: 'rgba(255,255,255,0.96)',
              backdropFilter: 'blur(24px)',
              border: '1px solid rgba(226, 232, 240, 0.9)',
              borderRadius: '16px',
              boxShadow: '0 16px 48px rgba(0,0,0,0.12)',
              padding: '16px',
              textAlign: 'center',
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
              zIndex: 10000
            }}
          >
            No results found for "{searchQuery}"
          </div>
        )}
      </div>

      <div className="header-spacer" />

      <div className="header-actions">
        {/* Theme toggle — gradual circular reveal via View Transitions */}
        <Tooltip label={isDark ? 'Light mode' : 'Dark mode'} side="bottom">
          <button
            className="header-icon-btn"
            onClick={handleThemeToggle}
            aria-label="Toggle theme"
            style={{ overflow: 'hidden' }}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </Tooltip>

        {/* Help / AI Copilot Button */}
        <Tooltip label="Kitchgoo Copilot" side="bottom">
        <button
          className="header-icon-btn animate-pulse"
          onClick={() => setHelpOpen(true)}
          style={{
            position: 'relative',
            background: 'linear-gradient(135deg, rgba(30, 94, 74,0.06), rgba(46, 125, 91,0.06))',
            border: '1px solid rgba(30, 94, 74,0.15)',
            color: '#1e5e4a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: 10,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseOver={e => {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(30, 94, 74,0.12), rgba(46, 125, 91,0.12))';
            e.currentTarget.style.borderColor = 'rgba(30, 94, 74,0.25)';
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseOut={e => {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(30, 94, 74,0.06), rgba(46, 125, 91,0.06))';
            e.currentTarget.style.borderColor = 'rgba(30, 94, 74,0.15)';
            e.currentTarget.style.transform = 'none';
          }}
        >
          <Sparkles size={16} />
        </button>
        </Tooltip>

        {/* User avatar button */}
        <Tooltip label="Account" side="bottom">
        <button
          ref={btnRef}
          className="header-user"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          onClick={openDropdown}
        >
          <div className="header-user-avatar">{avatarInitial}</div>
          <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
            <span className="header-user-name">{user?.name || 'Admin'}</span>
            <span className="header-user-role">{user?.role || 'Owner'}</span>
          </div>
        </button>
        </Tooltip>
      </div>

      {dropdown}
      <HelpDrawer isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
    </header>
  );
};

const DropItem = ({ icon, label, onClick, danger }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      width: '100%', padding: '9px 12px', borderRadius: '10px',
      border: 'none', background: 'none', cursor: 'pointer',
      fontSize: '0.83rem', fontWeight: 500,
      color: danger ? '#dc2626' : '#444',
      transition: 'background 0.15s',
    }}
    onMouseOver={e => e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.06)' : 'rgba(0,0,0,0.04)'}
    onMouseOut={e => e.currentTarget.style.background = 'none'}
  >
    {icon} {label}
  </button>
);

export default Header;
