import { isPWA } from '../utils/platform';

/**
 * Returns the bottom inset used for tab bar, spacer, and content padding.
 * Extra padding so the bar and content sit higher from the viewport bottom.
 * Only applied in PWA; regular web gets 0.
 */
const BOTTOM_PADDING = 24;

export default function useFrozenBottomInset() {
  return isPWA() ? BOTTOM_PADDING : 0;
}
