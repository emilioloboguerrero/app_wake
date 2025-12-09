import React, { useState } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';
import hybridDataService from '../services/hybridDataService';
import firestoreService from '../services/firestoreService';
import OnboardingQuestion1 from '../screens/onboarding/OnboardingQuestion1';
import OnboardingQuestion2 from '../screens/onboarding/OnboardingQuestion2';
import OnboardingQuestion3 from '../screens/onboarding/OnboardingQuestion3';
import OnboardingQuestion4 from '../screens/onboarding/OnboardingQuestion4';
import OnboardingQuestion5 from '../screens/onboarding/OnboardingQuestion5';
import OnboardingComplete from '../screens/onboarding/OnboardingComplete';

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

      console.log('📝 Saving onboarding data:', userData.onboardingData);

      // Cache onboarding status locally for offline access
      try {
        await AsyncStorage.setItem(`onboarding_status_${user.uid}`, JSON.stringify({
          onboardingCompleted: true,
          profileCompleted: true,
          cachedAt: Date.now()
        }));
        console.log('💾 Onboarding status cached locally');
      } catch (cacheError) {
        console.warn('⚠️ Failed to cache onboarding status:', cacheError);
        // Continue anyway - Firestore update is more important
      }

      // Update user profile with onboarding data
      await hybridDataService.updateUserProfile(user.uid, userData);

      console.log('✅ Onboarding completed successfully');
      
      // Trigger completion callback
      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      console.error('Error completing onboarding:', error);
      // Still call onComplete to avoid getting stuck
      if (onComplete) {
        onComplete();
      }
    }
  };

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        cardStyle: { backgroundColor: '#1a1a1a' },
      }}
    >
      <Stack.Screen name="OnboardingQuestion1">
        {(props) => <OnboardingQuestion1 {...props} onAnswer={handleAnswer} />}
      </Stack.Screen>
      <Stack.Screen name="OnboardingQuestion2">
        {(props) => <OnboardingQuestion2 {...props} onAnswer={handleAnswer} />}
      </Stack.Screen>
      <Stack.Screen name="OnboardingQuestion3">
        {(props) => <OnboardingQuestion3 {...props} onAnswer={handleAnswer} />}
      </Stack.Screen>
      <Stack.Screen name="OnboardingQuestion4">
        {(props) => <OnboardingQuestion4 {...props} onAnswer={handleAnswer} />}
      </Stack.Screen>
      <Stack.Screen name="OnboardingQuestion5">
        {(props) => <OnboardingQuestion5 {...props} onAnswer={handleAnswer} />}
      </Stack.Screen>
      <Stack.Screen name="OnboardingComplete">
        {(props) => <OnboardingComplete {...props} onComplete={handleComplete} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
};

export default OnboardingNavigator;
