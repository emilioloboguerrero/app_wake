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
import { FixedWakeHeader, WakeHeaderSpacer, WakeHeaderContent } from '../../components/WakeHeader';

const DAYS = [2, 3, 4, 5, '6+'];

const DURATIONS = [
  { id: 'under_45', text: 'Menos de 45 min' },
  { id: '45_60', text: '45–60 min' },
  { id: '60_90', text: '60–90 min' },
  { id: 'over_90', text: 'Más de 90 min' },
];

const OnboardingQuestion3 = ({ navigation, onAnswer }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [selectedDays, setSelectedDays] = useState(null);
  const [selectedDuration, setSelectedDuration] = useState(null);
  const styles = useMemo(() => createStyles(screenWidth, screenHeight), [screenWidth, screenHeight]);

  const canContinue = selectedDays !== null && selectedDuration !== null;

  const handleNext = () => {
    if (!canContinue) return;
    onAnswer('trainingDaysPerWeek', selectedDays);
    onAnswer('sessionDuration', selectedDuration);
    navigation.navigate('OnboardingQuestion4');
  };

  return (
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
      <FixedWakeHeader />
      <WakeHeaderContent style={styles.contentColumn}>
        <WakeHeaderSpacer />
        <View style={styles.questionContainer}>
          <Text style={styles.question}>¿Cuándo y cuánto puedes entrenar?</Text>
        </View>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} nestedScrollEnabled>
          <Text style={styles.subLabel}>Días a la semana</Text>
          <View style={styles.pillRow}>
            {DAYS.map(d => (
              <TouchableOpacity
                key={d}
                style={[styles.dayPill, selectedDays === d && styles.pillSelected]}
                onPress={() => setSelectedDays(d)}
              >
                <Text style={[styles.dayPillText, selectedDays === d && styles.pillTextSelected]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.subLabel, { marginTop: 28 }]}>Duración por sesión</Text>
          <View style={styles.cardList}>
            {DURATIONS.map(opt => (
              <TouchableOpacity
                key={opt.id}
                style={[styles.card, selectedDuration === opt.id && styles.cardSelected]}
                onPress={() => setSelectedDuration(opt.id)}
                activeOpacity={0.7}
              >
                <Text style={[styles.cardText, selectedDuration === opt.id && styles.cardTextSelected]}>
                  {opt.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </WakeHeaderContent>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.nextButton, !canContinue && styles.nextButtonDisabled]}
          onPress={handleNext}
          disabled={!canContinue}
        >
          <Text style={[styles.nextButtonText, !canContinue && styles.nextButtonTextDisabled]}>Continuar</Text>
          <Text style={[styles.progress, !canContinue && styles.progressDisabled]}>3 de 7</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const createStyles = (screenWidth, screenHeight) => StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a' },
  contentColumn: { flex: 1, minHeight: 0, overflow: 'hidden' },
  scrollView: { flex: 1, minHeight: 0, ...(Platform.OS === 'web' ? { maxHeight: Math.max(220, screenHeight - 300) } : {}) },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 160 },
  questionContainer: { minHeight: screenHeight * 0.14, justifyContent: 'flex-start', alignItems: 'center', paddingHorizontal: 10 },
  question: { fontSize: 26, fontWeight: '700', color: '#ffffff', lineHeight: 34, textAlign: 'center' },
  subLabel: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.55)', letterSpacing: 0.5, marginBottom: 12 },
  pillRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  dayPill: {
    flex: 1,
    minWidth: 48,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#222222',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  pillSelected: { borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(255,255,255,0.1)' },
  dayPillText: { fontSize: 16, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  pillTextSelected: { color: 'rgba(255,255,255,0.95)' },
  cardList: { gap: 10, marginTop: 4 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#222222',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  cardSelected: {
    borderLeftColor: 'rgba(255,255,255,0.6)',
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  cardText: { flex: 1, fontSize: 15, fontWeight: '500', color: 'rgba(255,255,255,0.85)' },
  cardTextSelected: { color: 'rgba(255,255,255,0.95)', fontWeight: '600' },
  bottomBar: {
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    bottom: 80, left: 0, right: 0,
    paddingHorizontal: 20, paddingTop: 16,
    paddingBottom: 24,
    backgroundColor: '#1a1a1a', alignItems: 'center',
  },
  nextButton: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    minHeight: Math.max(50, screenHeight * 0.06),
    paddingVertical: 6,
    width: Math.max(200, screenWidth * 0.5),
    borderRadius: Math.max(12, screenWidth * 0.04),
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  nextButtonDisabled: { backgroundColor: 'rgba(255,255,255,0.1)' },
  nextButtonText: { color: 'rgba(255,255,255,0.95)', fontSize: 18, fontWeight: '600' },
  nextButtonTextDisabled: { color: 'rgba(255,255,255,0.3)' },
  progress: { marginTop: 4, fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
  progressDisabled: { color: 'rgba(255,255,255,0.3)' },
});

export default OnboardingQuestion3;
