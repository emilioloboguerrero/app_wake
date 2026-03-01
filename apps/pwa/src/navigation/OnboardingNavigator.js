import React, { useState, useMemo, useEffect } from 'react';
import { Platform } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';
import hybridDataService from '../services/hybridDataService';
import { withErrorBoundary } from '../utils/withErrorBoundary';
import OnboardingQuestion1 from '../screens/onboarding/OnboardingQuestion1';
import OnboardingQuestion2 from '../screens/onboarding/OnboardingQuestion2';
import OnboardingQuestion3 from '../screens/onboarding/OnboardingQuestion3';
import OnboardingQuestion4 from '../screens/onboarding/OnboardingQuestion4';
import OnboardingQuestion5 from '../screens/onboarding/OnboardingQuestion5';
import OnboardingQuestion6 from '../screens/onboarding/OnboardingQuestion6';
import OnboardingQuestion7 from '../screens/onboarding/OnboardingQuestion7';
import OnboardingComplete from '../screens/onboarding/OnboardingComplete';
import logger from '../utils/logger';

const Stack = createStackNavigator();

const getEffectiveUid = (user) => {
  if (user?.uid) return user.uid;
  if (Platform.OS === 'web') {
    try {
      const { auth } = require('../config/firebase');
      return auth?.currentUser?.uid ?? null;
    } catch {
      return null;
    }
  }
  return null;
};

const OnboardingNavigator = ({ onComplete }) => {
  const { user } = useAuth();
  const [onboardingAnswers, setOnboardingAnswers] = useState({});
  const effectiveUid = getEffectiveUid(user);

  useEffect(() => {
    logger.log('[ONBOARDING_NAV] mounted. uid:', effectiveUid);
    if (!effectiveUid) logger.warn('[ONBOARDING_NAV] No uid in OnboardingNavigator');
  }, [effectiveUid]);

  const handleAnswer = (questionKey, answer) => {
    setOnboardingAnswers(prev => ({ ...prev, [questionKey]: answer }));
  };

  const handleComplete = async () => {
    const uid = effectiveUid;
    if (!uid) {
      logger.warn('[ONBOARDING_NAV] handleComplete: no uid, skipping save');
      if (onComplete) onComplete();
      return;
    }

    try {
      const userData = {
        onboardingData: {
          primaryGoal: onboardingAnswers.primaryGoal || null,
          trainingExperience: onboardingAnswers.trainingExperience || null,
          trainingDaysPerWeek: onboardingAnswers.trainingDaysPerWeek || null,
          sessionDuration: onboardingAnswers.sessionDuration || null,
          equipment: onboardingAnswers.equipment || null,
          nutritionGoal: onboardingAnswers.nutritionGoal || null,
          dietaryRestrictions: onboardingAnswers.dietaryRestrictions || [],
          sleepHours: onboardingAnswers.sleepHours || null,
          stressLevel: onboardingAnswers.stressLevel || null,
          completedAt: new Date().toISOString(),
        },
        onboardingCompleted: true,
        profileCompleted: true,
      };

      logger.debug('📝 Saving onboarding data. uid:', uid, userData.onboardingData);

      try {
        await AsyncStorage.setItem(`onboarding_status_${uid}`, JSON.stringify({
          onboardingCompleted: true,
          profileCompleted: true,
          cachedAt: Date.now(),
        }));
      } catch (cacheError) {
        logger.warn('⚠️ Failed to cache onboarding status:', cacheError);
      }

      if (Platform.OS === 'web') {
        try {
          const webStorageService = require('../services/webStorageService').default;
          await webStorageService.setItem(`onboarding_status_${uid}`, JSON.stringify({
            onboardingCompleted: true,
            profileCompleted: true,
            cachedAt: Date.now(),
          }));
        } catch (e) {
          logger.warn('[ONBOARDING_NAV] Web cache write failed:', e?.message);
        }
      }

      await hybridDataService.updateUserProfile(uid, userData);
      logger.debug('✅ Onboarding completed successfully. uid:', uid);

      if (onComplete) onComplete();
    } catch (error) {
      logger.error('Error completing onboarding:', error);
      if (onComplete) onComplete();
    }
  };

  const WrappedQuestion1 = useMemo(() => withErrorBoundary((props) => <OnboardingQuestion1 {...props} onAnswer={handleAnswer} />, 'OnboardingQuestion1'), [handleAnswer]);
  const WrappedQuestion2 = useMemo(() => withErrorBoundary((props) => <OnboardingQuestion2 {...props} onAnswer={handleAnswer} />, 'OnboardingQuestion2'), [handleAnswer]);
  const WrappedQuestion3 = useMemo(() => withErrorBoundary((props) => <OnboardingQuestion3 {...props} onAnswer={handleAnswer} />, 'OnboardingQuestion3'), [handleAnswer]);
  const WrappedQuestion4 = useMemo(() => withErrorBoundary((props) => <OnboardingQuestion4 {...props} onAnswer={handleAnswer} />, 'OnboardingQuestion4'), [handleAnswer]);
  const WrappedQuestion5 = useMemo(() => withErrorBoundary((props) => <OnboardingQuestion5 {...props} onAnswer={handleAnswer} />, 'OnboardingQuestion5'), [handleAnswer]);
  const WrappedQuestion6 = useMemo(() => withErrorBoundary((props) => <OnboardingQuestion6 {...props} onAnswer={handleAnswer} />, 'OnboardingQuestion6'), [handleAnswer]);
  const WrappedQuestion7 = useMemo(() => withErrorBoundary((props) => <OnboardingQuestion7 {...props} onAnswer={handleAnswer} />, 'OnboardingQuestion7'), [handleAnswer]);
  const WrappedComplete = useMemo(() => withErrorBoundary((props) => <OnboardingComplete {...props} onComplete={handleComplete} answers={onboardingAnswers} />, 'OnboardingComplete'), [handleComplete, onboardingAnswers]);

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
      <Stack.Screen name="OnboardingQuestion6" component={WrappedQuestion6} />
      <Stack.Screen name="OnboardingQuestion7" component={WrappedQuestion7} />
      <Stack.Screen name="OnboardingComplete" component={WrappedComplete} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
};

export default OnboardingNavigator;
