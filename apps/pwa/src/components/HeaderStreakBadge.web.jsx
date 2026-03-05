// Web-specific HeaderStreakBadge — adds milestone celebration animation.
// On round-number streaks (7, 30, 100, 365) the flame + number animate in
// using the S6 counter-row keyframes from global.css.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useActivityStreakContext } from '../contexts/ActivityStreakContext';
import SvgFire from './icons/vectors_fig/Environment/Fire';

const HEADER_ICON_SIZE = 18;
const opacityActive = 0.9;
const opacityDead = 0.4;

const MILESTONES = new Set([7, 14, 21, 30, 60, 90, 100, 180, 200, 365]);

export function HeaderStreakBadge() {
  const { streakNumber, flameLevel, isLoading, hasUser } = useActivityStreakContext();
  const prevStreakRef = useRef(streakNumber);
  const [isMilestone, setIsMilestone] = useState(false);
  const milestoneTimerRef = useRef(null);

  useEffect(() => {
    if (
      !isLoading &&
      streakNumber > 0 &&
      streakNumber !== prevStreakRef.current &&
      MILESTONES.has(streakNumber)
    ) {
      setIsMilestone(true);
      if (milestoneTimerRef.current) clearTimeout(milestoneTimerRef.current);
      milestoneTimerRef.current = setTimeout(() => setIsMilestone(false), 1200);
    }
    prevStreakRef.current = streakNumber;
    return () => {
      if (milestoneTimerRef.current) clearTimeout(milestoneTimerRef.current);
    };
  }, [streakNumber, isLoading]);

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
    <View
      style={styles.container}
      pointerEvents="none"
      {...(isMilestone ? { className: 'wake-streak-container-milestone' } : {})}
    >
      <View
        style={styles.fireRow}
        {...(isMilestone ? { className: 'wake-streak-flame' } : {})}
      >
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
      <Text
        style={styles.number}
        {...(isMilestone ? { className: 'wake-streak-num' } : {})}
      >
        {displayNumber}
      </Text>
      {isMilestone && (
        <Text
          className="wake-streak-label"
          style={styles.milestoneLabel}
        >
          DÍAS
        </Text>
      )}
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
  milestoneLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});

export default HeaderStreakBadge;
