import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute() {
  const { isAuthenticated } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    // Remember where the user was heading so Login can send them back
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}