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
  Animated,
  View,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import useAppViewportSize from '../hooks/useAppViewportSize.web';
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
import { useDailyWorkoutPrefetch } from '../hooks/hoy/useDailyWorkoutPrefetch';
import { useCourseDownloadStatus } from '../hooks/hoy/useCourseDownloadStatus';
import { useCoachProfileImages } from '../hooks/hoy/useCoachProfileImages';
import { getUpcomingBookingsForUser } from '../services/callBookingService';
import sessionService from '../services/sessionService';
import { shouldAskLevel } from '../utils/levelGate';
import LevelPickerModal from '../components/hoy/LevelPickerModal.web.jsx';
import purchaseEventManager from '../services/purchaseEventManager';
import updateEventManager from '../services/updateEventManager';
import tutorialManager from '../services/tutorialManager';
import TutorialOverlay from '../components/TutorialOverlay';
import { FixedWakeHeader, WakeHeaderContent, WakeHeaderSpacer } from '../components/WakeHeader';
import BottomSpacer from '../components/BottomSpacer';
import SkeletonCard from '../components/SkeletonCard.web.jsx';
import TodayWorkoutCard from '../components/TodayWorkoutCard.web.jsx';
import TodayNutritionCard from '../components/TodayNutritionCard.web.jsx';
import AdditionalResourcesCard from '../components/AdditionalResourcesCard.web.jsx';
import WeekCoachCard from '../components/WeekCoachCard.web.jsx';
import HoyBanners from '../components/HoyBanners.web.jsx';
import HoyEmptyState from '../components/hoy/HoyEmptyState.web.jsx';

const LIBRARY_MOVED_FLAG = 'wake:preview_library_moved_seen';
const SELECTED_COACH_KEY = (uid) => `wake:hoy:selectedCoachId:${uid}`;

const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const isCourseExpired = (course) => {
  if (course?.is_trial) return false;
  // includeInactive surfaces cancelled/inactive subscriptions in the carousel
  // so the user can renew. hasAccess (isCourseEntryActive) is the single source
  // of truth and already applies the 3-day grace window; gate on it directly so
  // a subscriber whose expires_at just passed isn't shown "Acceso expirado" and
  // blocked while the server still serves their content within the grace.
  return course?.hasAccess === false;
};

const HoyScreen = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Carousel sizing — mirrors MainScreen.js so spacing/proportions match the
  // production look. CARD_MARGIN keeps a 10% gutter on each side. Measures
  // the .app-viewport container (not the window) so the math matches the
  // centered desktop column. CARD_HEIGHT is capped by CARD_WIDTH * 1.7 so a
  // narrow column on a tall window doesn't stretch cards into thin billboards.
  const { width: screenWidth, height: screenHeight } = useAppViewportSize();
  const CARD_MARGIN = useMemo(() => screenWidth * 0.1, [screenWidth]);
  const CARD_WIDTH = useMemo(() => screenWidth - CARD_MARGIN * 2, [screenWidth, CARD_MARGIN]);
  const CARD_HEIGHT = useMemo(
    () => Math.min(Math.max(500, screenHeight * 0.62), CARD_WIDTH * 1.7),
    [screenHeight, CARD_WIDTH],
  );
  const { courses, isLoading: coursesLoading, error: coursesError, refetch: refetchCourses } = useUserCourses(user?.uid, { includeInactive: true });
  // Enrich with creator_id (fetched from top-level courses doc — user.courses doesn't carry it).
  // Non-blocking: carousel renders as soon as useUserCourses resolves; coach grouping
  // reflows when creator_id lands. Courses without resolved creator_id share a fallback
  // bucket keyed by creatorName so cards still appear instantly.
  const { courses: enrichedCourses } = useCoursesEnriched(courses);
  const isLoading = coursesLoading;
  // Prefetch /workout/daily for every course in parallel, sharing the per-card query key
  // so by the time TodayWorkoutCard mounts the data is already cached.
  useDailyWorkoutPrefetch(user?.uid, courses);
  const [selectedCoachId, setSelectedCoachId] = useState(null);
  // The Hoy carousel is anchored to a date — defaults to today, advanced via the
  // WeekCoachCard day strip / calendar. Workout + nutrition cards reflect this date.
  const [selectedDate, setSelectedDate] = useState(() => todayYmd());

  // Hydrate persisted coach selection once we know who's logged in. Stored per-user so
  // switching accounts on the same device doesn't carry the previous user's selection.
  useEffect(() => {
    if (!user?.uid) return;
    try {
      const v = localStorage.getItem(SELECTED_COACH_KEY(user.uid));
      if (v) setSelectedCoachId(v);
    } catch {}
  }, [user?.uid]);

  const handleSelectCoach = useCallback((coachId) => {
    setSelectedCoachId(coachId);
    setSelectedDate(todayYmd());
    if (!user?.uid || !coachId) return;
    try { localStorage.setItem(SELECTED_COACH_KEY(user.uid), coachId); } catch {}
  }, [user?.uid]);

  const handleSelectDate = useCallback((ymd) => {
    if (!ymd) return;
    setSelectedDate(ymd);
  }, []);

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

  // Real nutrition data (plan + diary entries summed) for the selected date.
  const nutrition = useNutritionToday(user?.uid, selectedDate);

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
    // The per-card daily-session cache (TodayWorkoutCard) lives under its own
    // key — invalidate it too so a coach update or new purchase flips the card
    // without waiting on the 60s staleTime window.
    queryClient.invalidateQueries({ queryKey: ['preview', 'todaySession', user.uid] });
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
      // Prefer creator_id when available; otherwise group by creatorName so the carousel
      // still renders before enrichment lands. Once creator_id resolves, the memo
      // recomputes and groups merge under the canonical key.
      const coachKey = c.creator_id || (c.creatorName ? `name:${c.creatorName}` : '__unknown__');
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

    if (nutrition.hasNutrition && arr.length > 0) {
      // Prefer the env whose creatorId matches the assignment's creator. If the assignment
      // doc has no creator_id (legacy assignments) or matches no current env, fall back to
      // the first env. This fallback is safe here because enrichment is already complete
      // (the screen is gated on enrichmentLoading) — creatorId values are final, not in-flight.
      const target = (nutrition.assignmentCreatorId
        ? arr.find((c) => c.creatorId === nutrition.assignmentCreatorId)
        : null) || arr[0];
      target.hasNutrition = true;
    }

    return arr;
  }, [enrichedCourses, nutrition.hasNutrition, nutrition.assignmentCreatorId, pinnedTrainingCourseId]);

  // Profile pictures for every coach environment — used by WeekCoachCard for both
  // the selector avatars and the card's accent (derived from the active coach's image).
  const coachProfileImagesByCoachId = useCoachProfileImages(coachEnvironments);

  const selectedCoach = useMemo(() => {
    if (!coachEnvironments.length) return null;
    if (selectedCoachId) {
      const found = coachEnvironments.find((c) => c.coachId === selectedCoachId);
      if (found) return found;
    }
    // No persisted selection — prefer the env that has today's nutrition card so the
    // user sees both workouts and nutrition at a glance instead of having to swipe.
    // Falls back to the existing pinned-first ordering when no env owns the nutrition.
    const withNutrition = coachEnvironments.find((c) => c.hasNutrition);
    return withNutrition || coachEnvironments[0];
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
    const id = call?.booking?.bookingId || call?.booking?.id;
    if (!id) return;
    navigate(`/call/${id}`, {
      state: { booking: call.booking, course: call.course, creatorName: call.creatorName },
    });
  }, [navigate]);

  const handleBeginWorkout = useCallback(async ({ course, workout, sessionId, mode }) => {
    // "Empezar de nuevo" (and the normal first start) → warmup then a fresh session.
    if (mode !== 'reopen') {
      navigate('/warmup', { state: { course, workout, sessionId, entryPath: 'hoy' } });
      return;
    }

    // "Continuar sesión" → reopen the already-completed session. Find its saved
    // record, reshape it into a checkpoint, and drop straight into execution
    // (skipping warmup, like the recovery flow). On finish, the execution screen
    // sends reopenCompletionId so the server replaces it instead of duplicating.
    const cId = course?.courseId || course?.id;
    if (!cId || !user?.uid) return;
    const today = new Date().toISOString().slice(0, 10);
    let completion = null;
    try {
      completion = await sessionService.getLatestCompletionForSession(user.uid, cId, sessionId, today);
    } catch {
      completion = null;
    }
    if (!completion) {
      // Couldn't locate the completed session — fall back to a fresh start.
      navigate('/warmup', { state: { course, workout, sessionId, entryPath: 'hoy' } });
      return;
    }
    const checkpoint = sessionService.buildReopenCheckpoint(completion, workout);
    navigate(`/course/${cId}/workout/execution`, {
      state: {
        course,
        workout,
        sessionId,
        checkpoint,
        reopenCompletionId: completion.completionId || completion.id,
      },
    });
  }, [navigate, user?.uid]);

  const handleRenewCourse = useCallback((course) => {
    const id = course?.courseId || course?.id;
    if (id) navigate(`/course/${id}`);
  }, [navigate]);

  // Level picker — surfaces for the first workout course in the selected coach env
  // that has a levels config and no chosen level yet. Non-leveled courses are
  // unaffected (shouldAskLevel returns false when course.levels is absent).
  const levelPickerCourse = useMemo(() => {
    if (!selectedCoach?.workouts?.length) return null;
    return selectedCoach.workouts.find((c) => shouldAskLevel(c, { level: c.level })) || null;
  }, [selectedCoach]);

  // Slides — workouts → optional nutrition → week/coach card.
  const slides = useMemo(() => {
    const items = [];
    (selectedCoach?.workouts || []).forEach((course) => {
      items.push({ id: `workout_${course.courseId || course.id}`, type: 'workout', course });
      if (Number(course.additional_resources_count) > 0) {
        items.push({ id: `resources_${course.courseId || course.id}`, type: 'resources', course });
      }
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

  // Accent is intentionally scoped per-card — each card extracts its own color
  // from the image it's displaying, so the screen wrapper carries no global accent.

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
          selectedDate={selectedDate}
          onBegin={handleBeginWorkout}
          onRenew={handleRenewCourse}
        />
      );
    } else if (item.type === 'resources') {
      inner = (
        <AdditionalResourcesCard
          course={item.course}
          count={item.course.additional_resources_count}
          onOpen={() => navigate(`/course/${item.course.courseId || item.course.id}/resources`)}
        />
      );
    } else if (item.type === 'nutrition') {
      inner = (
        <TodayNutritionCard
          imageUrl={selectedCoach?.workouts?.[0]?.image_url}
          nutritionPlanName={nutrition.nutritionPlanName}
          selectedDate={selectedDate}
          isLoading={nutrition.isLoading}
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
          profileImagesByCoachId={coachProfileImagesByCoachId}
          selectedDate={selectedDate}
          onSelectCoach={handleSelectCoach}
          onSelectDate={handleSelectDate}
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
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
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

  // Distinguish a failed courses load from a genuinely empty account. Without
  // this, a /users/me error fell through to the "no tienes programas" empty
  // state — a user with programs believed they had lost them.
  if (coursesError && isEmpty) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <SafeAreaView
          style={containerStyle}
          edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}
        >
          <FixedWakeHeader />
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: CARD_MARGIN }}>
            <Text style={{ fontSize: 17, fontWeight: '600', color: 'rgba(255,255,255,0.92)', textAlign: 'center', marginBottom: 8 }}>
              No pudimos cargar tus programas
            </Text>
            <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', textAlign: 'center', marginBottom: 22 }}>
              Revisa tu conexión e inténtalo de nuevo.
            </Text>
            <TouchableOpacity
              onPress={() => refetchCourses()}
              style={{ backgroundColor: '#fff', paddingVertical: 13, paddingHorizontal: 28, borderRadius: 12 }}
            >
              <Text style={{ color: '#111', fontSize: 15, fontWeight: '600' }}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </div>
    );
  }

  if (isEmpty) {
    // Banners must render above the empty state so a one-on-one invitee — who
    // has no programs until they accept — can still see and act on the invite.
    return (
      <HoyEmptyState
        onExplore={() => navigate('/library')}
        banners={
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
        }
      />
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Animated.View style={{ flex: 1, opacity: screenAnim }}>
        <SafeAreaView
          style={containerStyle}
          edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}
        >
          <FixedWakeHeader />

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 160 }}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            bounces
          >
            <WakeHeaderContent>
              <WakeHeaderSpacer />

              <Animated.View
                style={{
                  marginBottom: 4,
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
                  <View style={{ width: '100%', alignItems: 'center', overflow: 'visible' }}>
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
                        paddingTop: 8,
                        paddingBottom: 0,
                        alignItems: 'center',
                      }}
                      onScroll={Animated.event(
                        [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                        { useNativeDriver: false },
                      )}
                      onScrollEndDrag={handleScroll}
                      onMomentumScrollEnd={handleScroll}
                      scrollEventThrottle={16}
                      style={{ height: CARD_HEIGHT + 16, width: '100%', touchAction: 'pan-x' }}
                      getItemLayout={(_d, i) => ({ length: CARD_WIDTH, offset: CARD_WIDTH * i, index: i })}
                      initialNumToRender={2}
                      maxToRenderPerBatch={3}
                      windowSize={5}
                      removeClippedSubviews={false}
                      updateCellsBatchingPeriod={50}
                    />
                    <View style={{ width: '100%', minHeight: 24, justifyContent: 'center', alignItems: 'center', marginTop: 16, paddingBottom: 12 }}>
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

      {/* Level picker — appears when the active course is level-gated and the
          user has not chosen a level yet. Non-dismissible (closeOnBackdropClick
          would bypass the gate); auto-hides once setLevel invalidates the query
          and shouldAskLevel returns false. */}
      <LevelPickerModal
        course={levelPickerCourse}
        courseEntry={levelPickerCourse ? { level: levelPickerCourse.level } : null}
        visible={!!levelPickerCourse}
        onClose={() => {}}
      />
    </div>
  );
};

export default HoyScreen;
