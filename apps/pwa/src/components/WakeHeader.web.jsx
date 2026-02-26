// Web version of FixedWakeHeader component
import React from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { View, Image, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useActivityStreakContext } from '../contexts/ActivityStreakContext';
import logger from '../utils/logger';
import { isPWA } from '../utils/platform';
import HeaderStreakInfoModal from './HeaderStreakInfoModal.web.jsx';

// Match DailyWorkoutScreen streak: base 60, middle 20, inner 8; offsets bottom 0, 6, 8. Header scale: base 32 (a bit larger).
const STREAK_BASE = 32;
const STREAK_MIDDLE = Math.round((20 / 60) * STREAK_BASE);  // ~11
const STREAK_INNER = Math.round((8 / 60) * STREAK_BASE);    // ~4
const STREAK_BOTTOM_MIDDLE = Math.round((6 / 60) * STREAK_BASE);  // ~3
const STREAK_BOTTOM_INNER = Math.round((8 / 60) * STREAK_BASE);   // ~4
const OPACITY_ACTIVE = 0.9;
const OPACITY_DEAD = 0.4;

const FIRE_PATH = 'M37.34,7.36a.12.12,0,0,1,.18.13c-.47,1.86-2.78,12.63,5.57,19.62,8.16,6.84,8.41,17.13,2.33,24-7.27,8.23-19.84,6.78-25.25,1.37C16.36,48.69,9.44,36.33,21.29,26a.1.1,0,0,1,.16,0c.29,1.23,2.3,9,7.66,10,.25,0,.37-.11.25-.34C27.78,32.6,20.66,17,37.34,7.36Z';

function StreakFlameSvg({ size, stroke, strokeWidth, fill, opacity, flipX }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity, transform: flipX ? 'scaleX(-1)' : undefined }}>
      <path d={FIRE_PATH} stroke={stroke} strokeWidth={strokeWidth} fill={fill} strokeLinecap="round" />
    </svg>
  );
}

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
  const [isStreakModalOpen, setIsStreakModalOpen] = React.useState(false);
  
  const shouldShowProfileButton = profileImageUrl !== null || onProfilePress;

  const { user: contextUser } = useAuth();
  const [fallbackUser, setFallbackUser] = React.useState(null);
  React.useEffect(() => {
    if (!contextUser && typeof require !== 'undefined') {
      import('../config/firebase').then(({ auth }) => {
        if (auth.currentUser) setFallbackUser(auth.currentUser);
      });
    } else {
      setFallbackUser(null);
    }
  }, [contextUser]);
  const user = contextUser || fallbackUser;
  const { streakNumber, flameLevel, isLoading } = useActivityStreakContext();
  const streakLogRef = React.useRef({ isLoading, streakNumber });
  if (streakLogRef.current.isLoading !== isLoading || streakLogRef.current.streakNumber !== streakNumber) {
    streakLogRef.current = { isLoading, streakNumber };
    logger.log('[STREAK] WakeHeader.web received', { isLoading, streakNumber, flameLevel });
  }
  const isDead = flameLevel === 0;
  const streakOpacity = isDead || isLoading ? OPACITY_DEAD : OPACITY_ACTIVE;
  const streakDisplayNum = isDead ? 0 : streakNumber;
  const showAllThree = isLoading || isDead;
  
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

      {/* Logo - use require so Metro/Expo resolves asset URL in dev and build */}
      <Image
        source={require('../../assets/wake-logo-new.png')}
        style={{ width: logoWidth, height: logoHeight }}
        resizeMode="contain"
        accessibilityLabel="WAKE"
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

      {/* Streak badge - same structure as DailyWorkoutScreen (base / middle / inner), slightly larger.
          Click to open streak details modal. */}
      <div
        aria-label="Racha"
        role="button"
        tabIndex={0}
        style={{
          position: 'absolute',
          top: barCenterTop,
          right: shouldShowProfileButton ? Math.max(32, screenWidth * 0.08) + 44 + 12 : Math.max(32, screenWidth * 0.08),
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          zIndex: 1001,
        }}
        onClick={() => setIsStreakModalOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsStreakModalOpen(true);
          }
        }}
      >
        <div style={{ position: 'relative', width: STREAK_BASE, height: STREAK_BASE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {(showAllThree || flameLevel >= 3) && (
            <span style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)' }}>
              <StreakFlameSvg size={STREAK_BASE} stroke="#000000" strokeWidth={0.3} fill="#E64A11" opacity={streakOpacity} />
            </span>
          )}
          {(showAllThree || flameLevel >= 2) && (
            <span style={{ position: 'absolute', bottom: STREAK_BOTTOM_MIDDLE, left: '50%', transform: 'translateX(-50%)' }}>
              <StreakFlameSvg size={STREAK_MIDDLE} stroke="#D5C672" strokeWidth={0.5} fill="#D5C672" opacity={streakOpacity} flipX />
            </span>
          )}
          {(showAllThree || flameLevel >= 1) && (
            <span style={{ position: 'absolute', bottom: STREAK_BOTTOM_INNER, left: '50%', transform: 'translateX(-50%)' }}>
              <StreakFlameSvg size={STREAK_INNER} stroke="#FFFFFF" strokeWidth={0.5} fill="#FFFFFF" opacity={streakOpacity} />
            </span>
          )}
        </div>
        <span style={{ color: '#ffffff', fontSize: 16, fontWeight: 600 }}>
          {streakDisplayNum}
        </span>
      </div>
      
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

      <HeaderStreakInfoModal
        visible={isStreakModalOpen}
        onClose={() => setIsStreakModalOpen(false)}
      />
    </div>
  );
  return (typeof document !== 'undefined' && document.body)
    ? createPortal(headerEl, document.body)
    : headerEl;
};

// Extra top space for content area when not iPhone (Mac/Android) so content doesn't sit right under the header.
const CONTENT_TOP_PADDING_NON_IOS = 100;

// Header spacer: matches FixedWakeHeader (32px + safe area top). On non-iOS adds extra height so content has top padding. Does not include HEADER_TOP_OFFSET_NON_IOS so content stays in place when only the bar is pushed down.
// 59px fallback only when standalone (iOS PWA) so env(safe-area-inset-top) can be 0 at first paint; desktop and Android use rawTop so they don't get extra space.
export const WakeHeaderSpacer = () => {
  const insets = useSafeAreaInsets();
  const ref = React.useRef(null);
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent || '');
  const rawTop = Math.max(0, Number(insets?.top) || 0);
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

