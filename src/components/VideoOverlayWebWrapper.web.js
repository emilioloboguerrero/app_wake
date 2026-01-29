/**
 * Web-only: wraps overlay content in a real DOM div with data-video-overlay
 * so global CSS [data-video-card] [data-video-overlay] applies (translateZ(0), z-index).
 * No flex/centering here - child View controls position (pause center, volume/restart top-right).
 * Constrain to 100% so overlay never extends beyond the card (Safari).
 */
import React from 'react';

const wrapperStyle = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  width: '100%',
  height: '100%',
  maxWidth: '100%',
  maxHeight: '100%',
  overflow: 'hidden',
  boxSizing: 'border-box',
};

export default function VideoOverlayWebWrapper({ children, pointerEvents }) {
  return React.createElement('div', {
    'data-video-overlay': 'true',
    style: { ...wrapperStyle, pointerEvents: pointerEvents ?? 'auto' },
  }, children);
}
