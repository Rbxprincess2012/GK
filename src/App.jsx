import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { ToastProvider } from '@/components/admin/Toast'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import AdminShell from '@/components/admin/AdminShell'
import Login from '@/pages/Login'
import SetPassword from '@/pages/SetPassword'
import Dashboard from '@/pages/Dashboard'
import Inbox from '@/pages/Inbox'
import Incoming from '@/pages/Incoming'
import Orders from '@/pages/Orders'
import Drivers from '@/pages/Drivers'
import Vehicles from '@/pages/Vehicles'
import Clients from '@/pages/Clients'
import Objects from '@/pages/Objects'
import Containers from '@/pages/Containers'
import Distribution from '@/pages/Distribution'
import ShiftMap from '@/pages/ShiftMap'
import Review from '@/pages/Review'
import InWork from '@/pages/InWork'
import ProofReview from '@/pages/ProofReview'
import Reconcile from '@/pages/Reconcile'
import Journal from '@/pages/Journal'
import Schedule from '@/pages/Schedule'
import Reports from '@/pages/Reports'
import Settings from '@/pages/Settings'
import Users from '@/pages/Users'

function RequireAuth({ roles }) {
  const { user, loading } = useAuth()

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  )

  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />

  return <Outlet />
}

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  )

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <Login />}
      />

      {/* Установка пароля по приглашению — публично, без входа */}
      <Route path="/set-password" element={<SetPassword />} />

      {/* Защищённые роуты через Layout Route */}
      <Route element={<RequireAuth />}>
        <Route element={<AdminShell />}>
          <Route path="/"          element={<Dashboard />} />
          <Route path="/inbox"     element={<Inbox />} />
          <Route path="/incoming"  element={<Incoming />} />
          <Route path="/orders"    element={<Orders />} />
          <Route path="/distribution" element={<Distribution />} />
          <Route path="/map"          element={<ShiftMap />} />
          <Route path="/review"    element={<Review />} />
          <Route path="/inwork"    element={<InWork />} />
          <Route element={<RequireAuth roles={['manager', 'director', 'superuser']} />}>
            <Route path="/proof-review" element={<ProofReview />} />
          </Route>
          <Route path="/reconcile" element={<Reconcile />} />
          <Route path="/journal"   element={<Journal />} />
          <Route path="/drivers"   element={<Drivers />} />
          <Route path="/vehicles"  element={<Vehicles />} />
          <Route path="/clients"   element={<Clients />} />
          <Route path="/objects"   element={<Objects />} />
          <Route path="/containers" element={<Containers />} />
          <Route path="/schedule"  element={<Schedule />} />
          <Route path="/reports"   element={<Reports />} />

          <Route element={<RequireAuth roles={['director', 'superuser']} />}>
            <Route path="/users" element={<Users />} />
          </Route>
          <Route element={<RequireAuth roles={['manager', 'director', 'superuser']} />}>
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
