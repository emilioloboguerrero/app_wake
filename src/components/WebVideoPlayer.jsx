// Web Video Player Component
// Provides native-like video playback experience for PWA

import React, { useRef, useEffect, useState } from 'react';
import './WebVideoPlayer.css';
import logger from '../utils/logger';

const WebVideoPlayer = ({
  src,
  loop = false,
  muted = false,
  autoplay = false,
  onPlay,
  onPause,
  onEnd,
  onLoad,
  onError,
  style,
  className = '',
  controls = true,
  playsInline = true,
  videoRefCallback,
}) => {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(muted);
  const [showControls, setShowControls] = useState(controls);

  useEffect(() => {
    logger.debug('[WebVideoPlayer] effect', {
      srcType: typeof src,
      srcPreview: src == null ? 'null' : String(src).slice(0, 80),
      hasVideoEl: !!videoRef.current,
    });
    const video = videoRef.current;
    if (!video) {
      logger.warn('[WebVideoPlayer] effect run but videoRef.current is null');
      return;
    }

    // Set initial state
    video.loop = loop;
    video.muted = isMuted;
    video.playsInline = playsInline;

    // Event handlers
    const handlePlay = () => {
      setIsPlaying(true);
      onPlay?.();
    };

    const handlePause = () => {
      setIsPlaying(false);
      onPause?.();
    };

    const handleEnded = () => {
      setIsPlaying(false);
      onEnd?.();
    };

    const handleError = (e) => {
      logger.error('[WebVideoPlayer] video error', {
        message: e?.message,
        type: e?.type,
        target: e?.target?.error?.message,
        code: e?.target?.error?.code,
        src: video?.src?.slice?.(0, 80),
      });
      onError?.(e);
    };

    const handleLoadedMetadata = () => {
      const durationMs = video.duration && Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0;
      logger.debug('[WebVideoPlayer] loadedmetadata', { durationMs, durationSec: video.duration, src: video?.src?.slice?.(0, 80) });
      if (typeof onLoad === 'function' && durationMs > 0) {
        onLoad(durationMs);
      }
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    if (typeof videoRefCallback === 'function') {
      logger.debug('[WebVideoPlayer] calling videoRefCallback with video element');
      videoRefCallback(video);
    }

    // Auto-play if requested
    if (autoplay) {
      video.play().catch((error) => {
        logger.warn('Autoplay prevented:', error);
      });
    }

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      if (typeof videoRefCallback === 'function') {
        videoRefCallback(null);
      }
    };
  }, [src, loop, isMuted, autoplay, onPlay, onPause, onEnd, onLoad, onError, playsInline, videoRefCallback]);

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play().catch((error) => {
        logger.error('Error playing video:', error);
      });
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVideoClick = (e) => {
    // Don't toggle if clicking controls
    if (e.target.closest('.video-controls')) {
      return;
    }
    togglePlayPause();
  };

  const srcForVideo = src == null || src === '' ? undefined : (typeof src === 'string' ? src : String(src));
  if (src != null && src !== '' && typeof src !== 'string') {
    logger.warn('[WebVideoPlayer] src is not string', { type: typeof src, value: src });
  }
  return (
    <div
      className={`web-video-player ${className}`}
      style={style}
      onClick={handleVideoClick}
    >
      <video
        ref={videoRef}
        src={srcForVideo}
        className="web-video-element"
        playsInline={playsInline}
        preload="metadata"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover'
        }}
      />

      {/* Custom Controls Overlay */}
      {showControls && (
        <div className="video-controls-overlay">
          <div className="video-controls">
            <button
              className="control-button play-pause-button"
              onClick={togglePlayPause}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            <button
              className="control-button mute-button"
              onClick={toggleMute}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebVideoPlayer;


