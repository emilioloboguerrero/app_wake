// Web version of BottomSpacer - same "freeze on first read" approach as WakeHeaderSpacer
// so bottom never pops when safe area resolves late.
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TAB_BAR_CONTENT_HEIGHT = 62;
const TOP_PAD = 12;

const BottomSpacer = () => {
  const insets = useSafeAreaInsets();
  const ref = React.useRef(null);
  if (ref.current === null) {
    ref.current = TAB_BAR_CONTENT_HEIGHT + TOP_PAD + Math.max(0, insets.bottom ?? 0);
  }
  const totalHeight = ref.current;
  return (
    <div
      style={{
        width: '100%',
        height: totalHeight,
        flexShrink: 0,
        boxSizing: 'border-box',
      }}
    />
  );
};

export default BottomSpacer;

