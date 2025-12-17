import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { updateUser } from '../services/firestoreService';
import OnboardingQuestion1 from './onboarding/OnboardingQuestion1';
import OnboardingQuestion2 from './onboarding/OnboardingQuestion2';
import OnboardingQuestion3 from './onboarding/OnboardingQuestion3';
import OnboardingQuestion4 from './onboarding/OnboardingQuestion4';
import OnboardingQuestion5 from './onboarding/OnboardingQuestion5';
import OnboardingComplete from './onboarding/OnboardingComplete';

const UserOnboardingQuestions = () => {
  const navigate = useNavigate();
  const { user, refreshUserData } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [onboardingAnswers, setOnboardingAnswers] = useState({});

  const handleAnswer = (questionKey, answer) => {
    setOnboardingAnswers(prev => ({
      ...prev,
      [questionKey]: answer
    }));
  };

  const handleNext = () => {
    if (currentStep < 5) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
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

      // Update user profile with onboarding data
      await updateUser(user.uid, userData);

      console.log('✅ Onboarding completed successfully');
      
      // Refresh user data
      await refreshUserData();
      
      // Navigate to main app
      navigate('/user/biblioteca', { replace: true });
    } catch (error) {
      console.error('Error completing onboarding:', error);
      alert('Error al completar el onboarding. Por favor intenta de nuevo.');
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <OnboardingQuestion1
            onAnswer={handleAnswer}
            onNext={handleNext}
            selectedAnswers={onboardingAnswers.motivation || []}
          />
        );
      case 1:
        return (
          <OnboardingQuestion2
            onAnswer={handleAnswer}
            onNext={handleNext}
            onBack={handleBack}
            selectedAnswers={onboardingAnswers.interests || []}
          />
        );
      case 2:
        return (
          <OnboardingQuestion3
            onAnswer={handleAnswer}
            onNext={handleNext}
            onBack={handleBack}
            selectedAnswer={onboardingAnswers.activityLevel}
          />
        );
      case 3:
        return (
          <OnboardingQuestion4
            onAnswer={handleAnswer}
            onNext={handleNext}
            onBack={handleBack}
            selectedAnswer={onboardingAnswers.workoutPreference}
          />
        );
      case 4:
        return (
          <OnboardingQuestion5
            onAnswer={handleAnswer}
            onNext={handleNext}
            onBack={handleBack}
            selectedAnswer={onboardingAnswers.obstacles}
          />
        );
      case 5:
        return (
          <OnboardingComplete
            onComplete={handleComplete}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="user-onboarding-questions-container">
      {renderStep()}
    </div>
  );
};

export default UserOnboardingQuestions;

