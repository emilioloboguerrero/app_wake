import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, useWindowDimensions } from 'react-native';
import { saveReadiness, getTodayReadiness } from '../services/readinessService';
import { auth } from '../config/firebase';
import logger from '../utils/logger';

function toYYYYMMDD(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

const STEPS = [
  {
    key: 'energy',
    question: '¿Cómo está tu\nnivel de energía?',
    lowLabel: 'Agotado',
    midLabel: 'Moderado',
    highLabel: 'Energizado',
    invertColor: false,
    accentColor: '#F5C842',
  },
  {
    key: 'soreness',
    question: '¿Cómo sientes\ntus músculos hoy?',
    lowLabel: 'Fresco',
    midLabel: 'Moderado',
    highLabel: 'Muy adolorido',
    invertColor: true,
    accentColor: '#f87171',
  },
  {
    key: 'sleep',
    question: '¿Cómo dormiste\nanoche?',
    lowLabel: 'Pésimo',
    midLabel: 'Regular',
    highLabel: 'Excelente',
    invertColor: false,
    accentColor: '#93C5FD',
  },
];

function getValueColor(value, invertColor) {
  if (value == null) return 'rgba(255,255,255,0.15)';
  const n = invertColor ? (11 - value) : value;
  if (n >= 8) return '#4ade80';
  if (n >= 5) return '#F5C842';
  return '#f87171';
}

function getValueLabel(value, stepData) {
  if (value == null) return null;
  if (value <= 3) return stepData.lowLabel;
  if (value <= 6) return stepData.midLabel;
  return stepData.highLabel;
}

// ─── SVG icons (web-only) ────────────────────────────────────────────────────

function ChevronLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}>
      <path d="M12.5 15L7.5 10L12.5 5"
        stroke="rgba(255,255,255,0.5)" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EnergyIcon({ value }) {
  const intensity = value ? value / 10 : 0.3;
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}>
      <circle cx="40" cy="40" r="36" fill={`rgba(245,200,66,${0.07 + intensity * 0.1})`} />
      <circle cx="40" cy="40" r="24" fill={`rgba(245,200,66,${0.05 + intensity * 0.08})`} />
      <polygon
        points="45,5 21,42 36,42 35,75 59,38 44,38"
        fill={`rgba(245,200,66,${0.25 + intensity * 0.65})`}
        stroke={`rgba(245,200,66,${0.5 + intensity * 0.4})`}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SorenessIcon({ value }) {
  const intensity = value ? value / 10 : 0.3;
  // Shifts from green (low/fresh) to red (high/sore)
  const r = value ? Math.round(74 + ((value - 1) / 9) * (248 - 74)) : 160;
  const g = value ? Math.round(222 - ((value - 1) / 9) * (222 - 113)) : 180;
  const b = value ? Math.round(128 - ((value - 1) / 9) * (128 - 113)) : 120;
  const a = 0.15 + intensity * 0.25;
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}>
      <circle cx="40" cy="40" r="36" stroke={`rgba(${r},${g},${b},${a * 0.6})`} strokeWidth="1.5" />
      <circle cx="40" cy="40" r="26" stroke={`rgba(${r},${g},${b},${a * 0.8})`} strokeWidth="1.5" />
      <circle cx="40" cy="40" r="16" stroke={`rgba(${r},${g},${b},${a})`} strokeWidth="1.5" />
      <circle cx="40" cy="40" r="5" fill={`rgba(${r},${g},${b},${0.4 + intensity * 0.4})`} />
      <line x1="40" y1="2" x2="40" y2="12" stroke={`rgba(${r},${g},${b},${a * 0.7})`} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="78" y1="40" x2="68" y2="40" stroke={`rgba(${r},${g},${b},${a * 0.7})`} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="40" y1="78" x2="40" y2="68" stroke={`rgba(${r},${g},${b},${a * 0.7})`} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="2" y1="40" x2="12" y2="40" stroke={`rgba(${r},${g},${b},${a * 0.7})`} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SleepIcon({ value }) {
  const intensity = value ? value / 10 : 0.3;
  const starA = 0.15 + intensity * 0.55;
  const moonA = 0.25 + intensity * 0.6;
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}>
      <circle cx="36" cy="44" r="30" fill={`rgba(147,197,253,${0.05 + intensity * 0.07})`} />
      {/* Stars */}
      <circle cx="63" cy="14" r="2.5" fill={`rgba(147,197,253,${starA})`} />
      <circle cx="71" cy="28" r="1.5" fill={`rgba(147,197,253,${starA * 0.75})`} />
      <circle cx="57" cy="8" r="1.5" fill={`rgba(147,197,253,${starA * 0.6})`} />
      <circle cx="69" cy="20" r="1" fill={`rgba(147,197,253,${starA * 0.5})`} />
      <circle cx="75" cy="36" r="1" fill={`rgba(147,197,253,${starA * 0.4})`} />
      {/* Crescent: filled circle minus offset circle using card background color */}
      <circle cx="35" cy="44" r="22" fill={`rgba(147,197,253,${moonA})`} />
      <circle cx="46" cy="38" r="18" fill="#222222" />
    </svg>
  );
}

const ICONS = [EnergyIcon, SorenessIcon, SleepIcon];

// ─── Main component ───────────────────────────────────────────────────────────

export default function ReadinessCheckModal({ onClose, mandatory = false }) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState({ energy: null, soreness: null, sleep: null });
  const [saving, setSaving] = useState(false);

  const slideAnim = useRef(new Animated.Value(screenHeight)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const stepFadeAnim = useRef(new Animated.Value(1)).current;
  const stepSlideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadExisting = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const dateStr = toYYYYMMDD(new Date());
      try {
        const existing = await getTodayReadiness(uid, dateStr);
        if (!cancelled && existing?.energy != null && existing?.soreness != null && existing?.sleep != null) {
          setValues({
            energy: existing.energy,
            soreness: existing.soreness,
            sleep: existing.sleep,
          });
        }
      } catch (_) {}
    };
    loadExisting();
    return () => { cancelled = true; };
  }, []);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: screenHeight * 0.6, duration: 220, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  const handleSkip = () => {
    if (mandatory) return;
    const dateStr = toYYYYMMDD(new Date());
    try { localStorage.setItem(`wake_readiness_${dateStr}`, 'skipped'); } catch (_) {}
    dismiss();
  };

  const animateStep = (nextStep, forward) => {
    const exitX = forward ? -24 : 24;
    const enterX = forward ? 24 : -24;
    Animated.parallel([
      Animated.timing(stepFadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(stepSlideAnim, { toValue: exitX, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      stepSlideAnim.setValue(enterX);
      setStep(nextStep);
      Animated.parallel([
        Animated.timing(stepFadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(stepSlideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    });
  };

  const handleSave = async () => {
    const { energy, soreness, sleep } = values;
    if (energy == null || soreness == null || sleep == null) return;
    const uid = auth.currentUser?.uid;
    if (!uid) { dismiss(); return; }
    setSaving(true);
    const dateStr = toYYYYMMDD(new Date());
    try {
      await saveReadiness(uid, dateStr, { energy, soreness, sleep });
      try { localStorage.setItem(`wake_readiness_${dateStr}`, 'done'); } catch (_) {}
    } catch (err) {
      logger.error('[ReadinessModal] save failed', err?.message);
    } finally {
      setSaving(false);
      dismiss();
    }
  };

  const currentStepData = STEPS[step];
  const currentValue = values[currentStepData.key];
  const valueColor = getValueColor(currentValue, currentStepData.invertColor);
  const valueLabel = getValueLabel(currentValue, currentStepData);
  const isLastStep = step === STEPS.length - 1;
  const cardWidth = Math.min(screenWidth - 32, 420);
  const IconComponent = ICONS[step];

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]} pointerEvents="box-none">
      {mandatory ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="auto" />
      ) : (
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={handleSkip} activeOpacity={1} />
      )}
      <Animated.View style={[styles.card, { width: cardWidth, transform: [{ translateY: slideAnim }] }]}>

        {/* Header: back button + progress bars */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={[styles.backBtn, step === 0 && { opacity: 0 }]}
            onPress={() => animateStep(step - 1, false)}
            disabled={step === 0}
            activeOpacity={0.7}
          >
            <ChevronLeft />
          </TouchableOpacity>
          <View style={styles.progressBars}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.progressBar,
                  i < step && styles.progressBarDone,
                  i === step && { backgroundColor: currentStepData.accentColor },
                ]}
              />
            ))}
          </View>
          <View style={styles.backBtnPlaceholder} />
        </View>

        {/* Animated step content */}
        <Animated.View style={[
          styles.stepContent,
          { opacity: stepFadeAnim, transform: [{ translateX: stepSlideAnim }] },
        ]}>

          {/* Icon */}
          <View style={styles.iconArea}>
            <IconComponent value={currentValue} />
          </View>

          {/* Question */}
          <Text style={styles.question}>{currentStepData.question}</Text>

          {/* Value readout */}
          <View style={styles.valueReadout}>
            {currentValue != null ? (
              <>
                <Text style={[styles.valueNumber, { color: valueColor }]}>{currentValue}</Text>
                <Text style={[styles.valueLabelText, { color: valueColor }]}>{valueLabel}</Text>
              </>
            ) : (
              <Text style={styles.valuePlaceholder}>— / 10</Text>
            )}
          </View>

          {/* 10-segment picker */}
          <View style={styles.segmentPicker}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
              const isSelected = currentValue === n;
              const segColor = getValueColor(n, currentStepData.invertColor);
              return (
                <TouchableOpacity
                  key={n}
                  onPress={() => setValues(prev => ({ ...prev, [currentStepData.key]: n }))}
                  activeOpacity={0.65}
                  style={[
                    styles.segment,
                    isSelected
                      ? { backgroundColor: segColor, borderColor: segColor }
                      : { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.12)' },
                  ]}
                >
                  <Text style={[styles.segmentNum, isSelected && styles.segmentNumSelected]}>
                    {n}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Scale end labels */}
          <View style={styles.scaleLabels}>
            <Text style={styles.scaleLabel}>{currentStepData.lowLabel}</Text>
            <Text style={styles.scaleLabel}>{currentStepData.highLabel}</Text>
          </View>

        </Animated.View>

        {/* CTA + skip (outside animation, always stable) */}
        <TouchableOpacity
          style={[styles.ctaBtn, currentValue == null && styles.ctaBtnDisabled]}
          onPress={isLastStep ? handleSave : () => animateStep(step + 1, true)}
          disabled={currentValue == null || saving}
          activeOpacity={0.8}
        >
          <Text style={[styles.ctaBtnLabel, currentValue == null && styles.ctaBtnLabelDisabled]}>
            {isLastStep ? (saving ? 'Guardando...' : 'Guardar') : 'Continuar'}
          </Text>
        </TouchableOpacity>

      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    width: '100vw', height: '100vh',
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2000,
  },
  card: {
    backgroundColor: '#222222',
    borderRadius: 24,
    paddingTop: 20, paddingHorizontal: 24, paddingBottom: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backBtn: {
    width: 32, height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.07)',
    justifyContent: 'center', alignItems: 'center',
  },
  backBtnPlaceholder: {
    width: 32,
  },
  progressBars: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
  },
  progressBar: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  progressBarDone: {
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  stepContent: {
    width: '100%',
    alignItems: 'center',
  },
  iconArea: {
    height: 96,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  question: {
    fontSize: 22, fontWeight: '700', color: '#ffffff',
    textAlign: 'center', lineHeight: 30,
    marginBottom: 14,
  },
  valueReadout: {
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  valueNumber: {
    fontSize: 38, fontWeight: '800',
    lineHeight: 42,
  },
  valueLabelText: {
    fontSize: 12, fontWeight: '500',
    marginTop: 3,
    letterSpacing: 0.3,
  },
  valuePlaceholder: {
    fontSize: 22, fontWeight: '300',
    color: 'rgba(255,255,255,0.18)',
  },
  segmentPicker: {
    flexDirection: 'row',
    gap: 3,
    width: '100%',
    marginBottom: 8,
  },
  segment: {
    flex: 1,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentNum: {
    fontSize: 12, fontWeight: '500',
    color: 'rgba(255,255,255,0.35)',
  },
  segmentNumSelected: {
    color: '#1a1a1a', fontWeight: '700',
  },
  scaleLabels: {
    flexDirection: 'row', justifyContent: 'space-between',
    width: '100%',
    marginBottom: 22,
  },
  scaleLabel: {
    fontSize: 10, color: 'rgba(255,255,255,0.28)',
  },
  ctaBtn: {
    backgroundColor: '#ffffff', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
    marginBottom: 2,
  },
  ctaBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  ctaBtnLabel: {
    fontSize: 15, fontWeight: '700', color: '#1a1a1a',
  },
  ctaBtnLabelDisabled: {
    color: 'rgba(255,255,255,0.25)',
  },
  skipBtn: {
    alignItems: 'center', paddingVertical: 12,
  },
  skipLabel: {
    fontSize: 13, color: 'rgba(255,255,255,0.28)',
  },
});
