import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import { SvgXml } from 'react-native-svg';
import { FixedWakeHeader, WakeHeaderSpacer } from '../../components/WakeHeader';

const OnboardingQuestion2 = ({ navigation, onAnswer }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [selectedAnswers, setSelectedAnswers] = useState([]);

  // Icon SVGs for each activity type
  const dumbbellIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32" color="#000000" fill="none">
    <path d="M2.01792 20.3051C3.14656 21.9196 8.05942 23.1871 10.3797 20.1645C12.8894 21.3649 17.0289 20.9928 20.3991 19.1134C20.8678 18.8521 21.3112 18.5222 21.5827 18.0593C22.1957 17.0143 22.2102 15.5644 21.0919 13.4251C19.2274 8.77072 15.874 4.68513 14.5201 3.04212C14.2421 2.78865 12.4687 2.42868 11.3872 2.08279C10.9095 1.93477 10.02 1.83664 8.95612 3.23862C8.45176 3.90329 6.16059 5.5357 9.06767 6.63346C9.51805 6.74806 9.84912 6.95939 11.9038 6.58404C12.1714 6.53761 12.8395 6.58404 13.3103 7.41041L14.2936 8.81662C14.3851 8.94752 14.4445 9.09813 14.4627 9.25682C14.635 10.7557 14.6294 12.6323 15.4651 13.5826C14.1743 12.6492 10.8011 11.5406 8.2595 14.6951M2.00189 12.94C3.21009 11.791 6.71197 9.97592 10.4179 12.5216" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
  </svg>`;

  const runningIcon = `<svg width="40" height="40" viewBox="0 0 89 56" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M74.2571 53L27.8477 53C15.6233 53 9.51115 53 5.78557 48.345C-1.28584 39.5094 6.77155 16.0158 11.6524 7.16667C13.3071 17.1667 30.3416 16.8889 36.5467 15.5C32.4124 7.17161 37.9314 4.39219 40.6909 3.00247L40.6958 3C53.002 17.5833 79.3138 25.5166 85.762 41.4119C88.5474 48.278 80.6111 53 74.2571 53Z" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M3.00195 36.3335C20.3547 42.2893 31.0477 44.0178 44.759 39.6832C48.9137 38.3698 50.9911 37.7131 52.2859 37.8022C53.5807 37.8913 56.2223 39.1231 61.5053 41.5868C68.103 44.6636 77.1566 46.4349 86.3353 41.9932" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>
    <path d="M50.918 17.5835L57.168 11.3335" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M59.252 23.8335L65.502 17.5835" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const yogaIcon = `<svg fill="currentColor" height="38" width="38" viewBox="0 0 399.421 399.421" xmlns="http://www.w3.org/2000/svg">
    <path d="M390.421,90.522h-25.905c-0.123-0.003-0.249-0.003-0.372,0h-25.901c-4.971,0-9,4.029-9,9s4.029,9,9,9h17.087v19.085
    l-170.319,64.885H95.949l-22.765-31.203h14.013c4.971,0,9-4.029,9-9s-4.029-9-9-9H55.684c-0.144-0.004-0.287-0.004-0.431,0H35.021
    c-4.971,0-9,4.029-9,9s4.029,9,9,9h15.882l22.765,31.203H9c-4.971,0-9,4.029-9,9v98.409c0,4.971,4.029,9,9,9h42.09
    c4.971,0,9-4.029,9-9v-47.32h253.151v47.32c0,4.971,4.029,9,9,9h42.09c4.971,0,9-4.029,9-9v-98.409c0-0.063,0-0.127-0.002-0.191
    v-67.284c0.003-0.139,0.003-0.278,0-0.418v-25.076h17.091c4.971,0,9-4.029,9-9S395.392,90.522,390.421,90.522z M355.33,146.869
    v45.623H235.572L355.33,146.869z M42.09,290.901H18v-38.32h24.09V290.901z M355.332,290.901h-24.09v-38.32h24.09V290.901z
     M355.332,234.581h-33.09H18v-24.089h73.28c0.068,0.001,0.135,0.001,0.203,0h94.981c0.137,0.003,0.273,0.003,0.41,0h168.458V234.581
    z"/>
  </svg>`;

  const teamIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="2"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const wellnessIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const options = [
    { id: 1, text: 'Entrenamiento de fuerza / gimnasio', icon: dumbbellIcon },
    { id: 2, text: 'Cardio (Running, ciclismo, natación, etc.)', icon: runningIcon },
    { id: 3, text: 'Yoga o pilates', icon: yogaIcon },
    { id: 4, text: 'Deportes (Tenis, golf, boxeo, etc.)', icon: teamIcon },
    { id: 5, text: 'Movilidad o bienestar general', icon: wellnessIcon },
  ];

  const handleOptionSelect = (optionId) => {
    setSelectedAnswers(prev => {
      if (prev.includes(optionId)) {
        // Remove if already selected
        return prev.filter(id => id !== optionId);
      } else if (prev.length < 3) {
        // Add if less than 3 selected
        return [...prev, optionId];
      } else {
        // Replace oldest if 3 already selected
        return [prev[1], prev[2], optionId];
      }
    });
  };

  const handleNext = () => {
    if (selectedAnswers.length > 0) {
      // Convert selected IDs to actual text answers
      const selectedInterests = selectedAnswers.map(id => {
        const option = options.find(opt => opt.id === id);
        return option ? option.text : null;
      }).filter(Boolean); // Remove any null values
      
      onAnswer('interests', selectedInterests);
      navigation.navigate('OnboardingQuestion3');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <FixedWakeHeader />

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <WakeHeaderSpacer />

        {/* Large centered question */}
        <View style={styles.questionContainer}>
          <Text style={styles.question}>
            ¿Qué tipo de actividades o disciplinas te interesan más?
          </Text>
        </View>

        {/* Cube-style options grid */}
        <View style={styles.optionsGrid}>
          {options.map((option) => (
            <TouchableOpacity
              key={option.id}
              style={[
                styles.optionCube,
                selectedAnswers.includes(option.id) && styles.optionCubeSelected
              ]}
              onPress={() => handleOptionSelect(option.id)}
            >
              <View style={styles.optionIcon}>
                <SvgXml
                  xml={option.icon}
                  width={option.id === 2 ? 40 : option.id === 3 ? 38 : 32} 
                  height={option.id === 2 ? 40 : option.id === 3 ? 38 : 32} 
                  color={selectedAnswers.includes(option.id) ? '#BFA84D' : '#ffffff'}
                />
              </View>
              <Text style={[
                styles.optionText,
                selectedAnswers.includes(option.id) && styles.optionTextSelected
              ]}>
                {option.text}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Continue button */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[
              styles.nextButton,
              selectedAnswers.length === 0 && styles.nextButtonDisabled
            ]}
            onPress={handleNext}
            disabled={selectedAnswers.length === 0}
          >
            <Text style={[
              styles.nextButtonText,
              selectedAnswers.length === 0 && styles.nextButtonTextDisabled
            ]}>
              Continuar
            </Text>
            <Text
              style={[
                styles.progress,
                selectedAnswers.length === 0 && styles.progressDisabled
              ]}
            >
              2 de 5
            </Text>
          </TouchableOpacity>
          {selectedAnswers.length > 0 && (
            <Text style={styles.selectionInfo}>
              {selectedAnswers.length} de 3 seleccionado{selectedAnswers.length > 1 ? 's' : ''}
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40, // Add bottom padding for safe scrolling
  },
  progress: {
    marginTop: 6,
    fontSize: 14,
    color: '#BFA84D',
    textAlign: 'center',
    fontWeight: '500',
  },
  progressDisabled: {
    color: 'rgba(255, 255, 255, 0.5)',
  },
  questionContainer: {
    minHeight: screenHeight * 0.16,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 0,
    marginTop: 0,
  },
  question: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    lineHeight: 36,
    textAlign: 'center',
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 5,
    marginTop: 4,
    marginBottom: 0,
  },
  optionCube: {
    width: (screenWidth - 60) / 2, // 2 columns with margins
    backgroundColor: '#2a2a2a',
    padding: 20,
    borderRadius: 12, // Match OnboardingScreen.js
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)', // Match OnboardingScreen.js default
    shadowColor: 'rgba(255, 255, 255, 0.4)', // Match OnboardingScreen.js
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    alignItems: 'center',
    minHeight: 140,
    justifyContent: 'center',
  },
  optionCubeSelected: {
    borderColor: 'rgba(191, 168, 77, 0.7)', // Match OnboardingScreen.js success
    borderWidth: 1,
    shadowColor: 'rgba(191, 168, 77, 0.8)', // Match OnboardingScreen.js success
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    backgroundColor: '#2a2a2a', // Keep same background
  },
  optionIcon: {
    marginBottom: 12,
  },
  optionText: {
    fontSize: 14,
    color: '#ffffff',
    lineHeight: 20,
    textAlign: 'center',
    fontWeight: '500',
  },
  optionTextSelected: {
    color: '#BFA84D',
    fontWeight: '600',
  },
  buttonContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 20,
  },
  nextButton: {
    backgroundColor: 'rgba(191, 168, 77, 0.2)', // Match OnboardingScreen.js
    minHeight: Math.max(50, screenHeight * 0.06),
    paddingVertical: 6,
    width: Math.max(200, screenWidth * 0.5), // Match WorkoutExercisesScreen.js
    borderRadius: Math.max(12, screenWidth * 0.04), // Match WorkoutExercisesScreen.js
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  nextButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)', // Match OnboardingScreen.js disabled
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowOpacity: 0,
    elevation: 0,
  },
  nextButtonText: {
    color: 'rgba(191, 168, 77, 1)', // Match OnboardingScreen.js
    fontSize: 18,
    fontWeight: '600',
  },
  nextButtonTextDisabled: {
    color: 'rgba(255, 255, 255, 0.5)', // Match OnboardingScreen.js disabled
  },
  selectionInfo: {
    color: '#666',
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
  },
});

export default OnboardingQuestion2;

