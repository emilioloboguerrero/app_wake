/**
 * Returns the size of the `.app-viewport` element — the actual container the
 * app renders into — instead of the window. On desktop the viewport is clamped
 * to a 430px phone column (see global.css), so window dimensions don't reflect
 * the real content width. Subscribes via ResizeObserver so the value stays in
 * sync when the user resizes the browser, opens dev tools, or rotates a device.
 *
 * Falls back to useWindowDimensions on the first render before the effect runs,
 * or on routes that render outside `.app-viewport` (e.g. /login).
 */
import { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';

const VIEWPORT_SELECTOR = '.app-viewport';

export default function useAppViewportSize() {
  const win = useWindowDimensions();
  const [size, setSize] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    const el = document.querySelector(VIEWPORT_SELECTOR);
    if (!el) return undefined;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize({ width: rect.width, height: rect.height });
      }
    };
    measure();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return size ?? { width: win.width, height: win.height };
}
