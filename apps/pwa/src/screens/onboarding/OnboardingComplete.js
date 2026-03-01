import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  useWindowDimensions,
  Image,
  Platform,
} from 'react-native';
import { FixedWakeHeader, WakeHeaderSpacer, WakeHeaderContent } from '../../components/WakeHeader';
import { useAuth } from '../../contexts/AuthContext';

const GOAL_LABELS = {
  fat_loss: 'Perder grasa corporal',
  muscle: 'Ganar músculo y fuerza',
  performance: 'Mejorar rendimiento deportivo',
  health: 'Salud y más energía',
  event: 'Preparación para evento',
};

const OnboardingComplete = ({ onComplete, answers }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { user } = useAuth();
  const styles = useMemo(() => createStyles(screenWidth, screenHeight), [screenWidth, screenHeight]);

  const firstName = user?.displayName?.split(' ')[0] || '';
  const goalLabel = answers?.primaryGoal ? GOAL_LABELS[answers.primaryGoal] : null;

  return (
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
      <FixedWakeHeader />
      <WakeHeaderContent style={styles.contentColumn}>
        <WakeHeaderSpacer />
        <View style={styles.mainContent}>
          <Image
            source={require('../../../assets/Isotipo WAKE (negativo).png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>
            {firstName ? `¡Bienvenido, ${firstName}!` : '¡Todo listo!'}
          </Text>
          {!!goalLabel && (
            <View style={styles.goalChip}>
              <Text style={styles.goalChipText}>Tu objetivo · {goalLabel}</Text>
            </View>
          )}
          <Text style={styles.message}>
            Wake es donde mides lo que antes solo sentías.
          </Text>
        </View>
      </WakeHeaderContent>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.startButton} onPress={onComplete}>
          <Text style={styles.startButtonText}>Entrar a Wake</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const createStyles = (screenWidth, screenHeight) => StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a' },
  contentColumn: { flex: 1, minHeight: 0 },
  mainContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 20,
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: 8,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
  },
  goalChip: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  goalChipText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
  },
  message: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    lineHeight: 26,
    paddingHorizontal: 8,
  },
  bottomBar: {
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    bottom: 80, left: 0, right: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
  },
  startButton: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    height: Math.max(50, screenHeight * 0.06),
    width: Math.max(200, screenWidth * 0.5),
    borderRadius: Math.max(12, screenWidth * 0.04),
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButtonText: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 18,
    fontWeight: '600',
  },
});

export default OnboardingComplete;
