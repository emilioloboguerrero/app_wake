import React from 'react';
import { View, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { User02 as SvgUser02, House02 as SvgHouse02 } from './icons';

const BottomTabBar = () => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const location = useLocation();
  const navigate = useNavigate();
  const insets = useSafeAreaInsets();
  
  // Responsive tab bar dimensions - fixed above viewport bottom
  const tabBarHeight = Math.max(50, Math.min(72, screenHeight * 0.08)); // 8% of height, clamp 50–72
  const iconSize = Math.min(screenWidth * 0.06, 28);
  const bottomPadding = insets.bottom; // Respect safe area (e.g. notched devices)
  const bottomOffset = 24; // Bar sits this many px above the viewport bottom
  
  // Determine if tab bar should be visible based on current route
  const shouldShowTabBar = () => {
    const path = location.pathname;
    
    // Hide tab bar for sub-screens (matching MainTabNavigator logic)
    // Only show on main home (/) and profile (/profile) routes
    const showTabBarRoutes = ['/', '/profile'];
    
    return showTabBarRoutes.includes(path);
  };
  
  // Determine which tab is active
  const isMainActive = location.pathname === '/';
  const isProfileActive = location.pathname === '/profile';
  
  // Icon styling based on focus state
  const getIconProps = (isActive) => {
    return {
      width: iconSize,
      height: iconSize,
      stroke: '#ffffff',
      fill: isActive ? '#ffffff' : 'none',
      strokeWidth: isActive ? 2.8 : 2.5,
      style: { opacity: isActive ? 1 : 0.6 }
    };
  };
  
  if (!shouldShowTabBar()) {
    return null;
  }
  
  return (
    <View style={[styles.tabBar, { height: tabBarHeight + bottomPadding + 12, paddingTop: 12, paddingBottom: bottomPadding, bottom: bottomOffset }]}>
      <TouchableOpacity
        style={styles.tabButton}
        onPress={() => navigate('/')}
        activeOpacity={0.7}
      >
        <SvgHouse02 {...getIconProps(isMainActive)} />
      </TouchableOpacity>
      
      <TouchableOpacity
        style={styles.tabButton}
        onPress={() => navigate('/profile')}
        activeOpacity={0.7}
      >
        <SvgUser02 {...getIconProps(isProfileActive)} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    position: 'fixed',
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    zIndex: 1000,
    elevation: 0,
  },
  tabButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
  },
});

export default BottomTabBar;

