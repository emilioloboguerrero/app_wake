// Platform-aware video player hook
// Provides a consistent API across web and native platforms
// 
// On native: Uses expo-video's useVideoPlayer
// On web: Returns a mock player that won't block the main thread
//
// IMPORTANT: This hook follows React's rules of hooks by always calling
// the same hooks in the same order, regardless of platform.

import { useRef, useEffect, useState } from 'react';
import { isWeb } from '../utils/platform';
import logger from '../utils/logger';

// Create a stable mock player object
const createMockPlayer = (initialMuted = false) => {
  return {
    // State properties
    playing: false,
    muted: initialMuted,
    volume: 1.0,
    currentTime: 0,
    duration: 0,
    loop: false,
    
    // Control methods
    play() { this.playing = true; },
    pause() { this.playing = false; },
    seekTo(time) { this.currentTime = time; },
    replay() { this.currentTime = 0; this.playing = true; },
    
    // For compatibility
    replace(source) { /* no-op on web */ },
    
    // Method required by VideoView on web (prevents mountVideoView error)
    mountVideoView(view) { /* no-op on web */ },
    unmountVideoView(view) { /* no-op on web */ },
  };
};

// Cache the native useVideoPlayer hook at module level
let nativeUseVideoPlayer = null;
if (!isWeb) {
  try {
    nativeUseVideoPlayer = require('expo-video').useVideoPlayer;
  } catch (e) {
    logger.warn('[usePlatformVideoPlayer] expo-video not available');
  }
}

/**
 * Platform-aware video player hook
 * 
 * @param {string|object|null} source - Video source URL or require() result
 * @param {function} [setupCallback] - Optional callback when player initializes
 * @param {object} [options] - Additional options
 * @param {boolean} [options.enabled=true] - Whether to enable the player (for lazy loading)
 * @returns {object|null} Video player instance
 * 
 * @example
 * // Basic usage
 * const player = usePlatformVideoPlayer(videoUrl, (p) => { p.loop = true; });
 * 
 * @example
 * // Lazy loading (disabled until modal opens)
 * const player = usePlatformVideoPlayer(videoUrl, null, { enabled: isModalOpen });
 */
export function usePlatformVideoPlayer(source, setupCallback, options = {}) {
  const { enabled = true } = options;
  
  // Always use refs and state (consistent hook order)
  const mockPlayerRef = useRef(null);
  const setupCallbackRef = useRef(setupCallback);
  const [isReady, setIsReady] = useState(false);
  
  // Initialize mock player ref once (for web)
  if (isWeb && !mockPlayerRef.current) {
    mockPlayerRef.current = createMockPlayer();
  }
  
  // Update callback ref without triggering re-render
  useEffect(() => {
    setupCallbackRef.current = setupCallback;
  }, [setupCallback]);
  
  // Web-specific setup effect
  useEffect(() => {
    if (!isWeb) return;
    
    if (setupCallbackRef.current && mockPlayerRef.current) {
      try {
        setupCallbackRef.current(mockPlayerRef.current);
      } catch (e) {
        // Ignore setup errors on web
      }
    }
    setIsReady(true);
  }, []); // Only run once on mount
  
  // Native video player logic - must be after all hooks for consistent order
  // But we can't conditionally call useVideoPlayer, so we handle this differently
  
  // On web, return the mock player
  if (isWeb) {
    return mockPlayerRef.current;
  }
  
  // On native with expo-video available
  if (nativeUseVideoPlayer) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const player = nativeUseVideoPlayer(enabled ? source : '', (p) => {
      if (p && setupCallbackRef.current) {
        setupCallbackRef.current(p);
      }
    });
    return player;
  }
  
  // Fallback to mock if expo-video not available
  return mockPlayerRef.current;
}

/**
 * Hook to check if native video player should be used
 * @returns {boolean} True if on native platform, false on web
 */
export function useNativeVideoEnabled() {
  return !isWeb;
}

/**
 * Hook to get platform-appropriate video component
 * @returns {{ VideoView: Component, WebVideoPlayer: Component, isWeb: boolean }}
 */
export function useVideoComponents() {
  if (isWeb) {
    const WebVideoPlayer = require('../components/WebVideoPlayer').default;
    return {
      VideoView: null,
      WebVideoPlayer,
      isWeb: true,
    };
  }
  
  try {
    const { VideoView } = require('expo-video');
    return {
      VideoView,
      WebVideoPlayer: null,
      isWeb: false,
    };
  } catch (error) {
    return {
      VideoView: null,
      WebVideoPlayer: null,
      isWeb: true,
    };
  }
}

export default usePlatformVideoPlayer;
