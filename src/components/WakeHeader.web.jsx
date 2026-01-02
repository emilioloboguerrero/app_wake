// Web version of FixedWakeHeader component
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// Simple SVG icons for web
const ChevronLeftIcon = ({ size = 20, color = '#ffffff' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="m15 19-7-7 7-7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const FixedWakeHeader = ({ 
  showBackButton = false,
  onBackPress = null,
  profileImageUrl = null,
  onProfilePress = null,
  backgroundColor = '#1a1a1a'
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Responsive dimensions
  const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 375;
  const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 667;
  const headerHeight = Math.max(60, screenHeight * 0.08);
  const logoWidth = Math.min(screenWidth * 0.35, 120);
  const logoHeight = logoWidth * 0.57;
  const iconSize = 20;
  
  const shouldShowProfileButton = profileImageUrl !== null || onProfilePress;
  
  const handleProfilePress = () => {
    if (onProfilePress) {
      onProfilePress();
    } else {
      navigate('/profile');
    }
  };
  
  const handleBackPress = () => {
    if (onBackPress) {
      onBackPress();
    } else {
      navigate(-1);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      height: headerHeight,
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingLeft: screenWidth * 0.06,
      paddingRight: screenWidth * 0.06,
      backgroundColor: backgroundColor,
      zIndex: 1000,
    }}>
      {shouldShowProfileButton && (
        <button
          onClick={handleProfilePress}
          style={{
            position: 'absolute',
            top: Math.max(19, screenHeight * 0.021),
            right: Math.max(32, screenWidth * 0.08),
            width: 44,
            height: 44,
            borderRadius: 22,
            overflow: 'hidden',
            backgroundColor: '#2A2A2A',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {profileImageUrl ? (
            <img
              src={profileImageUrl}
              alt="Profile"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }}
            />
          ) : (
            <div style={{
              width: '100%',
              height: '100%',
              backgroundColor: '#3a3a3a'
            }} />
          )}
        </button>
      )}

      {/* Logo - centered */}
      <img 
        src="/wake-logo-new.png"
        alt="WAKE"
        style={{
          width: logoWidth,
          height: logoHeight,
          objectFit: 'contain'
        }}
      />
      
      {/* Back Button */}
      {showBackButton && (
        <button
          onClick={handleBackPress}
          style={{
            position: 'absolute',
            top: Math.max(19, screenHeight * 0.021),
            left: Math.max(32, screenWidth * 0.08),
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 8,
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            zIndex: 1001,
          }}
        >
          <ChevronLeftIcon size={iconSize} color="#ffffff" />
        </button>
      )}
    </div>
  );
};

// Header spacer component
export const WakeHeaderSpacer = () => {
  return <div style={{ height: 0 }} />; // No safe area on web
};

export default FixedWakeHeader;

