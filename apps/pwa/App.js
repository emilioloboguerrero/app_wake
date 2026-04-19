import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Text } from 'react-native';
import { AuthProvider } from './src/contexts/AuthContext';
import { VideoProvider } from './src/contexts/VideoContext';
import { ActivityStreakProvider } from './src/contexts/ActivityStreakContext';
import AppNavigator from './src/navigation/AppNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';
import workoutProgressService from './src/data-management/workoutProgressService';
import appSessionManager from './src/data-management/appSessionManager';
import assetBundleService from './src/services/assetBundleService';
import { useInterFonts } from './src/config/fonts';
import { initializeMonitoring } from './src/services/monitoringService';
import { auth } from './src/config/firebase';
import logger from './src/utils/logger';

// Global font configuration - this approach is more reliable
// We'll use a custom Text component instead of overriding defaultProps

export default function App() {
  const fontsLoaded = useInterFonts();

  useEffect(() => {
    // Initialize workout progress system on app startup
    const initializeApp = async () => {
      try {
        logger.log('🚀 Starting app initialization...');
        logger.log('⏰ Initialization timestamp:', new Date().toISOString());
        
        // Check auth state before initialization
        const currentUser = auth.currentUser;
        logger.log('🔐 Auth state at initialization start:', {
          isAuthenticated: !!currentUser,
          userId: currentUser?.uid || 'none',
          email: currentUser?.email || 'none'
        });
        
        // Initialize session manager first (tracks cold starts)
        logger.log('📊 Initializing session manager...');
        await appSessionManager.initialize();
        logger.log('✅ Session manager initialized');
        
        // Initialize the workout progress system
        logger.log('📈 Initializing workout progress service...');
        await workoutProgressService.initialize();
        logger.log('✅ Workout progress service initialized');

        // Initialize asset bundle (downloads all remote assets for current version once)
        logger.log('📦 Initializing asset bundle service...');
        logger.log('⚠️ Note: Asset bundle initialization may fail if Firestore rules require auth');
        await assetBundleService.initialize();
        logger.log('✅ Asset bundle service initialized');
        
        // Initialize monitoring system
        logger.log('📊 Initializing monitoring service...');
        await initializeMonitoring();
        logger.log('✅ Monitoring service initialized');
        
        
        logger.log('✅ App initialization completed successfully');
      } catch (error) {
        logger.error('❌ App initialization failed');
        logger.error('Error details:', {
          message: error.message,
          code: error.code,
          stack: error.stack?.split('\n').slice(0, 5).join('\n') // First 5 lines of stack
        });
        logger.error('Full error:', error);
      }
    };
    
    if (fontsLoaded) {
      logger.log('🎨 Fonts loaded, starting app initialization...');
      initializeApp();
    } else {
      logger.log('⏳ Waiting for fonts to load...');
    }
  }, [fontsLoaded]);


  if (!fontsLoaded) {
    return null; // Wait for fonts to load
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        <ActivityStreakProvider>
          <VideoProvider>
            <AppNavigator />
            <StatusBar style="light" />
          </VideoProvider>
        </ActivityStreakProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

