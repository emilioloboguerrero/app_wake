/**
 * Web-only patch: apply touch-action and overscroll containment so scroll works correctly
 * on PWA and overscroll does not move the page (header/bottom menu).
 *
 * - Vertical ScrollView → touch-action: pan-y, overscrollBehavior: contain
 * - Horizontal ScrollView / FlatList → touch-action: pan-x, overscrollBehavior: contain
 * - FlatList gets the same so screens that use FlatList as main scroll behave like MainScreen
 */
const RN = require('react-native');
const React = require('react');

const getScrollStyle = (horizontal) => ({
  touchAction: horizontal ? 'pan-x' : 'pan-y',
  overscrollBehavior: 'contain',
});

if (RN.Platform && RN.Platform.OS === 'web' && RN.ScrollView) {
  const OriginalScrollView = RN.ScrollView;
  const WrappedScrollView = React.forwardRef((props, ref) => {
    const { style, horizontal } = props;
    const scrollStyle = getScrollStyle(!!horizontal);
    return React.createElement(OriginalScrollView, {
      ...props,
      ref,
      style: style != null ? [style, scrollStyle] : scrollStyle,
    });
  });
  WrappedScrollView.displayName = 'ScrollView';
  RN.ScrollView = WrappedScrollView;
}

if (RN.Platform && RN.Platform.OS === 'web' && RN.FlatList) {
  const OriginalFlatList = RN.FlatList;
  const WrappedFlatList = React.forwardRef((props, ref) => {
    const { style, horizontal } = props;
    const scrollStyle = getScrollStyle(!!horizontal);
    const mergedStyle = style != null ? [style, scrollStyle] : scrollStyle;
    return React.createElement(OriginalFlatList, {
      ...props,
      ref,
      style: mergedStyle,
    });
  });
  WrappedFlatList.displayName = 'FlatList';
  RN.FlatList = WrappedFlatList;
}
