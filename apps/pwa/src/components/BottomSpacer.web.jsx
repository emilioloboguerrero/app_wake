// Web version of BottomSpacer - matches BottomTabBar height (TAB_BAR_CONTENT_HEIGHT + TOP_PAD)
// plus useFrozenBottomInset so content clears the fixed bar and its bottom padding.
import React from 'react';
import useFrozenBottomInset from '../hooks/useFrozenBottomInset.web';

const TAB_BAR_CONTENT_HEIGHT = 62;
const TOP_PAD = 12;

const BottomSpacer = () => {
  const frozenBottom = useFrozenBottomInset();
  const totalHeight = TAB_BAR_CONTENT_HEIGHT + TOP_PAD + frozenBottom;
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

