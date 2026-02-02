/**
 * Returns a layout height for bottom bar/spacer that never shrinks after first
 * paint. Uses the max of useWindowDimensions().height and window.innerHeight,
 * then keeps the largest value ever seen so the bottom never "collapses" when
 * the browser reports a smaller viewport after scroll.
 */
import { useRef } from 'react';
import { useWindowDimensions } from 'react-native';

export default function useStableLayoutHeight() {
  const { height: viewportHeight } = useWindowDimensions();
  const innerHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
  const current = Math.max(viewportHeight || 0, innerHeight, 1);
  const maxRef = useRef(current);
  if (current > maxRef.current) {
    maxRef.current = current;
  }
  return maxRef.current;
}
