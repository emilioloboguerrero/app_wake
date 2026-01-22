// Web version of FixedWakeHeader component
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import logger from '../utils/logger';

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
  showResetButton = false,
  onResetPress = null,
  resetButtonText = 'Resetear',
  showMenuButton = false,
  onMenuPress = null,
  menuButton = null,
  backgroundColor = '#1a1a1a'
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Responsive dimensions - use state to handle window resize and ensure values are set on reload
  const [dimensions, setDimensions] = React.useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth > 0 && window.innerHeight > 0) {
      return {
        width: window.innerWidth,
        height: window.innerHeight
      };
    }
    return { width: 375, height: 667 };
  });

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const updateDimensions = () => {
      if (window.innerWidth > 0 && window.innerHeight > 0) {
        setDimensions({
          width: window.innerWidth,
          height: window.innerHeight
        });
      }
    };
    
    // Update immediately in case window wasn't ready on mount
    updateDimensions();
    
    // Also try after a short delay to catch cases where window isn't ready yet
    const timeoutId = setTimeout(updateDimensions, 100);
    
    window.addEventListener('resize', updateDimensions);
    
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updateDimensions);
    };
  }, []);
  
  const screenWidth = dimensions.width;
  const screenHeight = dimensions.height;
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
      try {
        onBackPress();
      } catch (error) {
        logger.error('[WakeHeader.web] Error in onBackPress callback:', error);
        // Fallback to browser navigation
        navigate(-1);
      }
    } else {
      navigate(-1);
    }
  };

  // Calculate safe area insets for web (usually 0, but account for it)
  const safeAreaTop = typeof window !== 'undefined' && window.visualViewport 
    ? Math.max(0, (window.innerHeight - window.visualViewport.height) / 2)
    : 0;
  const headerTotalHeight = headerHeight + safeAreaTop;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      height: headerTotalHeight,
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: safeAreaTop,
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
      
      {/* Menu Button - aligned with logo center, on the left */}
      {showMenuButton && (onMenuPress || menuButton) && (
        <button
          onClick={onMenuPress}
          style={{
            position: 'absolute',
            top: safeAreaTop + headerHeight / 2,
            left: Math.max(32, screenWidth * 0.08),
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            width: 40,
            height: 40,
            padding: 0,
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            zIndex: 1001,
            transform: 'translateY(-50%)',
          }}
        >
          {menuButton || (
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '4px',
            }}>
              <div style={{ width: '4px', height: '4px', borderRadius: '2px', backgroundColor: '#ffffff' }} />
              <div style={{ width: '4px', height: '4px', borderRadius: '2px', backgroundColor: '#ffffff' }} />
              <div style={{ width: '4px', height: '4px', borderRadius: '2px', backgroundColor: '#ffffff' }} />
            </div>
          )}
        </button>
      )}
      
      {/* Back Button - aligned with logo center */}
      {showBackButton && (onBackPress || navigate) && (
        <button
          onClick={handleBackPress}
          style={{
            position: 'absolute',
            top: safeAreaTop + headerHeight / 2,
            left: Math.max(32, screenWidth * 0.08),
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            width: 40,
            height: 40,
            padding: 0,
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            zIndex: 1001,
            transform: 'translateY(-50%)',
          }}
        >
          <ChevronLeftIcon size={iconSize} color="#ffffff" />
        </button>
      )}
      
      {/* Reset Button - aligned with logo center */}
      {showResetButton && onResetPress && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (onResetPress) {
              onResetPress();
            }
          }}
          style={{
            position: 'absolute',
            top: safeAreaTop + headerHeight / 2,
            right: Math.max(32, screenWidth * 0.08),
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '8px 16px',
            backgroundColor: 'rgba(255, 68, 68, 0.2)',
            border: '1px solid rgba(255, 68, 68, 0.4)',
            borderRadius: 8,
            cursor: 'pointer',
            zIndex: 1001,
            transform: 'translateY(-50%)',
          }}
        >
          <span style={{
            color: '#ff4444',
            fontSize: 14,
            fontWeight: '600',
          }}>{resetButtonText}</span>
        </button>
      )}
    </div>
  );
};

// Header spacer component
export const WakeHeaderSpacer = () => {
  // Responsive dimensions - use state to handle window resize
  const [dimensions, setDimensions] = React.useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth > 0 && window.innerHeight > 0) {
      return {
        width: window.innerWidth,
        height: window.innerHeight
      };
    }
    return { width: 375, height: 667 };
  });

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const updateDimensions = () => {
      if (window.innerWidth > 0 && window.innerHeight > 0) {
        setDimensions({
          width: window.innerWidth,
          height: window.innerHeight
        });
      }
    };
    
    updateDimensions();
    const timeoutId = setTimeout(updateDimensions, 100);
    window.addEventListener('resize', updateDimensions);
    
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updateDimensions);
    };
  }, []);
  
  const screenHeight = dimensions.height;
  const headerHeight = Math.max(60, screenHeight * 0.08);
  const safeAreaTop = typeof window !== 'undefined' && window.visualViewport 
    ? Math.max(0, (window.innerHeight - window.visualViewport.height) / 2)
    : 0;
  const totalHeight = headerHeight + safeAreaTop;
  
  return <div style={{ height: totalHeight }} />;
};

export default FixedWakeHeader;

