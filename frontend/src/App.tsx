import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/Toast';
import LiquidGlassTracker from './components/LiquidGlassTracker';
import Login from './pages/Login';
import Driver from './pages/Driver';
import Police from './pages/Police';
import Hospital from './pages/Hospital';
import Admin from './pages/Admin';

// Protected route wrapper
const Guard: React.FC<{ roles?: string[]; children: React.ReactNode }> = ({ roles, children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen loading-screen-full"><div className="spinner"/><span>Restoring session...</span></div>;
  if (!user) return <Navigate to="/" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={`/${user.role}`} replace />;
  return <>{children}</>;
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <LiquidGlassTracker />
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/driver"   element={<Guard roles={['driver']}><Driver /></Guard>} />
            <Route path="/police"   element={<Guard roles={['police']}><Police /></Guard>} />
            <Route path="/hospital" element={<Guard roles={['hospital']}><Hospital /></Guard>} />
            <Route path="/admin"    element={<Guard roles={['admin']}><Admin /></Guard>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
