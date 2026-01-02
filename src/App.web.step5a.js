// STEP 5a: Test WebAppNavigator with a simple test route (skip LoginScreen)
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { StatusBar } from 'expo-status-bar';
import { useMontserratFonts } from './config/fonts';
import { AuthProvider } from './contexts/AuthContext';
import { VideoProvider } from './contexts/VideoContext';
import ErrorBoundary from './components/ErrorBoundary';

// Simple test component instead of LoginScreen
const TestScreen = () => (
  <div style={{ padding: 20, backgroundColor: '#1a1a1a', color: '#fff', minHeight: '100vh' }}>
    <h1>Test Screen</h1>
    <p>✅ Navigation is working!</p>
    <p>If you see this, WebAppNavigator structure is fine.</p>
    <p>The issue is likely in LoginScreen or a specific route.</p>
  </div>
);

export default function App() {
  const fontsLoaded = useMontserratFonts();
  
  console.log('[STEP 5a] Fonts loaded:', fontsLoaded);
  
  if (!fontsLoaded) {
    return null;
  }
  
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <VideoProvider>
            <Routes>
              <Route path="/" element={<TestScreen />} />
              <Route path="/login" element={<TestScreen />} />
            </Routes>
            <StatusBar style="light" />
          </VideoProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

