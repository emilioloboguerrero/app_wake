// Web version of FixedWakeHeader component
import React from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import logger from '../utils/logger';
import { isPWA } from '../utils/platform';

// Push header bar down on non-iPhone (Mac/Android) where safe area is 0.
const HEADER_TOP_OFFSET_NON_IOS = 24;
// When env(safe-area-inset-top) is 0 in standalone (e.g. iOS localhost PWA), use this so layout matches production (iPhone 17 / Dynamic Island ~59px).
const STANDALONE_SAFE_AREA_TOP_FALLBACK = 59;

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
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const headerHeight = 32;
  const initialSafeTopRef = React.useRef(null);
  // Header: use raw insets only (no fallback). Safe-area fallback is applied to content via WakeHeaderSpacer only.
  if (initialSafeTopRef.current === null) {
    initialSafeTopRef.current = Math.max(0, insets.top);
  }
  const safeAreaTop = initialSafeTopRef.current;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent || '');
  const extraTop = isIOS ? 0 : HEADER_TOP_OFFSET_NON_IOS;
  const totalTop = safeAreaTop + extraTop;
  const logoWidth = Math.min(screenWidth * 0.35, 120);
  const logoHeight = logoWidth * 0.57;
  const iconSize = 20;
  const barCenterTop = totalTop + headerHeight / 2;
  
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
        navigate(-1);
      }
    } else {
      navigate(-1);
    }
  };

  const headerEl = (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      minHeight: headerHeight + totalTop,
      height: headerHeight + totalTop,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: totalTop,
      paddingLeft: screenWidth * 0.06,
      paddingRight: screenWidth * 0.06,
      paddingBottom: 0,
      backgroundColor: backgroundColor,
      zIndex: 1000,
      boxSizing: 'border-box',
    }}>
      {shouldShowProfileButton && (
        <button
          onClick={handleProfilePress}
          style={{
            position: 'absolute',
            top: barCenterTop,
            right: Math.max(32, screenWidth * 0.08),
            transform: 'translateY(-50%)',
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

      {/* Logo - same path as loading screen (/app/assets/...) so one canonical location */}
      <img 
        src={typeof window !== 'undefined' && window.location.pathname.startsWith('/app') ? '/app/assets/wake-logo-new.png' : '/assets/wake-logo-new.png'}
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
            top: barCenterTop,
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
            top: barCenterTop,
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
            top: barCenterTop,
            right: Math.max(32, screenWidth * 0.08),
            transform: 'translateY(-50%)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '8px 16px',
            backgroundColor: 'rgba(255, 68, 68, 0.2)',
            border: '1px solid rgba(255, 68, 68, 0.4)',
            borderRadius: 8,
            cursor: 'pointer',
            zIndex: 1001,
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
  return (typeof document !== 'undefined' && document.body)
    ? createPortal(headerEl, document.body)
    : headerEl;
};

// Extra top space for content area when not iPhone (Mac/Android) so content doesn't sit right under the header.
const CONTENT_TOP_PADDING_NON_IOS = 100;

// Header spacer: matches FixedWakeHeader (32px + safe area top). On non-iOS adds extra height so content has top padding. Does not include HEADER_TOP_OFFSET_NON_IOS so content stays in place when only the bar is pushed down.
export const WakeHeaderSpacer = () => {
  const insets = useSafeAreaInsets();
  const ref = React.useRef(null);
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent || '');
  const rawTop = Math.max(0, insets.top);
  const isStandalone =
    (typeof navigator !== 'undefined' && navigator.standalone === true) || isPWA();
  const effectiveTop =
    rawTop === 0 && isStandalone ? STANDALONE_SAFE_AREA_TOP_FALLBACK : rawTop;
  if (ref.current === null) {
    const headerHeight = 32 + effectiveTop;
    const extra = isIOS ? 0 : CONTENT_TOP_PADDING_NON_IOS;
    ref.current = headerHeight + extra;
  }
  const totalHeight = ref.current;
  return <div style={{ height: totalHeight, flexShrink: 0, boxSizing: 'border-box' }} />;
};

// Single place to control space between header (spacer) and content. Use this to wrap content below WakeHeaderSpacer.
// Use marginTop (not paddingTop): CSS does not support negative padding, so negative values have no effect on web.
export const GAP_AFTER_HEADER = -20;
// Tighter gap in PWA to reduce space between header and content (more negative = content pulled up).
export const GAP_AFTER_HEADER_PWA = -32;

/** Use this when you need the effective gap (PWA-aware on web, GAP_AFTER_HEADER on native). */
export const getGapAfterHeader = () => (isPWA() ? GAP_AFTER_HEADER_PWA : GAP_AFTER_HEADER);

export const WakeHeaderContent = ({ style, gapAfterHeader, ...rest }) => {
  const effectiveGap = gapAfterHeader ?? getGapAfterHeader();
  return <View style={[{ marginTop: effectiveGap }, style]} {...rest} />;
};

export default FixedWakeHeader;

