// Web version of Bottom Navigation Menu
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';


// SVG Icons for web
const HouseIcon = ({ size = 24, stroke = '#ffffff', fill = 'none', strokeWidth = 2.5, opacity = 1 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} xmlns="http://www.w3.org/2000/svg" style={{ opacity }}>
    <path
      d="M4 11.452V16.8c0 1.12 0 1.68.218 2.109.192.376.497.682.874.873.427.218.987.218 2.105.218h9.606c1.118 0 1.677 0 2.104-.218a2 2 0 0 0 .875-.873c.218-.428.218-.987.218-2.105v-5.352c0-.534 0-.801-.065-1.05a2 2 0 0 0-.28-.617c-.145-.213-.345-.39-.748-.741l-4.8-4.2c-.746-.653-1.12-.98-1.54-1.104-.37-.11-.764-.11-1.135 0-.42.124-.792.45-1.538 1.102L5.093 9.044c-.402.352-.603.528-.747.74a2 2 0 0 0-.281.618C4 10.65 4 10.918 4 11.452"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill={fill}
    />
  </svg>
);

const UserIcon = ({ size = 24, stroke = '#ffffff', fill = 'none', strokeWidth = 2.5, opacity = 1 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} xmlns="http://www.w3.org/2000/svg" style={{ opacity }}>
    <path
      d="M20 21c0-2.761-3.582-5-8-5s-8 2.239-8 5m8-8a5 5 0 1 1 0-10 5 5 0 0 1 0 10"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill={fill}
    />
  </svg>
);

const BottomNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 667;
  const tabBarHeight = Math.max(60, screenHeight * 0.1);
  const iconSize = 24;
  
  const isMainActive = location.pathname === '/' || location.pathname.startsWith('/course');
  const isProfileActive = location.pathname === '/profile';
  
  // Determine if tab bar should be visible
  const shouldShowTabBar = !location.pathname.startsWith('/login') && 
                          !location.pathname.startsWith('/onboarding');

  if (!shouldShowTabBar) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: tabBarHeight,
      backgroundColor: 'transparent',
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      paddingBottom: 0,
    }}>
      {/* Main Tab */}
      <button
        onClick={() => navigate('/')}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          height: '100%',
        }}
      >
        <HouseIcon
          size={iconSize}
          stroke="#ffffff"
          fill={isMainActive ? '#ffffff' : 'none'}
          strokeWidth={isMainActive ? 2.8 : 2.5}
          opacity={isMainActive ? 1 : 0.6}
        />
      </button>

      {/* Profile Tab */}
      <button
        onClick={() => navigate('/profile')}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          height: '100%',
        }}
      >
        <UserIcon
          size={iconSize}
          stroke="#ffffff"
          fill={isProfileActive ? '#ffffff' : 'none'}
          strokeWidth={isProfileActive ? 2.8 : 2.5}
          opacity={isProfileActive ? 1 : 0.6}
        />
      </button>
    </div>
  );
};

export default BottomNavigation;

