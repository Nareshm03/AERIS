import React, { createContext, useContext, useState, useEffect } from 'react';
import type { AuthUser } from '../api';
import { authStore, getMe, logoutUser } from '../api';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null, loading: true, login: () => {}, logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser]     = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore session from stored token
    const token = authStore.get();
    if (!token) { setLoading(false); return; }

    getMe()
      .then(u => setUser(u))
      .catch(() => { authStore.clear(); })
      .finally(() => setLoading(false));
  }, []);

  const login = (token: string, u: AuthUser) => {
    authStore.set(token);
    setUser(u);
  };

  const logout = async () => {
    try { await logoutUser(); } catch { /* ignore */ }
    authStore.clear();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
