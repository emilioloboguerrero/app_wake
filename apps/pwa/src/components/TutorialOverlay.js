import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  useWindowDimensions,
  Animated,
  Platform,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { useVideo } from '../contexts/VideoContext';
import SvgPlay from './icons/SvgPlay';
import SvgVolumeMax from './icons/SvgVolumeMax';
import SvgVolumeOff from './icons/SvgVolumeOff';
import logger from '../utils/logger.js';
import WakeLoader from './WakeLoader';

const WakeModalOverlayWeb = Platform.OS === 'web' ? require('./WakeModalOverlay.web').default : null;

const TutorialOverlay = ({ 
  visible, 
  tutorialData, 
  onClose, 
  onComplete 
}) => {
  const componentStartTime = performance.now();
  logger.debug(`[CHILD] [CHECKPOINT] TutorialOverlay render started - ${componentStartTime.toFixed(2)}ms`);
  
  // Hooks must be called before any early returns (React rules)
  // ALL hooks must be called unconditionally and in the same order every render
  const hooksStartTime = performance.now();
  const { isMuted, toggleMute } = useVideo();
  const [isLoading, setIsLoading] = useState(true);
  const [currentTutorialIndex, setCurrentTutorialIndex] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [animationStarted, setAnimationStarted] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const progressAnimation = useRef(new Animated.Value(0)).current;
  // CRITICAL: useWindowDimensions() must be called BEFORE any early returns
  // This ensures hooks are always called in the same order (React Rules of Hooks)
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const videoUrl = tutorialData?.[currentTutorialIndex]?.videoUrl ?? '';
  const videoRef = useRef(null);
  
  // Log when we have a video URL to load (for debugging web/PWA tutorial card stuck gray)
  useEffect(() => {
    if (visible && videoUrl) {
      logger.log('[TutorialOverlay] Video source set, waiting for onLoad', {
        platform: Platform.OS,
        videoUrl: videoUrl.slice?.(0, 80),
        currentTutorialIndex,
      });
    }
  }, [visible, videoUrl, currentTutorialIndex]);

  // Sync mute state when context isMuted changes
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.setIsMutedAsync(isMuted).catch(() => {});
    }
  }, [isMuted]);

  // CRITICAL: All useEffect hooks must be called BEFORE any early returns
  // Use tutorialData?.[currentTutorialIndex] instead of currentTutorial since currentTutorial is defined after early return
  useEffect(() => {
    if (visible && tutorialData && tutorialData.length > 0 && tutorialData[currentTutorialIndex]) {
      setIsLoading(true);
      setIsVideoPlaying(false);
      setVideoDuration(0);
      setAnimationStarted(false);
      setVideoError(false); // Reset error state when changing tutorials
      progressAnimation.setValue(0); // Reset animation
    }
  }, [visible, tutorialData, currentTutorialIndex]);
  
  // Track component render completion using useEffect - must be before any returns
  // This useEffect is always called (before early returns) to maintain hook order
  useEffect(() => {
    if (visible && tutorialData && tutorialData.length > 0 && tutorialData[currentTutorialIndex]) {
      const componentEndTime = performance.now();
      const componentDuration = componentEndTime - componentStartTime;
      logger.debug(`[CHILD] [CHECKPOINT] TutorialOverlay render completed - ${componentEndTime.toFixed(2)}ms (took ${componentDuration.toFixed(2)}ms)`);
      if (componentDuration > 50) {
        logger.warn(`[CHILD] ⚠️ SLOW: TutorialOverlay render took ${componentDuration.toFixed(2)}ms (threshold: 50ms)`);
      }
    }
  }, [visible, tutorialData, currentTutorialIndex, componentStartTime]);
  
  const hooksDuration = performance.now() - hooksStartTime;
  if (hooksDuration > 10) {
    logger.warn(`[CHILD] ⚠️ SLOW: TutorialOverlay hooks took ${hooksDuration.toFixed(2)}ms`);
  }

  // CRITICAL: Early return AFTER all hooks are called
  // Check visibility after hooks to avoid blocking paint but maintain hook order
  const visibilityCheckStart = performance.now();
  if (!visible || !tutorialData || tutorialData.length === 0) {
    return null;
  }
  const visibilityCheckDuration = performance.now() - visibilityCheckStart;
  if (visibilityCheckDuration > 1) {
    logger.warn(`[CHILD] ⚠️ SLOW: TutorialOverlay visibility check took ${visibilityCheckDuration.toFixed(2)}ms`);
  }
  
  const currentTutorial = tutorialData?.[currentTutorialIndex];

  const handleVideoTap = async () => {
    if (!videoRef.current) return;
    if (isVideoPlaying) {
      await videoRef.current.pauseAsync();
      setIsVideoPlaying(false);
      progressAnimation.stopAnimation();
      logger.log('Paused video and animation');
    } else {
      await videoRef.current.playAsync();
      setIsVideoPlaying(true);
      if (animationStarted) {
        const remainingDuration = videoDuration * (1 - progressAnimation._value);
        Animated.timing(progressAnimation, {
          toValue: 1,
          duration: remainingDuration,
          useNativeDriver: false,
        }).start();
        logger.log('Resumed animation for', remainingDuration, 'ms');
      } else if (videoDuration > 0) {
        setAnimationStarted(true);
        Animated.timing(progressAnimation, {
          toValue: 1,
          duration: videoDuration,
          useNativeDriver: false,
        }).start();
        logger.log('Started synchronized animation for', videoDuration, 'ms');
      }
    }
  };

  const handleVolumeToggle = async () => {
    toggleMute();
    if (videoRef.current) {
      await videoRef.current.setIsMutedAsync(!isMuted).catch(() => {});
      logger.log('Video audio updated - muted:', !isMuted);
    }
  };

  const handleNextTutorial = () => {
    if (currentTutorialIndex < tutorialData.length - 1) {
      setCurrentTutorialIndex(currentTutorialIndex + 1);
      setIsVideoPlaying(false);
      setVideoDuration(0);
      setAnimationStarted(false);
      progressAnimation.setValue(0); // Reset animation
    } else {
      handleComplete();
    }
  };

  const handleComplete = () => {
    onComplete?.();
    onClose?.();
  };

  const handleClose = () => {
    onClose?.();
  };

  const onVideoLoad = (status) => {
    const s = status?.nativeEvent ?? status;
    // On web, expo-av passes a DOM Event to onLoad (no isLoaded). Event.target is the video element; .duration (seconds) may be NaN until metadata loads.
    const isWebEvent = Platform.OS === 'web' && status?.target != null;
    const durationFromWeb = isWebEvent && typeof status.target.duration === 'number' && !Number.isNaN(status.target.duration)
      ? Math.round(status.target.duration * 1000)
      : 0;
    const isLoaded = s?.isLoaded === true || isWebEvent;

    if (!isLoaded) {
      logger.log('[TutorialOverlay] onVideoLoad early return: not loaded', { hasIsLoaded: s?.isLoaded, isWebEvent });
      return;
    }

    const duration = s?.durationMillis ?? s?.duration ?? durationFromWeb;
    logger.log('[TutorialOverlay] onVideoLoad proceeding', { duration, platform: Platform.OS, isWebEvent });
    setIsLoading(false);
    setVideoError(false);
    setVideoDuration(duration);
    setAnimationStarted(false);
    progressAnimation.setValue(0);
    logger.log('Video', currentTutorialIndex, 'loaded, duration:', duration);
    setTimeout(async () => {
      if (videoRef.current) {
        await videoRef.current.setPositionAsync(0).catch(() => {});
        await videoRef.current.setIsMutedAsync(isMuted).catch(() => {});
        await videoRef.current.playAsync().catch(() => {});
        setIsVideoPlaying(true);
        if (duration > 0) {
          setAnimationStarted(true);
          Animated.timing(progressAnimation, {
            toValue: 1,
            duration,
            useNativeDriver: false,
          }).start();
          logger.log('Started synchronized animation for', duration, 'ms');
        }
        logger.log('Video', currentTutorialIndex, 'position reset to 0, started playing');
      }
    }, 100);
  };

  const onVideoError = (error) => {
    logger.error('❌ Tutorial video load error:', {
      platform: Platform.OS,
      tutorialIndex: currentTutorialIndex,
      videoUrl: currentTutorial?.videoUrl,
      error: error?.message || error,
      errorCode: error?.code,
      rawError: error,
    });
    
    setIsLoading(false);
    setVideoError(true);
    setVideoDuration(0);
    setAnimationStarted(false);
    progressAnimation.setValue(0);
    
    // Auto-skip to next tutorial after a short delay, or close if it's the last one
    setTimeout(() => {
      if (currentTutorialIndex < tutorialData.length - 1) {
        logger.log('⏭️ Auto-skipping to next tutorial due to video error');
        handleNextTutorial();
      } else {
        logger.log('✅ Closing tutorial overlay (last tutorial failed)');
        handleComplete();
      }
    }, 2000); // Give user 2 seconds to see the error before auto-skipping
  };

  const onVideoEnd = () => {
    handleNextTutorial();
  };

  const onPlaybackStatusUpdate = (status) => {
    if (status?.isPlaying !== undefined) {
      setIsVideoPlaying(status.isPlaying);
    }
    if (status?.didJustFinish && !status?.isLooping) {
      onVideoEnd();
    }
  };

  // Early return check - must be AFTER all hooks
  // Note: currentTutorial is defined above, so this check is safe
  if (!visible || !currentTutorial) {
    return null;
  }

  // Create styles with dimensions
  const stylesStartTime = performance.now();
  const styles = createStyles(screenWidth, screenHeight);
  const stylesDuration = performance.now() - stylesStartTime;
  logger.debug(`[CHILD] [TIMING] TutorialOverlay createStyles took ${stylesDuration.toFixed(2)}ms`);
  if (stylesDuration > 10) {
    logger.warn(`[CHILD] ⚠️ SLOW: TutorialOverlay createStyles took ${stylesDuration.toFixed(2)}ms`);
  }

  const jsxStartTime = performance.now();
  logger.debug(`[CHILD] [TIMING] TutorialOverlay JSX creation starting - ${jsxStartTime.toFixed(2)}ms`);

  const videoCardContent = (
    <TouchableOpacity
      style={styles.videoCard}
      activeOpacity={1}
      onPress={(e) => e.stopPropagation()}
    >
      {/* Progress Indicator - Smooth animation for each segment */}
      <View style={styles.progressBarContainer}>
            {Array.from({ length: tutorialData.length }).map((_, index) => {
              // Each segment has its own progress state
              const isCompleted = index < currentTutorialIndex;
              const isCurrent = index === currentTutorialIndex;
              
              return (
                <View
                  key={index}
                  style={[
                    styles.progressBarSegment,
                    {
                      backgroundColor: '#6B6B6B',
                    },
                  ]}
                >
                  {isCurrent ? (
                    <Animated.View
                      style={[
                        styles.progressBarFill,
                        { 
                          width: progressAnimation.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0%', '100%'],
                          }),
                          backgroundColor: '#FFFFFF'
                        },
                      ]}
                    />
                  ) : isCompleted ? (
                    <View
                      style={[
                        styles.progressBarFill,
                        { 
                          width: '100%',
                          backgroundColor: '#FFFFFF'
                        },
                      ]}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>

          {isLoading && (
            <View style={styles.loadingContainer}>
              <WakeLoader size={80} />
              <Text style={styles.loadingText}>Cargando...</Text>
            </View>
          )}
          
          {videoError ? (
            <View style={styles.videoErrorContainer}>
              <Text style={styles.videoErrorText}>Error al cargar el video</Text>
              <Text style={styles.videoErrorSubtext}>Saltando al siguiente tutorial...</Text>
            </View>
          ) : currentTutorial.videoUrl ? (
            <>
              {/* On web, wrap Video in an absolute container so it gets a definite size; expo-av can collapse otherwise */}
              <View style={Platform.OS === 'web' ? styles.videoContainerWeb : styles.videoContainer}>
                <Video
                  key={currentTutorialIndex}
                  ref={videoRef}
                  source={{ uri: currentTutorial.videoUrl }}
                  style={[styles.video, { opacity: isVideoPlaying ? 1.0 : 0.7 }]}
                  videoStyle={Platform.OS === 'web' ? styles.videoWeb : undefined}
                  resizeMode={ResizeMode.COVER}
                  useNativeControls={false}
                  isLooping={false}
                  onLoad={onVideoLoad}
                  onError={onVideoError}
                  onPlaybackStatusUpdate={onPlaybackStatusUpdate}
                  progressUpdateIntervalMillis={250}
                />
              </View>
              <TouchableOpacity
                style={styles.videoTapArea}
                activeOpacity={1}
                onPress={handleVideoTap}
              />
              {!isVideoPlaying && !isLoading && (
                <View style={styles.playIconContainer} pointerEvents="none">
                  <SvgPlay width={60} height={60} fill="#FFFFFF" />
                </View>
              )}
              {/* Volume - same position as Saltar, only when paused */}
              {!isVideoPlaying && !isLoading && (
                <View style={styles.volumeIconContainer}>
                  <TouchableOpacity
                    style={styles.volumeIconButton}
                    onPress={handleVolumeToggle}
                    activeOpacity={0.8}
                  >
                    {isMuted ? (
                      <SvgVolumeOff width={24} height={24} fill="#FFFFFF" />
                    ) : (
                      <SvgVolumeMax width={24} height={24} fill="#FFFFFF" />
                    )}
                  </TouchableOpacity>
                </View>
              )}
              {/* Skip Button - same position, only while playing */}
              {isVideoPlaying && !isLoading && (
                <View style={styles.skipButtonContainer}>
                  <TouchableOpacity
                    style={styles.skipButton}
                    onPress={handleNextTutorial}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.skipButtonText}>Saltar</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          ) : null}
    </TouchableOpacity>
  );

  if (WakeModalOverlayWeb) {
    return (
      <WakeModalOverlayWeb
        visible={visible}
        onClose={handleClose}
        contentAnimation="fade"
        contentPlacement="center"
      >
        {videoCardContent}
      </WakeModalOverlayWeb>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={handleClose}
      >
        {videoCardContent}
      </TouchableOpacity>
      {(() => {
        const jsxEndTime = performance.now();
        const jsxDuration = jsxEndTime - jsxStartTime;
        logger.debug(`[CHILD] [TIMING] TutorialOverlay JSX creation completed - ${jsxEndTime.toFixed(2)}ms (took ${jsxDuration.toFixed(2)}ms)`);
        if (jsxDuration > 50) {
          logger.warn(`[CHILD] ⚠️ SLOW: TutorialOverlay JSX creation took ${jsxDuration.toFixed(2)}ms`);
        }
        return null;
      })()}
    </Modal>
  );
};

// Styles function - takes screenWidth and screenHeight as parameters
const createStyles = (screenWidth, screenHeight) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  videoCard: {
    width: screenWidth - 40,
    height: screenHeight * 0.7,
    backgroundColor: '#000000',
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  videoContainer: {
    width: '100%',
    height: '100%',
  },
  videoContainerWeb: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  // expo-av Video on web: position 'relative' needed so the video element displays (absolute breaks display)
  videoWeb: {
    position: 'relative',
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    zIndex: 10,
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 16,
    marginTop: 10,
  },
  videoErrorContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 20,
    zIndex: 10,
  },
  videoErrorText: {
    color: '#ff6b6b',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  videoErrorSubtext: {
    color: '#999999',
    fontSize: 14,
    textAlign: 'center',
  },
  progressBarContainer: {
    position: 'absolute',
    top: 15,
    left: 15,
    right: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
    gap: 4,
  },
  progressBarSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#6B6B6B',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },
  skipButtonContainer: {
    position: 'absolute',
    top: 28, // just below the progress indicator (which is at top:15, height:4)
    right: 12,
    zIndex: 10,
  },
  // Volume uses same position as skip button (top: 28, right: 12)
  volumeIconContainer: {
    position: 'absolute',
    top: 28,
    right: 12,
    zIndex: 10,
  },
  skipButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  videoTapArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 5,
  },
  playIconContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -30 }, { translateY: -30 }],
    zIndex: 10,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  volumeIconButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    padding: 8,
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default TutorialOverlay;