import React from 'react';
import { View, Animated, ActivityIndicator, StyleSheet } from 'react-native';
import Text from '../Text';

const THRESHOLD = 70;

/**
 * Visual indicator for web pull-to-refresh.
 * Pair with useWebPullToRefresh hook.
 *
 * Renders an absolutely positioned indicator that slides in from the top
 * as the user pulls down. Place this inside the ScrollView at the very top
 * of the content.
 */
export default function WebPullToRefreshIndicator({ pullY, state, refreshing }) {
  const opacity = pullY.interpolate({
    inputRange: [0, 15, THRESHOLD],
    outputRange: [0, 0.3, 1],
    extrapolate: 'clamp',
  });

  const isRefreshing = state === 'refreshing' || refreshing;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity,
          transform: [{ translateY: Animated.subtract(pullY, 48) }],
        },
      ]}
      pointerEvents="none"
    >
      {isRefreshing ? (
        <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
      ) : (
        <Text style={styles.arrow}>{state === 'threshold' ? '\u2191' : '\u2193'}</Text>
      )}
      <Text style={styles.text}>
        {isRefreshing
          ? 'Actualizando...'
          : state === 'threshold'
            ? 'Suelta para actualizar'
            : 'Desliza para actualizar'}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 20,
  },
  arrow: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    fontWeight: '600',
  },
  text: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '500',
  },
});
