import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './layouts/AppLayout'

import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import AnimalLookup from './pages/AnimalLookup'
import CaptureScreen from './pages/CaptureScreen'
import LandmarkAdjustment from './pages/LandmarkAdjustment'
import EvaluationReview from './pages/EvaluationReview'
import EvaluationHistory from './pages/EvaluationHistory'
import Profile from './pages/Profile'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public authentication route */}
        <Route path="/login" element={<Login />} />

        {/* Authenticated routes with App Shell & Navigation */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/animals/new" element={<AnimalLookup />} />
            <Route path="/evaluations" element={<EvaluationHistory />} />
            <Route path="/evaluations/capture" element={<CaptureScreen />} />
            <Route path="/evaluations/:id/adjust" element={<LandmarkAdjustment />} />
            <Route path="/evaluations/:id/review" element={<EvaluationReview />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
        </Route>

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  )
}
