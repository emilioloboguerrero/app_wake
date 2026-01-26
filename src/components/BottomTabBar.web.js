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
  
  // Use stable defaults so first paint matches later (avoids tab bar "pop" when insets/dimensions resolve)
  const tabBarHeight = Math.max(50, Math.min(72, (screenHeight || 600) * 0.08));
  const iconSize = Math.min((screenWidth || 390) * 0.06, 28);
  const bottomPadding = insets.bottom ?? 0;

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

  const fixedWrapperStyle = {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  };

  return (
    <div className="wake-tab-bar-root" style={fixedWrapperStyle}>
      <View style={[styles.tabBar, { height: tabBarHeight + 12, paddingTop: 12, paddingBottom: 0 }]}>
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
    </div>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    width: '100%',
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

