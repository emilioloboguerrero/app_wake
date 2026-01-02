// STEP 3: Add fonts + AuthProvider + VideoProvider
import React from 'react';
import { useMontserratFonts } from './config/fonts';
import { AuthProvider } from './contexts/AuthContext';
import { VideoProvider } from './contexts/VideoContext';

export default function App() {
  const fontsLoaded = useMontserratFonts();
  
  console.log('[STEP 3] Fonts loaded:', fontsLoaded);
  
  if (!fontsLoaded) {
    return (
      <div style={{ padding: 20, backgroundColor: '#1a1a1a', color: '#fff' }}>
        <p>Loading fonts...</p>
      </div>
    );
  }
  
  return (
    <AuthProvider>
      <VideoProvider>
        <div style={{ 
          padding: 20, 
          backgroundColor: '#1a1a1a', 
          color: '#fff',
          minHeight: '100vh'
        }}>
          <h1>Step 3: Fonts + AuthProvider + VideoProvider Test</h1>
          <p>✅ Fonts loaded successfully!</p>
          <p>✅ AuthProvider initialized!</p>
          <p>✅ VideoProvider initialized!</p>
          <p>If you see this, VideoProvider is working.</p>
          <p>If it freezes here, the issue is in VideoProvider initialization.</p>
        </div>
      </VideoProvider>
    </AuthProvider>
  );
}

