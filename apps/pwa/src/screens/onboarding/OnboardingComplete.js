import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  useWindowDimensions,
  Image,
  ScrollView,
  Platform,
} from 'react-native';
import { FixedWakeHeader, WakeHeaderSpacer, WakeHeaderContent } from '../../components/WakeHeader';
import logger from '../../utils/logger';

const OnboardingComplete = ({ navigation, onComplete }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const styles = useMemo(() => createStyles(screenWidth, screenHeight), [screenWidth, screenHeight]);
  const handleComplete = () => {
    onComplete();
  };

  return (
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
      <FixedWakeHeader />

      <WakeHeaderContent style={styles.contentColumn}>
        <WakeHeaderSpacer />
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
        >
          <View style={styles.mainContent}>
            <View style={styles.iconContainer}>
              <Image
                source={require('../../../assets/Isotipo WAKE (negativo).png')}
                style={styles.wakeIcon}
                resizeMode="contain"
                onError={(error) => logger.debug('Image load error:', error)}
              />
            </View>
            <Text style={styles.message}>
              Wake es donde mides lo que antes solo sentías.{'\n\n'}
              Donde los mejores atletas te ayudan a progresar.
            </Text>
          </View>
        </ScrollView>
      </WakeHeaderContent>

      {/* Fixed bottom bar: Empezar button */}
      <View style={styles.bottomButtonContainer}>
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
  scrollView: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' ? { maxHeight: Math.max(220, screenHeight - 300) } : {}),
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 140,
  },
  mainContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: screenHeight * 0.06,
    paddingBottom: 24,
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
  completeButton: {
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    height: Math.max(50, screenHeight * 0.06),
    width: Math.max(200, screenWidth * 0.5),
    borderRadius: Math.max(12, screenWidth * 0.04),
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeButtonText: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: 18,
    fontWeight: '600',
  },
});

export default OnboardingComplete;
