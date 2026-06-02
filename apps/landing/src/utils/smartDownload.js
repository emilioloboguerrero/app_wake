// Wake currently ships only as a PWA at wakelab.co/app. Native apps are not
// live, so every "Download" CTA points at the PWA. When App Store / Play Store
// listings exist, reintroduce platform detection here.

const WEB_APP_URL = '/app/';

export function detectPlatform() {
  if (typeof navigator === 'undefined') return 'web';
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'web';
}

export function getDownloadUrl() {
  return WEB_APP_URL;
}

export function getDownloadLabel() {
  return 'Abrir Wake';
}
