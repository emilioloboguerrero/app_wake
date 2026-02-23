// Fixed heights + frozen bottom inset (same approach as WakeHeader for top) so bar never pops.
const TAB_BAR_CONTENT_HEIGHT = 58;
const TAB_BAR_EXTRA_BOTTOM_PADDING = 28;

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { View, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { useLocation, useNavigate } from 'react-router-dom';
import { User02 as SvgUser02, House02 as SvgHouse02, Steak as SvgSteak } from './icons';
import SvgBodyPartMuscleStrokeRounded from './icons/SvgBodyPartMuscleStrokeRounded';
import SvgChartLine from './icons/SvgChartLine';
import useFrozenBottomInset from '../hooks/useFrozenBottomInset.web';
import { useUserRole } from '../contexts/UserRoleContext';
import { isAdmin } from '../utils/roleHelper';

const BottomTabBar = () => {
  const { width: screenWidth } = useWindowDimensions();
  const location = useLocation();
  const navigate = useNavigate();
  const { role } = useUserRole();
  const paddingBottom = useFrozenBottomInset() + TAB_BAR_EXTRA_BOTTOM_PADDING;
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);

  const closeMenu = () => {
    setMenuClosing(true);
    setTimeout(() => {
      setMenuOpen(false);
      setMenuClosing(false);
    }, 200);
  };

  const handleToggle = () => {
    if (menuOpen) { closeMenu(); } else { setMenuOpen(true); }
  };

  const iconSize = Math.min((screenWidth || 390) * 0.06, 28);
  const showNutritionTab = role !== null && isAdmin(role);

  // Determine if tab bar should be visible based on current route (nutrition has its own header back, no tab bar)
  const shouldShowTabBar = () => {
    const path = location.pathname;
    return ['/', '/profile', '/progress'].includes(path);
  };

  const show = shouldShowTabBar();

  // Determine which tab is active
  const isMainActive = location.pathname === '/';
  const isProfileActive = location.pathname === '/profile';
  const isNutritionActive = location.pathname === '/nutrition';
  const isProgressActive = location.pathname === '/progress';

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
  const getSteakIconProps = (isActive) => ({
    ...getIconProps(isActive),
    strokeWidth: isActive ? 3.4 : 3,
  });

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
    paddingLeft: 20,
    paddingRight: 20,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  };

  const pillRingStyle = {
    flex: 1,
    borderRadius: 999,
    border: '1px solid rgba(255, 255, 255, 0.06)',
    boxShadow: '0 0 2px rgba(255, 255, 255, 0.08)',
    background: '#222222',
    overflow: 'hidden',
  };

  const pillInnerStyle = {
    borderRadius: 999,
    background: 'transparent',
  };

  const cardBottomOffset = paddingBottom + TAB_BAR_CONTENT_HEIGHT + 16;

  const cardWidth = Math.floor(screenWidth / 2);

  const actionCardStyle = {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    borderRadius: 16,
    border: '1px solid rgba(255, 255, 255, 0.25)',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 100,
  };

  const backdropAnim = menuClosing ? 'wakeBackdropOut 0.2s ease forwards' : 'wakeBackdropIn 0.2s ease forwards';
  const cardsAnim   = menuClosing ? 'wakeCardsOut 0.2s ease forwards'   : 'wakeCardsIn 0.2s ease forwards';

  const overlay = menuOpen ? (
    <>
      <style>{`
        @keyframes wakeBackdropIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes wakeBackdropOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes wakeCardsIn  { from { transform: translateY(12px); } to { transform: translateY(0); } }
        @keyframes wakeCardsOut { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(12px); } }
      `}</style>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          zIndex: 1002,
          animation: backdropAnim,
        }}
        onClick={closeMenu}
      />
      <div
        style={{
          position: 'fixed',
          right: 20,
          bottom: cardBottomOffset,
          zIndex: 1003,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          width: cardWidth,
          animation: cardsAnim,
        }}
      >
        <div style={actionCardStyle}>
          <SvgBodyPartMuscleStrokeRounded width={28} height={28} stroke="#ffffff" strokeWidth={1.5} />
          <span style={{ color: '#ffffff', fontSize: 15, fontWeight: '600', textAlign: 'center' }}>Iniciar entrenamiento</span>
        </div>
        <div style={actionCardStyle} onClick={() => { navigate('/nutrition'); closeMenu(); }}>
          <SvgSteak width={28} height={28} stroke="#ffffff" fill="#ffffff" />
          <span style={{ color: '#ffffff', fontSize: 15, fontWeight: '600', textAlign: 'center' }}>Registrar comida</span>
        </div>
      </div>
    </>
  ) : null;

  return (
    <>
      {typeof document !== 'undefined' && document.body
        ? createPortal(overlay, document.body)
        : overlay}
      <div className="wake-tab-bar-root" style={fixedWrapperStyle}>
        <div style={pillRingStyle}>
          <div style={pillInnerStyle}>
            <View style={[styles.tabBar, { height: TAB_BAR_CONTENT_HEIGHT }]}>
              <TouchableOpacity
                style={styles.tabButton}
                onPress={() => navigate('/')}
                activeOpacity={0.7}
              >
                <View style={styles.tabIconWrap}>
                  <SvgHouse02 {...getIconProps(isMainActive)} />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.tabButton}
                onPress={() => navigate('/progress')}
                activeOpacity={0.7}
              >
                <View style={styles.tabIconWrap}>
                  <SvgChartLine
                    width={iconSize}
                    height={iconSize}
                    color="#ffffff"
                    strokeWidth={isProgressActive ? 2.8 : 2.5}
                    style={{ opacity: isProgressActive ? 1 : 0.6 }}
                  />
                </View>
              </TouchableOpacity>

              {showNutritionTab && (
                <TouchableOpacity
                  style={styles.tabButton}
                  onPress={() => navigate('/nutrition')}
                  activeOpacity={0.7}
                >
                  <View style={styles.tabIconWrap}>
                    <SvgSteak {...getSteakIconProps(isNutritionActive)} />
                  </View>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.tabButton}
                onPress={() => navigate('/profile')}
                activeOpacity={0.7}
              >
                <View style={styles.tabIconWrap}>
                  <SvgUser02 {...getIconProps(isProfileActive)} />
                </View>
              </TouchableOpacity>
            </View>
          </div>
        </div>

        <div className="wake-tab-bar-add-button-wrap">
          <button
            type="button"
            className="wake-tab-bar-add-button"
            style={{ transform: (menuOpen && !menuClosing) ? 'rotate(45deg)' : 'rotate(0deg)' }}
            onClick={handleToggle}
          />
        </div>
      </div>
    </>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    width: '100%',
    backgroundColor: 'transparent',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  tabButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
  },
  tabIconWrap: {
    borderRadius: 999,
    paddingHorizontal: 26,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default BottomTabBar;

