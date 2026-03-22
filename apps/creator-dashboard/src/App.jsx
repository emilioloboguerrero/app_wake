import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { MediaUploadProvider } from './contexts/MediaUploadContext';
import LoginScreen from './screens/LoginScreen';
import LibraryExercisesScreen from './screens/LibraryExercisesScreen';
import LibrarySessionDetailScreen from './screens/LibrarySessionDetailScreen';
import ProgramDetailScreen from './screens/ProgramDetailScreen';
import LibraryContentScreen from './screens/LibraryContentScreen';
import CreatorOnboardingScreen from './screens/CreatorOnboardingScreen';

import ProfileScreen from './screens/ProfileScreen';
import ClientProgramScreen from './screens/ClientProgramScreen';
import PlanDetailScreen from './screens/PlanDetailScreen';
import PlanSessionDetailScreen from './screens/PlanSessionDetailScreen';
import MealEditorScreen from './screens/MealEditorScreen';
import PlanEditorScreen from './screens/PlanEditorScreen';
import CreateLibrarySessionScreen from './screens/CreateLibrarySessionScreen';
import EventsScreen from './screens/EventsScreen';
import EventResultsScreen from './screens/EventResultsScreen';
import EventEditorScreen from './screens/EventEditorScreen';
import EventCheckinScreen from './screens/EventCheckinScreen';
import ApiKeysScreen from './screens/ApiKeysScreen';
import DashboardScreen from './screens/DashboardScreen';
import ProtectedRoute from './components/ProtectedRoute';

// New IA screens
import BibliotecaScreen from './screens/BibliotecaScreen';
import ProgramasScreen from './screens/ProgramasScreen';
import ClientesScreen from './screens/ClientesScreen';

import './App.css';

const RedirectLibrarySessionEdit = () => {
  const { sessionId } = useParams();
  return <Navigate to={`/content/sessions/${sessionId}`} replace />;
};

const CREATOR_BASE = '/creators';

function AppContent() {
  return (
    <Router basename={CREATOR_BASE}>
        <div className="App">
          <Routes>
            <Route path="/login" element={<LoginScreen />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardScreen />
                </ProtectedRoute>
              }
            />
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute requireOnboarding={false}>
                  <CreatorOnboardingScreen />
                </ProtectedRoute>
              }
            />
            <Route
              path="/libraries"
              element={
                <ProtectedRoute>
                  <Navigate to="/biblioteca" replace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/libraries/:libraryId"
              element={
                <ProtectedRoute>
                  <LibraryExercisesScreen />
                </ProtectedRoute>
              }
            />
            <Route
              path="/content/sessions/:sessionId"
              element={
                <ProtectedRoute>
                  <LibrarySessionDetailScreen />
                </ProtectedRoute>
              }
            />
            <Route path="/content/modules/:moduleId" element={<Navigate to="/biblioteca" replace />} />
            <Route
              path="/plans/:planId/modules/:moduleId/sessions/:sessionId/edit"
              element={
                <ProtectedRoute>
                  <LibrarySessionDetailScreen />
                </ProtectedRoute>
              }
            />
            <Route
              path="/plans/:planId/modules/:moduleId/sessions/:sessionId"
              element={
                <ProtectedRoute>
                  <PlanSessionDetailScreen />
                </ProtectedRoute>
              }
            />
            <Route
              path="/plans/:planId"
              element={
                <ProtectedRoute>
                  <PlanDetailScreen />
                </ProtectedRoute>
              }
            />
            {/* ── New IA screens ──────────────────────────────── */}
            <Route
              path="/biblioteca"
              element={
                <ProtectedRoute>
                  <BibliotecaScreen />
                </ProtectedRoute>
              }
            />
            <Route
              path="/programas"
              element={
                <ProtectedRoute>
                  <ProgramasScreen />
                </ProtectedRoute>
              }
            />
            <Route
              path="/clientes"
              element={
                <ProtectedRoute>
                  <ClientesScreen />
                </ProtectedRoute>
              }
            />
            <Route
              path="/clientes/programa/:programId"
              element={
                <ProtectedRoute>
                  <ProgramDetailScreen backTo="/clientes?tab=asesorias" />
                </ProtectedRoute>
              }
            />
            {/* ── Legacy redirects ─────────────────────────────── */}
            <Route path="/content" element={<Navigate to="/biblioteca" replace />} />
            <Route path="/products" element={<Navigate to="/clientes" replace />} />
            <Route path="/products/new" element={<Navigate to="/programas" replace />} />
            <Route path="/programs" element={<Navigate to="/programas" replace />} />
            <Route
              path="/programs/:programId"
              element={
                <ProtectedRoute>
                  <ProgramDetailScreen backTo="/programas" />
                </ProtectedRoute>
              }
            />
            <Route path="/lab" element={<Navigate to="/dashboard" replace />} />
            <Route path="/clients" element={<Navigate to="/clientes" replace />} />
            <Route path="/one-on-one" element={<Navigate to="/clientes" replace />} />
            <Route
              path="/clients/:clientId"
              element={
                <ProtectedRoute>
                  <ClientProgramScreen />
                </ProtectedRoute>
              }
            />
            <Route
              path="/one-on-one/:clientId"
              element={
                <ProtectedRoute>
                  <ClientProgramScreen />
                </ProtectedRoute>
              }
            />
            <Route path="/availability" element={<Navigate to="/clientes?tab=llamadas" replace />} />
            <Route path="/nutrition" element={<Navigate to="/biblioteca?domain=nutricion" replace />} />
            <Route
              path="/nutrition/meals/new"
              element={
                <ProtectedRoute>
                  <MealEditorScreen />
                </ProtectedRoute>
              }
            />
            <Route
              path="/nutrition/meals/:mealId"
              element={
                <ProtectedRoute>
                  <MealEditorScreen />
                </ProtectedRoute>
              }
            />
            <Route
              path="/nutrition/plans/:planId"
              element={
                <ProtectedRoute>
                  <PlanEditorScreen />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <ProfileScreen />
                </ProtectedRoute>
              }
            />
            <Route
              path="/api-keys"
              element={
                <ProtectedRoute>
                  <ApiKeysScreen />
                </ProtectedRoute>
              }
            />
            <Route
              path="/library/sessions/:sessionId/edit"
              element={
                <ProtectedRoute>
                  <RedirectLibrarySessionEdit />
                </ProtectedRoute>
              }
            />
            <Route
              path="/library/sessions/new"
              element={
                <ProtectedRoute>
                  <CreateLibrarySessionScreen />
                </ProtectedRoute>
              }
            />
            <Route path="/library/modules/new" element={<Navigate to="/biblioteca" replace />} />
            <Route
              path="/library/content"
              element={
                <ProtectedRoute>
                  <LibraryContentScreen />
                </ProtectedRoute>
              }
            />
            <Route
              path="/library/content/sessions/:sessionId"
              element={
                <ProtectedRoute>
                  <LibraryContentScreen />
                </ProtectedRoute>
              }
            />
            <Route
              path="/library/content/modules/:moduleId"
              element={
                <ProtectedRoute>
                  <LibraryContentScreen />
                </ProtectedRoute>
              }
            />
            <Route
              path="/library/content/modules/:moduleId/sessions/:sessionId"
              element={
                <ProtectedRoute>
                  <LibraryContentScreen />
                </ProtectedRoute>
              }
            />
            <Route
              path="/events"
              element={
                <ProtectedRoute>
                  <EventsScreen />
                </ProtectedRoute>
              }
            />
            <Route
              path="/events/new"
              element={
                <ProtectedRoute>
                  <EventEditorScreen />
                </ProtectedRoute>
              }
            />
            <Route
              path="/events/:eventId/edit"
              element={
                <ProtectedRoute>
                  <EventResultsScreen />
                </ProtectedRoute>
              }
            />
            <Route
              path="/events/:eventId/results"
              element={
                <ProtectedRoute>
                  <EventResultsScreen />
                </ProtectedRoute>
              }
            />
            <Route
              path="/events/:eventId/checkin"
              element={
                <ProtectedRoute>
                  <EventCheckinScreen />
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </Router>
  );
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <MediaUploadProvider>
          <AppContent />
        </MediaUploadProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
