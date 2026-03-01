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

const OPTIONS = [
  { id: 'beginner', text: 'Nunca he entrenado / estoy empezando' },
  { id: 'less_1yr', text: 'Menos de 1 año' },
  { id: '1_3yrs', text: '1 a 3 años' },
  { id: 'over_3yrs', text: 'Más de 3 años' },
];

const OnboardingQuestion2 = ({ navigation, onAnswer }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [selected, setSelected] = useState(null);
  const styles = useMemo(() => createStyles(screenWidth, screenHeight), [screenWidth, screenHeight]);

  const handleNext = () => {
    if (!selected) return;
    onAnswer('trainingExperience', selected);
    navigation.navigate('OnboardingQuestion3');
  };

  return (
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
      <FixedWakeHeader />
      <WakeHeaderContent style={styles.contentColumn}>
        <WakeHeaderSpacer />
        <View style={styles.questionContainer}>
          <Text style={styles.question}>
            ¿Cuánto tiempo llevas entrenando con constancia?
          </Text>
        </View>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} nestedScrollEnabled>
          <View style={styles.cardList}>
            {OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.id}
                style={[styles.card, selected === opt.id && styles.cardSelected]}
                onPress={() => setSelected(opt.id)}
                activeOpacity={0.7}
              >
                <Text style={[styles.cardText, selected === opt.id && styles.cardTextSelected]}>
                  {opt.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </WakeHeaderContent>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.nextButton, !selected && styles.nextButtonDisabled]}
          onPress={handleNext}
          disabled={!selected}
        >
          <Text style={[styles.nextButtonText, !selected && styles.nextButtonTextDisabled]}>Continuar</Text>
          <Text style={[styles.progress, !selected && styles.progressDisabled]}>2 de 7</Text>
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
  questionContainer: { minHeight: screenHeight * 0.15, justifyContent: 'flex-start', alignItems: 'center', paddingHorizontal: 10 },
  question: { fontSize: 26, fontWeight: '700', color: '#ffffff', lineHeight: 34, textAlign: 'center' },
  cardList: { gap: 10, marginTop: 4 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
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
  cardText: { flex: 1, fontSize: 16, fontWeight: '500', color: 'rgba(255,255,255,0.85)' },
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

export default OnboardingQuestion2;
