import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from './lib/api';
import Layout from './components/Layout';
import Login from './pages/Login';
import Setup from './pages/Setup';
import Dashboard from './pages/Dashboard';
import Apps from './pages/Apps';
import AppDetail from './pages/AppDetail';
import Analytics from './pages/Analytics';
import Experiments from './pages/Experiments';
import SubscriberDetail from './pages/SubscriberDetail';
import PaywallEditor from './pages/PaywallEditor';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!api.isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    // Check if we need initial setup
    const checkSetup = async () => {
      try {
        if (api.isAuthenticated()) {
          await api.getMe();
        } else {
          // Check setup status via safe endpoint (no side effects)
          const status = await api.getSetupStatus();
          setNeedsSetup(status.needs_setup);
        }
      } catch {
        // If getMe fails, token is invalid - check setup status
        try {
          const status = await api.getSetupStatus();
          setNeedsSetup(status.needs_setup);
        } catch {
          // Network error or server down
        }
      }
      setLoading(false);
    };

    checkSetup();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/setup" element={needsSetup ? <Setup /> : <Navigate to="/login" replace />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="apps" element={<Apps />} />
        <Route path="apps/:id" element={<AppDetail />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="experiments" element={<Experiments />} />
        <Route path="subscribers/:id" element={<SubscriberDetail />} />
        <Route path="apps/:id/paywalls/new" element={<PaywallEditor />} />
        <Route path="apps/:id/paywalls/:identifier" element={<PaywallEditor />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
