// STEP 4: Add BrowserRouter + ErrorBoundary
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { useMontserratFonts } from './config/fonts';
import { AuthProvider } from './contexts/AuthContext';
import { VideoProvider } from './contexts/VideoContext';
import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  const fontsLoaded = useMontserratFonts();
  
  console.log('[STEP 4] Fonts loaded:', fontsLoaded);
  
  if (!fontsLoaded) {
    return (
      <div style={{ padding: 20, backgroundColor: '#1a1a1a', color: '#fff' }}>
        <p>Loading fonts...</p>
      </div>
    );
  }
  
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <VideoProvider>
            <div style={{ 
              padding: 20, 
              backgroundColor: '#1a1a1a', 
              color: '#fff',
              minHeight: '100vh'
            }}>
              <h1>Step 4: BrowserRouter + ErrorBoundary Test</h1>
              <p>✅ Fonts loaded successfully!</p>
              <p>✅ AuthProvider initialized!</p>
              <p>✅ VideoProvider initialized!</p>
              <p>✅ BrowserRouter initialized!</p>
              <p>✅ ErrorBoundary initialized!</p>
              <p>If you see this, routing is working.</p>
              <p>If it freezes here, the issue is in BrowserRouter or ErrorBoundary.</p>
            </div>
          </VideoProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

