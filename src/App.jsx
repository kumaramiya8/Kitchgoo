import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './db/AuthContext';
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

// Route guard
const Protected = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

function App() {
  const { user } = useAuth();

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />

      {/* Protected — Operations */}
      <Route path="/" element={<Protected><Layout title="Dashboard"><Dashboard /></Layout></Protected>} />
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
      <Route path="/platform-admin" element={<Protected><Layout title="Platform Admin"><PlatformAdmin /></Layout></Protected>} />

      {/* Protected — Settings */}
      <Route path="/settings" element={<Protected><Layout title="Settings"><Settings /></Layout></Protected>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
