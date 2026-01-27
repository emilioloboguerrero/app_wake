// Fixed heights + frozen bottom inset (same approach as WakeHeader for top) so bar never pops.
const TAB_BAR_CONTENT_HEIGHT = 62;
const TAB_BAR_TOP_PAD = 12;

import React from 'react';
import { View, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { useLocation, useNavigate } from 'react-router-dom';
import { User02 as SvgUser02, House02 as SvgHouse02 } from './icons';
import useFrozenBottomInset from '../hooks/useFrozenBottomInset.web';

const BottomTabBar = () => {
  const { width: screenWidth } = useWindowDimensions();
  const location = useLocation();
  const navigate = useNavigate();
  const paddingBottom = useFrozenBottomInset();

  const iconSize = Math.min((screenWidth || 390) * 0.06, 28);

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

  const show = shouldShowTabBar();
  
  if (!show) {
    return null;
  }

  const fixedWrapperStyle = {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingBottom,
  };

  return (
    <div className="wake-tab-bar-root" style={fixedWrapperStyle}>
      <View style={[styles.tabBar, { height: TAB_BAR_CONTENT_HEIGHT + TAB_BAR_TOP_PAD, paddingTop: TAB_BAR_TOP_PAD, paddingBottom: 0 }]}>
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

