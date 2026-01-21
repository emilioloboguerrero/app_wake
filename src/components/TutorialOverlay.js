import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  useWindowDimensions,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Video } from 'expo-av';
import { useVideo } from '../contexts/VideoContext';
import SvgPlay from './icons/SvgPlay';
import SvgVolumeMax from './icons/SvgVolumeMax';
import SvgVolumeOff from './icons/SvgVolumeOff';

import logger from '../utils/logger.js';

const TutorialOverlay = ({ 
  visible, 
  tutorialData, 
  onClose, 
  onComplete 
}) => {
  const componentStartTime = performance.now();
  logger.debug(`[CHILD] [CHECKPOINT] TutorialOverlay render started - ${componentStartTime.toFixed(2)}ms`);
  
  // Hooks must be called before any early returns (React rules)
  const hooksStartTime = performance.now();
  const { isMuted, toggleMute } = useVideo();
  const [isLoading, setIsLoading] = useState(true);
  const [currentTutorialIndex, setCurrentTutorialIndex] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [animationStarted, setAnimationStarted] = useState(false);
  const videoRef = useRef(null);
  const progressAnimation = useRef(new Animated.Value(0)).current;
  const hooksDuration = performance.now() - hooksStartTime;
  if (hooksDuration > 10) {
    logger.warn(`[CHILD] ⚠️ SLOW: TutorialOverlay hooks took ${hooksDuration.toFixed(2)}ms`);
  }

  // CRITICAL: Early return BEFORE expensive operations to avoid blocking paint
  // Check visibility first without doing any expensive work
  const visibilityCheckStart = performance.now();
  if (!visible || !tutorialData || tutorialData.length === 0) {
    return null;
  }
  const visibilityCheckDuration = performance.now() - visibilityCheckStart;
  if (visibilityCheckDuration > 1) {
    logger.warn(`[CHILD] ⚠️ SLOW: TutorialOverlay visibility check took ${visibilityCheckDuration.toFixed(2)}ms`);
  }
  
  // Use hook for reactive dimensions that update on orientation change
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  
  const currentTutorial = tutorialData?.[currentTutorialIndex];

  const handleVideoTap = () => {
    if (videoRef.current) {
      if (isVideoPlaying) {
        // Pause video and animation
        videoRef.current.pauseAsync();
        progressAnimation.stopAnimation();
        logger.log('Paused video and animation');
      } else {
        // Resume video and animation
        videoRef.current.playAsync();
        if (animationStarted) {
          // Resume animation from current position
          const remainingDuration = videoDuration * (1 - progressAnimation._value);
          Animated.timing(progressAnimation, {
            toValue: 1,
            duration: remainingDuration,
            useNativeDriver: false,
          }).start();
          logger.log('Resumed animation for', remainingDuration, 'ms');
        }
      }
    }
  };

  const handleVolumeToggle = async () => {
    toggleMute();
    // Update video audio settings immediately
    if (videoRef.current) {
      const newMutedState = !isMuted;
      await videoRef.current.setVolumeAsync(newMutedState ? 0 : 1.0);
      await videoRef.current.setIsMutedAsync(newMutedState);
      logger.log('Video audio updated - muted:', newMutedState, 'volume:', newMutedState ? 0 : 1.0);
    }
  };

  useEffect(() => {
    if (visible && currentTutorial) {
      setIsLoading(true);
      setIsVideoPlaying(false);
      setVideoDuration(0);
      setAnimationStarted(false);
      progressAnimation.setValue(0); // Reset animation
    }
  }, [visible, currentTutorial, currentTutorialIndex]);

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

  const onVideoLoad = async (status) => {
    setIsLoading(false);
    setVideoDuration(status.durationMillis || 0);
    setAnimationStarted(false);
    progressAnimation.setValue(0); // Reset animation
    logger.log('Video', currentTutorialIndex, 'loaded, duration:', status.durationMillis);
    
    // Reset video position to 0 and start playing
    setTimeout(async () => {
      if (videoRef.current) {
        await videoRef.current.setPositionAsync(0); // Reset to beginning
        // Ensure audio is properly configured
        await videoRef.current.setVolumeAsync(isMuted ? 0 : 1.0);
        await videoRef.current.setIsMutedAsync(isMuted);
        await videoRef.current.playAsync();
        logger.log('Video', currentTutorialIndex, 'position reset to 0, audio configured, and started playing');
        // Animation will start when onPlaybackStatusUpdate detects playing state
      }
    }, 100);
  };

  const onVideoEnd = () => {
    handleNextTutorial();
  };

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
              <ActivityIndicator size="large" color="#ffffff" />
              <Text style={styles.loadingText}>Cargando...</Text>
            </View>
          )}
          
          <Video
            ref={videoRef}
            source={{ uri: currentTutorial.videoUrl }}
            style={[styles.video, { opacity: isVideoPlaying ? 1.0 : 0.7 }]}
            volume={isMuted ? 0 : 1.0}
            isMuted={isMuted}
            shouldPlay={false}
            isLooping={false}
            useNativeControls={false}
            resizeMode="cover"
            onLoad={onVideoLoad}
            onPlaybackStatusUpdate={(status) => {
              if (status.isLoaded) {
                setIsLoading(false);
                
                if (status.isPlaying && !isVideoPlaying) {
                  setIsVideoPlaying(true);
                  logger.log('Video started playing, muted:', isMuted, 'volume:', isMuted ? 0 : 1.0);
                  
                  // Start animation only when video actually starts playing
                  if (!animationStarted && videoDuration > 0) {
                    setAnimationStarted(true);
                    Animated.timing(progressAnimation, {
                      toValue: 1,
                      duration: videoDuration,
                      useNativeDriver: false,
                    }).start();
                    logger.log('Started synchronized animation for', videoDuration, 'ms');
                  }
                }
                
                if (!status.isPlaying && isVideoPlaying) {
                  setIsVideoPlaying(false);
                  logger.log('Video paused');
                }
                
                if (status.didJustFinish) {
                  logger.log('Video finished');
                  onVideoEnd();
                }
              }
            }}
          />

          {/* Skip Button - top-left, below indicator, only while playing */}
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

          {/* Pause/Play Icon Overlay */}
          {!isVideoPlaying && !isLoading && (
            <View style={styles.playIconContainer}>
              <SvgPlay width={60} height={60} color="#ffffff" />
            </View>
          )}

          {/* Volume Control - only show when paused */}
          {!isVideoPlaying && !isLoading && (
            <View style={styles.volumeIconContainer}>
              <TouchableOpacity 
                style={styles.volumeIconButton}
                onPress={handleVolumeToggle}
                activeOpacity={0.7}
              >
                {isMuted ? (
                  <SvgVolumeOff width={24} height={24} color="white" />
                ) : (
                  <SvgVolumeMax width={24} height={24} color="white" />
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Tap to pause/resume */}
          <TouchableOpacity 
            style={styles.videoTapArea}
            onPress={handleVideoTap}
            activeOpacity={1}
          />
          
        </TouchableOpacity>
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
  
  // Track component render completion using useEffect
  useEffect(() => {
    const componentEndTime = performance.now();
    const componentDuration = componentEndTime - componentStartTime;
    logger.debug(`[CHILD] [CHECKPOINT] TutorialOverlay render completed - ${componentEndTime.toFixed(2)}ms (took ${componentDuration.toFixed(2)}ms)`);
    if (componentDuration > 50) {
      logger.warn(`[CHILD] ⚠️ SLOW: TutorialOverlay render took ${componentDuration.toFixed(2)}ms (threshold: 50ms)`);
    }
  });
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
  video: {
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
    right: 12, // align to the right above the volume icon (which is at right:12, top:60)
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
  volumeIconContainer: {
    position: 'absolute',
    top: 60,
    right: 12,
    zIndex: 5,
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