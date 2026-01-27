/**
 * Returns a bottom inset that is frozen on first read (like WakeHeader's safeAreaTop).
 * Prevents the bottom from jumping when insets update after mount.
 */
import { useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function useFrozenBottomInset() {
  const insets = useSafeAreaInsets();
  const ref = useRef(null);
  if (ref.current === null) {
    ref.current = Math.max(0, insets.bottom ?? 0);
  }
  return ref.current;
}
