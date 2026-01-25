import React, { useState, useEffect, useMemo } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';
import firestoreService from '../services/firestoreService';
import { withErrorBoundary } from '../utils/withErrorBoundary';

// Import navigators
import AuthNavigator from './AuthNavigator';
import MainTabNavigator from './MainTabNavigator';

// Import screens that might be accessed from anywhere
import LoadingScreen from '../screens/LoadingScreen';
import OnboardingNavigator from './OnboardingNavigator';
import OnboardingScreen from '../screens/OnboardingScreen';

import logger from '../utils/logger.js';
const Stack = createStackNavigator();

const AppNavigator = () => {
  const { user, loading } = useAuth();
  const [userProfile, setUserProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Function to refresh user profile (can be called from onboarding)
  const refreshUserProfile = () => {
    setRefreshKey(prev => prev + 1);
  };

  // Check user profile when user is authenticated
  useEffect(() => {
    const checkUserProfile = async () => {
      if (user && !loading) {
        setProfileLoading(true);
        try {
          // Small delay to ensure user document is created after registration
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          const profile = await firestoreService.getUser(user.uid);
          logger.log('🔍 User profile loaded:', profile);
          logger.log('🔍 Onboarding completed?', profile?.onboardingCompleted);
          
          if (profile) {
            setUserProfile(profile);
            
            // Cache onboarding status for offline access
            try {
              await AsyncStorage.setItem(`onboarding_status_${user.uid}`, JSON.stringify({
                onboardingCompleted: profile.onboardingCompleted ?? false,
                profileCompleted: profile.profileCompleted ?? false,
                cachedAt: Date.now()
              }));
              logger.log('💾 Onboarding status cached from Firestore');
            } catch (cacheError) {
              logger.warn('⚠️ Failed to cache onboarding status:', cacheError);
              // Continue anyway - not critical
            }
          } else {
            // New user - no profile exists yet. Start with Registro (profile) first.
            logger.log('🆕 New user detected, starting onboarding (profile first)');
            setUserProfile({ profileCompleted: false, onboardingCompleted: false });
          }
        } catch (error) {
          logger.error('Error fetching user profile:', error);
          
          // Handle offline/network errors gracefully - check cached onboarding status first
          try {
            const cachedOnboardingStatus = await AsyncStorage.getItem(`onboarding_status_${user.uid}`);
            if (cachedOnboardingStatus) {
              const status = JSON.parse(cachedOnboardingStatus);
              logger.log('📱 Device is offline, using cached onboarding status:', status);
              setUserProfile({
                profileCompleted: status.profileCompleted ?? false,
                onboardingCompleted: status.onboardingCompleted ?? false
              });
            } else {
              // No cached status - default to showing onboarding
              logger.log('📱 Device is offline, no cached onboarding status - showing onboarding');
              setUserProfile({ profileCompleted: false, onboardingCompleted: false });
            }
          } catch (cacheError) {
            // If reading cache fails, default to onboarding
            logger.error('Error reading cached onboarding status:', cacheError);
            logger.log('📱 Device is offline, error reading cache - showing onboarding');
            setUserProfile({ profileCompleted: false, onboardingCompleted: false });
          }
        } finally {
          setProfileLoading(false);
        }
      } else if (!user) {
        // Reset states when user logs out
        setUserProfile(null);
        setProfileLoading(false);
      }
    };

    checkUserProfile();
  }, [user, loading, refreshKey]);

  // Show loading while checking auth
  if (loading) {
    return <LoadingScreen />;
  }

  // Show loading while checking user profile for authenticated users
  if (user && profileLoading) {
    logger.log('🔄 Loading user profile...');
    return <LoadingScreen />;
  }

  // Debug logging for navigation decisions
  logger.log('🧭 Navigation decision:');
  logger.log('  - User:', user ? 'authenticated' : 'not authenticated');
  logger.log('  - User profile:', userProfile ? 'loaded' : 'not loaded');
  logger.log('  - Onboarding completed:', userProfile?.onboardingCompleted);

  // Memoize wrapped components to prevent recreation on every render
  const WrappedOnboardingScreen = useMemo(
    () => withErrorBoundary(
      (props) => <OnboardingScreen {...props} onComplete={refreshUserProfile} />,
      'OnboardingProfile'
    ),
    [refreshUserProfile]
  );

  const WrappedOnboardingNavigator = useMemo(
    () => withErrorBoundary(
      (props) => <OnboardingNavigator {...props} onComplete={refreshUserProfile} />,
      'Onboarding'
    ),
    [refreshUserProfile]
  );

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          gestureEnabled: true,
          cardStyle: { backgroundColor: '#1a1a1a' },
        }}
      >
        {!user ? (
          // User is not authenticated - show auth flow
          <Stack.Screen name="Auth" component={AuthNavigator} />
        ) : !userProfile ? (
          // User is authenticated but we haven't loaded their profile yet - show loading
          <Stack.Screen name="Loading" component={withErrorBoundary(LoadingScreen, 'Loading')} />
        ) : (userProfile.onboardingCompleted === false && (userProfile.profileCompleted === false || userProfile.profileCompleted === undefined)) ? (
          // User hasn't completed base profile (or field missing) → show profile first
          <Stack.Screen name="OnboardingProfile" component={WrappedOnboardingScreen} />
        ) : userProfile.onboardingCompleted === false ? (
          // Base profile done, show the new multi-screen onboarding
          <Stack.Screen name="Onboarding" component={WrappedOnboardingNavigator} />
        ) : (
          // User is authenticated and has completed onboarding - show main app
          <Stack.Screen name="MainApp" component={MainTabNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;


