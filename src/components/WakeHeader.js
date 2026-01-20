import React from 'react';
import { View, Image, StyleSheet, Dimensions, TouchableOpacity, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SvgChevronLeft from './icons/vectors_fig/Arrow/ChevronLeft';
// Fixed header container that stays above ScrollView
export const FixedWakeHeader = ({ 
  showBackButton = false,
  onBackPress = null,
  profileImageUrl = null,
  onProfilePress = null,
  showResetButton = false,
  onResetPress = null,
  resetButtonText = 'Resetear',
  backgroundColor = '#1a1a1a'
}) => {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = Dimensions.get('window');
  
  // Responsive dimensions
  const headerHeight = Math.max(60, screenHeight * 0.08); // 8% of screen height, min 60
  const logoWidth = Math.min(screenWidth * 0.35, 120); // 35% of screen width, max 140 (increased from 18% and 80)
  const logoHeight = logoWidth * 0.57; // Maintain aspect ratio
  const buttonSize = Math.min(headerHeight * 0.6, 44); // 60% of header height, max 44
  const iconSize = 20; // Fixed size for back arrow to match three-dot menu
  
  const shouldShowProfileButton = profileImageUrl !== null || onProfilePress;

  return (
    <View style={[styles.fixedHeaderContainer, { 
      top: 0, // Start from screen top
      height: headerHeight + Math.max(0, insets.top - 20), // Extend to cover gap
      paddingTop: Math.max(0, insets.top - 20), // Push content to original position
      paddingHorizontal: screenWidth * 0.06, // 6% of screen width
      backgroundColor,
      pointerEvents: 'box-none' // Allow touches to pass through to content below
    }]}>
      {shouldShowProfileButton && (
        <TouchableOpacity
          style={[
            styles.profileButton,
            {
              top: Math.max(19, screenHeight * 0.021) + Math.max(0, insets.top - 20),
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
      
      {/* Back Button - aligned with logo center inside header */}
      {showBackButton && onBackPress && (
        <TouchableOpacity 
          style={[styles.backButton, { 
            // Logo is centered in headerHeight area using flexbox (alignItems: 'center')
            // Logo center is at: paddingTop + headerHeight / 2
            // Position back button to align with logo center
            top: Math.max(0, insets.top - 20) + headerHeight / 2 - iconSize / 2, // Center icon with logo, no padding offset needed
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
            top: Math.max(0, insets.top - 20) + headerHeight / 2,
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
};

// Header spacer component to push content down when using fixed header
export const WakeHeaderSpacer = () => {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = Dimensions.get('window');
  
  // Account for full header height plus safe area
  const headerHeight = Math.max(60, screenHeight * 0.08); // 8% of screen height, min 60
  const safeAreaTop = Math.max(0, insets.top - 20);
  const totalHeight = headerHeight + safeAreaTop;
  
  return <View style={{ height: totalHeight }} />;
};



const { width: screenWidth } = Dimensions.get('window');

const styles = StyleSheet.create({
  fixedHeaderContainer: {
    position: 'absolute',
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
});

// Export the main header component
export default FixedWakeHeader;
