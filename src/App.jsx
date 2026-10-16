import React, { Suspense } from 'react';
import { Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from './db/AuthContext';
import { useApp } from './db/AppContext';
import { usePermissions } from './db/usePermissions';
import { isModuleEnabled, isPlatformAdminUser } from '../shared/seeds';
import Layout from './components/layout/Layout';
import Login from './pages/Login';

import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Inventory from './pages/Inventory';
import MenuScreen from './pages/MenuScreen';
import Delivery from './pages/Delivery';
import Staff from './pages/Staff';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Guests from './pages/Guests';
import KDS from './pages/KDS';
import Reservations from './pages/Reservations';
import MultiLocation from './pages/MultiLocation';
import PlatformAdmin from './pages/PlatformAdmin';
import QRMenu from './pages/QRMenu';
import Attendance from './pages/Attendance';
import Expenses from './pages/Expenses';

const PageLoader = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
    Loading…
  </div>
);

// Shown while the session + tenant payload load — a blank white page makes
// a 1-second boot feel like five.
const BootSplash = () => (
  <div style={{
    height: '100vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 14,
    background: 'var(--canvas, #f1f3ef)',
  }}>
    <div style={{
      width: 52, height: 52, borderRadius: 12, background: '#1e5e4a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z"/>
        <line x1="6" x2="18" y1="17" y2="17"/>
      </svg>
    </div>
    <div style={{ fontFamily: "'Young Serif', Georgia, serif", fontSize: '1.15rem', color: '#1c2420' }}>
      Kitchgoo
    </div>
    <div className="animate-pulse" style={{ fontSize: '0.78rem', color: 'var(--text-muted, #87938c)' }}>
      Setting the table…
    </div>
  </div>
);

// Route guard — checks authentication only
const Protected = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <BootSplash />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

// Route guard — prevents Platform Admin from entering restaurant routes unless impersonating
const RestaurantRouteGuard = ({ children }) => {
  const { user } = useAuth();
  if (isPlatformAdminUser(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
};

// Route guard — ensures only Platform Admin can enter platform admin specific routes
const PlatformAdminGuard = ({ children }) => {
  const { user } = useAuth();
  if (!isPlatformAdminUser(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
};

const getFirstAllowedRoute = (can) => {
  if (can('dashboard')) return '/';
  if (can('pos')) return '/pos';
  if (can('kds')) return '/kds';
  if (can('menu')) return '/menu';
  if (can('inventory')) return '/inventory';
  if (can('delivery')) return '/delivery';
  if (can('staff')) return '/staff';
  if (can('reports')) return '/reports';
  if (can('guests')) return '/guests';
  if (can('reservations')) return '/reservations';
  if (can('expenses')) return '/expenses';
  return '/attendance';
};

// Permission guard — redirects to first authorized page when the user's role lacks access.
// Must render inside AppProvider (i.e. inside a Protected route).
const PermissionGuard = ({ perm, children }) => {
  const can = usePermissions();
  if (!can(perm)) return <Navigate to={getFirstAllowedRoute(can)} replace />;
  return children;
};

// Module guard — redirects to first authorized page when an account-level module is disabled
const ModuleGuard = ({ module: modKey, children }) => {
  const { settings } = useApp();
  const can = usePermissions();
  if (modKey && !isModuleEnabled(settings, modKey)) {
    return <Navigate to={getFirstAllowedRoute(can)} replace />;
  }
  return children;
};

const RootElement = () => {
  const { user } = useAuth();
  const can = usePermissions();
  if (isPlatformAdminUser(user)) {
    return <PlatformAdmin />;
  }
  if (!can('dashboard')) {
    return <Navigate to={getFirstAllowedRoute(can)} replace />;
  }
  return <Dashboard />;
};

const AppLayout = () => {
  const location = useLocation();
  const { user } = useAuth();
  const isPlatformAdmin = isPlatformAdminUser(user);

  const getPageTitle = () => {
    if (isPlatformAdmin) return 'Platform Admin';
    const path = location.pathname;
    if (path === '/') return 'Dashboard';
    if (path === '/pos') return 'POS & Billing';
    if (path === '/kds') return 'Kitchen Display System';
    if (path === '/menu') return 'Menu Management';
    if (path === '/inventory') return 'Inventory & Supply Chain';
    if (path === '/delivery') return 'Delivery & Online Ordering';
    if (path === '/staff') return 'Staff & Workforce';
    if (path === '/attendance') return 'Attendance';
    if (path === '/expenses') return 'Expenses & Overheads';
    if (path === '/guests') return 'Guests & CRM';
    if (path === '/reservations') return 'Reservations & Waitlist';
    if (path === '/reports') return 'Reports & Analytics';
    if (path === '/multi-location') return 'Multi-Location & Franchise';
    if (path === '/platform-admin') return 'Platform Admin';
    if (path === '/settings') return 'Settings';
    return 'Kitchgoo';
  };

  return (
    <Layout title={getPageTitle()}>
      <Outlet />
    </Layout>
  );
};

class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, errorInfo) {
    console.warn('[RouteErrorBoundary] Uncaught route transition error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '60vh', padding: '32px', textAlign: 'center'
        }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Unable to display screen
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '18px', maxWidth: 400 }}>
            An update was deployed or a temporary network issue occurred. Reloading will fetch the latest version.
          </p>
          <button
            style={{
              background: '#1e5e4a', color: 'white', border: 'none', borderRadius: '10px',
              padding: '10px 20px', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer'
            }}
            onClick={() => {
              sessionStorage.removeItem('kitchgoo_chunk_reload');
              window.location.reload();
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const { user, loading } = useAuth();
  const location = useLocation();

  return (
    <RouteErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Routes location={location}>
          {/* Public */}
          <Route path="/login" element={user ? <Navigate to="/" replace /> : (loading ? <BootSplash /> : <Login />)} />
          <Route path="/qrmenu/:tenantId" element={<QRMenu />} />

          {/* Protected persistent layout shell */}
          <Route element={<Protected><AppLayout /></Protected>}>
            <Route path="/" element={<RootElement />} />
            <Route path="/pos" element={<RestaurantRouteGuard><PermissionGuard perm="pos"><POS /></PermissionGuard></RestaurantRouteGuard>} />
            <Route path="/kds" element={<RestaurantRouteGuard><ModuleGuard module="kds"><PermissionGuard perm="kds"><KDS /></PermissionGuard></ModuleGuard></RestaurantRouteGuard>} />
            <Route path="/menu" element={<RestaurantRouteGuard><PermissionGuard perm="menu"><MenuScreen /></PermissionGuard></RestaurantRouteGuard>} />
            <Route path="/inventory" element={<RestaurantRouteGuard><PermissionGuard perm="inventory"><Inventory /></PermissionGuard></RestaurantRouteGuard>} />
            <Route path="/delivery" element={<RestaurantRouteGuard><ModuleGuard module="delivery"><PermissionGuard perm="delivery"><Delivery /></PermissionGuard></ModuleGuard></RestaurantRouteGuard>} />

            {/* Management */}
            <Route path="/staff" element={<RestaurantRouteGuard><PermissionGuard perm="staff"><Staff /></PermissionGuard></RestaurantRouteGuard>} />
            <Route path="/expenses" element={<RestaurantRouteGuard><ModuleGuard module="expenses"><PermissionGuard perm="expenses"><Expenses /></PermissionGuard></ModuleGuard></RestaurantRouteGuard>} />
            <Route path="/guests" element={<RestaurantRouteGuard><PermissionGuard perm="guests"><Guests /></PermissionGuard></RestaurantRouteGuard>} />
            <Route path="/reservations" element={<RestaurantRouteGuard><ModuleGuard module="reservations"><PermissionGuard perm="reservations"><Reservations /></PermissionGuard></ModuleGuard></RestaurantRouteGuard>} />
            <Route path="/reports" element={<RestaurantRouteGuard><PermissionGuard perm="reports"><Reports /></PermissionGuard></RestaurantRouteGuard>} />

            {/* Attendance */}
            <Route path="/attendance" element={<RestaurantRouteGuard><Attendance /></RestaurantRouteGuard>} />

            {/* Enterprise & Platform Admin */}
            <Route path="/multi-location" element={<RestaurantRouteGuard><ModuleGuard module="multiLocation"><MultiLocation /></ModuleGuard></RestaurantRouteGuard>} />
            <Route path="/platform-admin" element={<PlatformAdminGuard><PlatformAdmin /></PlatformAdminGuard>} />

            {/* Settings */}
            <Route path="/settings" element={<RestaurantRouteGuard><PermissionGuard perm="settings.view"><Settings /></PermissionGuard></RestaurantRouteGuard>} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  );
}

export default App;
