import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, useWindowDimensions } from 'react-native';

// Colors mirror ReadinessCheckModal accent colors per metric.
const ENERGY_RGB = '245,200,66';   // #F5C842
const MUSCLE_RGB = '248,113,113';  // #f87171
const SLEEP_RGB = '147,197,253';   // #93C5FD

function EnergyIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 80 80" fill="none">
      <circle cx="40" cy="40" r="36" fill={`rgba(${ENERGY_RGB},0.17)`} />
      <circle cx="40" cy="40" r="24" fill={`rgba(${ENERGY_RGB},0.13)`} />
      <polygon
        points="45,5 21,42 36,42 35,75 59,38 44,38"
        fill={`rgba(${ENERGY_RGB},0.9)`}
        stroke={`rgba(${ENERGY_RGB},0.9)`}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MuscleIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 80 80" fill="none">
      <circle cx="40" cy="40" r="36" stroke={`rgba(${MUSCLE_RGB},0.45)`} strokeWidth="2.5" />
      <circle cx="40" cy="40" r="26" stroke={`rgba(${MUSCLE_RGB},0.6)`} strokeWidth="2.5" />
      <circle cx="40" cy="40" r="16" stroke={`rgba(${MUSCLE_RGB},0.75)`} strokeWidth="2.5" />
      <circle cx="40" cy="40" r="5" fill={`rgba(${MUSCLE_RGB},0.9)`} />
      <line x1="40" y1="2" x2="40" y2="12" stroke={`rgba(${MUSCLE_RGB},0.6)`} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="78" y1="40" x2="68" y2="40" stroke={`rgba(${MUSCLE_RGB},0.6)`} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="40" y1="78" x2="40" y2="68" stroke={`rgba(${MUSCLE_RGB},0.6)`} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="2" y1="40" x2="12" y2="40" stroke={`rgba(${MUSCLE_RGB},0.6)`} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function SleepIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 80 80" fill="none">
      <circle cx="36" cy="44" r="30" fill={`rgba(${SLEEP_RGB},0.12)`} />
      <circle cx="63" cy="14" r="2.5" fill={`rgba(${SLEEP_RGB},0.7)`} />
      <circle cx="71" cy="28" r="1.5" fill={`rgba(${SLEEP_RGB},0.55)`} />
      <circle cx="57" cy="8" r="1.5" fill={`rgba(${SLEEP_RGB},0.45)`} />
      <circle cx="69" cy="20" r="1" fill={`rgba(${SLEEP_RGB},0.4)`} />
      <circle cx="75" cy="36" r="1" fill={`rgba(${SLEEP_RGB},0.3)`} />
      <circle cx="35" cy="44" r="22" fill={`rgba(${SLEEP_RGB},0.85)`} />
      <circle cx="46" cy="38" r="18" fill="#222222" />
    </svg>
  );
}

function MetricRing({ progress, label, IconComponent, ringColor }) {
  const size = 84;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - progress);
  const center = size / 2;

  return (
    <View style={styles.ringWrap}>
      <View style={{ width: size, height: size, position: 'relative' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
          <circle
            cx={center} cy={center} r={r}
            stroke="rgba(255,255,255,0.10)"
            strokeWidth={stroke}
            fill="none"
          />
          <circle
            cx={center} cy={center} r={r}
            stroke={ringColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={c}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${center} ${center})`}
          />
        </svg>
        <View style={styles.iconCenter} pointerEvents="none">
          <IconComponent />
        </View>
      </View>
      <Text style={styles.ringLabel}>{label}</Text>
    </View>
  );
}

export default function ReadinessOptInPrompt({ onChoose }) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const slideAnim = useRef(new Animated.Value(screenHeight)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [busy, setBusy] = React.useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [slideAnim, fadeAnim]);

  const handle = (value) => {
    if (busy) return;
    setBusy(true);
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: screenHeight * 0.6, duration: 220, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => onChoose(value));
  };

  const cardWidth = Math.min(screenWidth - 32, 380);

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]} pointerEvents="auto">
      <View style={StyleSheet.absoluteFill} pointerEvents="auto" />
      <Animated.View style={[styles.card, { width: cardWidth, transform: [{ translateY: slideAnim }] }]}>
        <Text style={styles.question}>
          ¿Quieres rastrear cómo tus hábitos o bienestar afectan tu rendimiento?
        </Text>

        <View style={styles.ringsRow}>
          <MetricRing
            progress={0.78}
            label="Músculos"
            IconComponent={MuscleIcon}
            ringColor={`rgba(${MUSCLE_RGB},0.9)`}
          />
          <MetricRing
            progress={0.62}
            label="Sueño"
            IconComponent={SleepIcon}
            ringColor={`rgba(${SLEEP_RGB},0.9)`}
          />
          <MetricRing
            progress={0.88}
            label="Energía"
            IconComponent={EnergyIcon}
            ringColor={`rgba(${ENERGY_RGB},0.9)`}
          />
        </View>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => handle(true)}
          disabled={busy}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnLabel}>Hacerlo</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => handle(false)}
          disabled={busy}
          activeOpacity={0.7}
        >
          <Text style={styles.secondaryBtnLabel}>No hacerlo</Text>
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
    paddingTop: 28, paddingHorizontal: 24, paddingBottom: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    maxWidth: 380,
    width: '100%',
    alignSelf: 'center',
  },
  question: {
    fontSize: 18, fontWeight: '700', color: '#ffffff',
    textAlign: 'center', lineHeight: 25,
    marginBottom: 22,
  },
  ringsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  ringWrap: {
    alignItems: 'center',
  },
  iconCenter: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringLabel: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  primaryBtn: {
    backgroundColor: '#ffffff', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
    marginBottom: 8,
  },
  primaryBtnLabel: {
    fontSize: 15, fontWeight: '700', color: '#1a1a1a',
  },
  secondaryBtn: {
    paddingVertical: 12, alignItems: 'center',
  },
  secondaryBtnLabel: {
    fontSize: 14, color: 'rgba(255,255,255,0.55)', fontWeight: '500',
  },
});
