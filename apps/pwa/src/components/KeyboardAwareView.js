import React, { useRef, useEffect } from 'react';
import { TouchableWithoutFeedback, Keyboard, StyleSheet } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

/**
 * Centralized keyboard handling component
 * 
 * Features:
 * - Automatically scrolls focused input above keyboard
 * - Dismisses keyboard when tapping outside inputs
 * - Optimized for performance with native scroll
 * - Works on both iOS and Android
 * 
 * Usage:
 * <KeyboardAwareView>
 *   <YourContent />
 * </KeyboardAwareView>
 */
const KeyboardAwareView = ({ 
  children, 
  extraScrollHeight = 20,
  enableOnAndroid = true,
  keyboardShouldPersistTaps = "handled",
  showsVerticalScrollIndicator = false,
  contentContainerStyle,
  ...props 
}) => {
  const scrollViewRef = useRef(null);

  useEffect(() => {
    const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
      // Reset scroll position when keyboard is dismissed
      if (scrollViewRef.current) {
        setTimeout(() => {
          scrollViewRef.current?.scrollToPosition(0, 0, true);
        }, 100);
      }
    });

    return () => {
      keyboardDidHideListener?.remove();
    };
  }, []);

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAwareScrollView
        ref={scrollViewRef}
        style={styles.container}
        contentContainerStyle={[styles.contentContainer, contentContainerStyle]}
        enableOnAndroid={enableOnAndroid}
        extraScrollHeight={extraScrollHeight}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        enableResetScrollToCoords={true}
        {...props}
      >
        {children}
      </KeyboardAwareScrollView>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
  },
});

export default KeyboardAwareView;

