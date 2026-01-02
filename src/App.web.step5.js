// STEP 5: Add WebAppNavigator (but skip initialization code)
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { StatusBar } from 'expo-status-bar';
import { useMontserratFonts } from './config/fonts';
import { AuthProvider } from './contexts/AuthContext';
import { VideoProvider } from './contexts/VideoContext';
import WebAppNavigator from './navigation/WebAppNavigator';
import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  const fontsLoaded = useMontserratFonts();
  
  console.log('[STEP 5] Fonts loaded:', fontsLoaded);
  
  if (!fontsLoaded) {
    return null;
  }
  
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <VideoProvider>
            <WebAppNavigator />
            <StatusBar style="light" />
          </VideoProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

