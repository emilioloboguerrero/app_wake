// Fixed heights + frozen bottom inset (same approach as WakeHeader for top) so bar never pops.
const TAB_BAR_CONTENT_HEIGHT = 58;
const TAB_BAR_EXTRA_BOTTOM_PADDING = 28;

import React, { useState, useCallback, useRef, useEffect } from 'react';
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
import firestoreService from '../services/firestoreService';
import sessionService from '../services/sessionService';
import sessionManager from '../services/sessionManager';
import * as nutritionFirestoreService from '../services/nutritionFirestoreService';
import { NoPlanModal } from './NoPlanModal.web';
import { TrainingActionModal } from './TrainingActionModal.web';
import { ProgramPickerModal } from './ProgramPickerModal.web';
import WakeModalOverlay from './WakeModalOverlay.web';
import { toYYYYMMDD } from '../components/WeekDateSelector.web';
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
  const [trainingActionModal, setTrainingActionModal] = useState({ visible: false, variant: 'no_session_today', courseId: null });
  const [programPickerTraining, setProgramPickerTraining] = useState({ visible: false, options: [] });
  const [programPickerNutrition, setProgramPickerNutrition] = useState({ visible: false, options: [] });

  const PREFETCH_TTL_MS = 90000;
  const prefetchedTrainingRef = useRef({ courses: null, pinnedId: null, timestamp: 0 });

  const closeMenu = () => setMenuOpen(false);

  const handleToggle = () => {
    if (menuOpen) closeMenu();
    else setMenuOpen(true);
  };

  const resolveTargetCourse = useCallback((active, pinnedId) => {
    if (!active?.length) return null;
    if (active.length === 1) return active[0];
    const pinned = pinnedId ? active.find((c) => (c.courseId || c.id) === pinnedId) : null;
    return pinned || null;
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const userId = user?.uid ?? auth.currentUser?.uid;
    if (!userId) return;
    let cancelled = false;
    const today = toYYYYMMDD(new Date());
    Promise.all([
      purchaseService.getUserPurchasedCourses(userId, false),
      firestoreService.getPinnedTrainingCourseId(userId),
    ]).then(([courses, pinnedId]) => {
      if (cancelled) return;
      const active = Array.isArray(courses) ? courses : [];
      prefetchedTrainingRef.current = { courses: active, pinnedId: pinnedId || null, timestamp: Date.now() };
      const target = resolveTargetCourse(active, pinnedId);
      if (target) {
        const courseId = target.courseId || target.id;
        sessionService.getCurrentSession(userId, courseId, { targetDate: today }).catch(() => {});
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [menuOpen, user?.uid, resolveTargetCourse]);

  const buildCourseObj = (course) => {
    const cid = course.courseId || course.id;
    const details = course.courseDetails || {};
    return {
      courseId: cid,
      id: cid,
      title: details.title || course.title || 'Programa',
      ...details,
    };
  };

  const runEntrenarFlow = useCallback(async (course, userId) => {
    const courseId = course.courseId || course.id;
    if (!courseId) {
      setMenuActionLoading(false);
      setNoTrainingPlanModalVisible(true);
      return;
    }
    const courseObj = buildCourseObj(course);
    const today = toYYYYMMDD(new Date());
    try {
      const sessionState = await sessionService.getCurrentSession(userId, courseId, { targetDate: today });
      if (sessionState.emptyReason === 'no_session_today' || sessionState.emptyReason === 'no_planning_this_week' || !sessionState.workout?.exercises?.length) {
        setTrainingActionModal({ visible: true, variant: 'no_session_today', courseId });
        return;
      }
      if (sessionState.todaySessionAlreadyCompleted) {
        setTrainingActionModal({ visible: true, variant: 'already_completed', courseId });
        return;
      }
      const workout = sessionState.workout;
      const sessionId = workout.sessionId || sessionState.session?.sessionId || sessionState.session?.id;
      const session = await sessionManager.startSession(userId, courseId, sessionId, workout.title);
      closeMenu();
      navigate('/warmup', { state: { course: courseObj, workout, sessionId: session.sessionId } });
    } catch (err) {
      logger.error('[Entrenar] getCurrentSession or startSession failed', err?.message ?? err);
      setTrainingActionModal({ visible: true, variant: 'no_session_today', courseId });
    } finally {
      setMenuActionLoading(false);
    }
  }, [navigate]);

  const handleEntrenarPress = () => {
    const userId = user?.uid ?? auth.currentUser?.uid;
    if (!userId) {
      closeMenu();
      setNoTrainingPlanModalVisible(true);
      return;
    }
    const prefetched = prefetchedTrainingRef.current;
    const usePrefetched = prefetched.courses != null && (Date.now() - prefetched.timestamp) < PREFETCH_TTL_MS;

    if (usePrefetched && prefetched.courses.length === 0) {
      closeMenu();
      setNoTrainingPlanModalVisible(true);
      return;
    }
    if (usePrefetched && prefetched.courses.length > 0) {
      const active = prefetched.courses;
      if (active.length === 1) {
        setMenuActionLoading(true);
        runEntrenarFlow(active[0], userId);
        return;
      }
      const pinnedCourse = prefetched.pinnedId ? active.find((c) => (c.courseId || c.id) === prefetched.pinnedId) : null;
      if (pinnedCourse) {
        setMenuActionLoading(true);
        runEntrenarFlow(pinnedCourse, userId);
        return;
      }
      closeMenu();
      setProgramPickerTraining({
        visible: true,
        options: active.map((c) => ({
          ...c,
          id: c.courseId || c.id,
          courseId: c.courseId || c.id,
          title: c.courseDetails?.title || c.title || 'Programa',
        })),
      });
      return;
    }

    setMenuActionLoading(true);
    Promise.all([
      purchaseService.getUserPurchasedCourses(userId, false),
      firestoreService.getPinnedTrainingCourseId(userId),
    ]).then(([courses, pinnedId]) => {
      const active = Array.isArray(courses) ? courses : [];
      if (active.length === 0) {
        closeMenu();
        setMenuActionLoading(false);
        setNoTrainingPlanModalVisible(true);
        return;
      }
      if (active.length === 1) {
        runEntrenarFlow(active[0], userId);
        return;
      }
      const pinnedCourse = pinnedId ? active.find((c) => (c.courseId || c.id) === pinnedId) : null;
      if (pinnedCourse) {
        runEntrenarFlow(pinnedCourse, userId);
        return;
      }
      closeMenu();
      setMenuActionLoading(false);
      setProgramPickerTraining({
        visible: true,
        options: active.map((c) => ({
          ...c,
          id: c.courseId || c.id,
          courseId: c.courseId || c.id,
          title: c.courseDetails?.title || c.title || 'Programa',
        })),
      });
    }).catch((err) => {
      closeMenu();
      setMenuActionLoading(false);
      logger.error('[Entrenar] failed', err?.message ?? err);
      setNoTrainingPlanModalVisible(true);
    });
  };

  const handleTrainingPickerSelect = (item) => {
    const userId = user?.uid ?? auth.currentUser?.uid;
    if (!userId) return;
    setProgramPickerTraining((prev) => ({ ...prev, visible: false }));
    firestoreService.setPinnedTrainingCourseId(userId, item.courseId || item.id).then(() => {
      setMenuActionLoading(true);
      runEntrenarFlow(item, userId);
    }).catch((err) => {
      logger.error('[Entrenar] setPinnedTrainingCourseId failed', err?.message ?? err);
    });
  };

  const handleVerPrograma = (courseId) => {
    setTrainingActionModal((prev) => ({ ...prev, visible: false }));
    if (courseId) navigate(`/course/${courseId}/workout`);
  };

  const handleRegistrarComidaPress = () => {
    setNoNutritionPlanModalVisible(false);
    const userId = user?.uid ?? auth.currentUser?.uid;
    if (!userId) {
      closeMenu();
      setNoNutritionPlanModalVisible(true);
      return;
    }
    setMenuActionLoading(true);
    Promise.all([
      nutritionFirestoreService.getAssignmentsByUser(userId),
      firestoreService.getPinnedNutritionAssignmentId(userId),
    ]).then(([assignments, pinnedId]) => {
      const today = toYYYYMMDD(new Date());
      const activeAssignments = nutritionFirestoreService.getActiveAssignmentsForDate(assignments || [], today);
      if (activeAssignments.length === 0) {
        closeMenu();
        setMenuActionLoading(false);
        setNoNutritionPlanModalVisible(true);
        return;
      }
      if (activeAssignments.length === 1) {
        const assignment = activeAssignments[0];
        const planSnapshot = assignment.plan && typeof assignment.plan === 'object'
          ? { id: assignment.planId, ...assignment.plan }
          : null;
        closeMenu();
        setMenuActionLoading(false);
        navigate('/nutrition', {
          state: {
            preferredAssignmentId: assignment.id,
            initialAssignment: assignment,
            initialPlan: planSnapshot,
          },
        });
        return;
      }
      const pinned = pinnedId ? activeAssignments.find((a) => a.id === pinnedId) : null;
      if (pinned) {
        const planSnapshot = pinned.plan && typeof pinned.plan === 'object'
          ? { id: pinned.planId, ...pinned.plan }
          : null;
        closeMenu();
        setMenuActionLoading(false);
        navigate('/nutrition', {
          state: {
            preferredAssignmentId: pinned.id,
            initialAssignment: pinned,
            initialPlan: planSnapshot,
          },
        });
        return;
      }
      closeMenu();
      setMenuActionLoading(false);
      setProgramPickerNutrition({
        visible: true,
        options: activeAssignments.map((a) => ({
          ...a,
          id: a.id,
          assignmentId: a.id,
          title: a.plan?.name || a.planId || 'Plan de alimentación',
        })),
      });
    }).catch((err) => {
      closeMenu();
      setMenuActionLoading(false);
      logger.error('[Registrar comida] failed', err?.message ?? err, err);
      setNoNutritionPlanModalVisible(true);
    });
  };

  const handleNutritionPickerSelect = (item) => {
    const userId = user?.uid ?? auth.currentUser?.uid;
    if (!userId) return;
    setProgramPickerNutrition((prev) => ({ ...prev, visible: false }));
    const assignmentId = item.assignmentId || item.id;
    const planSnapshot = item.plan && typeof item.plan === 'object'
      ? { id: item.planId, ...item.plan }
      : null;
    firestoreService.setPinnedNutritionAssignmentId(userId, assignmentId).then(() => {
      navigate('/nutrition', {
        state: {
          preferredAssignmentId: assignmentId,
          initialAssignment: item,
          initialPlan: planSnapshot,
        },
      });
    }).catch((err) => {
      logger.error('[Registrar comida] setPinnedNutritionAssignmentId failed', err?.message ?? err);
    });
  };

  const handleGoToLibrary = () => {
    navigate('/library');
  };

  const iconSize = Math.min((screenWidth || 390) * 0.06, 28);
  const showLabTab = true;

  // Determine if tab bar should be visible based on current route (nutrition has its own header back, no tab bar)
  const shouldShowTabBar = () => {
    const path = location.pathname;
    return ['/', '/profile', '/progress'].includes(path);
  };

  const show = shouldShowTabBar();

  // Determine which tab is active
  const isMainActive = location.pathname === '/';
  const isProfileActive = location.pathname === '/profile';
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
      <TrainingActionModal
        visible={trainingActionModal.visible}
        onClose={() => setTrainingActionModal((p) => ({ ...p, visible: false }))}
        variant={trainingActionModal.variant}
        courseId={trainingActionModal.courseId}
        onVerPrograma={handleVerPrograma}
      />
      <ProgramPickerModal
        visible={programPickerTraining.visible}
        onClose={() => setProgramPickerTraining((p) => ({ ...p, visible: false }))}
        variant="training"
        title="¿Con qué programa quieres entrenar?"
        options={programPickerTraining.options}
        onSelect={handleTrainingPickerSelect}
      />
      <ProgramPickerModal
        visible={programPickerNutrition.visible}
        onClose={() => setProgramPickerNutrition((p) => ({ ...p, visible: false }))}
        variant="nutrition"
        options={programPickerNutrition.options}
        onSelect={handleNutritionPickerSelect}
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
                <SvgSteak width={28} height={28} stroke="#ffffff" fill="none" />
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

              {showLabTab && (
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

