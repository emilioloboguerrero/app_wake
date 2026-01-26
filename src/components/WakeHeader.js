import React from 'react';
import { View, Image, StyleSheet, TouchableOpacity, Text, useWindowDimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SvgChevronLeft from './icons/vectors_fig/Arrow/ChevronLeft';
import logger from '../utils/logger';
// Fixed header container that stays above ScrollView
export const FixedWakeHeader = ({ 
  showBackButton = false,
  onBackPress = null,
  profileImageUrl = null,
  onProfilePress = null,
  showResetButton = false,
  onResetPress = null,
  resetButtonText = 'Resetear',
  showMenuButton = false,
  onMenuPress = null,
  menuButton = null,
  backgroundColor = '#1a1a1a'
}) => {
  const componentStartTime = performance.now();
  logger.debug(`[CHILD] [CHECKPOINT] FixedWakeHeader render started - ${componentStartTime.toFixed(2)}ms`);
  
  const insetsStartTime = performance.now();
  const insets = useSafeAreaInsets();
  const insetsDuration = performance.now() - insetsStartTime;
  if (insetsDuration > 10) {
    logger.warn(`[CHILD] ⚠️ SLOW: useSafeAreaInsets took ${insetsDuration.toFixed(2)}ms`);
  }
  
  // Use hook for reactive dimensions that update on orientation change
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  
  // Same as first commit: web = 0 top, native = insets.top - 8 (capped 0) for consistent UI
  const safeAreaTop = Platform.OS === 'web' ? 0 : Math.max(0, insets.top - 8);
  const headerHeight = Platform.OS === 'web'
    ? 32
    : Math.max(40, Math.min(44, screenHeight * 0.055));
  const logoWidth = Math.min(screenWidth * 0.35, Platform.OS === 'web' ? 100 : 120);
  const logoHeight = logoWidth * 0.57; // Maintain aspect ratio
  const buttonSize = Math.min(headerHeight * 0.6, 44); // 60% of header height, max 44
  const iconSize = 20; // Fixed size for back arrow to match three-dot menu
  
  const shouldShowProfileButton = profileImageUrl !== null || onProfilePress;

  return (
    <View style={[styles.fixedHeaderContainer, { 
      position: Platform.OS === 'web' ? 'fixed' : 'absolute',
      top: 0,
      height: headerHeight + safeAreaTop,
      paddingTop: safeAreaTop,
      paddingHorizontal: screenWidth * 0.06, // 6% of screen width
      backgroundColor,
      pointerEvents: 'box-none' // Allow touches to pass through to content below
    }]}>
      {shouldShowProfileButton && (
        <TouchableOpacity
          style={[
            styles.profileButton,
            {
              top: safeAreaTop + (Platform.OS === 'web' ? 6 : Math.max(8, screenHeight * 0.012)),
              right: Math.max(32, screenWidth * 0.08)
            }
          ]}
          onPress={onProfilePress}
          disabled={!onProfilePress}
          activeOpacity={0.7}
        >
          {profileImageUrl ? (
            <Image
              source={{ uri: profileImageUrl }}
              style={styles.profileImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.profilePlaceholder} />
          )}
        </TouchableOpacity>
      )}

      {/* Logo - centered */}
      <Image 
        source={require('../../assets/wake-logo-new.png')} 
        style={{ width: logoWidth, height: logoHeight }}
        resizeMode="contain"
      />
      
      {/* Menu Button - aligned with logo center inside header, on the left */}
      {showMenuButton && (onMenuPress || menuButton) && (
        <TouchableOpacity 
          style={[styles.backButton, { 
            // Logo is centered in headerHeight area using flexbox (alignItems: 'center')
            // Logo center is at: paddingTop + headerHeight / 2
            // Position menu button to align with logo center
            top: safeAreaTop + headerHeight / 2 - iconSize / 2,
            left: Math.max(32, screenWidth * 0.08)
          }]}
          onPress={onMenuPress}
          activeOpacity={0.7}
        >
          {menuButton || (
            <View style={styles.threeDotsContainer}>
              <View style={styles.threeDots}>
                <View style={styles.dot} />
                <View style={styles.dot} />
                <View style={styles.dot} />
              </View>
            </View>
          )}
        </TouchableOpacity>
      )}
      
      {/* Back Button - aligned with logo center inside header */}
      {showBackButton && onBackPress && (
        <TouchableOpacity 
          style={[styles.backButton, { 
            top: safeAreaTop + headerHeight / 2 - iconSize / 2,
            left: Math.max(32, screenWidth * 0.08)
          }]}
          onPress={onBackPress}
          activeOpacity={0.7}
        >
          <SvgChevronLeft width={iconSize} height={iconSize} stroke="#ffffff" />
        </TouchableOpacity>
      )}
      
      {/* Reset Button - aligned with logo center inside header, on the right */}
      {showResetButton && onResetPress && (
        <TouchableOpacity 
          style={[styles.resetButton, { 
            // Position reset button to align with logo center, on the right side
            // Logo center is at: paddingTop + headerHeight / 2
            // Button center should align: top + buttonHeight/2 = paddingTop + headerHeight / 2
            top: safeAreaTop + headerHeight / 2,
            right: Math.max(32, screenWidth * 0.08),
            transform: [{ translateY: -16 }] // Half of button height (padding 8*2 + text ~16 = ~32, so -16)
          }]}
          onPress={onResetPress}
          activeOpacity={0.7}
        >
          <Text style={styles.resetButtonText}>{resetButtonText}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
  
  const componentEndTime = performance.now();
  const componentDuration = componentEndTime - componentStartTime;
  logger.debug(`[CHILD] [CHECKPOINT] FixedWakeHeader render completed - ${componentEndTime.toFixed(2)}ms (took ${componentDuration.toFixed(2)}ms)`);
  if (componentDuration > 50) {
    logger.warn(`[CHILD] ⚠️ SLOW: FixedWakeHeader render took ${componentDuration.toFixed(2)}ms (threshold: 50ms)`);
  }
};

// Header spacer component to push content down when using fixed header
export const WakeHeaderSpacer = () => {
  const componentStartTime = performance.now();
  logger.debug(`[CHILD] [CHECKPOINT] WakeHeaderSpacer render started - ${componentStartTime.toFixed(2)}ms`);
  
  const insets = useSafeAreaInsets();
  // Use hook for reactive dimensions that update on orientation change
  const { height: screenHeight } = useWindowDimensions();
  
  // Match FixedWakeHeader (first commit: web 0, native insets.top - 8)
  const safeAreaTop = Platform.OS === 'web' ? 0 : Math.max(0, insets.top - 8);
  const headerHeight = Platform.OS === 'web' ? 32 : Math.max(40, Math.min(44, screenHeight * 0.055));
  const totalHeight = headerHeight + safeAreaTop;
  
  const componentEndTime = performance.now();
  const componentDuration = componentEndTime - componentStartTime;
  logger.debug(`[CHILD] [CHECKPOINT] WakeHeaderSpacer render completed - ${componentEndTime.toFixed(2)}ms (took ${componentDuration.toFixed(2)}ms)`);
  if (componentDuration > 10) {
    logger.warn(`[CHILD] ⚠️ SLOW: WakeHeaderSpacer render took ${componentDuration.toFixed(2)}ms (threshold: 10ms)`);
  }
  
  return <View style={{ height: totalHeight }} />;
};

// Single place to control space between header (spacer) and content. Use this to wrap content below WakeHeaderSpacer.
const GAP_AFTER_HEADER = -20;

export const WakeHeaderContent = ({ style, gapAfterHeader = GAP_AFTER_HEADER, ...rest }) => (
  <View style={[{ paddingTop: gapAfterHeader }, style]} {...rest} />
);

const styles = StyleSheet.create({
  fixedHeaderContainer: {
    position: 'absolute', // overridden to 'fixed' on web via inline style so header stays put on scroll
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  backButton: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    width: 40, // Fixed width for consistent alignment
    height: 40, // Fixed height for consistent alignment
    zIndex: 1001,
  },
  resetButton: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 68, 68, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 68, 68, 0.4)',
    zIndex: 1001,
  },
  resetButtonText: {
    color: '#ff4444',
    fontSize: 14,
    fontWeight: '600',
  },
  profileButton: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileImage: {
    width: '100%',
    height: '100%',
  },
  profilePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#3a3a3a',
  },
  threeDotsContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  threeDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ffffff',
  },
});

// Export the main header component
export default FixedWakeHeader;
