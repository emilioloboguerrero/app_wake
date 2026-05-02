// Hoy v2 — production /, served by WebAppNavigator.
// Coach grouping: workouts and nutrition assignments are grouped by creator_id.
// Each coach is its own "environment"; user switches coaches via the WeekCoachCard.
//
// Layout/proportions match the legacy MainScreen.js: FixedWakeHeader at top,
// greeting + 3D carousel below. Cards overlap with scale/opacity transforms
// driven by scrollX, plus pagination dots that scale with the active card.

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Platform,
  useWindowDimensions,
  Animated,
  View,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Text from '../components/Text';
import { useAuth } from '../contexts/AuthContext';
import { queryKeys } from '../config/queryClient';
import apiClient from '../utils/apiClient';
import { useUserCourses } from '../hooks/workout/useUserCourses';
import {
  useClientRelationships,
  useAcceptRelationship,
  useDeclineRelationship,
} from '../hooks/relationships/useClientRelationships';
import { useNutritionToday } from '../hooks/hoy/useNutritionToday';
import { useSessionRecovery } from '../hooks/hoy/useSessionRecovery';
import { useCoursesEnriched } from '../hooks/hoy/useCoursesEnriched';
import { useAccentFromImage } from '../hooks/hoy/useAccentFromImage';
import { useCourseDownloadStatus } from '../hooks/hoy/useCourseDownloadStatus';
import { getUpcomingBookingsForUser } from '../services/callBookingService';
import sessionService from '../services/sessionService';
import purchaseEventManager from '../services/purchaseEventManager';
import updateEventManager from '../services/updateEventManager';
import tutorialManager from '../services/tutorialManager';
import TutorialOverlay from '../components/TutorialOverlay';
import { FixedWakeHeader, WakeHeaderContent, WakeHeaderSpacer } from '../components/WakeHeader';
import BottomSpacer from '../components/BottomSpacer';
import SkeletonCard from '../components/SkeletonCard.web.jsx';
import TodayWorkoutCard from '../components/TodayWorkoutCard.web.jsx';
import TodayNutritionCard from '../components/TodayNutritionCard.web.jsx';
import WeekCoachCard from '../components/WeekCoachCard.web.jsx';
import HoyBanners from '../components/HoyBanners.web.jsx';

const LIBRARY_MOVED_FLAG = 'wake:preview_library_moved_seen';

const isCourseExpired = (course) => {
  if (course?.is_trial) return false;
  if (!course?.expires_at) return false;
  return new Date(course.expires_at) <= new Date();
};

const HoyScreen = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Carousel sizing — mirrors MainScreen.js so spacing/proportions match the
  // production look. CARD_MARGIN keeps a 10% gutter on each side; CARD_HEIGHT
  // is responsive but never collapses below 500.
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const stableHeightRef = useRef(null);
  if (Platform.OS === 'web' && stableHeightRef.current === null) {
    stableHeightRef.current = screenHeight;
  }
  const CARD_MARGIN = useMemo(() => screenWidth * 0.1, [screenWidth]);
  const CARD_WIDTH = useMemo(() => screenWidth - CARD_MARGIN * 2, [screenWidth, CARD_MARGIN]);
  const CARD_HEIGHT = useMemo(() => Math.max(500, screenHeight * 0.62), [screenHeight]);

  const { courses, isLoading } = useUserCourses(user?.uid);
  // Enrich with creator_id (fetched from top-level courses doc — user.courses doesn't carry it).
  const enrichedCourses = useCoursesEnriched(courses);
  const [selectedCoachId, setSelectedCoachId] = useState(null);

  // Profile — needed for pinnedTrainingCourseId so we can honor user's preferred order.
  const { data: profile } = useQuery({
    queryKey: queryKeys.user.detail(user?.uid),
    queryFn: () => apiClient.get('/users/me').then((r) => r?.data ?? null),
    enabled: !!user?.uid,
    staleTime: 5 * 60 * 1000,
  });
  const pinnedTrainingCourseId = profile?.pinnedTrainingCourseId || null;

  const firstName = useMemo(() => {
    const display = profile?.displayName || user?.displayName;
    if (display && display.trim()) return display.split(' ')[0];
    return user?.email?.split('@')[0] || 'Usuario';
  }, [profile?.displayName, user?.displayName, user?.email]);

  // Real nutrition data (plan + today's diary entries summed).
  const nutrition = useNutritionToday(user?.uid);

  // Pending one-on-one invites surface as banners above the carousel.
  const { data: pendingInvites = [] } = useClientRelationships(user?.uid, { status: 'pending' });
  const acceptInvite = useAcceptRelationship(user?.uid);
  const declineInvite = useDeclineRelationship(user?.uid);
  const [inviteActionId, setInviteActionId] = useState(null);

  // Upcoming call bookings — same query used by MainScreen.
  const { data: upcomingBookings = [] } = useQuery({
    queryKey: ['bookings', 'upcoming', user?.uid],
    queryFn: () => getUpcomingBookingsForUser(user.uid),
    enabled: !!user?.uid,
    staleTime: 5 * 60 * 1000,
  });

  // Session recovery — surfaces when localStorage has an in-progress checkpoint.
  const { checkpoint: recoveryCheckpoint, dismiss: dismissRecovery } = useSessionRecovery(user?.uid);

  // Per-course download statuses driven by courseDownloadService callbacks.
  const downloadStatusByCourseId = useCourseDownloadStatus();

  // Program-update banner — set when updateEventManager fires while user is here.
  const [hasPendingUpdates, setHasPendingUpdates] = useState(false);

  // Library transition notice — one-time after the user has any program.
  const [libraryMovedSeen, setLibraryMovedSeen] = useState(() => {
    try { return localStorage.getItem(LIBRARY_MOVED_FLAG) === '1'; } catch { return true; }
  });

  // Tutorial overlay (no-op stub today; ports cleanly when /users/me/tutorials lands).
  const [tutorialVisible, setTutorialVisible] = useState(false);
  const [tutorialData, setTutorialData] = useState([]);
  const [currentTutorialIndex, setCurrentTutorialIndex] = useState(0);

  const refreshCourses = useCallback(() => {
    if (!user?.uid) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.user.detail(user.uid) });
  }, [queryClient, user?.uid]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    let timer = null;
    const trigger = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => refreshCourses(), 300);
    };
    const unsub1 = purchaseEventManager.subscribe(trigger);
    const unsub2 = purchaseEventManager.subscribeReady(trigger);
    return () => {
      if (timer) clearTimeout(timer);
      unsub1?.();
      unsub2?.();
    };
  }, [user?.uid, refreshCourses]);

  useEffect(() => {
    const unsub = updateEventManager.subscribe(() => setHasPendingUpdates(true));
    return unsub;
  }, []);

  const handleApplyProgramUpdate = useCallback(() => {
    refreshCourses();
    updateEventManager.clearPendingUpdates();
    setHasPendingUpdates(false);
  }, [refreshCourses]);

  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    tutorialManager.getTutorialsForScreen(user.uid, 'hoy_v2').then((tutorials) => {
      if (cancelled || !Array.isArray(tutorials) || tutorials.length === 0) return;
      setTutorialData(tutorials);
      setCurrentTutorialIndex(0);
      setTutorialVisible(true);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user?.uid]);

  const handleTutorialComplete = useCallback(() => {
    if (!user?.uid || tutorialData.length === 0) return;
    const current = tutorialData[currentTutorialIndex];
    if (current) {
      tutorialManager.markTutorialCompleted(user.uid, 'hoy_v2', current.videoUrl).catch(() => {});
    }
  }, [user?.uid, tutorialData, currentTutorialIndex]);

  const coachEnvironments = useMemo(() => {
    const byCoach = new Map();
    (enrichedCourses || []).forEach((c) => {
      const coachKey = c.creator_id || c.creatorName || 'unknown';
      if (!byCoach.has(coachKey)) {
        byCoach.set(coachKey, {
          coachId: coachKey,
          coachName: c.creatorName || 'Coach',
          creatorId: c.creator_id || null,
          workouts: [],
          hasNutrition: false,
        });
      }
      byCoach.get(coachKey).workouts.push(c);
    });

    if (pinnedTrainingCourseId) {
      byCoach.forEach((env) => {
        env.workouts.sort((a, b) => {
          const aPinned = (a.courseId || a.id) === pinnedTrainingCourseId ? 0 : 1;
          const bPinned = (b.courseId || b.id) === pinnedTrainingCourseId ? 0 : 1;
          return aPinned - bPinned;
        });
      });
    }

    let arr = Array.from(byCoach.values());

    if (pinnedTrainingCourseId) {
      arr = arr.slice().sort((a, b) => {
        const aHasPinned = a.workouts.some((w) => (w.courseId || w.id) === pinnedTrainingCourseId) ? 0 : 1;
        const bHasPinned = b.workouts.some((w) => (w.courseId || w.id) === pinnedTrainingCourseId) ? 0 : 1;
        return aHasPinned - bHasPinned;
      });
    }

    if (nutrition.hasNutrition) {
      const matching = nutrition.assignmentCreatorId
        ? arr.find((c) => c.creatorId === nutrition.assignmentCreatorId)
        : null;
      const target = matching || arr[0];
      if (target) target.hasNutrition = true;
    }

    return arr;
  }, [enrichedCourses, nutrition.hasNutrition, nutrition.assignmentCreatorId, pinnedTrainingCourseId]);

  const selectedCoach = useMemo(() => {
    if (!coachEnvironments.length) return null;
    if (selectedCoachId) {
      const found = coachEnvironments.find((c) => c.coachId === selectedCoachId);
      if (found) return found;
    }
    return coachEnvironments[0];
  }, [coachEnvironments, selectedCoachId]);

  const upcomingCalls = useMemo(() => {
    if (!Array.isArray(upcomingBookings)) return [];
    return upcomingBookings.map((booking) => {
      const course = (courses || []).find((c) => (c.courseId || c.id) === booking.courseId) || null;
      const creatorName = course?.creatorName || course?.creator_name || null;
      return { booking, course, creatorName };
    });
  }, [upcomingBookings, courses]);

  const showLibraryMoved = !libraryMovedSeen && coachEnvironments.length > 0;

  const handleDismissLibraryMoved = useCallback(() => {
    try { localStorage.setItem(LIBRARY_MOVED_FLAG, '1'); } catch {}
    setLibraryMovedSeen(true);
  }, []);

  const handleAcceptInvite = useCallback((inviteId) => {
    setInviteActionId(inviteId);
    acceptInvite.mutate(inviteId, { onSettled: () => setInviteActionId(null) });
  }, [acceptInvite]);

  const handleDeclineInvite = useCallback((inviteId) => {
    setInviteActionId(inviteId);
    declineInvite.mutate(inviteId, { onSettled: () => setInviteActionId(null) });
  }, [declineInvite]);

  const handleResumeRecovery = useCallback(async () => {
    if (!recoveryCheckpoint || !user?.uid) return;
    const cId = recoveryCheckpoint.courseId;
    if (!cId) return;
    let fullWorkout = null;
    try {
      const state = await sessionService.getCurrentSession(user.uid, cId, {
        manualSessionId: recoveryCheckpoint.sessionId,
        forceRefresh: true,
      });
      if (state?.workout?.exercises?.length) fullWorkout = state.workout;
    } catch {
      fullWorkout = null;
    }
    if (!fullWorkout) return;
    const course = (courses || []).find((c) => (c.courseId || c.id) === cId) || { courseId: cId, id: cId };
    navigate(`/course/${cId}/workout/execution`, {
      state: { course, workout: fullWorkout, sessionId: recoveryCheckpoint.sessionId, checkpoint: recoveryCheckpoint },
    });
  }, [recoveryCheckpoint, user?.uid, courses, navigate]);

  const handleOpenCall = useCallback((call) => {
    const id = call?.booking?.id;
    if (!id) return;
    navigate(`/call/${id}`, {
      state: { booking: call.booking, course: call.course, creatorName: call.creatorName },
    });
  }, [navigate]);

  const handleBeginWorkout = useCallback(({ course, workout, sessionId }) => {
    navigate('/warmup', { state: { course, workout, sessionId } });
  }, [navigate]);

  const handleRenewCourse = useCallback((course) => {
    const id = course?.courseId || course?.id;
    if (id) navigate(`/course/${id}`);
  }, [navigate]);

  // Slides — workouts → optional nutrition → week/coach card.
  const slides = useMemo(() => {
    const items = [];
    (selectedCoach?.workouts || []).forEach((course) => {
      items.push({ id: `workout_${course.courseId || course.id}`, type: 'workout', course });
    });
    if (selectedCoach?.hasNutrition) {
      items.push({ id: 'nutrition', type: 'nutrition' });
    }
    items.push({ id: 'week_coach', type: 'week_coach' });
    return items;
  }, [selectedCoach]);

  // Carousel scroll state — drives scale/opacity transforms and pagination dots.
  const flatListRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [currentIndex, setCurrentIndex] = useState(0);
  const cardEntranceAnim = useRef(new Animated.Value(0)).current;
  const greetAnim = useRef(new Animated.Value(0)).current;
  const screenAnim = useRef(new Animated.Value(0)).current;

  // When slide count changes (different coach selected), clamp scroll to a valid offset.
  useEffect(() => {
    const max = Math.max(0, slides.length - 1);
    if (currentIndex > max) {
      setCurrentIndex(0);
      scrollX.setValue(0);
      flatListRef.current?.scrollToOffset?.({ offset: 0, animated: false });
    }
  }, [slides.length, currentIndex, scrollX]);

  useEffect(() => {
    Animated.timing(screenAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    Animated.timing(greetAnim, { toValue: 1, duration: 420, delay: 100, useNativeDriver: true }).start();
  }, [screenAnim, greetAnim]);

  useEffect(() => {
    if (!isLoading && slides.length > 0) {
      cardEntranceAnim.setValue(0);
      Animated.timing(cardEntranceAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    }
  }, [isLoading, slides.length, cardEntranceAnim]);

  const handleScroll = (event) => {
    const x = event.nativeEvent.contentOffset.x;
    const index = Math.round(x / CARD_WIDTH);
    if (index !== currentIndex) setCurrentIndex(index);
  };

  // Accent color extracted from the selected coach's primary image — applied as CSS vars.
  const accentSourceImage = selectedCoach?.workouts?.[0]?.image_url || null;
  const accent = useAccentFromImage(accentSourceImage);
  const accentVarsStyle = accent
    ? {
        '--accent': accent.accent,
        '--accent-r': accent.accentR,
        '--accent-g': accent.accentG,
        '--accent-b': accent.accentB,
        '--accent-text': accent.accentText,
      }
    : {};

  const renderSlide = ({ item, index }) => {
    const inputRange = [
      (index - 1) * CARD_WIDTH,
      index * CARD_WIDTH,
      (index + 1) * CARD_WIDTH,
    ];
    const scale = scrollX.interpolate({ inputRange, outputRange: [0.85, 1, 0.85], extrapolate: 'clamp' });
    const opacity = scrollX.interpolate({ inputRange, outputRange: [0.5, 1, 0.5], extrapolate: 'clamp' });
    const distanceFromCenter = Math.abs(index - currentIndex);
    const cardZIndex = distanceFromCenter === 0 ? 10 : distanceFromCenter === 1 ? 5 : 0;

    let inner = null;
    if (item.type === 'workout') {
      inner = (
        <TodayWorkoutCard
          course={item.course}
          isExpired={isCourseExpired(item.course)}
          downloadStatus={downloadStatusByCourseId[item.course.courseId || item.course.id] || null}
          onBegin={handleBeginWorkout}
          onRenew={handleRenewCourse}
        />
      );
    } else if (item.type === 'nutrition') {
      inner = (
        <TodayNutritionCard
          imageUrl={selectedCoach?.workouts?.[0]?.image_url}
          nutritionPlanName={nutrition.nutritionPlanName}
          caloriesConsumed={nutrition.caloriesConsumed}
          caloriesTarget={nutrition.caloriesTarget || 2100}
          proteinConsumed={nutrition.proteinConsumed}
          proteinTarget={nutrition.proteinTarget || 150}
          carbsConsumed={nutrition.carbsConsumed}
          carbsTarget={nutrition.carbsTarget || 250}
          fatConsumed={nutrition.fatConsumed}
          fatTarget={nutrition.fatTarget || 70}
          onLogMeal={() => navigate('/nutrition')}
        />
      );
    } else if (item.type === 'week_coach') {
      inner = (
        <WeekCoachCard
          coachEnvironments={coachEnvironments}
          selectedCoachId={selectedCoach?.coachId}
          onSelectCoach={(coachId) => setSelectedCoachId(coachId)}
          onTapDate={(ymd, course) => {
            const id = course?.courseId || course?.id;
            if (id) navigate(`/course/${id}/workout`, { state: { selectedDate: ymd } });
          }}
          onSeeProgram={(course) => {
            const id = course?.courseId || course?.id;
            if (id) navigate(`/course/${id}/structure`);
          }}
        />
      );
    }

    return (
      <Animated.View
        style={{
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          transform: [{ scale }],
          opacity,
          zIndex: cardZIndex,
          alignSelf: 'center',
        }}
      >
        {inner}
      </Animated.View>
    );
  };

  const renderPaginationIndicators = () => (
    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
      {slides.map((_, index) => {
        const inputRange = [(index - 1) * CARD_WIDTH, index * CARD_WIDTH, (index + 1) * CARD_WIDTH];
        const opacity = scrollX.interpolate({ inputRange, outputRange: [0.3, 1, 0.3], extrapolate: 'clamp' });
        const scale = scrollX.interpolate({ inputRange, outputRange: [0.8, 1.3, 0.8], extrapolate: 'clamp' });
        return (
          <Animated.View
            key={index}
            style={{
              width: 8,
              height: 8,
              backgroundColor: '#ffffff',
              borderRadius: 4,
              marginHorizontal: 4,
              opacity,
              transform: [{ scale }],
            }}
          />
        );
      })}
    </View>
  );

  const containerStyle = { flex: 1, backgroundColor: '#1a1a1a' };

  if (isLoading) {
    return (
      <div style={accentVarsStyle}>
        <SafeAreaView
          style={containerStyle}
          edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}
        >
          <FixedWakeHeader />
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <WakeHeaderContent>
              <WakeHeaderSpacer />
              <View
                style={{
                  height: CARD_HEIGHT + 80,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: CARD_MARGIN,
                }}
              >
                <View style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}>
                  <SkeletonCard />
                </View>
              </View>
              <BottomSpacer />
            </WakeHeaderContent>
          </ScrollView>
        </SafeAreaView>
      </div>
    );
  }

  const isEmpty = !coachEnvironments.length;

  if (isEmpty) {
    return (
      <div style={accentVarsStyle}>
        <SafeAreaView
          style={containerStyle}
          edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}
        >
          <FixedWakeHeader />
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <WakeHeaderContent>
              <WakeHeaderSpacer />
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, minHeight: 400 }}>
                <Text style={{ fontSize: 22, fontWeight: '600', color: '#fff', marginBottom: 8, textAlign: 'center' }}>
                  Aún no tienes un programa
                </Text>
                <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 24, maxWidth: 320, lineHeight: 20, textAlign: 'center' }}>
                  Explora la biblioteca para empezar a entrenar con un coach.
                </Text>
                <TouchableOpacity
                  onPress={() => navigate('/library')}
                  style={{
                    paddingHorizontal: 28,
                    paddingVertical: 14,
                    borderRadius: 999,
                    backgroundColor: '#fff',
                  }}
                >
                  <Text style={{ color: '#1a1a1a', fontWeight: '600', fontSize: 14 }}>Explorar programas</Text>
                </TouchableOpacity>
              </View>
              <BottomSpacer />
            </WakeHeaderContent>
          </ScrollView>
        </SafeAreaView>
      </div>
    );
  }

  return (
    <div style={accentVarsStyle}>
      <Animated.View style={{ flex: 1, opacity: screenAnim }}>
        <SafeAreaView
          style={containerStyle}
          edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}
        >
          <FixedWakeHeader />

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            bounces
          >
            <WakeHeaderContent>
              <WakeHeaderSpacer />

              <Animated.View
                style={{
                  marginBottom: 12,
                  opacity: greetAnim,
                  transform: [{ translateY: greetAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
                }}
              >
                <Text
                  style={{
                    fontSize: Math.min(screenWidth * 0.08, 32),
                    fontWeight: '400',
                    color: '#ffffff',
                    textAlign: 'left',
                    paddingLeft: screenWidth * 0.12,
                  }}
                >
                  Hola, <Text style={{ fontSize: Math.min(screenWidth * 0.08, 32), fontWeight: '600', color: '#fff' }}>{firstName}</Text>
                </Text>
              </Animated.View>

              <HoyBanners
                recoveryCheckpoint={recoveryCheckpoint}
                onResumeRecovery={handleResumeRecovery}
                onDiscardRecovery={dismissRecovery}
                pendingInvites={pendingInvites}
                onAcceptInvite={handleAcceptInvite}
                onDeclineInvite={handleDeclineInvite}
                inviteActionId={inviteActionId}
                upcomingCalls={upcomingCalls}
                onOpenCall={handleOpenCall}
                showLibraryMoved={showLibraryMoved}
                onDismissLibraryMoved={handleDismissLibraryMoved}
                onOpenLibrary={() => navigate('/profile')}
                showProgramUpdate={hasPendingUpdates}
                onApplyProgramUpdate={handleApplyProgramUpdate}
              />

              <View style={{ minHeight: CARD_HEIGHT + 80 }}>
                <Animated.View
                  style={{
                    flex: 1,
                    overflow: 'visible',
                    opacity: cardEntranceAnim,
                    transform: [{ translateY: cardEntranceAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
                  }}
                >
                  <View style={{ width: '100%', alignItems: 'center', overflow: 'visible', marginTop: 8 }}>
                    <Animated.FlatList
                      ref={flatListRef}
                      data={slides}
                      renderItem={renderSlide}
                      keyExtractor={(item) => item.id}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      snapToInterval={CARD_WIDTH}
                      snapToAlignment="center"
                      decelerationRate="fast"
                      contentContainerStyle={{
                        paddingHorizontal: (screenWidth - CARD_WIDTH) / 2,
                        alignItems: 'center',
                      }}
                      onScroll={Animated.event(
                        [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                        { useNativeDriver: false },
                      )}
                      onScrollEndDrag={handleScroll}
                      onMomentumScrollEnd={handleScroll}
                      scrollEventThrottle={16}
                      style={{ height: CARD_HEIGHT, width: '100%' }}
                      getItemLayout={(_d, i) => ({ length: CARD_WIDTH, offset: CARD_WIDTH * i, index: i })}
                      initialNumToRender={2}
                      maxToRenderPerBatch={3}
                      windowSize={5}
                      removeClippedSubviews
                      updateCellsBatchingPeriod={50}
                    />
                    <View style={{ width: '100%', minHeight: 40, justifyContent: 'center', alignItems: 'center', marginTop: 10, paddingTop: 10, paddingBottom: 24 }}>
                      {renderPaginationIndicators()}
                    </View>
                  </View>
                </Animated.View>
              </View>

              <BottomSpacer />
            </WakeHeaderContent>
          </ScrollView>

          <TutorialOverlay
            visible={tutorialVisible}
            tutorialData={tutorialData}
            onClose={() => setTutorialVisible(false)}
            onComplete={handleTutorialComplete}
          />
        </SafeAreaView>
      </Animated.View>
    </div>
  );
};

export default HoyScreen;
