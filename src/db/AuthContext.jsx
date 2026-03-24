/**
 * AuthContext — Handles login, logout, register, and session persistence.
 * Users are stored in localStorage (database layer).
 */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { getAll, insert, update as dbUpdate } from './database';

const AuthContext = createContext(null);

// Hash a password simply (for demo — in production use bcrypt on a server)
const simpleHash = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash.toString(16);
};

// Seed default super-admin account
const seedDefaultAdmin = () => {
  const existing = getAll('users');
  if (existing.length === 0) {
    insert('users', {
      name: 'Admin',
      email: 'admin@kitchgoo.in',
      password: simpleHash('admin123'),
      role: 'Owner',
      avatar: 'A',
      restaurantName: 'Kitchgoo',
      createdAt: new Date().toISOString(),
    });
  }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    seedDefaultAdmin();
    // Restore session from localStorage
    try {
      const saved = localStorage.getItem('kitchgoo_session');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate session still matches user in DB
        const users = getAll('users');
        const match = users.find(u => u.id === parsed.id);
        if (match) setUser({ ...match, password: undefined });
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const login = (email, password) => {
    const users = getAll('users');
    const found = users.find(u =>
      u.email.toLowerCase() === email.toLowerCase() &&
      u.password === simpleHash(password)
    );
    if (!found) return { success: false, error: 'Invalid email or password.' };
    const sessionUser = { ...found, password: undefined };
    setUser(sessionUser);
    localStorage.setItem('kitchgoo_session', JSON.stringify(sessionUser));
    return { success: true };
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('kitchgoo_session');
  };

  /**
   * Register a new user account.
   * If called while already logged in (admin creating users), the current
   * session is NOT replaced — the new user is just saved to the DB.
   */
  const register = (data) => {
    const users = getAll('users');
    if (users.find(u => u.email.toLowerCase() === data.email.toLowerCase())) {
      return { success: false, error: 'An account with this email already exists.' };
    }
    const newUser = insert('users', {
      name: data.name,
      email: data.email,
      password: simpleHash(data.password),
      role: users.length === 0 ? 'Owner' : (data.role || 'Cashier'),
      avatar: data.name.charAt(0).toUpperCase(),
      restaurantName: data.restaurantName || 'Kitchgoo',
      phone: data.phone || '',
      createdAt: new Date().toISOString(),
    });

    // Only auto-login if there is no current session (first-time registration)
    if (!user) {
      const sessionUser = { ...newUser, password: undefined };
      setUser(sessionUser);
      localStorage.setItem('kitchgoo_session', JSON.stringify(sessionUser));
    }
    return { success: true };
  };

  const updateProfile = (data) => {
    if (!user) return { success: false, error: 'Not logged in.' };
    const updated = dbUpdate('users', user.id, {
      ...data,
      ...(data.password ? { password: simpleHash(data.password) } : {}),
    });
    if (!updated) return { success: false, error: 'User not found.' };
    const sessionUser = { ...updated, password: undefined };
    setUser(sessionUser);
    localStorage.setItem('kitchgoo_session', JSON.stringify(sessionUser));
    return { success: true };
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, register, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
