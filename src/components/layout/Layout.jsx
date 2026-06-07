import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import { useAuth } from '../../db/AuthContext';
import { useApp } from '../../db/AppContext';
import { useNavigate } from 'react-router-dom';
import { Eye, LogOut } from 'lucide-react';

const Layout = ({ children, title }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, stopImpersonating } = useAuth();
  const { reload } = useApp();
  const navigate = useNavigate();

  const handleExitImpersonation = () => {
    stopImpersonating();
    reload();
    navigate('/');
  };

  const isImpersonated = user?.isImpersonated === true;

  return (
    <div className="app-container" style={isImpersonated ? { paddingTop: '44px' } : {}}>
      {isImpersonated && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '44px',
          background: 'linear-gradient(90deg, #7c3aed, #a855f7)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          zIndex: 10000,
          fontSize: '0.84rem',
          fontWeight: 600,
          boxShadow: '0 4px 12px rgba(124,58,237,0.25)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Eye size={16} />
            <span>Currently managing <strong style={{ textDecoration: 'underline' }}>{user.restaurantName}</strong> as Platform Admin</span>
          </div>
          <button 
            onClick={handleExitImpersonation}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: '1.5px solid rgba(255, 255, 255, 0.4)',
              borderRadius: '8px',
              padding: '4px 12px',
              color: 'white',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s',
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.35)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
          >
            <LogOut size={13} /> Exit Account
          </button>
        </div>
      )}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {sidebarOpen && (
        <div 
          className="sidebar-backdrop" 
          onClick={() => setSidebarOpen(false)} 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(4px)',
            zIndex: 998,
            transition: 'opacity 0.2s ease',
          }}
        />
      )}
      <main className="main-content">
        <Header title={title} onMenuClick={() => setSidebarOpen(true)} />
        <div className="page-body">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
