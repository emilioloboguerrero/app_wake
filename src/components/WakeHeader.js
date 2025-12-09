import React from 'react';
import { View, Image, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SvgChevronLeft from './icons/vectors_fig/Arrow/ChevronLeft';
// Fixed header container that stays above ScrollView
export const FixedWakeHeader = ({ 
  showBackButton = false,
  onBackPress = null,
  profileImageUrl = null,
  onProfilePress = null,
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
      backgroundColor
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
      
      {/* Back Button - absolute positioned like three-dot menu */}
      {showBackButton && onBackPress && (
        <TouchableOpacity 
          style={[styles.backButton, { 
            top: Math.max(19, screenHeight * 0.021) + Math.max(0, insets.top - 20),  // Add padding offset
            left: Math.max(32, screenWidth * 0.08)    // More separated: increased from 24 to 32, and 0.06 to 0.08
          }]}
          onPress={onBackPress}
          activeOpacity={0.7}
        >
          <SvgChevronLeft width={iconSize} height={iconSize} stroke="#ffffff" />
        </TouchableOpacity>
      )}
    </View>
  );
};

// Header spacer component to push content down when using fixed header
export const WakeHeaderSpacer = () => {
  const insets = useSafeAreaInsets();
  
  // Minimal spacer - just enough to account for safe area
  const minimalSpacer = insets.top;
  
  return <View style={{ height: minimalSpacer }} />;
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
    padding: 8,
    zIndex: 1001,
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
