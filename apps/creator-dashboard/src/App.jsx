import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { MediaUploadProvider } from './contexts/MediaUploadContext';
import UploadStatusCard from './components/ui/UploadStatusCard';
import LoginScreen from './screens/LoginScreen';
import LibraryExercisesScreen from './screens/LibraryExercisesScreen';
import LibrarySessionDetailScreen from './screens/LibrarySessionDetailScreen';
import ProgramDetailScreen from './screens/ProgramDetailScreen';
import BundleDetailScreen from './screens/BundleDetailScreen';
import LibraryContentScreen from './screens/LibraryContentScreen';
import OnboardingEducation from './screens/onboarding/OnboardingEducation';
import CompleteProfileScreen from './screens/CompleteProfileScreen';

import ProfileScreen from './screens/ProfileScreen';
import ClientScreen from './screens/ClientScreen';
import PlanDetailScreen from './screens/PlanDetailScreen';
import PlanSessionDetailScreen from './screens/PlanSessionDetailScreen';
import MealEditorScreen from './screens/MealEditorScreen';
import PlanEditorScreen from './screens/PlanEditorScreen';
import CreateLibrarySessionScreen from './screens/CreateLibrarySessionScreen';
import EventsScreen from './screens/EventsScreen';
import EventResultsScreen from './screens/EventResultsScreen';
import EventCheckinScreen from './screens/EventCheckinScreen';
import ApiKeysScreen from './screens/ApiKeysScreen';
import AppResourcesScreen from './screens/AppResourcesScreen';
import DashboardScreen from './screens/DashboardScreen';
import ProtectedRoute from './components/ProtectedRoute';

// New IA screens
import BibliotecaScreen from './screens/BibliotecaScreen';
import ProgramasScreen from './screens/ProgramasScreen';
import ClientesScreen from './screens/ClientesScreen';
import ReviewInboxScreen from './screens/ReviewInboxScreen';

import BibliotecaGuideTest from './screens/biblioteca-guide/BibliotecaGuideTest';
import DebugScreenTracker from './components/DebugScreenTracker';
import ErrorBoundary from './components/ErrorBoundary';
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
            <Route path="/login" element={<DebugScreenTracker name="LoginScreen"><LoginScreen /></DebugScreenTracker>} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DebugScreenTracker name="DashboardScreen"><DashboardScreen /></DebugScreenTracker>
                </ProtectedRoute>
              }
            />
            <Route
              path="/complete-profile"
              element={
                <ProtectedRoute requireOnboarding={false} requireCreator={false}>
                  <DebugScreenTracker name="CompleteProfileScreen"><CompleteProfileScreen /></DebugScreenTracker>
                </ProtectedRoute>
              }
            />
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute requireOnboarding={false}>
                  <DebugScreenTracker name="OnboardingEducation"><OnboardingEducation /></DebugScreenTracker>
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
                  <DebugScreenTracker name="LibraryExercisesScreen"><LibraryExercisesScreen /></DebugScreenTracker>
                </ProtectedRoute>
              }
            />
            <Route
              path="/content/sessions/:sessionId"
              element={
                <ProtectedRoute>
                  <DebugScreenTracker name="LibrarySessionDetailScreen"><LibrarySessionDetailScreen /></DebugScreenTracker>
                </ProtectedRoute>
              }
            />
            <Route path="/content/modules/:moduleId" element={<Navigate to="/biblioteca" replace />} />
            <Route
              path="/plans/:planId/modules/:moduleId/sessions/:sessionId/edit"
              element={
                <ProtectedRoute>
                  <DebugScreenTracker name="PlanSessionEditScreen"><LibrarySessionDetailScreen /></DebugScreenTracker>
                </ProtectedRoute>
              }
            />
            <Route
              path="/programs/:programId/modules/:moduleId/sessions/:sessionId/edit"
              element={
                <ProtectedRoute>
                  <DebugScreenTracker name="ProgramSessionEditScreen"><LibrarySessionDetailScreen /></DebugScreenTracker>
                </ProtectedRoute>
              }
            />
            <Route
              path="/plans/:planId/modules/:moduleId/sessions/:sessionId"
              element={
                <ProtectedRoute>
                  <DebugScreenTracker name="PlanSessionDetailScreen"><PlanSessionDetailScreen /></DebugScreenTracker>
                </ProtectedRoute>
              }
            />
            <Route
              path="/plans/:planId"
              element={
                <ProtectedRoute>
                  <DebugScreenTracker name="PlanDetailScreen"><PlanDetailScreen /></DebugScreenTracker>
                </ProtectedRoute>
              }
            />
            {/* ── New IA screens ──────────────────────────────── */}
            <Route
              path="/biblioteca"
              element={
                <ProtectedRoute>
                  <DebugScreenTracker name="BibliotecaScreen"><BibliotecaScreen /></DebugScreenTracker>
                </ProtectedRoute>
              }
            />
            <Route
              path="/programas"
              element={
                <ProtectedRoute>
                  <DebugScreenTracker name="ProgramasScreen"><ProgramasScreen /></DebugScreenTracker>
                </ProtectedRoute>
              }
            />
            <Route path="/bundles" element={<Navigate to="/programas?tab=bundles" replace />} />
            <Route
              path="/bundles/:bundleId"
              element={
                <ProtectedRoute>
                  <DebugScreenTracker name="BundleDetailScreen"><BundleDetailScreen /></DebugScreenTracker>
                </ProtectedRoute>
              }
            />
            <Route
              path="/clientes"
              element={
                <ProtectedRoute>
                  <DebugScreenTracker name="ClientesScreen"><ClientesScreen /></DebugScreenTracker>
                </ProtectedRoute>
              }
            />
            <Route
              path="/inbox"
              element={
                <ProtectedRoute>
                  <DebugScreenTracker name="ReviewInboxScreen"><ReviewInboxScreen /></DebugScreenTracker>
                </ProtectedRoute>
              }
            />
            <Route
              path="/clientes/programa/:programId"
              element={
                <ProtectedRoute>
                  <DebugScreenTracker name="ProgramDetailScreen"><ProgramDetailScreen backTo="/clientes?tab=asesorias" /></DebugScreenTracker>
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
                  <DebugScreenTracker name="ProgramDetailScreen"><ProgramDetailScreen backTo="/programas" /></DebugScreenTracker>
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
                  <DebugScreenTracker name="ClientScreen"><ClientScreen /></DebugScreenTracker>
                </ProtectedRoute>
              }
            />
            <Route
              path="/one-on-one/:clientId"
              element={
                <ProtectedRoute>
                  <DebugScreenTracker name="ClientScreen"><ClientScreen /></DebugScreenTracker>
                </ProtectedRoute>
              }
            />
            <Route path="/availability" element={<Navigate to="/clientes?tab=llamadas" replace />} />
            <Route path="/nutrition" element={<Navigate to="/biblioteca?domain=nutricion" replace />} />
            <Route
              path="/nutrition/meals/new"
              element={
                <ProtectedRoute>
                  <DebugScreenTracker name="MealEditorScreen"><MealEditorScreen /></DebugScreenTracker>
                </ProtectedRoute>
              }
            />
            <Route
              path="/nutrition/meals/:mealId"
              element={
                <ProtectedRoute>
                  <DebugScreenTracker name="MealEditorScreen"><MealEditorScreen /></DebugScreenTracker>
                </ProtectedRoute>
              }
            />
            <Route
              path="/nutrition/plans/:planId"
              element={
                <ProtectedRoute>
                  <DebugScreenTracker name="PlanEditorScreen"><PlanEditorScreen /></DebugScreenTracker>
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <DebugScreenTracker name="ProfileScreen"><ProfileScreen /></DebugScreenTracker>
                </ProtectedRoute>
              }
            />
            <Route
              path="/api-keys"
              element={
                <ProtectedRoute>
                  <DebugScreenTracker name="ApiKeysScreen"><ApiKeysScreen /></DebugScreenTracker>
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
                  <DebugScreenTracker name="CreateLibrarySessionScreen"><CreateLibrarySessionScreen /></DebugScreenTracker>
                </ProtectedRoute>
              }
            />
            <Route path="/library/modules/new" element={<Navigate to="/biblioteca" replace />} />
            <Route
              path="/library/content"
              element={
                <ProtectedRoute>
                  <DebugScreenTracker name="LibraryContentScreen"><LibraryContentScreen /></DebugScreenTracker>
                </ProtectedRoute>
              }
            />
            <Route
              path="/library/content/sessions/:sessionId"
              element={
                <ProtectedRoute>
                  <DebugScreenTracker name="LibraryContentScreen"><LibraryContentScreen /></DebugScreenTracker>
                </ProtectedRoute>
              }
            />
            <Route
              path="/library/content/modules/:moduleId"
              element={
                <ProtectedRoute>
                  <DebugScreenTracker name="LibraryContentScreen"><LibraryContentScreen /></DebugScreenTracker>
                </ProtectedRoute>
              }
            />
            <Route
              path="/library/content/modules/:moduleId/sessions/:sessionId"
              element={
                <ProtectedRoute>
                  <DebugScreenTracker name="LibraryContentScreen"><LibraryContentScreen /></DebugScreenTracker>
                </ProtectedRoute>
              }
            />
            <Route
              path="/events"
              element={
                <ProtectedRoute>
                  <DebugScreenTracker name="EventsScreen"><EventsScreen /></DebugScreenTracker>
                </ProtectedRoute>
              }
            />
            <Route
              path="/events/:eventId/edit"
              element={
                <ProtectedRoute>
                  <DebugScreenTracker name="EventResultsScreen"><EventResultsScreen /></DebugScreenTracker>
                </ProtectedRoute>
              }
            />
            <Route
              path="/events/:eventId/results"
              element={
                <ProtectedRoute>
                  <DebugScreenTracker name="EventResultsScreen"><EventResultsScreen /></DebugScreenTracker>
                </ProtectedRoute>
              }
            />
            <Route
              path="/events/:eventId/checkin"
              element={
                <ProtectedRoute>
                  <DebugScreenTracker name="EventCheckinScreen"><EventCheckinScreen /></DebugScreenTracker>
                </ProtectedRoute>
              }
            />
            {/* ── Admin routes ────────────────────────────────── */}
            <Route
              path="/admin/resources"
              element={
                <ProtectedRoute>
                  <DebugScreenTracker name="AppResourcesScreen"><AppResourcesScreen /></DebugScreenTracker>
                </ProtectedRoute>
              }
            />
            {/* ── Test routes ─────────────────────────────────── */}
            <Route path="/test/biblioteca-guide" element={<BibliotecaGuideTest />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </Router>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <MediaUploadProvider>
            <AppContent />
            <UploadStatusCard />
          </MediaUploadProvider>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
