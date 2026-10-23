import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { homeFor, useAuth } from './context/AuthContext';
import { LiveDataProvider } from './context/LiveData';
import AILab from './pages/AILab';
import Analytics from './pages/Analytics';
import AuditLog from './pages/AuditLog';
import Camps from './pages/Camps';
import CitizenSOS from './pages/CitizenSOS';
import Dashboard from './pages/Dashboard';
import FieldApp from './pages/FieldApp';
import Gateway from './pages/Gateway';
import Login from './pages/Login';
import { ForgotPassword, ResetPassword, VolunteerRegister } from './pages/PublicForms';
import Resilience from './pages/Resilience';
import Resources from './pages/Resources';
import Users from './pages/Users';
import VolunteerPortal from './pages/VolunteerPortal';

function Guard({ roles, children }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="grid h-full place-items-center text-slate-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/sos" element={<CitizenSOS />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/volunteer/register" element={<VolunteerRegister />} />
      <Route
        path="/field"
        element={
          <Guard roles={['responder', 'admin']}>
            <LiveDataProvider admin={false}>
              <FieldApp />
            </LiveDataProvider>
          </Guard>
        }
      />
      <Route
        path="/volunteer"
        element={
          <Guard roles={['volunteer']}>
            <LiveDataProvider admin={false}>
              <VolunteerPortal />
            </LiveDataProvider>
          </Guard>
        }
      />
      <Route
        element={
          <Guard roles={['admin']}>
            <LiveDataProvider>
              <Layout />
            </LiveDataProvider>
          </Guard>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="camps" element={<Camps />} />
        <Route path="gateway" element={<Gateway />} />
        <Route path="resilience" element={<Resilience />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="resources" element={<Resources />} />
        <Route path="ai-lab" element={<AILab />} />
        <Route path="users" element={<Users />} />
        <Route path="audit" element={<AuditLog />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
