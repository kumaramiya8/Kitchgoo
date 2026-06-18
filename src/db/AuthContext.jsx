/**
 * AuthContext — Handles login, logout, register, and session persistence securely via backend.
 * Uses HttpOnly cookies (via /api endpoints) for sessions instead of localStorage.
 */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { getAll, insert, update as dbUpdate, setCurrentTenant, initTenantDB } from './database';

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
   * Register a new user account.
   * This is still done via the database layer since we haven't built a full /api/register yet,
   * but if it's their first time, we force them to login via the server immediately after.
   */
  const register = async (data) => {
    const users = getAll('users');
    if (users.find(u => u.email.toLowerCase() === data.email.toLowerCase())) {
      return { success: false, error: 'An account with this email already exists.' };
    }
    
    // Simple hash for the DB (legacy compatibility)
    const simpleHash = (str) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
      }
      return hash.toString(16);
    };

    const newUser = await insert('users', {
      name: data.name,
      email: data.email,
      password: simpleHash(data.password),
      role: users.length === 0 ? 'Owner' : (data.role || 'Cashier'),
      avatar: data.name.charAt(0).toUpperCase(),
      restaurantName: data.restaurantName || 'Kitchgoo',
      phone: data.phone || '',
      createdAt: new Date().toISOString(),
    });

    if (!user) {
      // Login via the server to establish HttpOnly cookie
      return await login(data.restaurantName || 'Kitchgoo', data.email, data.password);
    }
    return { success: true };
  };

  const updateProfile = async (data) => {
    if (!user) return { success: false, error: 'Not logged in.' };
    
    const simpleHash = (str) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
      }
      return hash.toString(16);
    };

    const updated = await dbUpdate('users', user.id, {
      ...data,
      ...(data.password ? { password: simpleHash(data.password) } : {}),
    });
    
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
