/**
 * Web-only: wraps video card content in a real DOM div with data-video-card
 * so global CSS [data-video-card] video and [data-video-card] [data-video-overlay]
 * reliably apply. Use position:relative + 100% size so we stay exactly within
 * the card (Safari was sizing absolute wrapper to a taller containing block).
 */
import React from 'react';

const wrapperStyle = {
  position: 'relative',
  width: '100%',
  height: '100%',
  minWidth: 0,
  minHeight: 0,
  maxWidth: '100%',
  maxHeight: '100%',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  isolation: 'isolate',
  zIndex: 0,
  boxSizing: 'border-box',
};

export default function VideoCardWebWrapper({ children }) {
  return React.createElement('div', {
    'data-video-card': 'true',
    style: wrapperStyle,
  }, children);
}
