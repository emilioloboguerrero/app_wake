// Meta in-app browsers break OAuth popups (Google blocks embedded webviews),
// so funnel events carry this tag to segment drop-off by environment.
export function detectInAppBrowser() {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  if (/instagram/i.test(ua)) return 'instagram';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'facebook';
  return null;
}
