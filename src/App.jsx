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

      {/* Protected */}
      <Route path="/" element={<Protected><Layout title="Dashboard"><Dashboard /></Layout></Protected>} />
      <Route path="/pos" element={<Protected><Layout title="POS & Billing"><POS /></Layout></Protected>} />
      <Route path="/inventory" element={<Protected><Layout title="Inventory Management"><Inventory /></Layout></Protected>} />
      <Route path="/menu" element={<Protected><Layout title="Menu Management"><MenuScreen /></Layout></Protected>} />
      <Route path="/delivery" element={<Protected><Layout title="Delivery Integrations"><Delivery /></Layout></Protected>} />
      <Route path="/staff" element={<Protected><Layout title="Staff Management"><Staff /></Layout></Protected>} />
      <Route path="/reports" element={<Protected><Layout title="Reports & Analytics"><Reports /></Layout></Protected>} />
      <Route path="/settings" element={<Protected><Layout title="Settings"><Settings /></Layout></Protected>} />
      <Route path="/guests" element={<Protected><Layout title="Guest Profiles"><Guests /></Layout></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
