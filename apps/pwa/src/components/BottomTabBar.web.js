// Fixed heights + frozen bottom inset (same approach as WakeHeader for top) so bar never pops.
const TAB_BAR_CONTENT_HEIGHT = 58;
const TAB_BAR_EXTRA_BOTTOM_PADDING = 28;

import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, useWindowDimensions, ActivityIndicator } from 'react-native';
import { useLocation, useNavigate } from 'react-router-dom';
import { User02 as SvgUser02, House02 as SvgHouse02, Steak as SvgSteak } from './icons';
import SvgBodyPartMuscleStrokeRounded from './icons/SvgBodyPartMuscleStrokeRounded';
import SvgChartLine from './icons/SvgChartLine';
import useFrozenBottomInset from '../hooks/useFrozenBottomInset.web';
import { useUserRole } from '../contexts/UserRoleContext';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../config/firebase';
import { isAdmin } from '../utils/roleHelper';
import purchaseService from '../services/purchaseService';
import * as nutritionFirestoreService from '../services/nutritionFirestoreService';
import { NoPlanModal } from './NoPlanModal.web';
import WakeModalOverlay from './WakeModalOverlay.web';
import logger from '../utils/logger';

const BottomTabBar = () => {
  const { width: screenWidth } = useWindowDimensions();
  const location = useLocation();
  const navigate = useNavigate();
  const { role } = useUserRole();
  const { user } = useAuth();
  const paddingBottom = useFrozenBottomInset() + TAB_BAR_EXTRA_BOTTOM_PADDING;
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuActionLoading, setMenuActionLoading] = useState(false);
  const [noTrainingPlanModalVisible, setNoTrainingPlanModalVisible] = useState(false);
  const [noNutritionPlanModalVisible, setNoNutritionPlanModalVisible] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  const handleToggle = () => {
    if (menuOpen) closeMenu();
    else setMenuOpen(true);
  };

  const handleEntrenarPress = () => {
    const userId = user?.uid ?? auth.currentUser?.uid;
    if (!userId) {
      closeMenu();
      setNoTrainingPlanModalVisible(true);
      return;
    }
    setMenuActionLoading(true);
    purchaseService.getUserPurchasedCourses(userId, false).then((courses) => {
      closeMenu();
      setMenuActionLoading(false);
      const active = Array.isArray(courses) ? courses : [];
      if (active.length === 0) {
        setNoTrainingPlanModalVisible(true);
      } else {
        const first = active[0];
        const courseId = first.courseId || first.id;
        if (courseId) {
          navigate(`/course/${courseId}/workout`);
        } else {
          setNoTrainingPlanModalVisible(true);
        }
      }
    }).catch(() => {
      closeMenu();
      setMenuActionLoading(false);
      setNoTrainingPlanModalVisible(true);
    });
  };

  const handleRegistrarComidaPress = () => {
    setNoNutritionPlanModalVisible(false);
    const userId = user?.uid ?? auth.currentUser?.uid;
    logger.log('[Registrar comida] userId=', userId, '(from context:', !!user?.uid, ', from auth.currentUser:', !!auth.currentUser?.uid, ')');
    if (!userId) {
      logger.log('[Registrar comida] no userId, showing modal');
      closeMenu();
      setNoNutritionPlanModalVisible(true);
      return;
    }
    setMenuActionLoading(true);
    nutritionFirestoreService.hasActiveNutritionAssignment(userId).then((hasPlan) => {
      closeMenu();
      setMenuActionLoading(false);
      logger.log('[Registrar comida] hasPlan=', hasPlan, '→', hasPlan ? 'navigate' : 'show modal');
      if (hasPlan) {
        setNoNutritionPlanModalVisible(false);
        navigate('/nutrition');
      } else {
        setNoNutritionPlanModalVisible(true);
      }
    }).catch((err) => {
      closeMenu();
      setMenuActionLoading(false);
      logger.error('[Registrar comida] hasActiveNutritionAssignment failed', err?.message ?? err, err);
      setNoNutritionPlanModalVisible(true);
    });
  };

  const handleGoToLibrary = () => {
    navigate('/library');
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

  const cardWidth = Math.min(170, Math.floor((screenWidth || 390) * 0.42));

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

  return (
    <>
      <NoPlanModal
        visible={noTrainingPlanModalVisible}
        onClose={() => setNoTrainingPlanModalVisible(false)}
        variant="training"
        onGoToLibrary={handleGoToLibrary}
      />
      <NoPlanModal
        visible={noNutritionPlanModalVisible}
        onClose={() => setNoNutritionPlanModalVisible(false)}
        variant="nutrition"
        onGoToLibrary={handleGoToLibrary}
      />
      <WakeModalOverlay
        visible={menuOpen}
        onClose={() => { if (!menuActionLoading) closeMenu(); }}
        contentAnimation="slideUp"
        contentPlacement="full"
      >
        <div
          style={{
            position: 'fixed',
            right: 20,
            bottom: cardBottomOffset,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            width: cardWidth,
            pointerEvents: 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {menuActionLoading ? (
            <div style={{ ...actionCardStyle, justifyContent: 'center', gap: 12 }}>
              <ActivityIndicator size="small" color="#ffffff" />
              <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '500' }}>Cargando...</span>
            </div>
          ) : (
            <>
              <div style={actionCardStyle} onClick={handleEntrenarPress} role="button" tabIndex={0}>
                <SvgBodyPartMuscleStrokeRounded width={28} height={28} stroke="#ffffff" strokeWidth={1.5} />
                <span style={{ color: '#ffffff', fontSize: 15, fontWeight: '600', textAlign: 'center' }}>Entrenar</span>
              </div>
              <div style={actionCardStyle} onClick={handleRegistrarComidaPress} role="button" tabIndex={0}>
                <SvgSteak width={28} height={28} stroke="#ffffff" fill="#ffffff" />
                <span style={{ color: '#ffffff', fontSize: 15, fontWeight: '600', textAlign: 'center' }}>Registrar comida</span>
              </div>
            </>
          )}
        </div>
      </WakeModalOverlay>
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
            style={{
              transform: menuOpen ? 'rotate(45deg)' : 'rotate(0deg)',
            }}
            onClick={handleToggle}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <path d="M12 5v14M5 12h14" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </button>
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

