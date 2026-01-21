// Platform-aware VideoView component
// On native: Uses expo-video's VideoView
// On web: Uses WebVideoPlayer or a placeholder

import React from 'react';
import { View, Text } from 'react-native';
import { isWeb } from '../utils/platform';
import logger from '../utils/logger';

// Platform-specific video component
let NativeVideoView = null;
let WebVideoPlayerComponent = null;

// Only load expo-video on native
if (!isWeb) {
  try {
    const expoVideo = require('expo-video');
    NativeVideoView = expoVideo.VideoView;
  } catch (e) {
    logger.warn('[PlatformVideoView] Failed to load expo-video:', e.message);
  }
}

// Load WebVideoPlayer on web
if (isWeb) {
  try {
    WebVideoPlayerComponent = require('./WebVideoPlayer').default;
  } catch (e) {
    logger.warn('[PlatformVideoView] Failed to load WebVideoPlayer:', e.message);
  }
}

/**
 * Platform-aware VideoView component
 * Props are compatible with expo-video's VideoView
 */
const PlatformVideoView = ({
  player,
  style,
  contentFit = 'cover',
  nativeControls = false,
  showsTimecodes = false,
  fullscreenOptions,
  allowsPictureInPicture = false,
  onVideoTap,
  videoUrl,
  ...otherProps
}) => {
  // On native, use VideoView from expo-video
  if (!isWeb && NativeVideoView) {
    return (
      <NativeVideoView
        player={player}
        style={style}
        contentFit={contentFit}
        nativeControls={nativeControls}
        showsTimecodes={showsTimecodes}
        fullscreenOptions={fullscreenOptions}
        allowsPictureInPicture={allowsPictureInPicture}
        {...otherProps}
      />
    );
  }
  
  // On web, use WebVideoPlayer if available and we have a video URL
  if (isWeb && WebVideoPlayerComponent && videoUrl) {
    return (
      <WebVideoPlayerComponent
        src={videoUrl}
        style={style}
        loop={player?.loop ?? false}
        muted={player?.muted ?? false}
        autoplay={!player?.paused}
        controls={nativeControls}
        playsInline={true}
      />
    );
  }
  
  // Fallback: render a placeholder
  return (
    <View style={[style, { backgroundColor: '#2a2a2a', justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={{ color: '#666', fontSize: 12 }}>
        {isWeb ? 'Video (web)' : 'Video unavailable'}
      </Text>
    </View>
  );
};

export default PlatformVideoView;

// Re-export VideoView for native compatibility
export { NativeVideoView as VideoView };
