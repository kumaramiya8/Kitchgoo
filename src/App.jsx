import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './db/AuthContext';
import { useApp } from './db/AppContext';
import { usePermissions } from './db/usePermissions';
import { isModuleEnabled } from '../shared/seeds';
import Layout from './components/layout/Layout';
import Login from './pages/Login';

// Pages load as separate chunks — automatically recovers if a new deploy changes chunk hashes
const lazyWithRetry = (importFn) =>
  lazy(async () => {
    const isRetried = sessionStorage.getItem('kitchgoo_chunk_reload');
    try {
      const module = await importFn();
      sessionStorage.removeItem('kitchgoo_chunk_reload');
      return module;
    } catch (err) {
      if (!isRetried) {
        sessionStorage.setItem('kitchgoo_chunk_reload', 'true');
        window.location.reload();
        return new Promise(() => {});
      }
      throw err;
    }
  });

const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const POS = lazyWithRetry(() => import('./pages/POS'));
const Inventory = lazyWithRetry(() => import('./pages/Inventory'));
const MenuScreen = lazyWithRetry(() => import('./pages/MenuScreen'));
const Delivery = lazyWithRetry(() => import('./pages/Delivery'));
const Staff = lazyWithRetry(() => import('./pages/Staff'));
const Reports = lazyWithRetry(() => import('./pages/Reports'));
const Settings = lazyWithRetry(() => import('./pages/Settings'));
const Guests = lazyWithRetry(() => import('./pages/Guests'));
const KDS = lazyWithRetry(() => import('./pages/KDS'));
const Reservations = lazyWithRetry(() => import('./pages/Reservations'));
const MultiLocation = lazyWithRetry(() => import('./pages/MultiLocation'));
const PlatformAdmin = lazyWithRetry(() => import('./pages/PlatformAdmin'));
const QRMenu = lazyWithRetry(() => import('./pages/QRMenu'));
const Attendance = lazyWithRetry(() => import('./pages/Attendance'));
const Expenses = lazyWithRetry(() => import('./pages/Expenses'));

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
  if ((user?.role === 'SuperAdmin' || user?.role === 'PlatformAdmin') && !user.isImpersonated) {
    return <Layout title="Platform Admin"><PlatformAdmin /></Layout>;
  }
  if (!can('dashboard')) {
    return <Navigate to={getFirstAllowedRoute(can)} replace />;
  }
  return <Layout title="Dashboard"><Dashboard /></Layout>;
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

  return (
    <RouteErrorBoundary>
    <Suspense fallback={<PageLoader />}>
    <Routes>
      {/* Public */}
      <Route path="/login" element={user ? <Navigate to="/" replace /> : (loading ? <BootSplash /> : <Login />)} />
      <Route path="/qrmenu/:tenantId" element={<QRMenu />} />

      {/* Protected — Operations */}
      <Route path="/" element={<Protected allowAdmin={true}><RootElement /></Protected>} />
      <Route path="/pos" element={<Protected><PermissionGuard perm="pos"><Layout title="POS & Billing"><POS /></Layout></PermissionGuard></Protected>} />
      <Route path="/kds" element={<Protected><ModuleGuard module="kds"><PermissionGuard perm="kds"><Layout title="Kitchen Display System"><KDS /></Layout></PermissionGuard></ModuleGuard></Protected>} />
      <Route path="/menu" element={<Protected><PermissionGuard perm="menu"><Layout title="Menu Management"><MenuScreen /></Layout></PermissionGuard></Protected>} />
      <Route path="/inventory" element={<Protected><PermissionGuard perm="inventory"><Layout title="Inventory & Supply Chain"><Inventory /></Layout></PermissionGuard></Protected>} />
      <Route path="/delivery" element={<Protected><ModuleGuard module="delivery"><PermissionGuard perm="delivery"><Layout title="Delivery & Online Ordering"><Delivery /></Layout></PermissionGuard></ModuleGuard></Protected>} />

      {/* Protected — Management */}
      <Route path="/staff" element={<Protected><PermissionGuard perm="staff"><Layout title="Staff & Workforce"><Staff /></Layout></PermissionGuard></Protected>} />
      <Route path="/expenses" element={<Protected><ModuleGuard module="expenses"><PermissionGuard perm="expenses"><Layout title="Expenses & Overheads"><Expenses /></Layout></PermissionGuard></ModuleGuard></Protected>} />
      <Route path="/guests" element={<Protected><PermissionGuard perm="guests"><Layout title="Guests & CRM"><Guests /></Layout></PermissionGuard></Protected>} />
      <Route path="/reservations" element={<Protected><ModuleGuard module="reservations"><PermissionGuard perm="reservations"><Layout title="Reservations & Waitlist"><Reservations /></Layout></PermissionGuard></ModuleGuard></Protected>} />
      <Route path="/reports" element={<Protected><PermissionGuard perm="reports"><Layout title="Reports & Analytics"><Reports /></Layout></PermissionGuard></Protected>} />

      {/* Protected — Attendance (no permission guard — all staff need clock in/out) */}
      <Route path="/attendance" element={<Protected><Layout title="Attendance"><Attendance /></Layout></Protected>} />

      {/* Protected — Enterprise */}
      <Route path="/multi-location" element={<Protected><ModuleGuard module="multiLocation"><Layout title="Multi-Location & Franchise"><MultiLocation /></Layout></ModuleGuard></Protected>} />
      <Route path="/platform-admin" element={<Protected allowAdmin={true}><ModuleGuard module="platformAdmin" allowAdmin={true}><Layout title="Platform Admin"><PlatformAdmin /></Layout></ModuleGuard></Protected>} />

      {/* Protected — Settings */}
      <Route path="/settings" element={<Protected allowAdmin={true}><PermissionGuard perm="settings.view"><Layout title="Settings"><Settings /></Layout></PermissionGuard></Protected>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
    </RouteErrorBoundary>
  );
}

export default App;
