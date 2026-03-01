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

const SLEEP_OPTIONS = [
  { id: 'under_6', text: '< 6h' },
  { id: '6_7', text: '6–7h' },
  { id: '7_8', text: '7–8h' },
  { id: 'over_8', text: '+8h' },
];

const STRESS_OPTIONS = [
  { id: 'low', text: 'Bajo', sub: 'Mucho tiempo y energía disponibles' },
  { id: 'medium', text: 'Moderado', sub: 'Cargas normales de trabajo o estudio' },
  { id: 'high', text: 'Alto', sub: 'Mucha responsabilidad, poco tiempo' },
  { id: 'very_high', text: 'Muy alto', sub: 'Agotado la mayoría de los días' },
];

const OnboardingQuestion7 = ({ navigation, onAnswer, onComplete }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [selectedSleep, setSelectedSleep] = useState(null);
  const [selectedStress, setSelectedStress] = useState(null);
  const styles = useMemo(() => createStyles(screenWidth, screenHeight), [screenWidth, screenHeight]);

  const canContinue = selectedSleep !== null && selectedStress !== null;

  const handleNext = () => {
    if (!canContinue) return;
    onAnswer('sleepHours', selectedSleep);
    onAnswer('stressLevel', selectedStress);
    navigation.navigate('OnboardingComplete');
  };

  return (
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
      <FixedWakeHeader />
      <WakeHeaderContent style={styles.contentColumn}>
        <WakeHeaderSpacer />
        <View style={styles.questionContainer}>
          <Text style={styles.question}>Un último detalle sobre tu día a día</Text>
        </View>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} nestedScrollEnabled>
          <Text style={styles.subLabel}>¿Cuántas horas duermes normalmente?</Text>
          <View style={styles.pillRow}>
            {SLEEP_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.id}
                style={[styles.sleepPill, selectedSleep === opt.id && styles.pillSelected]}
                onPress={() => setSelectedSleep(opt.id)}
              >
                <Text style={[styles.sleepPillText, selectedSleep === opt.id && styles.pillTextSelected]}>
                  {opt.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.subLabel, { marginTop: 28 }]}>Nivel de estrés en el día a día</Text>
          <View style={styles.cardList}>
            {STRESS_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.id}
                style={[styles.card, selectedStress === opt.id && styles.cardSelected]}
                onPress={() => setSelectedStress(opt.id)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardText, selectedStress === opt.id && styles.cardTextSelected]}>{opt.text}</Text>
                  <Text style={styles.cardSub}>{opt.sub}</Text>
                </View>
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
          <Text style={[styles.nextButtonText, !canContinue && styles.nextButtonTextDisabled]}>Finalizar</Text>
          <Text style={[styles.progress, !canContinue && styles.progressDisabled]}>7 de 7</Text>
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
  pillRow: { flexDirection: 'row', gap: 10 },
  sleepPill: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#222222',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  pillSelected: { borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(255,255,255,0.1)' },
  sleepPillText: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  pillTextSelected: { color: 'rgba(255,255,255,0.95)' },
  cardList: { gap: 10, marginTop: 4 },
  card: {
    backgroundColor: '#222222',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  cardSelected: {
    borderLeftColor: 'rgba(255,255,255,0.6)',
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  cardText: { fontSize: 16, fontWeight: '600', color: 'rgba(255,255,255,0.9)', marginBottom: 3 },
  cardTextSelected: { color: 'rgba(255,255,255,0.95)' },
  cardSub: { fontSize: 13, color: 'rgba(255,255,255,0.35)', lineHeight: 18 },
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

export default OnboardingQuestion7;
