// STEP 2: Add fonts + AuthProvider
import React from 'react';
import { useMontserratFonts } from './config/fonts';
import { AuthProvider } from './contexts/AuthContext';

export default function App() {
  const fontsLoaded = useMontserratFonts();
  
  console.log('[STEP 2] Fonts loaded:', fontsLoaded);
  
  if (!fontsLoaded) {
    return (
      <div style={{ padding: 20, backgroundColor: '#1a1a1a', color: '#fff' }}>
        <p>Loading fonts...</p>
      </div>
    );
  }
  
  return (
    <AuthProvider>
      <div style={{ 
        padding: 20, 
        backgroundColor: '#1a1a1a', 
        color: '#fff',
        minHeight: '100vh'
      }}>
        <h1>Step 2: Fonts + AuthProvider Test</h1>
        <p>✅ Fonts loaded successfully!</p>
        <p>✅ AuthProvider initialized!</p>
        <p>If you see this, AuthProvider is working.</p>
        <p>If it freezes here, the issue is in AuthProvider initialization.</p>
      </div>
    </AuthProvider>
  );
}

