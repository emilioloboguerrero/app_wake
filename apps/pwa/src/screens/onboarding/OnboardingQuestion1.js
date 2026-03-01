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

const targetIcon = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
  <circle cx="12" cy="12" r="6" stroke="currentColor" stroke-width="2"/>
  <circle cx="12" cy="12" r="2" stroke="currentColor" stroke-width="2"/>
</svg>`;

const muscleIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="none">
  <path d="M2.01792 20.3051C3.14656 21.9196 8.05942 23.1871 10.3797 20.1645C12.8894 21.3649 17.0289 20.9928 20.3991 19.1134C20.8678 18.8521 21.3112 18.5222 21.5827 18.0593C22.1957 17.0143 22.2102 15.5644 21.0919 13.4251C19.2274 8.77072 15.874 4.68513 14.5201 3.04212C14.2421 2.78865 12.4687 2.42868 11.3872 2.08279C10.9095 1.93477 10.02 1.83664 8.95612 3.23862C8.45176 3.90329 6.16059 5.5357 9.06767 6.63346C9.51805 6.74806 9.84912 6.95939 11.9038 6.58404C12.1714 6.53761 12.8395 6.58404 13.3103 7.41041L14.2936 8.81662C14.3851 8.94752 14.4445 9.09813 14.4627 9.25682C14.635 10.7557 14.6294 12.6323 15.4651 13.5826C14.1743 12.6492 10.8011 11.5406 8.2595 14.6951M2.00189 12.94C3.21009 11.791 6.71197 9.97592 10.4179 12.5216" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const boltIcon = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const heartIcon = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M19.2373 6.23731C20.7839 7.78395 20.8432 10.2727 19.3718 11.8911L11.9995 20.0001L4.62812 11.8911C3.15679 10.2727 3.21605 7.7839 4.76269 6.23726C6.48961 4.51034 9.33372 4.66814 10.8594 6.5752L12 8.00045L13.1396 6.57504C14.6653 4.66798 17.5104 4.51039 19.2373 6.23731Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const trophyIcon = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M4 22h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const OPTIONS = [
  { id: 'fat_loss', text: 'Perder grasa corporal', icon: targetIcon },
  { id: 'muscle', text: 'Ganar músculo y fuerza', icon: muscleIcon },
  { id: 'performance', text: 'Mejorar mi rendimiento deportivo', icon: boltIcon },
  { id: 'health', text: 'Sentirme más saludable y con más energía', icon: heartIcon },
  { id: 'event', text: 'Prepararme para un evento o competencia', icon: trophyIcon },
];

const OnboardingQuestion1 = ({ navigation, onAnswer }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [selected, setSelected] = useState(null);
  const styles = useMemo(() => createStyles(screenWidth, screenHeight), [screenWidth, screenHeight]);

  const handleNext = () => {
    if (!selected) return;
    const opt = OPTIONS.find(o => o.id === selected);
    onAnswer('primaryGoal', opt.id);
    navigation.navigate('OnboardingQuestion2');
  };

  return (
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
      <FixedWakeHeader />
      <WakeHeaderContent style={styles.contentColumn}>
        <WakeHeaderSpacer />
        <View style={styles.questionContainer}>
          <Text style={styles.question}>
            ¿Cuál es tu objetivo número uno ahora mismo?
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
                <View style={styles.cardIcon}>
                  <SvgXml xml={opt.icon} width={28} height={28} color={selected === opt.id ? 'rgba(255,255,255,0.95)' : '#ffffff'} />
                </View>
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
          <Text style={[styles.progress, !selected && styles.progressDisabled]}>1 de 7</Text>
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
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 14,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  cardSelected: {
    borderLeftColor: 'rgba(255,255,255,0.6)',
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  cardIcon: { width: 32, alignItems: 'center' },
  cardText: { flex: 1, fontSize: 15, fontWeight: '500', color: 'rgba(255,255,255,0.85)', lineHeight: 20 },
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

export default OnboardingQuestion1;
