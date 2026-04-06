import { useRef, useState, useEffect, useCallback } from 'react';
import { Animated } from 'react-native';

const THRESHOLD = 70;
const MAX_PULL = 110;
const RESISTANCE = 0.45;

/**
 * Hook for web pull-to-refresh on a React Native Web ScrollView.
 *
 * Returns { pullY, state, bind } where:
 *  - pullY: Animated.Value for indicator positioning
 *  - state: 'idle' | 'pulling' | 'threshold' | 'refreshing'
 *  - bind: call bind(scrollViewRef) after mount to attach touch listeners
 */
export default function useWebPullToRefresh({ onRefresh, refreshing, enabled = true }) {
  const pullY = useRef(new Animated.Value(0)).current;
  const touchStartY = useRef(0);
  const pulling = useRef(false);
  const [state, setState] = useState('idle');
  const stateRef = useRef('idle');
  const refreshingRef = useRef(refreshing);
  const cleanupRef = useRef(null);
  refreshingRef.current = refreshing;

  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  // Resolve RNW ScrollView ref to underlying DOM node
  const resolveNode = useCallback((rnRef) => {
    if (!rnRef?.current) return null;
    const raw = rnRef.current;
    const el = raw.getScrollableNode?.() || raw.getInnerViewNode?.() || raw;
    return el instanceof HTMLElement ? el : null;
  }, []);

  const bind = useCallback((rnScrollViewRef) => {
    // Clean up previous listeners
    if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; }
    if (!enabled) return;

    const node = resolveNode(rnScrollViewRef);
    if (!node) return;

    const onTouchStart = (e) => {
      if (refreshingRef.current) return;
      if (node.scrollTop > 0) return;
      touchStartY.current = e.touches[0].clientY;
      pulling.current = true;
      stateRef.current = 'pulling';
      setState('pulling');
    };

    const onTouchMove = (e) => {
      if (!pulling.current || refreshingRef.current) return;
      if (node.scrollTop > 0) {
        pulling.current = false;
        stateRef.current = 'idle';
        setState('idle');
        pullY.setValue(0);
        return;
      }

      const delta = e.touches[0].clientY - touchStartY.current;
      if (delta <= 0) {
        pullY.setValue(0);
        return;
      }

      e.preventDefault();
      const dampened = Math.min(delta * RESISTANCE, MAX_PULL);
      pullY.setValue(dampened);
      const next = dampened >= THRESHOLD ? 'threshold' : 'pulling';
      if (stateRef.current !== next) { stateRef.current = next; setState(next); }
    };

    const onTouchEnd = () => {
      if (!pulling.current) return;
      pulling.current = false;

      if (stateRef.current === 'threshold' && !refreshingRef.current) {
        stateRef.current = 'refreshing';
        setState('refreshing');
        Animated.spring(pullY, { toValue: 40, useNativeDriver: true, tension: 60, friction: 10 }).start();
        onRefreshRef.current?.();
      } else {
        stateRef.current = 'idle';
        setState('idle');
        Animated.spring(pullY, { toValue: 0, useNativeDriver: true, tension: 50, friction: 8 }).start();
      }
    };

    node.addEventListener('touchstart', onTouchStart, { passive: true });
    node.addEventListener('touchmove', onTouchMove, { passive: false });
    node.addEventListener('touchend', onTouchEnd, { passive: true });

    cleanupRef.current = () => {
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchmove', onTouchMove);
      node.removeEventListener('touchend', onTouchEnd);
    };
  }, [enabled, resolveNode, pullY]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (cleanupRef.current) cleanupRef.current(); };
  }, []);

  // Collapse indicator when refresh completes
  useEffect(() => {
    if (!refreshing && stateRef.current === 'refreshing') {
      stateRef.current = 'idle';
      setState('idle');
      Animated.spring(pullY, { toValue: 0, useNativeDriver: true, tension: 50, friction: 8 }).start();
    }
  }, [refreshing, pullY]);

  return { pullY, state, bind };
}
