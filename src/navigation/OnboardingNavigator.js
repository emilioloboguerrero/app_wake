import React, { useState, useMemo } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';
import hybridDataService from '../services/hybridDataService';
import firestoreService from '../services/firestoreService';
import { withErrorBoundary } from '../utils/withErrorBoundary';
import OnboardingQuestion1 from '../screens/onboarding/OnboardingQuestion1';
import OnboardingQuestion2 from '../screens/onboarding/OnboardingQuestion2';
import OnboardingQuestion3 from '../screens/onboarding/OnboardingQuestion3';
import OnboardingQuestion4 from '../screens/onboarding/OnboardingQuestion4';
import OnboardingQuestion5 from '../screens/onboarding/OnboardingQuestion5';
import OnboardingComplete from '../screens/onboarding/OnboardingComplete';
import logger from '../utils/logger';

const Stack = createStackNavigator();

const OnboardingNavigator = ({ onComplete }) => {
  const { user } = useAuth();
  const [onboardingAnswers, setOnboardingAnswers] = useState({});

  const handleAnswer = (questionKey, answer) => {
    setOnboardingAnswers(prev => ({
      ...prev,
      [questionKey]: answer
    }));
  };

  const handleComplete = async () => {
    try {
      // Organize all onboarding answers under onboardingData map
      const userData = {
        onboardingData: {
          motivation: onboardingAnswers.motivation || [],
          interests: onboardingAnswers.interests || [],
          activityLevel: onboardingAnswers.activityLevel || null,
          workoutPreference: onboardingAnswers.workoutPreference || null,
          obstacles: onboardingAnswers.obstacles || null,
          completedAt: new Date().toISOString(),
        },
        onboardingCompleted: true,
        profileCompleted: true,
      };

      logger.debug('📝 Saving onboarding data:', userData.onboardingData);

      // Cache onboarding status locally for offline access
      try {
        await AsyncStorage.setItem(`onboarding_status_${user.uid}`, JSON.stringify({
          onboardingCompleted: true,
          profileCompleted: true,
          cachedAt: Date.now()
        }));
        logger.debug('💾 Onboarding status cached locally');
      } catch (cacheError) {
        logger.warn('⚠️ Failed to cache onboarding status:', cacheError);
        // Continue anyway - Firestore update is more important
      }

      // Update user profile with onboarding data
      await hybridDataService.updateUserProfile(user.uid, userData);

      logger.debug('✅ Onboarding completed successfully');
      
      // Trigger completion callback
      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      logger.error('Error completing onboarding:', error);
      // Still call onComplete to avoid getting stuck
      if (onComplete) {
        onComplete();
      }
    }
  };

  // Create wrapped components with error boundaries - memoized to prevent recreation
  const WrappedQuestion1 = useMemo(() => withErrorBoundary((props) => <OnboardingQuestion1 {...props} onAnswer={handleAnswer} />, 'OnboardingQuestion1'), [handleAnswer]);
  const WrappedQuestion2 = useMemo(() => withErrorBoundary((props) => <OnboardingQuestion2 {...props} onAnswer={handleAnswer} />, 'OnboardingQuestion2'), [handleAnswer]);
  const WrappedQuestion3 = useMemo(() => withErrorBoundary((props) => <OnboardingQuestion3 {...props} onAnswer={handleAnswer} />, 'OnboardingQuestion3'), [handleAnswer]);
  const WrappedQuestion4 = useMemo(() => withErrorBoundary((props) => <OnboardingQuestion4 {...props} onAnswer={handleAnswer} />, 'OnboardingQuestion4'), [handleAnswer]);
  const WrappedQuestion5 = useMemo(() => withErrorBoundary((props) => <OnboardingQuestion5 {...props} onAnswer={handleAnswer} />, 'OnboardingQuestion5'), [handleAnswer]);
  const WrappedComplete = useMemo(() => withErrorBoundary((props) => <OnboardingComplete {...props} onComplete={handleComplete} />, 'OnboardingComplete'), [handleComplete]);

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        cardStyle: { backgroundColor: '#1a1a1a' },
      }}
    >
      <Stack.Screen name="OnboardingQuestion1" component={WrappedQuestion1} />
      <Stack.Screen name="OnboardingQuestion2" component={WrappedQuestion2} />
      <Stack.Screen name="OnboardingQuestion3" component={WrappedQuestion3} />
      <Stack.Screen name="OnboardingQuestion4" component={WrappedQuestion4} />
      <Stack.Screen name="OnboardingQuestion5" component={WrappedQuestion5} />
      <Stack.Screen name="OnboardingComplete" component={WrappedComplete} />
    </Stack.Navigator>
  );
};

export default OnboardingNavigator;
