import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  useWindowDimensions,
  Image,
} from 'react-native';
import logger from '../../utils/logger';

const OnboardingComplete = ({ navigation, onComplete }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const handleComplete = () => {
    onComplete();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.mainContent}>
          {/* Wake App Icon at top */}
          <View style={styles.iconContainer}>
            <Image
              source={require('../../../assets/Isotipo WAKE (negativo).png')}
              style={styles.wakeIcon}
              resizeMode="contain"
              onError={(error) => logger.debug('Image load error:', error)}
            />
          </View>

          {/* Free-standing message */}
          <Text style={styles.message}>
            Wake es donde mides lo que antes solo sentías.{'\n\n'}
            Donde los mejores atletas te ayudan a progresar.
          </Text>
        </View>

        {/* Call to action button */}
        <TouchableOpacity
          style={styles.completeButton}
          onPress={handleComplete}
        >
          <Text style={styles.completeButtonText}>Empezar</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 40,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mainContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: screenHeight * 0.1,
    paddingBottom: screenHeight * 0.12,
    gap: screenHeight * 0.04,
  },
  iconContainer: {
    marginBottom: 40,
    alignItems: 'center',
    justifyContent: 'center',
    width: 250,
    height: 250,
  },
  wakeIcon: {
    width: 250,
    height: 250,
    // Ensure high quality rendering
    minWidth: 250,
    minHeight: 250,
  },
  message: {
    fontSize: 28,
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 36,
    marginBottom: 50,
    fontWeight: '600',
    paddingHorizontal: 10,
  },
  completeButton: {
    backgroundColor: 'rgba(191, 168, 77, 0.2)', // Match OnboardingQuestion1.js
    height: Math.max(50, screenHeight * 0.06), // Match WorkoutExercisesScreen.js
    width: Math.max(200, screenWidth * 0.5), // Match WorkoutExercisesScreen.js
    borderRadius: Math.max(12, screenWidth * 0.04), // Match WorkoutExercisesScreen.js
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  completeButtonText: {
    color: 'rgba(191, 168, 77, 1)', // Match OnboardingQuestion1.js
    fontSize: 18,
    fontWeight: '600',
  },
});

export default OnboardingComplete;
