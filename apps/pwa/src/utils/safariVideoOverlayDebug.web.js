/**
 * Safari video overlay debug utility (web only).
 * Run when ?safari_video_debug=1 or in __DEV__ on Safari to inspect why
 * video might paint over overlays. Logs to console and optionally shows
 * a small on-screen panel (useful on iPhone without remote debugging).
 */

import { isWeb } from './platform';

function isSafari() {
  if (!isWeb || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return (ua.includes('Safari') && !ua.includes('Chrome') && !ua.includes('Chromium')) || false;
}

function shouldRun() {
  if (!isWeb || typeof document === 'undefined') return false;
  const params = new URLSearchParams(window.location?.search || '');
  if (params.get('safari_video_debug') === '1') return true;
  return typeof __DEV__ !== 'undefined' && __DEV__ && isSafari();
}

function getComputedStyleSummary(el) {
  if (!el || !window.getComputedStyle) return null;
  const s = window.getComputedStyle(el);
  return {
    zIndex: s.zIndex,
    position: s.position,
    transform: s.transform,
    webkitTransform: s.webkitTransform,
    isolation: s.isolation,
    display: s.display,
  };
}

function runOnce() {
  if (!shouldRun()) return;
  const delay = 2500; // wait for video card to mount
  setTimeout(() => {
    const cards = document.querySelectorAll('[data-video-card]');
    const videos = document.querySelectorAll('[data-video-card] video');
    const overlays = document.querySelectorAll('[data-video-card] [data-video-overlay]');
    const anyOverlays = document.querySelectorAll('[data-video-overlay]');

    const videoStyle = videos.length ? getComputedStyleSummary(videos[0]) : null;
    const overlayStyle = overlays.length ? getComputedStyleSummary(overlays[0]) : null;

    const info = {
      '[data-video-card] count': cards.length,
      '[data-video-card] video count': videos.length,
      '[data-video-card] [data-video-overlay] count': overlays.length,
      '[data-video-overlay] anywhere count': anyOverlays.length,
      'first video computed': videoStyle,
      'first overlay computed': overlayStyle,
    };

    console.log('[Safari video overlay debug]', info);
    try {
      window.__SAFARI_VIDEO_DEBUG_INFO = info;
    } catch (_) {}
  }, delay);
}

/**
 * Call from a screen or App after mount to run debug once.
 * When ?safari_video_debug=1, also shows a small floating panel with the info.
 */
export function runSafariVideoOverlayDebug() {
  if (!shouldRun()) return;
  runOnce();
  if (new URLSearchParams(window.location?.search || '').get('safari_video_debug') === '1') {
    setTimeout(() => {
      const panel = document.createElement('div');
      panel.id = 'safari-video-debug-panel';
      panel.setAttribute('data-video-overlay', 'true');
      panel.style.cssText = [
        'position:fixed',
        'bottom:80px',
        'left:8px',
        'right:8px',
        'max-height:200px',
        'overflow:auto',
        'background:rgba(0,0,0,0.9)',
        'color:#0f0',
        'font:11px monospace',
        'padding:8px',
        'z-index:999999',
        'border:2px solid #0f0',
        'pointer-events:none',
        'user-select:none',
      ].join(';');
      panel.innerHTML = '<div>Refresh and open this screen with video paused. Then check console for "[Safari video overlay debug]".</div>';
      document.body.appendChild(panel);
      setTimeout(() => {
        const info = window.__SAFARI_VIDEO_DEBUG_INFO;
        if (info) {
          panel.innerHTML = '<pre style="margin:0;white-space:pre-wrap;word-break:break-all;">' + JSON.stringify(info, null, 2) + '</pre>';
        }
      }, 2800);
    }, 2600);
  }
}

export default runSafariVideoOverlayDebug;
