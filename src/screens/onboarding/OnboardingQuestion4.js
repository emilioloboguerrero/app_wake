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

const OnboardingQuestion4 = ({ navigation, onAnswer }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const styles = useMemo(() => createStyles(screenWidth, screenHeight), [screenWidth, screenHeight]);

  // Icon SVGs for each workout preference
  const intenseIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const relaxedIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6.8291 17.0806C13.9002 21.3232 19.557 15.6663 18.8499 5.0598C8.24352 4.35269 2.58692 10.0097 6.8291 17.0806ZM6.8291 17.0806C6.82902 17.0805 6.82918 17.0807 6.8291 17.0806ZM6.8291 17.0806L5 18.909M6.8291 17.0806L10.6569 13.2522" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const balancedIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6.5 19H17.5C17.9647 19 18.197 18.9999 18.3902 18.9614C19.1836 18.8036 19.8036 18.1836 19.9614 17.3902C19.9999 17.197 19.9999 16.9647 19.9999 16.5C19.9999 16.0353 19.9999 15.8031 19.9614 15.6099C19.8036 14.8165 19.1836 14.1962 18.3902 14.0384C18.197 14 17.9647 14 17.5 14H6.5C6.03534 14 5.80306 14 5.60986 14.0384C4.81648 14.1962 4.19624 14.8165 4.03843 15.6099C4 15.8031 4 16.0354 4 16.5C4 16.9647 4 17.1969 4.03843 17.3901C4.19624 18.1835 4.81648 18.8036 5.60986 18.9614C5.80306 18.9999 6.03535 19 6.5 19Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M6.5 10H17.5C17.9647 10 18.197 9.99986 18.3902 9.96143C19.1836 9.80361 19.8036 9.18356 19.9614 8.39018C19.9999 8.19698 19.9999 7.96465 19.9999 7.5C19.9999 7.03535 19.9999 6.80306 19.9614 6.60986C19.8036 5.81648 19.1836 5.19624 18.3902 5.03843C18.197 5 17.9647 5 17.5 5H6.5C6.03534 5 5.80306 5 5.60986 5.03843C4.81648 5.19624 4.19624 5.81648 4.03843 6.60986C4 6.80306 4 7.03539 4 7.50004C4 7.9647 4 8.19694 4.03843 8.39014C4.19624 9.18352 4.81648 9.80361 5.60986 9.96143C5.80306 9.99986 6.03535 10 6.5 10Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const variedIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M11 16L8 19M8 19L5 16M8 19V5M13 8L16 5M16 5L19 8M16 5V19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const options = [
    { id: 1, text: 'Rutinas cortas e intensas', icon: intenseIcon },
    { id: 2, text: 'Sesiones más largas y relajadas', icon: relaxedIcon },
    { id: 3, text: 'Algo equilibrado entre ambas', icon: balancedIcon },
    { id: 4, text: 'Depende del día, me gusta variar', icon: variedIcon },
  ];

  const handleNext = () => {
    if (selectedAnswer) {
      // Convert selected ID to actual text answer
      const selectedOption = options.find(opt => opt.id === selectedAnswer);
      const workoutPreferenceText = selectedOption ? selectedOption.text : null;
      
      onAnswer('workoutPreference', workoutPreferenceText);
      navigation.navigate('OnboardingQuestion5');
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
            ¿Qué tipo de entrenamientos prefieres?
          </Text>
        </View>

        {/* Cube-style options grid - 2x2 for 4 options */}
        <View style={styles.optionsGrid}>
          {options.map((option) => (
            <TouchableOpacity
              key={option.id}
              style={[
                styles.optionCube,
                selectedAnswer === option.id && styles.optionCubeSelected
              ]}
              onPress={() => setSelectedAnswer(option.id)}
            >
              <View style={styles.optionIcon}>
                <SvgXml 
                  xml={option.icon} 
                  width={32} 
                  height={32} 
                  color={selectedAnswer === option.id ? '#BFA84D' : '#ffffff'}
                />
              </View>
              <Text style={[
                styles.optionText,
                selectedAnswer === option.id && styles.optionTextSelected
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
              !selectedAnswer && styles.nextButtonDisabled
            ]}
            onPress={handleNext}
            disabled={!selectedAnswer}
          >
            <Text style={[
              styles.nextButtonText,
              !selectedAnswer && styles.nextButtonTextDisabled
            ]}>
              Continuar
            </Text>
            <Text
              style={[
                styles.progress,
                !selectedAnswer && styles.progressDisabled
              ]}
            >
              4 de 5
            </Text>
          </TouchableOpacity>
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
});

export default OnboardingQuestion4;
