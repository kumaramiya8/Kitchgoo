import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Bell, Search, ChevronLeft, LogOut, Settings, Users } from 'lucide-react';
import { useAuth } from '../../db/AuthContext';
import { useNavigate } from 'react-router-dom';

const Header = ({ title = 'Dashboard' }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const btnRef = useRef(null);
  const dropRef = useRef(null);
  const [dropPos, setDropPos] = useState({ top: 0, right: 0 });

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
      style={{
        position: 'fixed',
        top: dropPos.top,
        right: dropPos.right,
        background: 'rgba(255,255,255,0.96)',
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.9)',
        borderRadius: '18px',
        boxShadow: '0 16px 48px rgba(0,0,0,0.14), 0 4px 16px rgba(124,58,237,0.08)',
        minWidth: '220px',
        padding: '8px',
        zIndex: 9999,
      }}
    >
      {/* User info */}
      <div style={{ padding: '10px 14px 12px', borderBottom: '1px solid rgba(0,0,0,0.06)', marginBottom: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.95rem', flexShrink: 0 }}>
            {avatarInitial}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#111' }}>{user?.name || 'Admin'}</div>
            <div style={{ fontSize: '0.72rem', color: '#888' }}>{user?.email}</div>
          </div>
        </div>
        <div style={{ marginTop: '8px', display: 'inline-block', padding: '2px 8px', borderRadius: '6px', background: 'rgba(124,58,237,0.08)', color: '#7c3aed', fontSize: '0.7rem', fontWeight: 700 }}>
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
      <button className="header-back-btn" onClick={() => navigate(-1)}>
        <ChevronLeft size={16} />
      </button>

      <div className="header-search-wrapper">
        <Search size={15} className="header-search-icon" />
        <input type="text" placeholder="Search..." className="header-search" />
      </div>

      <div className="header-spacer" />

      <div className="header-actions">
        <button className="header-icon-btn">
          <Bell size={18} />
        </button>

        {/* User avatar button */}
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
      </div>

      {dropdown}
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
