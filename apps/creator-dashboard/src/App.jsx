import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { MediaUploadProvider } from './contexts/MediaUploadContext';
import { BackgroundTaskProvider } from './contexts/BackgroundTaskContext';
import UploadStatusCard from './components/ui/UploadStatusCard';
import BackgroundTaskCard from './components/ui/BackgroundTaskCard';
import ProtectedRoute from './components/ProtectedRoute';
import DebugScreenTracker from './components/DebugScreenTracker';
import ErrorBoundary from './components/ErrorBoundary';
import './App.css';

// Every route screen is lazy-loaded so the entry bundle carries only the app
// shell (providers, ProtectedRoute, ErrorBoundary). Each screen becomes its own
// chunk loaded on navigation — previously all ~28 screens shipped in one 2.8 MB
// bundle that every coach parsed on cold start.
const LoginScreen = lazy(() => import('./screens/LoginScreen'));
const LibraryExercisesScreen = lazy(() => import('./screens/LibraryExercisesScreen'));
const LibrarySessionDetailScreen = lazy(() => import('./screens/LibrarySessionDetailScreen'));
const ProgramDetailScreen = lazy(() => import('./screens/ProgramDetailScreen'));
const BundleDetailScreen = lazy(() => import('./screens/BundleDetailScreen'));
const LibraryContentScreen = lazy(() => import('./screens/LibraryContentScreen'));
const OnboardingEducation = lazy(() => import('./screens/onboarding/OnboardingEducation'));
const CompleteProfileScreen = lazy(() => import('./screens/CompleteProfileScreen'));
const ProfileScreen = lazy(() => import('./screens/ProfileScreen'));
const ClientScreen = lazy(() => import('./screens/ClientScreen'));
const PlanDetailScreen = lazy(() => import('./screens/PlanDetailScreen'));
const PlanSessionDetailScreen = lazy(() => import('./screens/PlanSessionDetailScreen'));
const MealEditorScreen = lazy(() => import('./screens/MealEditorScreen'));
const PlanEditorScreen = lazy(() => import('./screens/PlanEditorScreen'));
const NutritionProgramEditorScreen = lazy(() => import('./screens/NutritionProgramEditorScreen'));
const CreateLibrarySessionScreen = lazy(() => import('./screens/CreateLibrarySessionScreen'));
const EventsScreen = lazy(() => import('./screens/EventsScreen'));
const DocumentsScreen = lazy(() => import('./screens/DocumentsScreen'));
const EventResultsScreen = lazy(() => import('./screens/EventResultsScreen'));
const EventCheckinScreen = lazy(() => import('./screens/EventCheckinScreen'));
const ApiKeysScreen = lazy(() => import('./screens/ApiKeysScreen'));
const AppResourcesScreen = lazy(() => import('./screens/AppResourcesScreen'));
const AdminSalesScreen = lazy(() => import('./screens/AdminSalesScreen'));
const DashboardScreen = lazy(() => import('./screens/DashboardScreen'));
const BibliotecaScreen = lazy(() => import('./screens/BibliotecaScreen'));
const ProgramasScreen = lazy(() => import('./screens/ProgramasScreen'));
const ClientesScreen = lazy(() => import('./screens/ClientesScreen'));
const BibliotecaGuideTest = lazy(() => import('./screens/biblioteca-guide/BibliotecaGuideTest'));

function RouteFallback() {
  return <div style={{ minHeight: '100vh' }} aria-hidden="true" />;
}

const RedirectLibrarySessionEdit = () => {
  const { sessionId } = useParams();
  return <Navigate to={`/content/sessions/${sessionId}`} replace />;
};

const CREATOR_BASE = '/creators';

function AppContent() {
  return (
    <Router basename={CREATOR_BASE}>
        <div className="App">
          <Suspense fallback={<RouteFallback />}>
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
              path="/nutrition/programs/:programId"
              element={
                <ProtectedRoute>
                  <DebugScreenTracker name="NutritionProgramEditorScreen"><NutritionProgramEditorScreen /></DebugScreenTracker>
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
            <Route path="/documentos" element={<DocumentsScreen />} />
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
              path="/admin/sales"
              element={
                <ProtectedRoute>
                  <DebugScreenTracker name="AdminSalesScreen"><AdminSalesScreen /></DebugScreenTracker>
                </ProtectedRoute>
              }
            />
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
          </Suspense>
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
            <BackgroundTaskProvider>
              <AppContent />
              <UploadStatusCard />
              <BackgroundTaskCard />
            </BackgroundTaskProvider>
          </MediaUploadProvider>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
