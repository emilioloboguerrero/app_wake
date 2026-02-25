import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useActivityStreakContext } from '../contexts/ActivityStreakContext';
import SvgFire from './icons/vectors_fig/Environment/Fire';

const HEADER_ICON_SIZE = 18;
const opacityActive = 0.9;
const opacityDead = 0.4;

export function HeaderStreakBadge() {
  const { streakNumber, flameLevel, isLoading, hasUser } = useActivityStreakContext();

  if (!hasUser) return null;

  const isDead = flameLevel === 0;
  const opacity = isDead ? opacityDead : opacityActive;
  const displayNumber = isDead ? 0 : streakNumber;
  const showAllThree = isLoading || isDead;
  const showBase = showAllThree || flameLevel >= 3;
  const showMiddle = showAllThree || flameLevel >= 2;
  const showInner = showAllThree || flameLevel >= 1;
  const useDimmed = isLoading || isDead;

  return (
    <View style={styles.container} pointerEvents="none">
      <View style={styles.fireRow}>
        {showBase && (
          <SvgFire
            width={HEADER_ICON_SIZE}
            height={HEADER_ICON_SIZE}
            stroke="#000000"
            strokeWidth={0.3}
            fill="#E64A11"
            style={[styles.fireBase, { opacity: useDimmed ? opacityDead : opacity }]}
          />
        )}
        {showMiddle && (
          <SvgFire
            width={HEADER_ICON_SIZE * 0.55}
            height={HEADER_ICON_SIZE * 0.55}
            stroke="#D5C672"
            strokeWidth={0.5}
            fill="#D5C672"
            style={[styles.fireMiddle, { opacity: useDimmed ? opacityDead : opacity }]}
          />
        )}
        {showInner && (
          <SvgFire
            width={HEADER_ICON_SIZE * 0.3}
            height={HEADER_ICON_SIZE * 0.3}
            stroke="#FFFFFF"
            strokeWidth={0.5}
            fill="#FFFFFF"
            style={[styles.fireInner, { opacity: useDimmed ? opacityDead : opacity }]}
          />
        )}
      </View>
      <Text style={styles.number}>{displayNumber}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  fireRow: {
    position: 'relative',
    width: HEADER_ICON_SIZE,
    height: HEADER_ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  fireBase: {
    position: 'absolute',
    bottom: 0,
  },
  fireMiddle: {
    position: 'absolute',
    bottom: 2,
  },
  fireInner: {
    position: 'absolute',
    bottom: 3,
  },
  number: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default HeaderStreakBadge;
