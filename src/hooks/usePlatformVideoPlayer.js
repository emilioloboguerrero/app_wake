// Re-export expo-video for backwards compatibility.
// All platforms now use expo-video (VideoView + useVideoPlayer) with custom overlay UI.
import { useVideoPlayer } from 'expo-video';

export { useVideoPlayer };
export { useVideoPlayer as usePlatformVideoPlayer };

export function useNativeVideoEnabled() {
  return true;
}

export function useVideoComponents() {
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
      isWeb: false,
    };
  }
}

export default useVideoPlayer;
