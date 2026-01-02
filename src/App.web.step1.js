// STEP 1: Add fonts back
import React from 'react';
import { useMontserratFonts } from './config/fonts';

export default function App() {
  const fontsLoaded = useMontserratFonts();
  
  console.log('[STEP 1] Fonts loaded:', fontsLoaded);
  
  if (!fontsLoaded) {
    return (
      <div style={{ padding: 20, backgroundColor: '#1a1a1a', color: '#fff' }}>
        <p>Loading fonts...</p>
      </div>
    );
  }
  
  return (
    <div style={{ 
      padding: 20, 
      backgroundColor: '#1a1a1a', 
      color: '#fff',
      minHeight: '100vh'
    }}>
      <h1>Step 1: Fonts Test</h1>
      <p>✅ Fonts loaded successfully!</p>
      <p>If you see this, fonts are working.</p>
      <p>If it freezes here, the issue is in font loading.</p>
    </div>
  );
}

