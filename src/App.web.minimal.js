// MINIMAL WEB APP - Absolute minimum for testing
import React from 'react';
import LoginScreen from './screens/LoginScreen.web';

export default function App() {
  // Skip ALL initialization, providers, routing - just render login
  return <LoginScreen />;
}
