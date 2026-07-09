import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './db/AuthContext';
import Layout from './components/layout/Layout';
import Login from './pages/Login';

// Pages load as separate chunks — the old single bundle was 1.25 MB, which
// is a slow first paint on the cheap tablets restaurants actually run.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const POS = lazy(() => import('./pages/POS'));
const Inventory = lazy(() => import('./pages/Inventory'));
const MenuScreen = lazy(() => import('./pages/MenuScreen'));
const Delivery = lazy(() => import('./pages/Delivery'));
const Staff = lazy(() => import('./pages/Staff'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const Guests = lazy(() => import('./pages/Guests'));
const KDS = lazy(() => import('./pages/KDS'));
const Reservations = lazy(() => import('./pages/Reservations'));
const MultiLocation = lazy(() => import('./pages/MultiLocation'));
const PlatformAdmin = lazy(() => import('./pages/PlatformAdmin'));
const QRMenu = lazy(() => import('./pages/QRMenu'));

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

// Route guard
const Protected = ({ children, allowAdmin = false }) => {
  const { user, loading } = useAuth();
  if (loading) return <BootSplash />;
  if (!user) return <Navigate to="/login" replace />;
  
  // If the user is Kitchgoo and not impersonating, only allow access to platform admin allowed routes
  if (user?.restaurantName?.toLowerCase() === 'kitchgoo' && !user.isImpersonated && !allowAdmin) {
    return <Navigate to="/" replace />;
  }
  
  return children;
};

const RootElement = () => {
  const { user } = useAuth();
  if (user?.restaurantName?.toLowerCase() === 'kitchgoo' && !user.isImpersonated) {
    return <Layout title="Platform Admin"><PlatformAdmin /></Layout>;
  }
  return <Layout title="Dashboard"><Dashboard /></Layout>;
};

function App() {
  const { user, loading } = useAuth();

  return (
    <Suspense fallback={<PageLoader />}>
    <Routes>
      {/* Public */}
      <Route path="/login" element={user ? <Navigate to="/" replace /> : (loading ? <BootSplash /> : <Login />)} />
      <Route path="/qrmenu/:tenantId" element={<QRMenu />} />

      {/* Protected — Operations */}
      <Route path="/" element={<Protected allowAdmin={true}><RootElement /></Protected>} />
      <Route path="/pos" element={<Protected><Layout title="POS & Billing"><POS /></Layout></Protected>} />
      <Route path="/kds" element={<Protected><Layout title="Kitchen Display System"><KDS /></Layout></Protected>} />
      <Route path="/menu" element={<Protected><Layout title="Menu Management"><MenuScreen /></Layout></Protected>} />
      <Route path="/inventory" element={<Protected><Layout title="Inventory & Supply Chain"><Inventory /></Layout></Protected>} />
      <Route path="/delivery" element={<Protected><Layout title="Delivery & Online Ordering"><Delivery /></Layout></Protected>} />

      {/* Protected — Management */}
      <Route path="/staff" element={<Protected><Layout title="Staff & Workforce"><Staff /></Layout></Protected>} />
      <Route path="/guests" element={<Protected><Layout title="Guests & CRM"><Guests /></Layout></Protected>} />
      <Route path="/reservations" element={<Protected><Layout title="Reservations & Waitlist"><Reservations /></Layout></Protected>} />
      <Route path="/reports" element={<Protected><Layout title="Reports & Analytics"><Reports /></Layout></Protected>} />

      {/* Protected — Enterprise */}
      <Route path="/multi-location" element={<Protected><Layout title="Multi-Location & Franchise"><MultiLocation /></Layout></Protected>} />
      <Route path="/platform-admin" element={<Protected allowAdmin={true}><Layout title="Platform Admin"><PlatformAdmin /></Layout></Protected>} />

      {/* Protected — Settings */}
      <Route path="/settings" element={<Protected allowAdmin={true}><Layout title="Settings"><Settings /></Layout></Protected>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}

export default App;
