import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, useWindowDimensions } from 'react-native';

function MiniGraph() {
  return (
    <svg width="220" height="80" viewBox="0 0 220 80" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="rGraphFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      {[16, 32, 48, 64].map((y) => (
        <line
          key={y}
          x1="0" x2="220" y1={y} y2={y}
          stroke="rgba(255,255,255,0.05)" strokeWidth="1"
        />
      ))}
      <path
        d="M0 60 L36 50 L72 56 L108 38 L144 44 L180 22 L220 28 L220 80 L0 80 Z"
        fill="url(#rGraphFill)"
      />
      <path
        d="M0 60 L36 50 L72 56 L108 38 L144 44 L180 22 L220 28"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {[
        [0, 60], [36, 50], [72, 56], [108, 38], [144, 44], [180, 22], [220, 28],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2" fill="#ffffff" />
      ))}
    </svg>
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

        <View style={styles.graphArea}>
          <MiniGraph />
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
  graphArea: {
    alignItems: 'center',
    marginBottom: 24,
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
