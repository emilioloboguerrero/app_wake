import React, { useState, useMemo } from 'react';
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

const OnboardingQuestion1 = ({ navigation, onAnswer }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [selectedAnswers, setSelectedAnswers] = useState([]);
  const styles = useMemo(() => createStyles(screenWidth, screenHeight), [screenWidth, screenHeight]);

  // Icon SVGs (simplified versions for the available icons)
  const heartIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M19.2373 6.23731C20.7839 7.78395 20.8432 10.2727 19.3718 11.8911L11.9995 20.0001L4.62812 11.8911C3.15679 10.2727 3.21605 7.7839 4.76269 6.23726C6.48961 4.51034 9.33372 4.66814 10.8594 6.5752L12 8.00045L13.1396 6.57504C14.6653 4.66798 17.5104 4.51039 19.2373 6.23731Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const starIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const flagIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="4" y1="22" x2="4" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const targetIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
    <circle cx="12" cy="12" r="6" stroke="currentColor" stroke-width="2"/>
    <circle cx="12" cy="12" r="2" stroke="currentColor" stroke-width="2"/>
  </svg>`;

  const muscleIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32" color="#000000" fill="none">
    <path d="M2.01792 20.3051C3.14656 21.9196 8.05942 23.1871 10.3797 20.1645C12.8894 21.3649 17.0289 20.9928 20.3991 19.1134C20.8678 18.8521 21.3112 18.5222 21.5827 18.0593C22.1957 17.0143 22.2102 15.5644 21.0919 13.4251C19.2274 8.77072 15.874 4.68513 14.5201 3.04212C14.2421 2.78865 12.4687 2.42868 11.3872 2.08279C10.9095 1.93477 10.02 1.83664 8.95612 3.23862C8.45176 3.90329 6.16059 5.5357 9.06767 6.63346C9.51805 6.74806 9.84912 6.95939 11.9038 6.58404C12.1714 6.53761 12.8395 6.58404 13.3103 7.41041L14.2936 8.81662C14.3851 8.94752 14.4445 9.09813 14.4627 9.25682C14.635 10.7557 14.6294 12.6323 15.4651 13.5826C14.1743 12.6492 10.8011 11.5406 8.2595 14.6951M2.00189 12.94C3.21009 11.791 6.71197 9.97592 10.4179 12.5216" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
  </svg>`;

  const usersIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="2"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const options = [
    { id: 1, text: 'Ganar más energía y sentirme mejor en mi día a día', icon: heartIcon },
    { id: 2, text: 'Alcanzar una meta específica (competencia, carrera, evento)', icon: flagIcon },
    { id: 3, text: 'Perder peso o grasa corporal', icon: targetIcon },
    { id: 4, text: 'Ganar músculo o fuerza', icon: muscleIcon },
    { id: 5, text: 'Conocer gente nueva y ser parte de una comunidad', icon: usersIcon },
  ];

  const handleOptionSelect = (optionId) => {
    setSelectedAnswers(prev => {
      if (prev.includes(optionId)) {
        // Remove if already selected
        return prev.filter(id => id !== optionId);
      } else if (prev.length < 2) {
        // Add if less than 2 selected
        return [...prev, optionId];
      } else {
        // Replace first selected with new one if already at max
        return [prev[1], optionId];
      }
    });
  };

  const handleNext = () => {
    if (selectedAnswers.length > 0) {
      // Convert selected IDs to actual text answers
      const selectedMotivations = selectedAnswers.map(id => {
        const option = options.find(opt => opt.id === id);
        return option ? option.text : null;
      }).filter(Boolean); // Remove any null values
      
      onAnswer('motivation', selectedMotivations);
      navigation.navigate('OnboardingQuestion2');
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
            ¿Cuál es tu motivación principal para hacer deporte?
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
                  width={32} 
                  height={32} 
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
              1 de 5
            </Text>
          </TouchableOpacity>
          
          {selectedAnswers.length > 0 && (
            <Text style={styles.selectionInfo}>
              {selectedAnswers.length} de 2 seleccionado{selectedAnswers.length > 1 ? 's' : ''}
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (screenWidth, screenHeight) => StyleSheet.create({
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
    marginTop: 0,
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

export default OnboardingQuestion1;
