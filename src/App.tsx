import { Suspense, lazy, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

const Login = lazy(() => import('./pages/Login'));
const ProtectedAppLayout = lazy(() => import('./components/layout/ProtectedAppLayout'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const LiveFeed = lazy(() => import('./pages/LiveFeed'));
const Students = lazy(() => import('./pages/Students'));
const Devices = lazy(() => import('./pages/Devices'));
const Edges = lazy(() => import('./pages/Edges'));
const History = lazy(() => import('./pages/History'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Schools = lazy(() => import('./pages/Schools'));
const Integrators = lazy(() => import('./pages/Integrators'));
const Licenses = lazy(() => import('./pages/Licenses'));
const CockpitSchool = lazy(() => import('./pages/CockpitSchool'));
const CockpitIntegrator = lazy(() => import('./pages/CockpitIntegrator'));
const CockpitSuperadmin = lazy(() => import('./pages/CockpitSuperadmin'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const TVPanel = lazy(() => import('./pages/TVPanel'));
const DeviceDiagnostics = lazy(() => import('./pages/DeviceDiagnostics'));
const AuditTrail = lazy(() => import('./pages/AuditTrail'));
const OpsCenter = lazy(() => import('./pages/OpsCenter'));
const VirtualDevices = lazy(() => import('./pages/VirtualDevices'));
const AIReports = lazy(() => import('./pages/AIReports'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const TVPanelManagement = lazy(() => import('./pages/TVPanelManagement'));
const PartnerManagement = lazy(() => import('./pages/PartnerManagement'));
const PlatformSettings = lazy(() => import('./pages/PlatformSettings'));
const SchoolWhatsApp = lazy(() => import('./pages/SchoolWhatsApp'));
const SchoolHub = lazy(() => import('./pages/SchoolHub/index'));

function RouteLoader() {
  return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          width: 32,
          height: 32,
          border: '3px solid var(--color-primary-600)',
          borderTopColor: 'transparent',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <RouteLoader />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function RoleRoute({ children, allowed }: { children: ReactNode; allowed: string[] }) {
  const { profile } = useAuth();

  if (profile && !allowed.includes(profile.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ErrorBoundary>
          <BrowserRouter>
            <Suspense fallback={<RouteLoader />}>
              <Routes>
                <Route path="/tv/:accessToken" element={<TVPanel />} />
                <Route path="/login" element={<Login />} />

                <Route path="/" element={<ProtectedRoute><ProtectedAppLayout /></ProtectedRoute>}>
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="live-feed" element={<LiveFeed />} />
                  <Route path="school-hub" element={<SchoolHub />} />
                  <Route path="students" element={<Students />} />
                  <Route path="devices" element={<Devices />} />
                  <Route
                    path="edges"
                    element={
                      <RoleRoute allowed={['superadmin', 'integrator_admin', 'integrator_support']}>
                        <Edges />
                      </RoleRoute>
                    }
                  />
                  <Route path="history" element={<History />} />
                  <Route path="notifications" element={<Notifications />} />

                  <Route
                    path="cockpit"
                    element={
                      <RoleRoute allowed={['school_admin', 'coordinator']}>
                        <CockpitSchool />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="cockpit-integrator"
                    element={
                      <RoleRoute allowed={['integrator_admin', 'integrator_support', 'superadmin']}>
                        <CockpitIntegrator />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="cockpit-platform"
                    element={
                      <RoleRoute allowed={['superadmin']}>
                        <CockpitSuperadmin />
                      </RoleRoute>
                    }
                  />

                  <Route
                    path="schools"
                    element={
                      <RoleRoute allowed={['superadmin', 'integrator_admin']}>
                        <Schools />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="integrators"
                    element={
                      <RoleRoute allowed={['superadmin']}>
                        <Integrators />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="licenses"
                    element={
                      <RoleRoute allowed={['superadmin']}>
                        <Licenses />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="onboarding"
                    element={
                      <RoleRoute allowed={['superadmin', 'integrator_admin']}>
                        <Onboarding />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="device-diagnostics"
                    element={
                      <RoleRoute allowed={['superadmin', 'integrator_admin', 'integrator_support']}>
                        <DeviceDiagnostics />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="audit-trail"
                    element={
                      <RoleRoute allowed={['superadmin', 'integrator_admin', 'integrator_support']}>
                        <AuditTrail />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="ops-center"
                    element={
                      <RoleRoute allowed={['superadmin', 'integrator_admin', 'integrator_support', 'school_admin', 'coordinator']}>
                        <OpsCenter />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="virtual-devices"
                    element={
                      <RoleRoute allowed={['superadmin', 'integrator_admin', 'integrator_support', 'school_admin']}>
                        <VirtualDevices />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="ai-reports"
                    element={
                      <RoleRoute allowed={['superadmin', 'integrator_admin', 'integrator_support', 'school_admin', 'coordinator']}>
                        <AIReports />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="users"
                    element={
                      <RoleRoute allowed={['superadmin', 'integrator_admin', 'integrator_support', 'school_admin', 'coordinator']}>
                        <UserManagement />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="whatsapp"
                    element={
                      <RoleRoute allowed={['superadmin', 'integrator_admin', 'integrator_support', 'school_admin']}>
                        <SchoolWhatsApp />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="tv-panels"
                    element={
                      <RoleRoute allowed={['superadmin', 'integrator_admin', 'school_admin']}>
                        <TVPanelManagement />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="partner-management"
                    element={
                      <RoleRoute allowed={['superadmin']}>
                        <PartnerManagement />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="platform-settings"
                    element={
                      <RoleRoute allowed={['superadmin']}>
                        <PlatformSettings />
                      </RoleRoute>
                    }
                  />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </ErrorBoundary>
      </ToastProvider>
    </AuthProvider>
  );
}
