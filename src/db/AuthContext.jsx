/**
 * AuthContext — Handles login, logout, register, and session persistence securely via backend.
 * Uses HttpOnly cookies (via /api endpoints) for sessions instead of localStorage.
 */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { update as dbUpdate, setCurrentTenant, initTenantDB } from './database';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // In-memory impersonation states (lost on reload to prevent XSS storage)
  const [adminSession, setAdminSession] = useState(null);
  const [impersonatedTenant, setImpersonatedTenant] = useState(null);

  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch('/api/session');
        const data = await res.json();
        
        if (data.success && data.user) {
          setCurrentTenant(data.user.restaurantName);
          await initTenantDB(data.user.restaurantName);
          setUser(data.user);
        }
      } catch (err) {
        console.error('[Auth] Failed to verify session via server:', err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const login = async (accountName, email, password) => {
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountName, email, password }),
      });
      const data = await res.json();

      if (data.success && data.user) {
        setCurrentTenant(data.user.restaurantName);
        await initTenantDB(data.user.restaurantName);
        setUser(data.user);
        
        // Clear any lingering impersonation state
        setAdminSession(null);
        setImpersonatedTenant(null);
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Invalid credentials' };
      }
    } catch (err) {
      return { success: false, error: 'Network error during login' };
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch (err) {
      console.error('[Auth] Error logging out:', err);
    }
    setUser(null);
    setCurrentTenant('Kitchgoo');
    setAdminSession(null);
    setImpersonatedTenant(null);
  };

  const impersonateAccount = async (tenantName) => {
    if (!user) return { success: false, error: 'Not logged in.' };
    
    // Save admin context in memory only
    setAdminSession(user);
    setImpersonatedTenant(tenantName);
    
    // Switch tenant
    setCurrentTenant(tenantName);
    await initTenantDB(tenantName);
    
    const virtualUser = {
      id: `virtual_${tenantName}`,
      name: `Admin (${tenantName})`,
      email: 'admin@kitchgoo.in',
      role: 'Owner',
      restaurantName: tenantName,
      isImpersonated: true
    };
    setUser(virtualUser);
    return { success: true };
  };

  const stopImpersonating = () => {
    if (!adminSession) return { success: false, error: 'No admin session found.' };
    
    // Switch tenant back
    setCurrentTenant('Kitchgoo');
    setUser(adminSession);
    
    setAdminSession(null);
    setImpersonatedTenant(null);
    return { success: true };
  };

  /**
   * Register a new user account — fully server-side. The backend creates the
   * account (tenant) if needed, scrypt-hashes the password, and sets the
   * HttpOnly session cookie in the same round trip.
   */
  const register = async (data) => {
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantName: data.restaurantName || 'Kitchgoo',
          name: data.name,
          email: data.email,
          password: data.password,
          phone: data.phone || '',
          role: data.role,
        }),
      });
      const result = await res.json();
      if (!result.success) {
        return { success: false, error: result.error || 'Registration failed.' };
      }

      if (!user) {
        setCurrentTenant(result.user.restaurantName);
        await initTenantDB(result.user.restaurantName);
        setUser(result.user);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: 'Network error during registration' };
    }
  };

  const updateProfile = async (data) => {
    if (!user) return { success: false, error: 'Not logged in.' };

    // Password goes over as plaintext (HTTPS) — the backend scrypt-hashes it.
    const updated = await dbUpdate('users', user.id, data);
    
    if (!updated) return { success: false, error: 'User not found.' };
    const sessionUser = { ...updated, password: undefined };
    setUser(sessionUser);
    // Notice: we don't save to localStorage anymore!
    return { success: true };
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, register, updateProfile, impersonateAccount, stopImpersonating }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
