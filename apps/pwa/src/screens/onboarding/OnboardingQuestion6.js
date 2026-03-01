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
  { id: 'none', text: 'Ninguna en particular' },
  { id: 'veg', text: 'Vegetariano/a' },
  { id: 'vegan', text: 'Vegano/a' },
  { id: 'gluten', text: 'Sin gluten' },
  { id: 'lactose', text: 'Sin lácteos' },
  { id: 'other', text: 'Otra intolerancia' },
];

const OnboardingQuestion6 = ({ navigation, onAnswer }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [selected, setSelected] = useState([]);
  const styles = useMemo(() => createStyles(screenWidth, screenHeight), [screenWidth, screenHeight]);

  const toggle = (id) => {
    setSelected(prev => {
      if (id === 'none') return prev.includes('none') ? [] : ['none'];
      const withoutNone = prev.filter(x => x !== 'none');
      if (withoutNone.includes(id)) return withoutNone.filter(x => x !== id);
      return [...withoutNone, id];
    });
  };

  const canContinue = selected.length > 0;

  const handleNext = () => {
    if (!canContinue) return;
    onAnswer('dietaryRestrictions', selected);
    navigation.navigate('OnboardingQuestion7');
  };

  return (
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
      <FixedWakeHeader />
      <WakeHeaderContent style={styles.contentColumn}>
        <WakeHeaderSpacer />
        <View style={styles.questionContainer}>
          <Text style={styles.question}>¿Tienes alguna restricción o preferencia alimentaria?</Text>
          <Text style={styles.questionSub}>Puedes seleccionar varias</Text>
        </View>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} nestedScrollEnabled>
          <View style={styles.grid}>
            {OPTIONS.map(opt => {
              const isSelected = selected.includes(opt.id);
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.tag, isSelected && styles.tagSelected]}
                  onPress={() => toggle(opt.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tagText, isSelected && styles.tagTextSelected]}>{opt.text}</Text>
                </TouchableOpacity>
              );
            })}
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
          <Text style={[styles.progress, !canContinue && styles.progressDisabled]}>6 de 7</Text>
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
  questionContainer: { minHeight: screenHeight * 0.18, justifyContent: 'flex-start', alignItems: 'center', paddingHorizontal: 10 },
  question: { fontSize: 26, fontWeight: '700', color: '#ffffff', lineHeight: 34, textAlign: 'center' },
  questionSub: { fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  tag: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 22,
    backgroundColor: '#222222',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  tagSelected: {
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  tagText: { fontSize: 14, fontWeight: '500', color: 'rgba(255,255,255,0.7)' },
  tagTextSelected: { color: 'rgba(255,255,255,0.95)', fontWeight: '600' },
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

export default OnboardingQuestion6;
