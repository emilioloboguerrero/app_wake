import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import LoginScreen from './screens/LoginScreen';
import LibrariesScreen from './screens/LibrariesScreen';
import LibraryExercisesScreen from './screens/LibraryExercisesScreen';
import ProgramsScreen from './screens/ProgramsScreen';
import ProgramDetailScreen from './screens/ProgramDetailScreen';
import CreatorOnboardingScreen from './screens/CreatorOnboardingScreen';
import LabScreen from './screens/LabScreen';
import ProfileScreen from './screens/ProfileScreen';
import CoursePurchaseScreen from './screens/CoursePurchaseScreen';
import BibliotecaScreen from './screens/BibliotecaScreen';
import LegalDocumentsScreen from './screens/LegalDocumentsScreen';
import OneOnOneScreen from './screens/OneOnOneScreen';
import ClientProgramScreen from './screens/ClientProgramScreen';
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
              path="/libraries" 
              element={
                <ProtectedRoute>
                  <LibrariesScreen />
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
              path="/programs" 
              element={
                <ProtectedRoute>
                  <ProgramsScreen />
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
              path="/one-on-one" 
              element={
                <ProtectedRoute>
                  <OneOnOneScreen />
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
            <Route path="/legal" element={<LegalDocumentsScreen />} />
            <Route path="/" element={<Navigate to="/login" replace />} />
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

