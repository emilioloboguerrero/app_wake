import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  useWindowDimensions,
  ScrollView,
  Platform,
} from 'react-native';
import { SvgXml } from 'react-native-svg';
import { FixedWakeHeader, WakeHeaderSpacer, WakeHeaderContent } from '../../components/WakeHeader';

const OnboardingQuestion5 = ({ navigation, onAnswer }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const styles = useMemo(() => createStyles(screenWidth, screenHeight), [screenWidth, screenHeight]);

  // Icon SVGs for each obstacle
  const timeIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
    <polyline points="12,6 12,12 16,14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const knowledgeIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const motivationIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2.33496 10.3368C2.02171 10.0471 2.19187 9.52339 2.61557 9.47316L8.61914 8.76107C8.79182 8.74059 8.94181 8.63215 9.01465 8.47425L11.5469 2.98446C11.7256 2.59703 12.2764 2.59695 12.4551 2.98439L14.9873 8.47413C15.0601 8.63204 15.2092 8.74077 15.3818 8.76124L21.3857 9.47316C21.8094 9.52339 21.9791 10.0472 21.6659 10.3369L17.2278 14.4419C17.1001 14.56 17.0433 14.7357 17.0771 14.9063L18.255 20.8359C18.3382 21.2544 17.8928 21.5787 17.5205 21.3703L12.2451 18.4166C12.0934 18.3317 11.9091 18.3321 11.7573 18.417L6.48144 21.3695C6.10913 21.5779 5.66294 21.2544 5.74609 20.8359L6.92414 14.9066C6.95803 14.7361 6.90134 14.5599 6.77367 14.4419L2.33496 10.3368Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const planIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="14,2 14,8 20,8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="10,9 9,9 8,9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const options = [
    { id: 1, text: 'Falta de tiempo', icon: timeIcon },
    { id: 2, text: 'No saber por dónde empezar', icon: knowledgeIcon },
    { id: 3, text: 'Falta de motivación o constancia', icon: motivationIcon },
    { id: 4, text: 'No tener un plan o guía claros', icon: planIcon },
  ];

  const handleNext = () => {
    if (selectedAnswer) {
      // Convert selected ID to actual text answer
      const selectedOption = options.find(opt => opt.id === selectedAnswer);
      const obstaclesText = selectedOption ? selectedOption.text : null;
      
      onAnswer('obstacles', obstaclesText);
      navigation.replace('OnboardingComplete');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
      <FixedWakeHeader />

      <WakeHeaderContent style={styles.contentColumn}>
        <WakeHeaderSpacer />
        {/* Question fixed at top – not scrollable */}
        <View style={styles.questionContainer}>
          <Text style={styles.question}>
            ¿Qué es lo que más te ha impedido alcanzar tus objetivos antes?
          </Text>
        </View>

        {/* Only the options list scrolls */}
        <ScrollView
          style={styles.optionsScrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
          nestedScrollEnabled
        >
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
        </ScrollView>
      </WakeHeaderContent>

      {/* Fixed bottom bar: button + progress */}
      <View style={styles.bottomButtonContainer}>
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
            5 de 5
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const createStyles = (screenWidth, screenHeight) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  contentColumn: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  optionsScrollView: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' ? { maxHeight: Math.max(220, screenHeight - 300) } : {}),
  },
  scrollContent: {
    paddingHorizontal: 20,
    // Reserve space for fixed bar (button + progress + padding) so last options aren't covered
    paddingBottom: 140,
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
  bottomButtonContainer: {
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Math.max(20, screenHeight * 0.025),
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButton: {
    backgroundColor: 'rgba(191, 168, 77, 0.2)', // Match OnboardingScreen.js
    minHeight: Math.max(50, screenHeight * 0.06),
    paddingVertical: 6,
    width: Math.max(200, screenWidth * 0.5), // Primary button dimensions
    borderRadius: Math.max(12, screenWidth * 0.04), // Primary button dimensions
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

export default OnboardingQuestion5;
