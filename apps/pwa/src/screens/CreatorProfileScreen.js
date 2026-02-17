import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, useWindowDimensions, TouchableOpacity, Animated, Linking, FlatList, Modal, Pressable, ScrollView, TouchableWithoutFeedback, Platform } from 'react-native';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { firestore } from '../config/firebase';
import { ImageBackground, Image as ExpoImage } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import SvgPlay from '../components/icons/SvgPlay';
import SvgVolumeMax from '../components/icons/SvgVolumeMax';
import SvgVolumeOff from '../components/icons/SvgVolumeOff';
import SvgArrowReload from '../components/icons/SvgArrowReload';
import { FixedWakeHeader } from '../components/WakeHeader';
import BottomSpacer from '../components/BottomSpacer';
import Text from '../components/Text';
import firestoreService from '../services/firestoreService';
import profilePictureService from '../services/profilePictureService';
import exerciseHistoryService from '../services/exerciseHistoryService';
import oneRepMaxService from '../services/oneRepMaxService';
import MuscleSilhouette from '../components/MuscleSilhouette';
import { getMondayWeek, formatWeekDisplay, getWeekDates, getWeeksBetween } from '../utils/weekCalculation';
import { LineChart, BarChart, PieChart } from 'react-native-chart-kit';
import logger from '../utils/logger';
import SvgCloudOff from '../components/icons/vectors_fig/File/Cloud_Off';
import SvgChevronRight from '../components/icons/vectors_fig/Arrow/ChevronRight';
import SvgInfo from '../components/icons/SvgInfo';
import SvgListChecklist from '../components/icons/SvgListChecklist';
import SvgChat from '../components/icons/vectors_fig/Communication/Chat';
import muscleVolumeInfoService from '../services/muscleVolumeInfoService';
import { getMuscleDisplayName } from '../constants/muscles';
import { getMuscleColorForText } from '../utils/muscleColorUtils';
import { creatorProfileCache } from '../utils/cache';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../config/firebase';
import { isAdmin, isCreator } from '../utils/roleHelper';
// Only load on native — react-native-linear-gradient uses requireNativeComponent and breaks on web
const NativeLinearGradient = Platform.OS !== 'web' ? require('react-native-linear-gradient').default : null;

const TAB_CONFIG = [
  { key: 'programs', title: 'Programas' },
  { key: 'profile', title: 'Perfil' },
];

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);
const AnimatedVerticalFlatList = Animated.createAnimatedComponent(FlatList);

const StoryCard = React.memo(({ item, index, scrollValue, onLinkPress, isLast, isActive, isPerfilTabActive, storyCardSnap, storyCardSpacing = 4, styles }) => {
  const cardWidth = storyCardSnap;
  const inputRange = [
    (index - 1) * cardWidth,
    index * cardWidth,
    (index + 1) * cardWidth,
  ];

  const scale = scrollValue.interpolate({
    inputRange,
    outputRange: [0.9, 1.0, 0.9],
    extrapolate: 'clamp',
  });

  const opacity = scrollValue.interpolate({
    inputRange,
    outputRange: [0.7, 1.0, 0.7],
    extrapolate: 'clamp',
  });

  const isVideo = item.type === 'video';
  const isImage = item.type === 'image';
  const isText = item.type === 'text';
  const isLink = item.type === 'link';

  const [isPaused, setIsPaused] = useState(true);
  const [isMuted, setIsMuted] = useState(false);

  const videoSource = isVideo ? item.value : '';
  const videoPlayer = useVideoPlayer(videoSource, (player) => {
    if (player) {
      player.loop = false;
      player.muted = false;
      player.volume = 1.0;
      player.pause();
    }
  });

  useEffect(() => {
    if (!videoPlayer) return;
    videoPlayer.muted = isMuted;
  }, [isMuted, videoPlayer]);

  useEffect(() => {
    if (!videoPlayer) return;
    if (isPaused) {
      videoPlayer.pause();
    } else {
      videoPlayer.play();
    }
  }, [isPaused, videoPlayer]);

  useEffect(() => {
    if (!isVideo || !videoPlayer) {
      return;
    }
    // Pause if not on Perfil tab
    if (!isPerfilTabActive) {
      setIsPaused(true);
      videoPlayer.pause();
      videoPlayer.currentTime = 0;
      return;
    }
    // Otherwise, respect isActive state
    if (isActive) {
      setIsPaused(false);
      videoPlayer.play();
    } else {
      setIsPaused(true);
      videoPlayer.pause();
      videoPlayer.currentTime = 0;
    }
  }, [isActive, isVideo, videoPlayer, isPerfilTabActive]);

  const handleTogglePlayback = () => {
    if (!isVideo || !videoPlayer) return;
    if (isPaused) {
      videoPlayer.play();
      setIsPaused(false);
    } else {
      videoPlayer.pause();
      setIsPaused(true);
    }
  };

  const handleRestart = () => {
    if (!isVideo || !videoPlayer) return;
    videoPlayer.currentTime = 0;
    videoPlayer.play();
    setIsPaused(false);
  };

  const handleToggleMute = () => {
    if (!isVideo || !videoPlayer) return;
    videoPlayer.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handlePress = () => {
    if (isLink && item.value) {
      onLinkPress(item);
    } else if (isVideo) {
      handleTogglePlayback();
    }
  };

  if (!styles) return null;

  return (
    <Animated.View
      style={[
        styles.storyCardWrapper,
        {
          transform: [{ scale }],
          opacity,
          marginRight: isLast ? 0 : storyCardSpacing,
        },
      ]}
    >
      {item.title ? (
        <View style={styles.storyCardTitleWrapper}>
          <Text style={styles.storyCardTitleOutside} numberOfLines={2}>
            {item.title}
          </Text>
        </View>
      ) : null}

      <TouchableOpacity
        activeOpacity={isLink ? 0.85 : 1}
        onPress={isLink ? handlePress : undefined}
        style={[
          styles.storyCardBase,
          (isVideo || isImage) ? styles.storyCardMedia : styles.storyCardText,
        ]}
      >
        {isVideo && item.value && (
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleTogglePlayback}
            style={styles.storyMediaPressable}
          >
            <VideoView
              player={videoPlayer}
              style={styles.storyMedia}
              contentFit="cover"
              fullscreenOptions={{ allowed: false }}
              allowsPictureInPicture={false}
              nativeControls={false}
              showsTimecodes={false}
              playsInline
            />
            {isPaused && (
              <View style={styles.storyVideoDimmingLayer} pointerEvents="none" />
            )}
            {isPaused && (
              <View style={styles.storyPauseOverlay}>
                <SvgPlay width={48} height={48} />
              </View>
            )}
            {isPaused && (
              <View style={styles.storyVolumeContainer}>
                <TouchableOpacity
                  style={styles.storyIconButton}
                  onPress={handleToggleMute}
                  activeOpacity={0.7}
                >
                  {isMuted ? (
                    <SvgVolumeOff width={24} height={24} color="#ffffff" />
                  ) : (
                    <SvgVolumeMax width={24} height={24} color="#ffffff" />
                  )}
                </TouchableOpacity>
              </View>
            )}
            {isPaused && (
              <View style={styles.storyRestartContainer}>
                <TouchableOpacity
                  style={styles.storyIconButton}
                  onPress={handleRestart}
                  activeOpacity={0.7}
                >
                  <SvgArrowReload width={24} height={24} color="#ffffff" />
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        )}

        {isImage && item.value && (
          <ImageBackground
            source={{ uri: item.value }}
            style={styles.storyMedia}
            imageStyle={styles.storyMediaImage}
            contentFit="cover"
          />
        )}

        {(isText || isLink) && (
          <View style={styles.storyTextContent}>
            <Text
              style={styles.storyCardContent}
              numberOfLines={6}
            >
              {item.value}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
});

// Filter programs by viewer role (same logic as ProgramLibraryScreen)
function filterProgramsByViewer(programs, viewerUid, viewerRole) {
  if (!programs || programs.length === 0) return programs;
  return programs.filter((course) => {
    const courseStatus = course.status || course.estado;
    const isPublished = courseStatus === 'publicado' || courseStatus === 'published';
    if (isAdmin(viewerRole)) return true;
    if (isCreator(viewerRole)) {
      const isOwnDraft = !isPublished && course.creator_id === viewerUid;
      return isPublished || isOwnDraft;
    }
    return isPublished;
  });
}

const CreatorProfileScreen = ({ navigation, route }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { creatorId, imageUrl: initialImageUrl } = route.params || {};
  const { user: contextUser } = useAuth();
  const effectiveViewer = contextUser || auth.currentUser;
  const [imageUrl, setImageUrl] = useState(initialImageUrl || null);
  const [loading, setLoading] = useState(!initialImageUrl && !!creatorId);
  const [displayName, setDisplayName] = useState('');
  const [currentTabIndex, setCurrentTabIndex] = useState(0);
  
  // Calculate story card dimensions based on screen size
  const STORY_CARD_WIDTH = screenWidth * 0.8;
  const STORY_CARD_HEIGHT = screenHeight * 0.6;
  const STORY_CARD_SPACING = 4;
  const STORY_CARD_SNAP = STORY_CARD_WIDTH + STORY_CARD_SPACING;

  // Carousel dimensions — match Perfil story cards so Programas and Perfil feel consistent
  const CARD_MARGIN = screenWidth * 0.1;
  const CARD_WIDTH = screenWidth - (CARD_MARGIN * 2); // same as STORY_CARD_WIDTH (0.8 * screenWidth)
  const CARD_HEIGHT = STORY_CARD_HEIGHT; // same size as story cards on Perfil tab

  // Create styles with current dimensions - memoized to prevent recalculation
  const styles = useMemo(
    () => createStyles(screenWidth, screenHeight, STORY_CARD_WIDTH, STORY_CARD_HEIGHT, CARD_WIDTH, CARD_HEIGHT),
    [screenWidth, screenHeight, STORY_CARD_WIDTH, STORY_CARD_HEIGHT, CARD_WIDTH, CARD_HEIGHT],
  );
  const tabsScrollRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const tabBarMargin = 24;
  const tabIndicatorStep = useMemo(
    () => (screenWidth - 2 * tabBarMargin) / TAB_CONFIG.length,
    [screenWidth]
  );
  // Refs for each tab's ScrollView
  const perfilScrollRef = useRef(null);
  const programasScrollRef = useRef(null);
  // Track scroll positions per tab
  const tabScrollPositions = useRef({ 0: 0, 1: 0 });
  // Programas tab: snap to 3 positions (0, general section, one-on-one section) via JS
  const [generalSectionHeight, setGeneralSectionHeight] = useState(0);
  const [oneOnOneSectionHeight, setOneOnOneSectionHeight] = useState(0);
  const [creatorPrograms, setCreatorPrograms] = useState([]);
  const [programsLoading, setProgramsLoading] = useState(true);
  const [programsError, setProgramsError] = useState(null);
  const [creatorCards, setCreatorCards] = useState([]);
  const [creatorDoc, setCreatorDoc] = useState(null); // Store creator document for reuse
  const storyScrollX = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(new Animated.Value(0)).current;
  const [creatorAge, setCreatorAge] = useState(null);
  const [creatorLocation, setCreatorLocation] = useState(null);
  const muscleScrollX = useRef(new Animated.Value(0)).current;

  // General programs carousel (same style as MainScreen active programs)
  const generalPrograms = useMemo(
    () => creatorPrograms.filter(
      (p) => (p.deliveryType || p.delivery_type || 'low_ticket') !== 'one_on_one'
    ),
    [creatorPrograms]
  );
  const scrollXGeneral = useRef(new Animated.Value(0)).current;
  const [currentIndexGeneral, setCurrentIndexGeneral] = useState(0);
  const generalCarouselRef = useRef(null);

  // One-on-one programs carousel (same style as general)
  const oneOnOnePrograms = useMemo(
    () => creatorPrograms.filter(
      (p) => (p.deliveryType || p.delivery_type || 'low_ticket') === 'one_on_one'
    ),
    [creatorPrograms]
  );
  const scrollXOneOnOne = useRef(new Animated.Value(0)).current;
  const [currentIndexOneOnOne, setCurrentIndexOneOnOne] = useState(0);
  const oneOnOneCarouselRef = useRef(null);

  // OPTIMIZATION: Parallelize independent data loading with caching
  useEffect(() => {
    let isMounted = true;

    const loadAllData = async () => {
      if (!creatorId) {
        if (isMounted) {
          setLoading(false);
          setDisplayName('');
          setProgramsLoading(false);
        }
        return;
      }

      // Resolve viewer uid and role for Library-style program filtering (admin: all, creator: published + own drafts, user: published only)
      const viewerUid = effectiveViewer?.uid || null;
      let viewerRole = 'user';
      if (viewerUid) {
        try {
          const viewerDoc = await firestoreService.getUser(viewerUid);
          viewerRole = viewerDoc?.role || 'user';
        } catch {
          viewerRole = 'user';
        }
      }
      const cacheKey = `creator_${creatorId}_viewer_${viewerUid || 'anon'}`;
      const cachedData = creatorProfileCache.get(cacheKey);

      if (cachedData) {
        logger.log('📦 Using cached creator data');
        if (isMounted) {
          setImageUrl(cachedData.imageUrl);
          setDisplayName(cachedData.displayName);
          setCreatorAge(cachedData.age);
          setCreatorLocation(cachedData.location);
          setCreatorCards(cachedData.cards);
          setCreatorDoc(cachedData.creatorDoc);
          setCreatorPrograms(cachedData.programs);
          setLoading(false);
          setProgramsLoading(false);
        }
        return;
      }

      try {
        // Set loading states
        if (isMounted) {
          setLoading(true);
          setProgramsLoading(true);
          setProgramsError(null);
        }

        // OPTIMIZATION: Load creator data and programs in parallel (independent queries)
        const [creatorDocResult, programsResult] = await Promise.all([
          firestoreService.getUser(creatorId),
          (async () => {
            try {
              const coursesRef = collection(firestore, 'courses');
              const q = query(coursesRef, where('creator_id', '==', creatorId));
              const snapshot = await getDocs(q);
              return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
              }));
            } catch (error) {
              logger.error('Error loading creator programs:', error);
              throw error;
            }
          })()
        ]);

        if (!isMounted) {
          return;
        }

        // Filter programs by viewer role (same as ProgramLibraryScreen)
        const filteredPrograms = filterProgramsByViewer(programsResult, viewerUid, viewerRole);

        // Process creator data
        const creatorDoc = creatorDocResult;
        if (!isMounted) {
          return;
        }

        // Store creator document for reuse in other functions
        setCreatorDoc(creatorDoc);

        let fetchedUrl =
          creatorDoc?.profilePictureUrl ||
          creatorDoc?.image_url ||
          creatorDoc?.imageUrl ||
          null;

        if (!fetchedUrl) {
          try {
            fetchedUrl = await profilePictureService.getProfilePictureUrl(creatorId);
          } catch (imageError) {
            logger.error('Error loading creator profile picture via service:', imageError);
          }
        }

        const resolvedImage = fetchedUrl || initialImageUrl || null;
        const firstName = creatorDoc?.firstName || creatorDoc?.first_name || '';
        const lastName = creatorDoc?.lastName || creatorDoc?.last_name || '';
        const composedName = `${firstName} ${lastName}`.trim();
        const cardsMap = creatorDoc?.cards || {};
        setImageUrl(resolvedImage);
        setDisplayName(
          composedName ||
            creatorDoc?.displayName ||
            creatorDoc?.display_name ||
            creatorDoc?.name ||
            ''
        );
        const rawAge =
          creatorDoc?.age ??
          creatorDoc?.edad ??
          (typeof creatorDoc?.birthdate === 'string'
            ? creatorDoc.birthdate
            : creatorDoc?.birthDate);
        let computedAge = null;
        if (typeof rawAge === 'number') {
          computedAge = rawAge;
        } else if (typeof rawAge === 'string') {
          const parsed = parseInt(rawAge, 10);
          if (!Number.isNaN(parsed)) {
            computedAge = parsed;
          }
        }
        if (!computedAge && rawAge instanceof Date) {
          const now = new Date();
          let ageYears = now.getFullYear() - rawAge.getFullYear();
          const m = now.getMonth() - rawAge.getMonth();
          if (m < 0 || (m === 0 && now.getDate() < rawAge.getDate())) {
            ageYears--;
          }
          if (!Number.isNaN(ageYears)) {
            computedAge = ageYears;
          }
        }
        setCreatorAge(
          typeof computedAge === 'number' && !Number.isNaN(computedAge) && computedAge > 0
            ? computedAge
            : null
        );

        const city =
          creatorDoc?.city ||
          creatorDoc?.location_city ||
          creatorDoc?.location?.city ||
          creatorDoc?.ciudad ||
          null;
        const country =
          creatorDoc?.country ||
          creatorDoc?.location_country ||
          creatorDoc?.location?.country ||
          creatorDoc?.pais ||
          null;
        const locationParts = [city, country].filter(Boolean);
        setCreatorLocation(locationParts.length > 0 ? locationParts.join(', ') : null);
        const parsedCards = Object.entries(cardsMap).map(([title, value]) => ({
          id: title,
          title,
          value,
          type: detectCardType(value),
        }));
        setCreatorCards(parsedCards);

        // Set programs after filtering by viewer role (same as Library)
        setCreatorPrograms(filteredPrograms);

        // Cache the results (5 minute TTL); cache filtered programs for this viewer
        creatorProfileCache.set(cacheKey, {
          imageUrl: resolvedImage,
          displayName: composedName ||
            creatorDoc?.displayName ||
            creatorDoc?.display_name ||
            creatorDoc?.name ||
            '',
          age: typeof computedAge === 'number' && !Number.isNaN(computedAge) && computedAge > 0
            ? computedAge
            : null,
          location: locationParts.length > 0 ? locationParts.join(', ') : null,
          cards: parsedCards,
          creatorDoc: creatorDoc,
          programs: filteredPrograms,
        }, 5 * 60 * 1000); // 5 minutes TTL
        
        if (isMounted) {
          setLoading(false);
          setProgramsLoading(false);
        }
      } catch (error) {
        if (isMounted) {
          logger.error('Error loading creator profile data:', error);
          setDisplayName('');
          setProgramsError('No se pudieron cargar los programas.');
          setCreatorPrograms([]);
          setLoading(false);
          setProgramsLoading(false);
        }
      }
    };

    loadAllData();

    return () => {
      isMounted = false;
    };
  }, [creatorId, initialImageUrl, effectiveViewer?.uid]);

  const detectCardType = (rawValue) => {
    if (!rawValue || typeof rawValue !== 'string') {
      return 'text';
    }

    const value = rawValue.trim();
    if (value.startsWith('http')) {
      const videoRegex = /\.(mp4|mov|m4v|webm|m3u8)(\?|$)/i;
      const imageRegex = /\.(png|jpg|jpeg|webp|gif)(\?|$)/i;

      if (videoRegex.test(value) || value.includes('youtube') || value.includes('vimeo')) {
        return 'video';
      }
      if (imageRegex.test(value)) {
        return 'image';
      }
      return 'link';
    }
    return 'text';
  };

  // Note: loadPrograms is now handled in loadAllData above (parallelized with creator data)

  // Helper function to get time period date range
  const getTimePeriodDateRange = (period) => {
    const now = new Date();
    
    // For "all time", return a very old date
    if (period === 'alltime') {
      return { startDate: new Date(0), endDate: now };
    }
    
    const periods = {
      'month': 4,      // ~4 weeks
      '3months': 12,   // ~12 weeks  
      '6months': 24,   // ~24 weeks
      'year': 52       // ~52 weeks (12 months)
    };
    
    const weeksBack = periods[period] || 4;
    const startDate = new Date(now.getTime() - (weeksBack * 7 * 24 * 60 * 60 * 1000));
    
    return { startDate, endDate: now };
  };

  const storyCardsWithFallback = useMemo(() => {
    if (creatorCards.length === 0) {
      return [];
    }
    if (creatorCards.length === 1) {
      return creatorCards;
    }
    const first = creatorCards[0];
    const last = creatorCards[creatorCards.length - 1];
    return [last, ...creatorCards, first];
  }, [creatorCards]);
  const storyListRef = useRef(null);
  const storyIsJumpingRef = useRef(false);
  const [storyActiveIndex, setStoryActiveIndex] = useState(creatorCards.length > 1 ? 1 : 0);

  // Sync scroll position when tab changes (for header animation)
  useEffect(() => {
    const scrollRefs = [programasScrollRef, perfilScrollRef];
    const currentScrollRef = scrollRefs[currentTabIndex];
    
    if (currentScrollRef?.current) {
      // Get current scroll position and update scrollY
      const currentPosition = tabScrollPositions.current[currentTabIndex];
      scrollY.setValue(currentPosition);
    }
  }, [currentTabIndex, scrollY]);

  useEffect(() => {
    if (storyCardsWithFallback.length > 1 && storyListRef.current) {
      const jumpToMiddle = () => {
        storyIsJumpingRef.current = true;
        storyListRef.current.scrollToIndex({ index: 1, animated: false });
        storyScrollX.setValue(STORY_CARD_SNAP);
        requestAnimationFrame(() => {
          storyIsJumpingRef.current = false;
        });
      };

      jumpToMiddle();
      requestAnimationFrame(() => {
        if (storyListRef.current) {
          jumpToMiddle();
        }
      });
      setStoryActiveIndex(1);
    } else if (storyCardsWithFallback.length === 1) {
      storyScrollX.setValue(0);
      setStoryActiveIndex(0);
    }
  }, [storyCardsWithFallback.length, storyScrollX]);

  const handleStoryMomentumEnd = useCallback(
    (event) => {
      if (storyCardsWithFallback.length <= 1 || !storyListRef.current) {
        return;
      }

      const offsetX = event.nativeEvent.contentOffset.x;
      const newIndex = Math.round(offsetX / STORY_CARD_SNAP);
      const lastIndex = storyCardsWithFallback.length - 1;
      setStoryActiveIndex(newIndex);

      if (newIndex === 0 && !storyIsJumpingRef.current) {
        storyIsJumpingRef.current = true;
        storyListRef.current.scrollToIndex({ index: lastIndex - 1, animated: false });
        storyScrollX.setValue((lastIndex - 1) * STORY_CARD_SNAP);
        setStoryActiveIndex(lastIndex - 1);
        requestAnimationFrame(() => {
          storyIsJumpingRef.current = false;
        });
      } else if (newIndex === lastIndex && !storyIsJumpingRef.current) {
        storyIsJumpingRef.current = true;
        storyListRef.current.scrollToIndex({ index: 1, animated: false });
        storyScrollX.setValue(STORY_CARD_SNAP);
        setStoryActiveIndex(1);
        requestAnimationFrame(() => {
          storyIsJumpingRef.current = false;
        });
      }
    },
    [storyCardsWithFallback.length, storyScrollX]
  );

  // Chart rendering functions
  const [selectedPRDataPoint, setSelectedPRDataPoint] = useState(null);
  const [prTooltipOpacity] = useState(new Animated.Value(0));

  // Animation functions for PR tooltip
  const showPRTooltip = () => {
    Animated.timing(prTooltipOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };

  const hidePRTooltip = () => {
    Animated.timing(prTooltipOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };

  const dismissPRTooltip = () => {
    hidePRTooltip();
    setTimeout(() => setSelectedPRDataPoint(null), 200);
  };

  const renderPRProgressionChart = () => {
    if (!labStats.prHistoryData || labStats.prHistoryData.length === 0) {
      return (
        <View style={styles.chartEmptyContainer}>
          <Text style={styles.chartEmptyText}>No hay datos de PRs disponibles</Text>
        </View>
      );
    }

    // Define distinct colors for each exercise line
    const exerciseColors = [
      'rgba(191, 168, 77, 1)',   // Gold
      'rgba(255, 255, 255, 1)',  // White
      'rgba(150, 150, 150, 1)',  // Gray
    ];

    // Collect all unique dates across all exercises
    const allDates = new Set();
    labStats.prHistoryData.forEach(exerciseData => {
      exerciseData.history.forEach(entry => {
        const date = entry.date?.toDate?.() || entry.date || new Date();
        allDates.add(date.toISOString().split('T')[0]);
      });
    });

    const sortedDates = Array.from(allDates).sort();

    // Format dates for labels (show only some to avoid crowding)
    const formatDate = (dateStr) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    };

    const labels = sortedDates.map((dateStr, index) => {
      // Show every nth label to avoid crowding
      if (sortedDates.length <= 8) return formatDate(dateStr);
      const step = Math.ceil(sortedDates.length / 8);
      return index % step === 0 ? formatDate(dateStr) : '';
    });

    // Build datasets with normalized percentage change for each exercise
    const datasets = labStats.prHistoryData.map((exerciseData, exerciseIndex) => {
      // Get first non-null value as baseline for percentage calculation
      let firstValue = null;
      const rawData = sortedDates.map(dateStr => {
        const entry = exerciseData.history.find(e => {
          const entryDate = e.date?.toDate?.() || e.date || new Date();
          return entryDate.toISOString().split('T')[0] === dateStr;
        });
        if (entry && firstValue === null) {
          firstValue = entry.estimate;
        }
        return entry ? { estimate: entry.estimate, date: entry.date } : null;
      });

      // Calculate normalized percentage change (0% = first value, 100% = double the first value)
      const normalizedData = rawData.map(entry => {
        if (!entry || firstValue === null || firstValue === 0) return null;
        // Percentage change from first value: ((current - first) / first) * 100
        const percentageChange = ((entry.estimate - firstValue) / firstValue) * 100;
        return {
          percentage: percentageChange,
          originalValue: entry.estimate,
          date: entry.date,
        };
      });

      // Fill nulls with previous value for continuous line
      let lastValue = null;
      const filledData = normalizedData.map(val => {
        if (val !== null) {
          lastValue = val;
          return val.percentage;
        }
        return lastValue ? lastValue.percentage : null;
      });

      // Store original values for tooltip and labels
      const dataPointsWithValues = normalizedData.map((val, idx) => {
        if (val !== null) {
          return {
            percentage: val.percentage,
            originalValue: val.originalValue,
            date: val.date,
          };
        }
        return lastValue || null;
      });

      const baseColor = exerciseColors[exerciseIndex % exerciseColors.length];
      return {
        data: filledData,
        dataPointsWithValues, // Store original values for tooltip
        exerciseName: exerciseData.exerciseName,
        exerciseIndex,
        color: (opacity = 1) => {
          // Extract RGB values and apply opacity
          if (baseColor.includes('rgba')) {
            return baseColor.replace(/[\d.]+\)$/g, `${opacity})`);
          }
          return baseColor;
        },
        strokeWidth: 3,
      };
    });

    const chartData = {
      labels,
      datasets: datasets.map(ds => ({
        data: ds.data,
        color: ds.color,
        strokeWidth: ds.strokeWidth,
      })),
    };

    const chartConfig = {
      backgroundColor: 'transparent',
      backgroundGradientFrom: '#2a2a2a',
      backgroundGradientTo: '#2a2a2a',
      decimalPlaces: 0, // Show percentage as whole numbers
      color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
      labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
      formatYLabel: (value) => `${value}%`, // Add % to Y-axis labels
      style: {
        borderRadius: 16,
      },
      propsForDots: {
        r: '5',
        strokeWidth: '2',
      },
      propsForBackgroundLines: {
        strokeDasharray: '',
        stroke: 'rgba(255, 255, 255, 0.1)',
      },
      withInnerLines: true,
      withOuterLines: true,
      withVerticalLines: false,
      withHorizontalLines: true,
      fromZero: false,
    };

    // Chart dimensions
    const chartWidth = screenWidth - 80;
    const chartHeight = 220;

    // Get latest PR for each exercise to display in legend
    const getLatestPR = (exerciseData) => {
      if (!exerciseData.history || exerciseData.history.length === 0) return null;
      // History is already sorted by date, so the last entry is the latest
      const latest = exerciseData.history[exerciseData.history.length - 1];
      return latest.estimate;
    };

    // Handle data point click
    const handleDataPointClick = (data) => {
      // data.index is the date index in sortedDates
      // We need to find which dataset(s) have data at this index
      // For simplicity, we'll show the first dataset that has data at this index
      for (let datasetIndex = 0; datasetIndex < datasets.length; datasetIndex++) {
        const dataset = datasets[datasetIndex];
        if (dataset.dataPointsWithValues && dataset.dataPointsWithValues[data.index]) {
          const pointData = dataset.dataPointsWithValues[data.index];
          setSelectedPRDataPoint({
            index: data.index,
            datasetIndex,
            exerciseName: dataset.exerciseName,
            originalValue: pointData.originalValue,
            date: pointData.date,
            percentage: pointData.percentage,
          });
          showPRTooltip();
          break; // Show tooltip for first matching dataset
        }
      }
    };

    return (
      <TouchableWithoutFeedback onPress={dismissPRTooltip}>
        <View style={styles.chartContainer}>
          <LineChart
            data={chartData}
            width={chartWidth}
            height={chartHeight}
            chartConfig={chartConfig}
            bezier
            style={styles.chart}
            withInnerLines={true}
            withOuterLines={true}
            withVerticalLines={false}
            withHorizontalLines={true}
            withVerticalLabels={true}
            withHorizontalLabels={true}
            fromZero={false}
            verticalLabelRotation={-45}
            onDataPointClick={handleDataPointClick}
          />
          
          {/* PR Tooltip */}
          {selectedPRDataPoint && (
            <PRDataPointTooltip
              dataPoint={selectedPRDataPoint}
              opacity={prTooltipOpacity}
            />
          )}
          
          {/* Legend with latest PR weights */}
          <View style={styles.chartLegend}>
            {labStats.prHistoryData.map((exerciseData, index) => {
              const latestPR = getLatestPR(exerciseData);
              return (
                <View key={index} style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendColorBox,
                      { backgroundColor: exerciseColors[index % exerciseColors.length] },
                    ]}
                  />
                  <View style={styles.legendTextContainer}>
                    <Text style={styles.legendText}>{exerciseData.exerciseName}</Text>
                    {latestPR !== null && latestPR !== undefined && (
                      <Text style={[styles.legendPRValue, { color: exerciseColors[index % exerciseColors.length] }]}>
                        {latestPR.toFixed(1)}kg
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </TouchableWithoutFeedback>
    );
  };

  // PR Data Point Tooltip Component
  const PRDataPointTooltip = ({ dataPoint, opacity }) => {
    if (!dataPoint) return null;

    const date = dataPoint.date?.toDate?.() || dataPoint.date || new Date();
    const formattedDate = date.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

    return (
      <Animated.View style={[styles.prDataPointTooltip, { opacity }]}>
        <View style={styles.prDataPointTooltipContent}>
          <Text style={styles.prDataPointTooltipExerciseName}>{dataPoint.exerciseName}</Text>
          <Text style={styles.prDataPointTooltipDate}>{formattedDate}</Text>
          <View style={styles.prDataPointTooltipRow}>
            <Text style={styles.prDataPointTooltipLabel}>1RM Estimado:</Text>
            <Text style={styles.prDataPointTooltipValue}>{dataPoint.originalValue.toFixed(1)}kg</Text>
          </View>
        </View>
      </Animated.View>
    );
  };

  // Generate modern monochrome colors for exercises - progressive grayscale from light to dark
  const generateExerciseColor = (index) => {
    // Progressive grayscale palette - starts lightest, gets progressively darker
    const colors = [
      'rgba(255, 255, 255, 0.9)',    // Pure White (lightest)
      'rgba(230, 230, 230, 0.9)',    // Very Light Gray
      'rgba(200, 200, 200, 0.9)',    // Light Gray
      'rgba(170, 170, 170, 0.9)',    // Medium Light Gray
      'rgba(140, 140, 140, 0.9)',    // Medium Gray
      'rgba(110, 110, 110, 0.9)',    // Medium Dark Gray
      'rgba(80, 80, 80, 0.9)',       // Dark Gray
      'rgba(50, 50, 50, 0.9)',       // Very Dark Gray
      'rgba(20, 20, 20, 0.9)',       // Almost Black (darkest)
    ];
    
    return colors[index % colors.length];
  };

  // Prepare pie chart data for exercises
  const prepareExercisePieChartData = (exercises) => {
    const total = exercises.reduce((sum, ex) => sum + ex.count, 0);
    
    if (total === 0) return [];
    
    // Sort by count (most to least) and create chart data for all exercises
    return exercises.map((exercise, index) => ({
      name: exercise.name,
      population: exercise.count,
      color: generateExerciseColor(index),
      legendFontColor: '#FFFFFF',
      legendFontSize: 12
    }));
  };

  const renderTopExercisesChart = () => {
    if (!labStats.topExercises || labStats.topExercises.length === 0) {
      return (
        <View style={styles.chartEmptyContainer}>
          <Text style={styles.chartEmptyText}>No hay datos de ejercicios disponibles</Text>
        </View>
      );
    }

    const pieChartData = prepareExercisePieChartData(labStats.topExercises);
    const total = labStats.topExercises.reduce((sum, ex) => sum + ex.count, 0);
    
    // Get top 3 exercises for indicators (with percentages)
    const top3Exercises = labStats.topExercises
      .slice(0, 3)
      .map((exercise, index) => {
        const percentage = total > 0 ? ((exercise.count / total) * 100).toFixed(1) : 0;
        return {
          name: exercise.name,
          color: generateExerciseColor(index),
          percentage: percentage
        };
      });

    const chartConfig = {
      backgroundColor: 'transparent',
      backgroundGradientFrom: 'transparent',
      backgroundGradientTo: 'transparent',
      color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
      labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
      strokeWidth: 2,
      barPercentage: 0.5,
      useShadowColorFromDataset: false,
      decimalPlaces: 0,
      formatXLabel: () => '',
      formatYLabel: () => '',
    };

    return (
      <TouchableOpacity 
        style={styles.exercisePieChartContainer}
        onPress={() => setIsExerciseModalVisible(true)}
        activeOpacity={0.8}
      >
        {/* Pie Chart */}
        <View style={styles.exercisePieChartWrapper}>
          {pieChartData.length > 0 ? (
            <PieChart
              data={pieChartData}
              width={screenWidth * 0.3}
              height={140}
              chartConfig={chartConfig}
              accessor="population"
              backgroundColor="transparent"
              paddingLeft="20"
              center={[10, 10]}
              absolute
              hasLegend={false}
            />
          ) : (
            <View style={styles.noDataContainer}>
              <Text style={styles.noDataText}>No hay datos</Text>
            </View>
          )}
        </View>
        
        {/* Exercise Color Indicators */}
        <View style={styles.exerciseIndicatorsContainer}>
          {top3Exercises.length > 0 ? (
            <>
              {top3Exercises.map((exercise, index) => (
                <View key={exercise.name} style={styles.exerciseIndicatorRow}>
                  <View 
                    style={[
                      styles.exerciseColorIndicator, 
                      { backgroundColor: exercise.color }
                    ]} 
                  />
                  <Text style={styles.exerciseName}>
                    {exercise.name} ({exercise.percentage}%)
                  </Text>
                </View>
              ))}
              {/* 3 dots below the indicators */}
              <View style={styles.exerciseDotsContainer}>
                {[0, 1, 2].map((index) => (
                  <View 
                    key={index} 
                    style={styles.exerciseDot}
                  />
                ))}
              </View>
            </>
          ) : (
            <Text style={styles.noDataText}>No hay datos</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // Helper function to get period label
  const getPeriodLabel = (period) => {
    const labels = {
      'month': '1 Mes',
      '3months': '3 Meses',
      '6months': '6 Meses',
      'year': '1 Año',
      'alltime': 'Todo el historial'
    };
    return labels[period] || '1 Mes';
  };

  // Handle muscle volume info press
  const handleMuscleVolumeInfoPress = (metricKey) => {
    const info = muscleVolumeInfoService.getMuscleVolumeInfo(metricKey);
    if (info) {
      setSelectedMuscleVolumeInfo(info);
      setIsMuscleVolumeInfoModalVisible(true);
    }
  };

  // Render muscle volume list (sets per muscle group)
  const renderMuscleVolumeList = () => {
    if (!labStats.lastMonthVolume || Object.keys(labStats.lastMonthVolume).length === 0) {
      return (
        <View style={styles.muscleListContainer}>
          <Text style={styles.muscleListTitle}>Series efectivas</Text>
          <Text style={styles.muscleListSubtitle}>{getPeriodLabel(selectedPeriod)}</Text>
          <Text style={styles.muscleListEmptyText}>
            No hay datos de entrenamientos para este período.
          </Text>
        </View>
      );
    }

    // Normalize volumes to weekly averages
    const numberOfWeeks = labStats.weeksWithData || 1;
    const normalizedVolumes = Object.entries(labStats.lastMonthVolume).reduce((acc, [muscle, totalSets]) => {
      acc[muscle] = totalSets / numberOfWeeks;
      return acc;
    }, {});

    // Sort muscles by volume (highest first)
    const sortedMuscles = Object.entries(normalizedVolumes)
      .sort(([, a], [, b]) => b - a);

    const hasInfo = muscleVolumeInfoService.hasInfo('series_efectivas');

    return (
      <View style={styles.muscleListContainer}>
        <TouchableOpacity 
          style={styles.muscleListHeaderTouchable}
          onPress={() => handleMuscleVolumeInfoPress('series_efectivas')}
          disabled={!hasInfo}
          activeOpacity={hasInfo ? 0.7 : 1}
        >
          <Text style={styles.muscleListTitle}>Series efectivas</Text>
          <Text style={styles.muscleListSubtitle}>{getPeriodLabel(selectedPeriod)}</Text>
          
          {/* Info icon indicator */}
          {hasInfo && (
            <View style={styles.muscleListInfoIconContainer}>
              <SvgInfo width={14} height={14} color="rgba(255, 255, 255, 0.6)" />
            </View>
          )}
        </TouchableOpacity>
        
        <View style={styles.musclesListContainerWrapper}>
          <ScrollView 
            style={styles.musclesListScrollView}
            contentContainerStyle={styles.musclesList}
            showsVerticalScrollIndicator={false}
          >
            {sortedMuscles.map(([muscle, sets]) => {
              const textColor = getMuscleColorForText(sets);
              return (
                <View key={muscle} style={styles.muscleRow}>
                  <Text style={styles.muscleName} numberOfLines={1} ellipsizeMode="tail">{getMuscleDisplayName(muscle)}</Text>
                  <Text style={[styles.muscleVolume, { color: textColor.color, opacity: textColor.opacity }]}>
                    {sets.toFixed(1)} sets
                  </Text>
                </View>
              );
            })}
          </ScrollView>
          
          {/* Scroll indicator */}
          <View style={styles.muscleListScrollIndicator}>
            <Text style={styles.muscleListScrollIndicatorText}>Desliza</Text>
          </View>
        </View>
      </View>
    );
  };

  const handleStoryCardPress = useCallback((card) => {
    if (!card?.value) return;

    if (card.type === 'link') {
      Linking.openURL(card.value).catch((err) =>
        logger.error('Error opening link:', err)
      );
    }
  }, []);

  const renderHeroContent = () => {
    if (loading) {
      return (
        <View style={[styles.heroImage, styles.heroPlaceholder]}>
          <ActivityIndicator size="large" color="#ffffff" />
        </View>
      );
    }

    if (imageUrl) {
      return (
        <View style={styles.heroImage}>
          <ExpoImage
            source={{ uri: imageUrl }}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
          />
          {Platform.OS === 'web' ? (
            <View
              style={[
                { pointerEvents: 'none' },
                styles.heroGradientBottom,
                {
                  backgroundImage: 'linear-gradient(to top, #1a1a1a 0%, rgba(26,26,26,0.7) 45%, transparent 100%)',
                },
              ]}
            />
          ) : (
            <NativeLinearGradient
              colors={['transparent', 'rgba(26, 26, 26, 0.7)', '#1a1a1a']}
              locations={[0, 0.45, 1]}
              style={[styles.heroGradientBottom, { pointerEvents: 'none' }]}
              start={{ x: 0.5, y: 1 }}
              end={{ x: 0.5, y: 0 }}
            />
          )}
        </View>
      );
    }

    return (
      <View style={[styles.heroImage, styles.heroPlaceholder]}>
        <Text style={styles.placeholderText}>Sin foto</Text>
      </View>
    );
  };

  const MAX_HERO_HEIGHT = 320;
  const MIN_HERO_HEIGHT = 100;
  // Must fit: fixedTabBar paddingTop (16) + tabHeaderContainer (paddingVertical 8*2 + minHeight 44) + underline (2) = 78
  const TAB_BAR_HEIGHT = 80;
  const MAX_HEADER_HEIGHT = MAX_HERO_HEIGHT + TAB_BAR_HEIGHT;
  const MIN_HEADER_HEIGHT = MIN_HERO_HEIGHT + TAB_BAR_HEIGHT;
  const SCROLL_THRESHOLD = 200; // Distance to scroll before fully shrunk (increased for smoother animation)
  // Tuned so (1) at scrollY=0 card top is 72px below header bottom; (2) at first snap cards stay at same viewport position
  const PROGRAMAS_SNAP_TOP_OFFSET = -200;
  // Minimum scroll when at "top" — higher value = card fixates higher (no size changes, just scroll position)
  const PROGRAMAS_SNAP_TOP_MIN = 0;
  // Reduce scroll to "one on one" snap — higher value = less space between generales and one-on-one fixations (one on one cards sit higher)
  const PROGRAMAS_SNAP_SECOND_OFFSET = -70;
  // Indicator-only: shift when it switches relative to card snap (tune so indicator matches what you see)
  const PROGRAMAS_INDICATOR_FIRST_OFFSET = 0; // add to first: positive = indicator switches to one-on-one later
  const PROGRAMAS_INDICATOR_SECOND_OFFSET = 0; // add to second: positive = need to scroll more before indicator shows one-on-one
  const PROGRAMAS_INDICATOR_SEGMENT_HEIGHT = 44;
  const PROGRAMAS_INDICATOR_PADDING = 8;
  const PROGRAMAS_INDICATOR_PEEK = 28;
  const PROGRAMAS_INDICATOR_SLIDE_DISTANCE = PROGRAMAS_INDICATOR_PADDING + PROGRAMAS_INDICATOR_SEGMENT_HEIGHT - PROGRAMAS_INDICATOR_PEEK;
  const hasGeneralPrograms = generalPrograms.length > 0;
  const hasOneOnOnePrograms = oneOnOnePrograms.length > 0;
  const showProgramasScrollIndicator = hasGeneralPrograms && hasOneOnOnePrograms;

  const programasSnapOffsets = useMemo(() => {
    const first = MAX_HEADER_HEIGHT + PROGRAMAS_SNAP_TOP_OFFSET;
    if (hasGeneralPrograms) {
      const second = first + generalSectionHeight - PROGRAMAS_SNAP_SECOND_OFFSET;
      return [PROGRAMAS_SNAP_TOP_MIN, first, second];
    }
    if (hasOneOnOnePrograms && oneOnOneSectionHeight > 0) {
      const second = first + oneOnOneSectionHeight - PROGRAMAS_SNAP_SECOND_OFFSET;
      return [PROGRAMAS_SNAP_TOP_MIN, first, second];
    }
    return [PROGRAMAS_SNAP_TOP_MIN, first];
  }, [hasGeneralPrograms, hasOneOnOnePrograms, generalSectionHeight, oneOnOneSectionHeight]);

  const heroHeight = scrollY.interpolate({
    inputRange: [0, SCROLL_THRESHOLD],
    outputRange: [MAX_HERO_HEIGHT, MIN_HERO_HEIGHT],
    extrapolate: 'clamp',
  });

  const headerHeight = scrollY.interpolate({
    inputRange: [0, SCROLL_THRESHOLD],
    outputRange: [MAX_HEADER_HEIGHT, MIN_HEADER_HEIGHT],
    extrapolate: 'clamp',
  });

  const handleGeneralCarouselScroll = (e) => {
    const x = e.nativeEvent.contentOffset.x;
    const index = Math.round(x / CARD_WIDTH);
    const clamped = Math.max(0, Math.min(index, generalPrograms.length - 1));
    if (clamped !== currentIndexGeneral) setCurrentIndexGeneral(clamped);
  };

  const renderGeneralProgramCard = ({ item: program, index }) => {
    const cardWidth = CARD_WIDTH;
    const inputRange = [
      (index - 1) * cardWidth,
      index * cardWidth,
      (index + 1) * cardWidth,
    ];
    const scale = scrollXGeneral.interpolate({
      inputRange,
      outputRange: [0.85, 1.0, 0.85],
      extrapolate: 'clamp',
    });
    const opacity = scrollXGeneral.interpolate({
      inputRange,
      outputRange: [0.5, 1.0, 0.5],
      extrapolate: 'clamp',
    });
    const distanceFromCenter = Math.abs(index - currentIndexGeneral);
    const cardZIndex = distanceFromCenter === 0 ? 10 : distanceFromCenter === 1 ? 5 : 0;
    const imageUrl = program.image_url || program.imageUrl || null;

    const cardStyle = {
      transform: [{ scale }],
      opacity,
      alignSelf: 'center',
      elevation: cardZIndex,
      zIndex: cardZIndex,
    };

    const onPress = () => navigation.navigate('CourseDetail', { course: program });

    if (imageUrl) {
      return (
        <Animated.View style={[styles.generalCarouselCard, cardStyle]}>
          <View style={styles.generalCarouselCardContentWithImage}>
            <ExpoImage
              source={{ uri: imageUrl }}
              style={styles.generalCarouselCardBackgroundImage}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
            <TouchableOpacity style={styles.generalCarouselCardOverlay} onPress={onPress} activeOpacity={1}>
              <Text style={styles.generalCarouselCardTitle} numberOfLines={2}>
                {program.title || 'Programa'}
              </Text>
              <Text style={styles.generalCarouselCardSubtitle}>
                {program.discipline || 'Disciplina general'}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      );
    }
    return (
      <Animated.View style={[styles.generalCarouselCard, cardStyle]}>
        <TouchableOpacity style={styles.generalCarouselCardContent} onPress={onPress} activeOpacity={0.9}>
          <SvgCloudOff width={40} height={40} stroke="#ffffff" strokeWidth={1.5} />
          <Text style={styles.generalCarouselCardTitle} numberOfLines={2}>
            {program.title || 'Programa'}
          </Text>
          <Text style={styles.generalCarouselCardSubtitle}>
            {program.discipline || 'Disciplina general'}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // Same pagination indicators as MainScreen (dots below cards)
  const renderGeneralCarouselPagination = () => {
    const cardWidth = CARD_WIDTH;
    return (
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
        {generalPrograms.map((_, index) => {
          const inputRange = [
            (index - 1) * cardWidth,
            index * cardWidth,
            (index + 1) * cardWidth,
          ];
          const opacity = scrollXGeneral.interpolate({
            inputRange,
            outputRange: [0.3, 1.0, 0.3],
            extrapolate: 'clamp',
          });
          const scale = scrollXGeneral.interpolate({
            inputRange,
            outputRange: [0.8, 1.3, 0.8],
            extrapolate: 'clamp',
          });
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
  };

  const handleOneOnOneCarouselScroll = (e) => {
    const x = e.nativeEvent.contentOffset.x;
    const index = Math.round(x / CARD_WIDTH);
    const clamped = Math.max(0, Math.min(index, oneOnOnePrograms.length - 1));
    if (clamped !== currentIndexOneOnOne) setCurrentIndexOneOnOne(clamped);
  };

  // Snap Programas scroll to one of 3 positions. Indicator: full size while scrolling or not snapped, smaller and closer to right when settled at a snap.
  const PROGRAMAS_SCROLL_SETTLE_MS = 300;
  const PROGRAMAS_SNAP_THRESHOLD_PX = 6;

  const programasSnappingRef = useRef(false);
  const programasScrollEndTimeoutRef = useRef(null);
  const lastProgramasScrollYRef = useRef(0);
  const programasIndicatorIsSmallRef = useRef(true);

  const programasIndicatorScaleRef = useRef(new Animated.Value(0)).current;

  const isAtProgramasSnapPoint = useCallback((y) => {
    const points = programasSnapOffsets;
    return points.length > 0 && points.some((p) => Math.abs(p - y) < PROGRAMAS_SNAP_THRESHOLD_PX);
  }, [programasSnapOffsets]);

  const applyProgramasSnap = useCallback((y) => {
    if (programasSnappingRef.current) return;
    const points = programasSnapOffsets;
    if (points.length === 0) return;
    const nearest = points.reduce((prev, curr) =>
      Math.abs(curr - y) < Math.abs(prev - y) ? curr : prev
    );
    if (Math.abs(nearest - y) < 2) return;
    programasSnappingRef.current = true;
    tabScrollPositions.current[0] = nearest;
    if (currentTabIndex === 0) scrollY.setValue(nearest);
    programasScrollRef.current?.scrollTo({
      y: nearest,
      animated: Platform.OS !== 'web',
    });
    setTimeout(() => { programasSnappingRef.current = false; }, 400);
  }, [programasSnapOffsets, currentTabIndex]);

  const handleProgramasScrollEnd = useCallback((e) => {
    const y = e.nativeEvent.contentOffset.y;
    lastProgramasScrollYRef.current = y;
    applyProgramasSnap(y);
  }, [applyProgramasSnap]);

  const handleProgramasScrollBeginDrag = useCallback(() => {
    if (programasScrollEndTimeoutRef.current) {
      clearTimeout(programasScrollEndTimeoutRef.current);
      programasScrollEndTimeoutRef.current = null;
    }
    if (programasIndicatorIsSmallRef.current) {
      programasIndicatorIsSmallRef.current = false;
      Animated.timing(programasIndicatorScaleRef, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [programasIndicatorScaleRef]);

  const handleProgramasScroll = useCallback((e) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    lastProgramasScrollYRef.current = offsetY;
    tabScrollPositions.current[0] = offsetY;
    if (currentTabIndex === 0) scrollY.setValue(offsetY);

    if (programasIndicatorIsSmallRef.current) {
      programasIndicatorIsSmallRef.current = false;
      Animated.timing(programasIndicatorScaleRef, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }

    if (programasScrollEndTimeoutRef.current) clearTimeout(programasScrollEndTimeoutRef.current);
    programasScrollEndTimeoutRef.current = setTimeout(() => {
      programasScrollEndTimeoutRef.current = null;
      const y = lastProgramasScrollYRef.current;
      if (isAtProgramasSnapPoint(y)) {
        programasIndicatorIsSmallRef.current = true;
        Animated.timing(programasIndicatorScaleRef, { toValue: 0, duration: 250, useNativeDriver: true }).start();
      } else {
        applyProgramasSnap(y);
      }
    }, PROGRAMAS_SCROLL_SETTLE_MS);
  }, [currentTabIndex, applyProgramasSnap, isAtProgramasSnapPoint, programasIndicatorScaleRef]);

  useEffect(() => {
    return () => {
      if (programasScrollEndTimeoutRef.current) clearTimeout(programasScrollEndTimeoutRef.current);
    };
  }, []);

  const renderOneOnOneProgramCard = ({ item: program, index }) => {
    const cardWidth = CARD_WIDTH;
    const inputRange = [
      (index - 1) * cardWidth,
      index * cardWidth,
      (index + 1) * cardWidth,
    ];
    const scale = scrollXOneOnOne.interpolate({
      inputRange,
      outputRange: [0.85, 1.0, 0.85],
      extrapolate: 'clamp',
    });
    const opacity = scrollXOneOnOne.interpolate({
      inputRange,
      outputRange: [0.5, 1.0, 0.5],
      extrapolate: 'clamp',
    });
    const distanceFromCenter = Math.abs(index - currentIndexOneOnOne);
    const cardZIndex = distanceFromCenter === 0 ? 10 : distanceFromCenter === 1 ? 5 : 0;
    const imageUrl = program.image_url || program.imageUrl || null;

    const cardStyle = {
      transform: [{ scale }],
      opacity,
      alignSelf: 'center',
      elevation: cardZIndex,
      zIndex: cardZIndex,
    };

    const onPress = () => navigation.navigate('CourseDetail', { course: program });

    if (imageUrl) {
      return (
        <Animated.View style={[styles.generalCarouselCard, cardStyle]}>
          <View style={styles.generalCarouselCardContentWithImage}>
            <ExpoImage
              source={{ uri: imageUrl }}
              style={styles.generalCarouselCardBackgroundImage}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
            <TouchableOpacity style={styles.generalCarouselCardOverlay} onPress={onPress} activeOpacity={1}>
              <Text style={styles.generalCarouselCardTitle} numberOfLines={2}>
                {program.title || 'Programa'}
              </Text>
              <Text style={styles.generalCarouselCardSubtitle}>
                {program.discipline || 'Disciplina general'}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      );
    }
    return (
      <Animated.View style={[styles.generalCarouselCard, cardStyle]}>
        <TouchableOpacity style={styles.generalCarouselCardContent} onPress={onPress} activeOpacity={0.9}>
          <SvgCloudOff width={40} height={40} stroke="#ffffff" strokeWidth={1.5} />
          <Text style={styles.generalCarouselCardTitle} numberOfLines={2}>
            {program.title || 'Programa'}
          </Text>
          <Text style={styles.generalCarouselCardSubtitle}>
            {program.discipline || 'Disciplina general'}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderOneOnOneCarouselPagination = () => {
    const cardWidth = CARD_WIDTH;
    return (
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
        {oneOnOnePrograms.map((_, index) => {
          const inputRange = [
            (index - 1) * cardWidth,
            index * cardWidth,
            (index + 1) * cardWidth,
          ];
          const opacity = scrollXOneOnOne.interpolate({
            inputRange,
            outputRange: [0.3, 1.0, 0.3],
            extrapolate: 'clamp',
          });
          const scale = scrollXOneOnOne.interpolate({
            inputRange,
            outputRange: [0.8, 1.3, 0.8],
            extrapolate: 'clamp',
          });
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
  };

  return (
    <View style={styles.container}>
      {/* Fixed Header: Hero Image + Tab Bar */}
      <Animated.View 
        style={[
          styles.fixedHeader, 
          { 
            height: headerHeight,
            overflow: 'hidden',
          }
        ]}
      >
        <Animated.View 
          style={[
            styles.heroContainer, 
            { 
              height: heroHeight,
            }
          ]}
        >
          {renderHeroContent()}
        </Animated.View>
        <View style={styles.fixedTabBar}>
          <View style={styles.tabHeaderContainer}>
            {/* Thin underline indicator (Library style) */}
            <Animated.View
              style={[
                styles.tabIndicatorUnderline,
                {
                  width: tabIndicatorStep,
                  transform: [
                    {
                      translateX: scrollX.interpolate({
                        inputRange: [0, screenWidth],
                        outputRange: [0, tabIndicatorStep],
                        extrapolate: 'clamp',
                      }),
                    },
                  ],
                },
              ]}
            />
            {TAB_CONFIG.map((tab, index) => {
              const tabOpacity = scrollX.interpolate({
                inputRange: [0, screenWidth],
                outputRange: index === 0 ? [1, 0.45] : [0.45, 1],
                extrapolate: 'clamp',
              });
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={styles.tabButton}
                  activeOpacity={0.7}
                  onPress={() => {
                    setCurrentTabIndex(index);
                    if (tabsScrollRef.current) {
                      tabsScrollRef.current.scrollTo({ x: index * screenWidth, animated: true });
                    }
                    const scrollRefs = [programasScrollRef, perfilScrollRef];
                    const newScrollRef = scrollRefs[index];
                    if (newScrollRef?.current) {
                      setTimeout(() => {
                        newScrollRef.current.scrollTo({
                          y: tabScrollPositions.current[index],
                          animated: false,
                        });
                        scrollY.setValue(tabScrollPositions.current[index]);
                      }, 50);
                    }
                  }}
                >
                  <Animated.Text style={[styles.tabTitle, { opacity: tabOpacity }]}>
                    {tab.title}
                  </Animated.Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Animated.View>

      {/* Horizontal Tab Pager */}
      <View style={styles.tabPagerContainer}>
        <Animated.ScrollView
          ref={tabsScrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => {
            const newIndex = Math.round(event.nativeEvent.contentOffset.x / screenWidth);
            if (newIndex !== currentTabIndex) {
              setCurrentTabIndex(newIndex);
              // Restore scroll position for the new tab
              const scrollRef = [programasScrollRef, perfilScrollRef][newIndex];
              if (scrollRef?.current) {
                scrollRef.current.scrollTo({
                  y: tabScrollPositions.current[newIndex],
                  animated: false,
                });
                // Update scrollY to match the new tab's position
                scrollY.setValue(tabScrollPositions.current[newIndex]);
              }
            }
          }}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: false }
          )}
          scrollEventThrottle={16}
        >
          {/* Tab 0: Programas */}
          <ScrollView
            ref={programasScrollRef}
            style={[styles.tabScrollView, { width: screenWidth }]}
            contentContainerStyle={[
              styles.tabScrollContent,
              { paddingTop: MAX_HEADER_HEIGHT },
            ]}
            showsVerticalScrollIndicator={false}
            decelerationRate="fast"
            onScroll={handleProgramasScroll}
            onScrollBeginDrag={handleProgramasScrollBeginDrag}
            onScrollEndDrag={handleProgramasScrollEnd}
            onMomentumScrollEnd={handleProgramasScrollEnd}
            scrollEventThrottle={16}
          >
            <View style={[styles.tabPageContent, { paddingTop: 8 }]}>
              {programsLoading ? (
                <View style={styles.programsLoadingContainer}>
                  <ActivityIndicator size="large" color="#ffffff" />
                  <Text style={styles.programsLoadingText}>Cargando programas...</Text>
                </View>
              ) : programsError ? (
                <Text style={styles.programsErrorText}>{programsError}</Text>
              ) : creatorPrograms.length === 0 ? (
                <Text style={styles.programsEmptyText}>
                  Este creador no tiene programas disponibles actualmente.
                </Text>
              ) : (
                <>
                  {hasGeneralPrograms && (
                    <View
                      style={[styles.generalCarouselSection, styles.programSectionFirst]}
                      onLayout={(e) => {
                        const h = e.nativeEvent.layout.height;
                        if (h > 0) setGeneralSectionHeight(h);
                      }}
                    >
                      <View style={styles.programSectionTitleWrapper}>
                        <Text style={styles.programSectionTitleText}>Programas generales</Text>
                        <SvgListChecklist width={16} height={16} color="#ffffff" style={styles.programSectionTitleIcon} />
                      </View>
                      <View style={styles.generalCarouselFullBleed}>
                        <View style={styles.generalCarouselSwipeableContainer}>
                          <View style={styles.generalCarouselInner}>
                            <View style={styles.generalCarouselWrapper}>
                              <Animated.FlatList
                                ref={generalCarouselRef}
                                data={generalPrograms}
                                renderItem={renderGeneralProgramCard}
                                keyExtractor={(item, index) => item.id || `gen-${index}`}
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                snapToInterval={CARD_WIDTH}
                                snapToAlignment="center"
                                decelerationRate="fast"
                                contentContainerStyle={styles.generalCarouselListContent}
                                ItemSeparatorComponent={() => <View style={styles.generalCarouselCardSeparator} />}
                                onScroll={Animated.event(
                                  [{ nativeEvent: { contentOffset: { x: scrollXGeneral } } }],
                                  { useNativeDriver: false }
                                )}
                                onScrollEndDrag={handleGeneralCarouselScroll}
                                onMomentumScrollEnd={handleGeneralCarouselScroll}
                                scrollEventThrottle={16}
                                style={styles.generalCarouselListStyle}
                                getItemLayout={(_, index) => ({
                                  length: CARD_WIDTH,
                                  offset: CARD_WIDTH * index,
                                  index,
                                })}
                                initialNumToRender={2}
                                maxToRenderPerBatch={3}
                                windowSize={5}
                                removeClippedSubviews={true}
                                updateCellsBatchingPeriod={50}
                              />
                              <View style={styles.generalCarouselPagination}>
                                {renderGeneralCarouselPagination()}
                              </View>
                            </View>
                          </View>
                        </View>
                      </View>
                    </View>
                  )}
                  {hasOneOnOnePrograms && (
                    <View
                      style={[styles.generalCarouselSection, hasGeneralPrograms ? styles.programSectionNext : styles.programSectionFirst]}
                      onLayout={(e) => {
                        const h = e.nativeEvent.layout.height;
                        if (h > 0) setOneOnOneSectionHeight(h);
                      }}
                    >
                      <View style={styles.programSectionTitleWrapper}>
                        <Text style={styles.programSectionTitleText}>Asesorías</Text>
                        <SvgChat width={16} height={16} stroke="#ffffff" strokeWidth={2} style={styles.programSectionTitleIcon} />
                      </View>
                      <View style={styles.generalCarouselFullBleed}>
                        <View style={styles.generalCarouselSwipeableContainer}>
                          <View style={styles.generalCarouselInner}>
                            <View style={styles.generalCarouselWrapper}>
                              <Animated.FlatList
                                ref={oneOnOneCarouselRef}
                                data={oneOnOnePrograms}
                                renderItem={renderOneOnOneProgramCard}
                                keyExtractor={(item, index) => item.id || `1on1-${index}`}
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                snapToInterval={CARD_WIDTH}
                                snapToAlignment="center"
                                decelerationRate="fast"
                                contentContainerStyle={styles.generalCarouselListContent}
                                ItemSeparatorComponent={() => <View style={styles.generalCarouselCardSeparator} />}
                                onScroll={Animated.event(
                                  [{ nativeEvent: { contentOffset: { x: scrollXOneOnOne } } }],
                                  { useNativeDriver: false }
                                )}
                                onScrollEndDrag={handleOneOnOneCarouselScroll}
                                onMomentumScrollEnd={handleOneOnOneCarouselScroll}
                                scrollEventThrottle={16}
                                style={styles.generalCarouselListStyle}
                                getItemLayout={(_, index) => ({
                                  length: CARD_WIDTH,
                                  offset: CARD_WIDTH * index,
                                  index,
                                })}
                                initialNumToRender={2}
                                maxToRenderPerBatch={3}
                                windowSize={5}
                                removeClippedSubviews={true}
                                updateCellsBatchingPeriod={50}
                              />
                              <View style={styles.generalCarouselPagination}>
                                {renderOneOnOneCarouselPagination()}
                              </View>
                            </View>
                          </View>
                        </View>
                      </View>
                    </View>
                  )}
                </>
              )}
              <BottomSpacer />
            </View>
          </ScrollView>

          {/* Tab 1: Perfil */}
          <ScrollView
            ref={perfilScrollRef}
            style={[styles.tabScrollView, { width: screenWidth }]}
            contentContainerStyle={[
              styles.tabScrollContent,
              { paddingTop: MAX_HEADER_HEIGHT },
            ]}
            showsVerticalScrollIndicator={false}
            onScroll={(event) => {
              const offsetY = event.nativeEvent.contentOffset.y;
              tabScrollPositions.current[1] = offsetY;
              if (currentTabIndex === 1) {
                scrollY.setValue(offsetY);
              }
            }}
            scrollEventThrottle={8}
          >
            <View style={styles.tabPageContent}>
                  <View style={styles.titleSection}>
                    <Text style={styles.screenTitle}>
                      {displayName || 'Creador'}
                    </Text>
                  {(creatorAge || creatorLocation) && (
                    <View style={styles.creatorMetaContainer}>
                      {creatorAge ? (
                        <View style={styles.creatorMetaPill}>
                          <Text style={styles.creatorMetaText}>
                            {`${creatorAge} años`}
                          </Text>
                        </View>
                      ) : null}
                      {creatorLocation ? (
                        <View style={styles.creatorMetaPill}>
                          <Text style={styles.creatorMetaText}>
                            {creatorLocation}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  )}
                  </View>
                  {storyCardsWithFallback.length > 0 && (
                    <View style={styles.storyCardsSection}>
                      <AnimatedFlatList
                        ref={storyListRef}
                        data={storyCardsWithFallback}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        snapToInterval={STORY_CARD_SNAP}
                        decelerationRate="fast"
                        contentContainerStyle={styles.storyScrollContent}
                        onScroll={Animated.event(
                          [{ nativeEvent: { contentOffset: { x: storyScrollX } } }],
                          { useNativeDriver: Platform.OS !== 'web' }
                        )}
                        scrollEventThrottle={16}
                        onMomentumScrollEnd={handleStoryMomentumEnd}
                        keyExtractor={(item, index) =>
                          `${item?.id || item?.title || 'card'}-${index}`
                        }
                        renderItem={({ item, index }) => (
                          <StoryCard
                            item={item}
                            index={index}
                            isLast={index === storyCardsWithFallback.length - 1}
                            scrollValue={storyScrollX}
                            onLinkPress={handleStoryCardPress}
                            storyCardSnap={STORY_CARD_SNAP}
                            storyCardSpacing={STORY_CARD_SPACING}
                            styles={styles}
                            isActive={index === storyActiveIndex}
                            isPerfilTabActive={currentTabIndex === 1}
                          />
                        )}
                        getItemLayout={(_, index) => ({
                          length: STORY_CARD_SNAP,
                          offset: STORY_CARD_SNAP * index,
                          index,
                        })}
                        initialScrollIndex={storyCardsWithFallback.length > 1 ? 1 : 0}
                        removeClippedSubviews={true}
                        maxToRenderPerBatch={5}
                        windowSize={5}
                        initialNumToRender={3}
                        onScrollToIndexFailed={(info) => {
                          const safeIndex = Math.min(
                            info.index,
                            Math.max(storyCardsWithFallback.length - 1, 0)
                          );
                          requestAnimationFrame(() => {
                            const targetOffset = safeIndex * STORY_CARD_SNAP;
                            const list = storyListRef.current;
                            if (!list) {
                              return;
                            }
                            const tryScrollToIndex = () => {
                              try {
                                list.scrollToIndex({
                                  index: safeIndex,
                                  animated: false,
                                });
                              } catch (error) {
                                list.scrollToOffset({
                                  offset: targetOffset,
                                  animated: false,
                                });
                              }
                            };
                            requestAnimationFrame(tryScrollToIndex);
                          });
                        }}
                      />
                    </View>
                  )}
              <BottomSpacer />
            </View>
          </ScrollView>
        </Animated.ScrollView>
      </View>

      {/* Programas vertical scroll indicator: visible only when both sections exist and Programas tab is in view */}
      {showProgramasScrollIndicator && programasSnapOffsets.length >= 3 && (() => {
        const snapTop = programasSnapOffsets[0];
        const snapFirstCard = programasSnapOffsets[1];
        const snapSecondCard = programasSnapOffsets.length >= 3 ? programasSnapOffsets[2] : programasSnapOffsets[1];
        // Indicator uses same snap logic + optional offsets so it can be tuned to match visual without changing card snap
        const snapFirst = snapFirstCard + PROGRAMAS_INDICATOR_FIRST_OFFSET;
        const snapSecond = snapSecondCard + PROGRAMAS_INDICATOR_SECOND_OFFSET;
        // Three-point range so segment 0 stays focused from top through first; only first→second transitions
        const inputRange = [snapTop, snapFirst, snapSecond];
        const scaleFocused = 1.15;
        const scaleUnfocused = 0.82;
        const opacityFocused = 1;
        const opacityUnfocused = 0.35;
        return (
          <Animated.View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              opacity: scrollX.interpolate({
                inputRange: [0, screenWidth * 0.4, screenWidth],
                outputRange: [1, 0, 0],
                extrapolate: 'clamp',
              }),
            }}
            pointerEvents="none"
          >
          <Animated.View
            style={[
              styles.programasScrollIndicatorContainer,
              {
                right: programasIndicatorScaleRef.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-5, 12],
                  extrapolate: 'clamp',
                }),
                transform: [
                  {
                    scale: programasIndicatorScaleRef.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.6, 1],
                      extrapolate: 'clamp',
                    }),
                  },
                ],
              },
            ]}
            pointerEvents="none"
          >
            <View style={[styles.programasScrollIndicatorCard, Platform.OS === 'web' && styles.programasScrollIndicatorCardWeb]}>
              <View style={styles.programasScrollIndicatorWindow}>
                <Animated.View
                  style={[
                    styles.programasScrollIndicatorContent,
                    {
                      transform: [
                        {
                          translateY: scrollY.interpolate({
                            inputRange,
                            outputRange: [0, 0, -PROGRAMAS_INDICATOR_SLIDE_DISTANCE],
                            extrapolate: 'clamp',
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <View style={styles.programasScrollIndicatorSpacer} />
                  <Animated.View
                    style={[
                      styles.programasScrollIndicatorSegment,
                      {
                        opacity: scrollY.interpolate({
                          inputRange,
                          outputRange: [opacityFocused, opacityFocused, opacityUnfocused],
                          extrapolate: 'clamp',
                        }),
                        transform: [
                          {
                            scale: scrollY.interpolate({
                              inputRange,
                              outputRange: [scaleFocused, scaleFocused, scaleUnfocused],
                              extrapolate: 'clamp',
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    <SvgListChecklist width={20} height={20} color="rgba(255,255,255,0.95)" />
                  </Animated.View>
                  <Animated.View
                    style={[
                      styles.programasScrollIndicatorSegment,
                      {
                        opacity: scrollY.interpolate({
                          inputRange,
                          outputRange: [opacityUnfocused, opacityUnfocused, opacityFocused],
                          extrapolate: 'clamp',
                        }),
                        transform: [
                          {
                            scale: scrollY.interpolate({
                              inputRange,
                              outputRange: [scaleUnfocused, scaleUnfocused, scaleFocused],
                              extrapolate: 'clamp',
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    <View style={styles.programasScrollIndicatorIconWrap}>
                      <SvgChat width={20} height={20} stroke="rgba(255,255,255,0.95)" strokeWidth={2} />
                    </View>
                  </Animated.View>
                  <View style={styles.programasScrollIndicatorSpacer} />
                </Animated.View>
              </View>
            </View>
          </Animated.View>
          </Animated.View>
        );
      })()}

      <FixedWakeHeader
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
        backgroundColor="transparent"
      />
    </View>
  );
};

const createStyles = (screenWidth, screenHeight, STORY_CARD_WIDTH, STORY_CARD_HEIGHT, CARD_WIDTH = screenWidth * 0.8, CARD_HEIGHT = 320) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  fixedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
  },
  programasScrollIndicatorContainer: {
    position: 'absolute',
    top: '50%',
    right: 12,
    marginTop: -60,
    zIndex: 8,
  },
  programasScrollIndicatorCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    paddingVertical: 16,
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  programasScrollIndicatorCardWeb: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
  },
  programasScrollIndicatorWindow: {
    height: 88,
    width: 40,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingBottom: 4,
  },
  programasScrollIndicatorContent: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  programasScrollIndicatorSpacer: {
    height: 8,
    width: 40,
  },
  programasScrollIndicatorSegment: {
    height: 44,
    width: 40,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  programasScrollIndicatorIconWrap: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fixedTabBar: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 24,
    paddingTop: 16,
    marginBottom: 15,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  heroContainer: {
    width: '100%',
    backgroundColor: '#1f1f1f',
    overflow: 'hidden',
    position: 'relative',
  },
  heroImageLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 0,
  },
  heroImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  heroImageStyle: {
    resizeMode: 'cover',
  },
  heroPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    paddingVertical: 8,
    minHeight: 44,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    zIndex: 1,
  },
  tabTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500',
  },
  tabIndicatorUnderline: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
  },
  tabPagerContainer: {
    flex: 1,
  },
  tabScrollView: {
    flex: 1,
  },
  tabScrollContent: {
    paddingBottom: 32,
  },
  tabPageContent: {
    paddingHorizontal: 24,
    paddingVertical: 24,
    gap: 12,
  },
  tabPageText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.75)',
    lineHeight: 22,
  },
  labHeaderContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 0,
  },
  labHeaderSpacer: {
    flex: 1,
  },
  periodSelectorButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  periodSelectorButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginRight: Math.max(4, screenWidth * 0.01),
  },
  periodSelectorArrow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
  },
  periodModalContent: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(16, screenWidth * 0.04),
    width: '100%',
    maxWidth: Math.min(screenWidth * 0.9, 400),
    maxHeight: Math.max(400, screenHeight * 0.6),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 10,
  },
  periodModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    paddingVertical: Math.max(16, screenHeight * 0.02),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  periodModalTitle: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.05, 20),
    fontWeight: '600',
    flex: 1,
  },
  periodModalCloseButton: {
    width: Math.max(30, screenWidth * 0.075),
    height: Math.max(30, screenWidth * 0.075),
    borderRadius: Math.max(15, screenWidth * 0.037),
    backgroundColor: '#44454B',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Math.max(12, screenWidth * 0.03),
  },
  periodModalCloseButtonText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
  },
  periodModalScrollView: {
    maxHeight: Math.max(300, screenHeight * 0.4),
  },
  periodModalItem: {
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    paddingVertical: Math.max(16, screenHeight * 0.02),
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'transparent',
  },
  periodModalItemSelected: {
    backgroundColor: 'rgba(191, 168, 77, 0.1)',
  },
  periodModalItemLast: {
    borderBottomWidth: 0,
  },
  periodModalItemText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '500',
    flex: 1,
  },
  periodModalItemTextSelected: {
    color: 'rgba(191, 168, 77, 1)',
    fontWeight: '600',
  },
  periodModalCheckmark: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
    marginLeft: 8,
  },
  labLoadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  labLoadingText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    marginTop: 12,
  },
  labStatCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    position: 'relative',
  },
  labStatCardNoPadding: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    padding: 0,
    marginBottom: 16,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    overflow: 'visible',
  },
  exerciseInfoIconContainer: {
    position: 'absolute',
    top: Math.max(16, screenHeight * 0.02),
    right: Math.max(16, screenWidth * 0.04),
    zIndex: 10,
  },
  labStatCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  labStatLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '500',
    flex: 1,
  },
  prInfoIconContainer: {
    marginLeft: 8,
  },
  labStatRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  labStatCardHalf: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    position: 'relative',
    marginRight: 6,
  },
  labStatValue: {
    fontSize: 24,
    color: '#ffffff',
    fontWeight: '600',
  },
  labStatValueLarge: {
    fontSize: 40,
    color: '#ffffff',
    fontWeight: '600',
  },
  exerciseItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  exerciseName: {
    fontSize: 16,
    color: '#ffffff',
    flex: 1,
  },
  exerciseCount: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  prItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  prExerciseName: {
    fontSize: 16,
    color: '#ffffff',
    flex: 1,
  },
  prValue: {
    fontSize: 16,
    color: 'rgba(191, 168, 77, 1)',
    fontWeight: '600',
  },
  chartContainer: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 8,
    marginTop: 8,
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  chartEmptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  chartEmptyText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    opacity: 0.6,
    textAlign: 'center',
  },
  chartLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 16,
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
    marginBottom: 8,
  },
  legendTextContainer: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  legendColorBox: {
    width: 12,
    height: 12,
    borderRadius: 2,
    marginRight: 8,
  },
  legendText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '500',
    marginBottom: 2,
  },
  legendPRValue: {
    fontSize: 11,
    color: 'rgba(191, 168, 77, 1)',
    fontWeight: '600',
  },
  // PR Data Point Tooltip Styles
  prDataPointTooltip: {
    position: 'absolute',
    top: Math.max(20, screenHeight * 0.025),
    left: Math.max(20, screenWidth * 0.05),
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(8, screenWidth * 0.02),
    padding: Math.max(12, screenWidth * 0.03),
    borderWidth: 1,
    borderColor: 'rgba(191, 168, 77, 0.3)',
    shadowColor: 'rgba(0, 0, 0, 0.5)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 1000,
  },
  prDataPointTooltipContent: {
    alignItems: 'flex-start',
  },
  prDataPointTooltipExerciseName: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
    marginBottom: Math.max(4, screenHeight * 0.005),
  },
  prDataPointTooltipDate: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: Math.min(screenWidth * 0.035, 14),
    fontWeight: '400',
    marginBottom: Math.max(6, screenHeight * 0.007),
  },
  prDataPointTooltipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  prDataPointTooltipLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: Math.min(screenWidth * 0.035, 14),
    fontWeight: '500',
  },
  prDataPointTooltipValue: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.035, 14),
    fontWeight: '600',
  },
  exercisePieChartContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    paddingHorizontal: Math.max(5, screenWidth * 0.01),
    gap: Math.max(25, screenWidth * 0.06),
    overflow: 'visible',
    zIndex: 1,
  },
  exercisePieChartWrapper: {
    width: screenWidth * 0.3,
    height: 140,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    paddingRight: Math.max(8, screenWidth * 0.02),
    paddingLeft: Math.max(4, screenWidth * 0.01),
    paddingTop: Math.max(-4, screenHeight * -0.005),
    overflow: 'visible',
    zIndex: 1000,
    elevation: 10,
    position: 'relative',
  },
  noDataContainer: {
    width: screenWidth * 0.3,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noDataText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: Math.min(screenWidth * 0.04, 16),
    textAlign: 'center',
  },
  exerciseIndicatorsContainer: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: Math.max(5, screenWidth * 0.01),
    paddingRight: Math.max(5, screenWidth * 0.01),
  },
  exerciseIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Math.max(4, screenHeight * 0.005),
    paddingVertical: Math.max(2, screenHeight * 0.002),
  },
  exerciseColorIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Math.max(6, screenWidth * 0.015),
  },
  exerciseName: {
    fontSize: Math.min(screenWidth * 0.038, 15),
    color: '#FFFFFF',
    fontWeight: '500',
    flex: 1,
  },
  exerciseDotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Math.max(8, screenHeight * 0.01),
    gap: Math.max(2, screenWidth * 0.005),
  },
  exerciseDot: {
    width: Math.max(2, screenWidth * 0.005),
    height: Math.max(2, screenWidth * 0.005),
    borderRadius: Math.max(1, screenWidth * 0.0025),
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  storyCardsSection: {
    marginTop: 12,
    marginBottom: 28,
    width: screenWidth,
    alignSelf: 'center',
  },
  storyScrollContent: {
    paddingHorizontal: (screenWidth - STORY_CARD_WIDTH) / 2,
  },
  storyCardWrapper: {
    width: STORY_CARD_WIDTH,
    height: STORY_CARD_HEIGHT + 56,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  storyCardTitleWrapper: {
    width: STORY_CARD_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  storyCardTitleOutside: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
  },
  storyCardBase: {
    width: '100%',
    height: STORY_CARD_HEIGHT,
    backgroundColor: '#2a2a2a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: 'rgba(0, 0, 0, 0.3)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
    overflow: 'hidden',
  },
  storyCardMedia: {
    justifyContent: 'flex-end',
  },
  storyCardText: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    justifyContent: 'flex-start',
  },
  storyTextContent: {
    flex: 1,
  },
  storyCardContent: {
    fontSize: 13,
    lineHeight: 20,
    color: 'rgba(255, 255, 255, 0.75)',
    flex: 1,
  },
  storyMediaPressable: {
    flex: 1,
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  storyMedia: {
    width: '100%',
    height: STORY_CARD_HEIGHT,
  },
  storyMediaImage: {
    borderRadius: 16,
    width: '100%',
    height: '100%',
  },
  storyVideoDimmingLayer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    zIndex: 1,
  },
  storyPauseOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  storyVolumeContainer: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 3,
  },
  storyRestartContainer: {
    position: 'absolute',
    top: 60,
    right: 12,
    zIndex: 3,
  },
  storyIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  programsLoadingContainer: {
    marginTop: 24,
    alignItems: 'center',
    gap: 12,
  },
  programsLoadingText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 14,
  },
  programsErrorText: {
    color: '#ff6b6b',
    fontSize: 14,
    marginTop: 24,
  },
  programsEmptyText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    marginTop: 24,
  },
  programsSection: {
    marginBottom: 24,
  },
  programsSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 12,
  },
  programsContainer: {
    gap: 15,
    marginTop: 12,
  },
  programCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3a3a3a',
    height: 170,
    overflow: 'hidden',
    position: 'relative',
  },
  programTypeBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  programTypeBadgeStandalone: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  programTypeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ffffff',
  },
  programImageBackground: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  programImage: {
    borderRadius: 12,
  },
  programImageOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'flex-end',
  },
  programOverlayInfo: {
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  programFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#3a3a3a',
    gap: 8,
  },
  programTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#ffffff',
  },
  programDiscipline: {
    fontSize: 14,
    fontWeight: '400',
    color: '#cccccc',
    marginTop: 4,
  },
  // General programs carousel — align with Perfil story cards: same title position/style, same card spacing
  generalCarouselSection: {
    minHeight: CARD_HEIGHT + 80,
    marginBottom: 28,
  },
  programSectionFirst: {
    marginTop: 32, // tuned with paddingTop 8 on Programas so top fixation matches bottom (72px below header)
  },
  programSectionNext: {
    marginTop: 28,
  },
  // Section title: same position and style as Perfil story card titles (storyCardTitleWrapper + storyCardTitleOutside)
  programSectionTitleWrapper: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    gap: 4,
  },
  programSectionTitleIcon: {
    marginLeft: 0,
  },
  programSectionTitleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
  },
  // Break out of tabPageContent padding so carousel is full-width and centering matches MainScreen
  generalCarouselFullBleed: {
    marginHorizontal: -24,
  },
  generalCarouselSwipeableContainer: {
    overflow: 'visible',
  },
  generalCarouselInner: {
    position: 'relative',
    overflow: 'visible',
  },
  generalCarouselWrapper: {
    width: '100%',
    alignItems: 'center',
    overflow: 'visible',
    marginTop: 0,
  },
  generalCarouselListContent: {
    paddingHorizontal: (screenWidth - CARD_WIDTH) / 2,
    alignItems: 'center',
  },
  generalCarouselListStyle: {
    height: CARD_HEIGHT,
    width: '100%',
  },
  generalCarouselCard: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  },
  generalCarouselCardContentWithImage: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: 16,
    borderWidth: 0,
    overflow: 'hidden',
    width: '100%',
    height: '100%',
  },
  generalCarouselCardBackgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    borderRadius: 16,
    opacity: 1,
  },
  generalCarouselCardOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 40,
    position: 'relative',
  },
  generalCarouselCardTitle: {
    fontSize: 30,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
  },
  generalCarouselCardSubtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
    marginTop: 25,
  },
  generalCarouselCardContent: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    padding: Math.max(16, screenWidth * 0.05),
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: '#3a3a3a',
    justifyContent: 'flex-end',
    alignItems: 'center',
    position: 'relative',
  },
  generalCarouselCardSeparator: {
    width: 0,
  },
  generalCarouselPagination: {
    width: '100%',
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    paddingBottom: 24,
    zIndex: 1000,
    backgroundColor: 'transparent',
  },
  heroGradientBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: 140,
    zIndex: 1,
    elevation: 2,
  },
  placeholderText: {
    color: '#ffffff',
    fontSize: 16,
    opacity: 0.6,
  },
  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  titleSection: {
    paddingTop: 0,
    marginTop: 8,
    marginBottom: 24,
    alignItems: 'flex-start',
    gap: 12,
  },
  creatorMetaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  creatorMetaPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  creatorMetaText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'left',
    marginLeft: 20,
  },
  // Exercise Modal Styles
  exerciseModalContainer: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  exerciseModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    paddingTop: Math.max(50, screenHeight * 0.06),
    paddingBottom: Math.max(20, screenHeight * 0.025),
    backgroundColor: '#1a1a1a',
  },
  exerciseModalTitle: {
    fontSize: Math.min(screenWidth * 0.055, 22),
    fontWeight: '600',
    color: '#ffffff',
    flex: 1,
    textAlign: 'left',
    paddingLeft: Math.max(25, screenWidth * 0.06),
    paddingTop: Math.max(25, screenHeight * 0.03),
  },
  exerciseModalBackButton: {
    width: Math.max(30, screenWidth * 0.075),
    height: Math.max(30, screenWidth * 0.075),
    borderRadius: Math.max(15, screenWidth * 0.037),
    backgroundColor: '#44454B',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Math.max(12, screenWidth * 0.03),
  },
  exerciseModalBackText: {
    fontSize: Math.min(screenWidth * 0.04, 16),
    color: '#ffffff',
    fontWeight: '600',
  },
  exerciseModalContent: {
    flex: 1,
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
  },
  exerciseModalLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Math.max(16, screenHeight * 0.02),
    paddingVertical: Math.max(8, screenHeight * 0.01),
  },
  exerciseModalColorIndicator: {
    width: Math.max(20, screenWidth * 0.05),
    height: Math.max(20, screenWidth * 0.05),
    borderRadius: Math.max(10, screenWidth * 0.025),
    marginRight: Math.max(16, screenWidth * 0.04),
  },
  exerciseModalExerciseName: {
    fontSize: Math.min(screenWidth * 0.045, 18),
    color: '#ffffff',
    fontWeight: '500',
    flex: 1,
  },
  exerciseModalPercentage: {
    fontSize: Math.min(screenWidth * 0.045, 18),
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '400',
  },
  // PR Info Modal Styles
  infoModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoModalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  infoModalContent: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    width: Math.max(350, screenWidth * 0.9),
    maxWidth: 400,
    height: Math.max(500, screenHeight * 0.7),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    overflow: 'visible',
  },
  infoModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Math.max(25, screenWidth * 0.06),
    paddingTop: Math.max(25, screenHeight * 0.03),
    paddingBottom: Math.max(16, screenHeight * 0.02),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  infoModalTitle: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.055, 22),
    fontWeight: '600',
    flex: 1,
  },
  infoModalCloseButton: {
    width: Math.max(30, screenWidth * 0.075),
    height: Math.max(30, screenWidth * 0.075),
    borderRadius: Math.max(15, screenWidth * 0.037),
    backgroundColor: '#44454B',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Math.max(12, screenWidth * 0.03),
  },
  infoModalCloseButtonText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
  },
  infoModalScrollContainer: {
    flex: 1,
    position: 'relative',
  },
  infoModalScrollView: {
    flex: 1,
    paddingHorizontal: Math.max(25, screenWidth * 0.06),
    paddingTop: Math.max(20, screenHeight * 0.025),
  },
  infoModalDescription: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '400',
    lineHeight: Math.max(24, screenHeight * 0.03),
    opacity: 0.9,
    marginBottom: Math.max(20, screenHeight * 0.025),
  },
  // Muscle Volume Info Modal Styles
  muscleVolumeInfoModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  muscleVolumeInfoModalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  muscleVolumeInfoModalContent: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    width: Math.max(350, screenWidth * 0.9),
    maxWidth: 400,
    height: Math.max(500, screenHeight * 0.7),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    overflow: 'visible',
  },
  muscleVolumeInfoScrollContainer: {
    flex: 1,
    position: 'relative',
  },
  muscleVolumeInfoScrollView: {
    flex: 1,
    paddingHorizontal: Math.max(25, screenWidth * 0.06),
  },
  muscleVolumeInfoModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Math.max(16, screenHeight * 0.02),
  },
  muscleVolumeInfoModalTitle: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.055, 22),
    fontWeight: '600',
    flex: 1,
    textAlign: 'left',
    paddingLeft: Math.max(25, screenWidth * 0.06),
    paddingTop: Math.max(25, screenHeight * 0.03),
  },
  muscleVolumeInfoCloseButton: {
    width: Math.max(30, screenWidth * 0.075),
    height: Math.max(30, screenWidth * 0.075),
    borderRadius: Math.max(15, screenWidth * 0.037),
    backgroundColor: '#44454B',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Math.max(12, screenWidth * 0.03),
    marginRight: Math.max(10, screenWidth * 0.03),
    marginTop: Math.max(5, screenHeight * 0.01),
  },
  muscleVolumeInfoCloseButtonText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
  },
  muscleVolumeInfoModalDescription: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '400',
    lineHeight: Math.max(24, screenHeight * 0.03),
    opacity: 0.9,
    marginBottom: Math.max(20, screenHeight * 0.025),
  },
  disclaimersSection: {
    marginTop: Math.max(20, screenHeight * 0.025),
    paddingTop: Math.max(16, screenHeight * 0.02),
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  disclaimersTitle: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
    marginBottom: Math.max(12, screenHeight * 0.015),
  },
  disclaimerText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '400',
    lineHeight: Math.max(22, screenHeight * 0.027),
    marginBottom: Math.max(8, screenHeight * 0.01),
  },
  scrollIndicator: {
    position: 'absolute',
    bottom: Math.max(20, screenHeight * 0.025),
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollIndicatorText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: Math.min(screenWidth * 0.035, 14),
    fontWeight: '400',
  },
  // Muscle Volume Section Styles
  muscleVolumeSectionWrapper: {
    marginHorizontal: -24, // Break out of content padding
    marginBottom: Math.max(8, screenHeight * 0.01),
    marginTop: Math.max(8, screenHeight * 0.01),
    overflow: 'visible',
  },
  muscleCardsScrollContainer: {
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    gap: 0,
    overflow: 'visible',
  },
  muscleVolumeSection: {
    overflow: 'visible',
  },
  muscleCardFirst: {
    width: screenWidth - Math.max(40, screenWidth * 0.1), // Account for container padding
    marginRight: 15, // Space between cards
    overflow: 'visible',
  },
  muscleCardSecond: {
    width: screenWidth - Math.max(40, screenWidth * 0.1), // Account for container padding
    overflow: 'visible',
  },
  musclePaginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Math.max(16, screenHeight * 0.02),
  },
  muscleListContainer: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    padding: Math.max(20, screenWidth * 0.05),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    overflow: 'visible',
    height: 500, // Fixed height to match MuscleSilhouette
    position: 'relative',
  },
  muscleListTitle: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
    marginBottom: Math.max(4, screenHeight * 0.005),
    textAlign: 'left',
    paddingLeft: Math.max(10, screenWidth * 0.02),
  },
  muscleListSubtitle: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.035, 14),
    opacity: 0.6,
    marginBottom: Math.max(16, screenHeight * 0.02),
    textAlign: 'left',
    paddingLeft: Math.max(10, screenWidth * 0.02),
  },
  muscleListHeaderTouchable: {
    position: 'relative',
  },
  muscleListInfoIconContainer: {
    position: 'absolute',
    top: Math.max(16, screenHeight * 0.02),
    right: Math.max(16, screenWidth * 0.04),
    zIndex: 10,
  },
  musclesListContainerWrapper: {
    flex: 1,
    position: 'relative',
  },
  musclesListScrollView: {
    flex: 1,
  },
  musclesList: {
    gap: Math.max(10, screenHeight * 0.012),
    paddingBottom: 24,
  },
  muscleListScrollIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 35,
    backgroundColor: 'rgba(42, 42, 42, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  muscleListScrollIndicatorText: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
  },
  muscleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  muscleName: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '500',
    opacity: 0.9,
    flex: 1,
    marginRight: 8,
  },
  muscleVolume: {
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
  },
  muscleListEmptyText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.035, 14),
    opacity: 0.6,
    textAlign: 'center',
    paddingVertical: Math.max(20, screenHeight * 0.025),
    lineHeight: Math.max(20, screenHeight * 0.025),
  },
});

export default CreatorProfileScreen;

