import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import Placeholder from "./components/Placeholder";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import AnimalLookup from "./pages/AnimalLookup";

export default function App() {
  return (
    <Routes>
      {/* Public route: no bottom nav */}
      <Route path="/login" element={<Login />} />

      {/* Everything below requires a signed-in user */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route
            path="/dashboard"
            element={<Placeholder title="Dashboard" />}
          />
          <Route path="/animals/new" element={<AnimalLookup />} />{" "}
          <Route
            path="/evaluations"
            element={<Placeholder title="Evaluation History" />}
          />
          <Route
            path="/evaluations/capture"
            element={<Placeholder title="Capture Photos" />}
          />
          <Route
            path="/evaluations/:id/adjust"
            element={<Placeholder title="Adjust Keypoints" />}
          />
          <Route
            path="/evaluations/:id/review"
            element={<Placeholder title="Review Scores" />}
          />
          <Route path="/profile" element={<Placeholder title="Profile" />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
