import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import LoginScreen from './screens/LoginScreen';
import LibrariesScreen from './screens/LibrariesScreen';
import LibraryExercisesScreen from './screens/LibraryExercisesScreen';
import ProgramsScreen from './screens/ProgramsScreen';
import ProgramDetailScreen from './screens/ProgramDetailScreen';
import LibraryContentScreen from './screens/LibraryContentScreen';
import CreatorOnboardingScreen from './screens/CreatorOnboardingScreen';
import UserOnboardingScreen from './screens/UserOnboardingScreen';
import UserOnboardingQuestions from './screens/UserOnboardingQuestions';
import LabScreen from './screens/LabScreen';
import ProfileScreen from './screens/ProfileScreen';
import CoursePurchaseScreen from './screens/CoursePurchaseScreen';
import BibliotecaScreen from './screens/BibliotecaScreen';
import LegalDocumentsScreen from './screens/LegalDocumentsScreen';
import SupportScreen from './screens/SupportScreen';
import OneOnOneScreen from './screens/OneOnOneScreen';
import ClientProgramScreen from './screens/ClientProgramScreen';
import ContentHubScreen from './screens/ContentHubScreen';
import ProductsScreen from './screens/ProductsScreen';
import CreateLibrarySessionScreen from './screens/CreateLibrarySessionScreen';
import CreateLibraryModuleScreen from './screens/CreateLibraryModuleScreen';
import ProtectedRoute from './components/ProtectedRoute';
import './App.css';

function AppContent() {
  return (
    <Router>
        <div className="App">
          <Routes>
            <Route path="/login" element={<LoginScreen />} />
            <Route 
              path="/onboarding" 
              element={
                <ProtectedRoute requireOnboarding={false}>
                  <CreatorOnboardingScreen />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/user/onboarding" 
              element={
                <ProtectedRoute requireCreator={false} requireOnboarding={false}>
                  <UserOnboardingScreen />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/user/onboarding/questions" 
              element={
                <ProtectedRoute requireCreator={false} requireOnboarding={false}>
                  <UserOnboardingQuestions />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/libraries" 
              element={
                <ProtectedRoute>
                  <Navigate to="/content" replace />
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
              path="/plans/new" 
              element={
                <ProtectedRoute>
                  <ContentHubScreen />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/plans/:planId" 
              element={
                <ProtectedRoute>
                  <ContentHubScreen />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/content" 
              element={
                <ProtectedRoute>
                  <ContentHubScreen />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/products" 
              element={
                <ProtectedRoute>
                  <ProductsScreen />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/programs" 
              element={
                <ProtectedRoute>
                  <Navigate to="/products" replace />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/programs/:programId" 
              element={
                <ProtectedRoute>
                  <ProgramDetailScreen />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/lab" 
              element={
                <ProtectedRoute>
                  <LabScreen />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/clients" 
              element={
                <ProtectedRoute>
                  <OneOnOneScreen />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/one-on-one" 
              element={
                <ProtectedRoute>
                  <OneOnOneScreen />
                </ProtectedRoute>
              } 
            />
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
            <Route 
              path="/profile" 
              element={
                <ProtectedRoute requireCreator={false}>
                  <ProfileScreen />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/course/:courseId" 
              element={
                <ProtectedRoute requireCreator={false}>
                  <CoursePurchaseScreen />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/user/biblioteca" 
              element={
                <ProtectedRoute requireCreator={false}>
                  <BibliotecaScreen />
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
            <Route 
              path="/library/modules/new" 
              element={
                <ProtectedRoute>
                  <CreateLibraryModuleScreen />
                </ProtectedRoute>
              } 
            />
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
            <Route path="/legal" element={<LegalDocumentsScreen />} />
            <Route path="/support" element={<SupportScreen />} />
            <Route path="/" element={<SupportScreen />} />
          </Routes>
        </div>
      </Router>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;

