import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, useWindowDimensions, TouchableOpacity, Animated, Linking, FlatList, Modal, Pressable, ScrollView, TouchableWithoutFeedback } from 'react-native';
import { collection, getDocs, query, where, orderBy, limit, collectionGroup } from 'firebase/firestore';
import { firestore } from '../config/firebase';
import { ImageBackground } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { FixedWakeHeader } from '../components/WakeHeader';
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
import SvgPlay from '../components/icons/SvgPlay';
import SvgArrowReload from '../components/icons/SvgArrowReload';
import SvgVolumeMax from '../components/icons/SvgVolumeMax';
import SvgVolumeOff from '../components/icons/SvgVolumeOff';
import SvgChevronRight from '../components/icons/vectors_fig/Arrow/ChevronRight';
import SvgInfo from '../components/icons/SvgInfo';
import muscleVolumeInfoService from '../services/muscleVolumeInfoService';
import { getMuscleDisplayName } from '../constants/muscles';
import { getMuscleColorForText } from '../utils/muscleColorUtils';
import { creatorProfileCache } from '../utils/cache';

const TAB_CONFIG = [
  { key: 'profile', title: 'Perfil' },
  { key: 'lab', title: 'Lab' },
  { key: 'programs', title: 'Programas' },
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
              style={[styles.storyMedia, { opacity: 0.7 }]}
              contentFit="cover"
              allowsPictureInPicture={false}
              nativeControls={false}
              showsTimecodes={false}
            />
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

const CreatorProfileScreen = ({ navigation, route }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { creatorId, imageUrl: initialImageUrl } = route.params || {};
  const [imageUrl, setImageUrl] = useState(initialImageUrl || null);
  const [loading, setLoading] = useState(!initialImageUrl && !!creatorId);
  const [displayName, setDisplayName] = useState('');
  const [currentTabIndex, setCurrentTabIndex] = useState(0);
  
  // Calculate story card dimensions based on screen size
  const STORY_CARD_WIDTH = screenWidth * 0.8;
  const STORY_CARD_HEIGHT = screenHeight * 0.6;
  const STORY_CARD_SPACING = 4;
  const STORY_CARD_SNAP = STORY_CARD_WIDTH + STORY_CARD_SPACING;
  
  // Create styles with current dimensions - memoized to prevent recalculation
  const styles = useMemo(
    () => createStyles(screenWidth, screenHeight, STORY_CARD_WIDTH, STORY_CARD_HEIGHT),
    [screenWidth, screenHeight, STORY_CARD_WIDTH, STORY_CARD_HEIGHT],
  );
  const tabsScrollRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [tabWidth, setTabWidth] = useState(0);
  // Refs for each tab's ScrollView
  const perfilScrollRef = useRef(null);
  const labScrollRef = useRef(null);
  const programasScrollRef = useRef(null);
  // Track scroll positions per tab
  const tabScrollPositions = useRef({ 0: 0, 1: 0, 2: 0 });
  const [creatorPrograms, setCreatorPrograms] = useState([]);
  const [programsLoading, setProgramsLoading] = useState(true);
  const [programsError, setProgramsError] = useState(null);
  const [programStats, setProgramStats] = useState({
    uniqueUsers: 0,
    mostPopularProgram: null,
    loading: true,
  });
  const [creatorCards, setCreatorCards] = useState([]);
  const [creatorDoc, setCreatorDoc] = useState(null); // Store creator document for reuse
  const storyScrollX = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(new Animated.Value(0)).current;
  const [creatorAge, setCreatorAge] = useState(null);
  const [creatorLocation, setCreatorLocation] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('month'); // month, 3months, 6months, year, alltime
  const [isPeriodModalVisible, setIsPeriodModalVisible] = useState(false);
  const [isExerciseModalVisible, setIsExerciseModalVisible] = useState(false);
  const [isMuscleVolumeInfoModalVisible, setIsMuscleVolumeInfoModalVisible] = useState(false);
  const [selectedMuscleVolumeInfo, setSelectedMuscleVolumeInfo] = useState(null);
  const [isPRInfoModalVisible, setIsPRInfoModalVisible] = useState(false);
  const muscleScrollX = useRef(new Animated.Value(0)).current;
  const [labStats, setLabStats] = useState({
    totalSessions: 0,
    favoriteProgram: null,
    topExercises: [],
    recentPRs: [],
    prHistoryData: [], // Array of { exerciseName, exerciseKey, history: [] }
    lastMonthVolume: {},
    loading: true,
  });

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

      // Check cache first
      const cacheKey = `creator_${creatorId}`;
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

        // Set programs from parallel query
        setCreatorPrograms(programsResult);
        
        // Cache the results (5 minute TTL)
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
          programs: programsResult,
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
  }, [creatorId, initialImageUrl]);

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

  // Load program statistics (sessions, users, most popular)
  useEffect(() => {
    let isMounted = true;

    const loadProgramStats = async () => {
      if (!creatorId || creatorPrograms.length === 0) {
        if (isMounted) {
          setProgramStats({
            uniqueUsers: 0,
            mostPopularProgram: null,
            loading: false,
          });
        }
        return;
      }

      // Check cache first
      const cacheKey = `creator_program_stats_${creatorId}`;
      const cachedStats = creatorProfileCache.get(cacheKey);
      
      if (cachedStats) {
        logger.log('📦 Using cached program stats');
        if (isMounted) {
          setProgramStats(cachedStats);
        }
        return;
      }

      try {
        if (isMounted) {
          setProgramStats(prev => ({ ...prev, loading: true }));
        }

        const programIds = creatorPrograms.map(p => p.id).filter(Boolean);
        
        logger.log('📊 Program Stats - Creator programs:', creatorPrograms.map(p => ({ id: p.id, title: p.title })));
        logger.log('📊 Program Stats - Extracted program IDs:', programIds);
        
        if (programIds.length === 0) {
          logger.log('📊 Program Stats - No program IDs found, returning empty stats');
          if (isMounted) {
            setProgramStats({
              uniqueUsers: 0,
              mostPopularProgram: null,
              loading: false,
            });
          }
          return;
        }

        // Use Collection Group Query to get sessionHistory from all users
        // This queries the sessionHistory subcollection across all users
        // Firestore 'in' query supports max 10 items, so we need to batch if >10 programs
        const sessionHistoryQueries = [];
        for (let i = 0; i < programIds.length; i += 10) {
          const batch = programIds.slice(i, i + 10);
          logger.log(`📊 Program Stats - Querying batch ${Math.floor(i / 10) + 1} with ${batch.length} program IDs:`, batch);
          try {
            const q = query(
              collectionGroup(firestore, 'sessionHistory'),
              where('courseId', 'in', batch)
            );
            sessionHistoryQueries.push(getDocs(q));
          } catch (error) {
            logger.error('📊 Program Stats - Collection group query failed, trying alternative:', error);
            // If collection group query fails, we'll use the users collection approach
            throw error;
          }
        }

        // Execute all queries
        let allSessionDocs = [];
        try {
          const allSnapshots = await Promise.all(sessionHistoryQueries);
          
          logger.log('📊 Program Stats - Number of query snapshots:', allSnapshots.length);
          
          // Combine all results
          allSnapshots.forEach((snapshot, index) => {
            logger.log(`📊 Program Stats - Snapshot ${index + 1} size:`, snapshot.size);
            snapshot.forEach(doc => {
              const data = doc.data();
              // Extract userId from document path: users/{userId}/sessionHistory/{sessionId}
              const pathParts = doc.ref.path.split('/');
              const userId = pathParts[1]; // users/{userId}/sessionHistory/...
              
              allSessionDocs.push({
                id: doc.id,
                userId: userId,
                ...data
              });
            });
          });

          logger.log('📊 Program Stats - Total session docs found:', allSessionDocs.length);
          if (allSessionDocs.length > 0) {
            logger.log('📊 Program Stats - Sample session doc:', JSON.stringify(allSessionDocs[0], null, 2));
            logger.log('📊 Program Stats - Sample session doc courseId:', allSessionDocs[0].courseId);
            logger.log('📊 Program Stats - Sample session doc userId:', allSessionDocs[0].userId);
          } else {
            logger.log('📊 Program Stats - No session documents found!');
          }
        } catch (collectionGroupError) {
          logger.log('📊 Program Stats - Collection group query not available, using users collection approach');
          
          // Fallback: Query all users and check their courses object
          const usersSnapshot = await getDocs(collection(firestore, 'users'));
          const uniqueUserIds = new Set();
          const programSessionCounts = {};
          
          // For each user, check if they have any of the creator's programs
          usersSnapshot.forEach(userDoc => {
            const userData = userDoc.data();
            const userCourses = userData.courses || {};
            const userId = userDoc.id;
            
            // Check if user has any of the creator's programs
            let hasCreatorProgram = false;
            Object.keys(userCourses).forEach(courseId => {
              if (programIds.includes(courseId)) {
                hasCreatorProgram = true;
                // Count this as an enrollment (not a session completion)
                programSessionCounts[courseId] = (programSessionCounts[courseId] || 0) + 1;
              }
            });
            
            if (hasCreatorProgram) {
              uniqueUserIds.add(userId);
            }
          });
          
          const uniqueUsers = uniqueUserIds.size;
          logger.log('📊 Program Stats - Unique users (from courses):', uniqueUsers);
          
          // Get most popular program
          let mostPopularProgram = null;
          let maxEnrollments = 0;
          Object.entries(programSessionCounts).forEach(([courseId, count]) => {
            if (count > maxEnrollments) {
              maxEnrollments = count;
              const program = creatorPrograms.find(p => p.id === courseId);
              if (program) {
                mostPopularProgram = {
                  id: program.id,
                  title: program.title || 'Programa sin título',
                  sessions: count, // Actually enrollments, not sessions
                };
              }
            }
          });

          if (isMounted) {
            setProgramStats({
              uniqueUsers,
              mostPopularProgram,
              loading: false,
            });
          }
          return;
        }

        // Get unique users from sessionHistory
        const uniqueUserIds = new Set();
        allSessionDocs.forEach(doc => {
          if (doc.userId) {
            uniqueUserIds.add(doc.userId);
          }
        });
        const uniqueUsers = uniqueUserIds.size;

        logger.log('📊 Program Stats - Unique users found:', uniqueUsers);

        // Find most popular program (by session count)
        const programSessionCounts = {};
        allSessionDocs.forEach(doc => {
          const courseId = doc.courseId;
          if (courseId) {
            programSessionCounts[courseId] = (programSessionCounts[courseId] || 0) + 1;
          }
        });

        logger.log('📊 Program Stats - Session counts per program:', programSessionCounts);

        // Get program with most sessions
        let mostPopularProgram = null;
        let maxSessions = 0;
        Object.entries(programSessionCounts).forEach(([courseId, count]) => {
          if (count > maxSessions) {
            maxSessions = count;
            const program = creatorPrograms.find(p => p.id === courseId);
            if (program) {
              mostPopularProgram = {
                id: program.id,
                title: program.title || 'Programa sin título',
                sessions: count,
              };
            }
          }
        });

        const stats = {
          uniqueUsers,
          mostPopularProgram,
          loading: false,
        };
        
        // Cache the results (15 minute TTL - stats change less frequently)
        creatorProfileCache.set(cacheKey, stats, 15 * 60 * 1000);
        
        if (isMounted) {
          setProgramStats(stats);
        }
      } catch (error) {
        logger.error('Error loading program stats:', error);
        if (isMounted) {
          setProgramStats({
            uniqueUsers: 0,
            mostPopularProgram: null,
            loading: false,
          });
        }
      }
    };

    // Only load stats if we have programs
    if (creatorPrograms.length > 0 && !programsLoading) {
      loadProgramStats();
    }

    return () => {
      isMounted = false;
    };
  }, [creatorId, creatorPrograms, programsLoading]);

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

  // Load Lab Stats
  useEffect(() => {
    let isMounted = true;

    const loadLabStats = async () => {
      if (!creatorId) {
        if (isMounted) {
          setLabStats({
            totalSessions: 0,
            favoriteProgram: null,
            topExercises: [],
            recentPRs: [],
            lastMonthVolume: {},
            weeksWithData: 1,
            loading: false,
          });
        }
        return;
      }

      // Check cache first (cache key includes period since stats are period-dependent)
      const cacheKey = `creator_lab_${creatorId}_${selectedPeriod}`;
      const cachedStats = creatorProfileCache.get(cacheKey);
      
      if (cachedStats) {
        logger.log('📦 Using cached lab stats');
        if (isMounted) {
          setLabStats(cachedStats);
        }
        return;
      }

      try {
        if (isMounted) {
          setLabStats(prev => ({ ...prev, loading: true }));
        }

        // Get session history - query directly without orderBy to avoid index requirement
        const sessionHistoryRef = collection(firestore, 'users', creatorId, 'sessionHistory');
        const q = query(sessionHistoryRef); // No orderBy - avoids index requirement
        const querySnapshot = await getDocs(q);
        
        // Convert to array and properly handle Firestore Timestamps
        let sessions = [];
        querySnapshot.forEach((doc) => {
          const sessionData = doc.data();
          
          // Properly convert completedAt from Firestore Timestamp or ISO string
          let completedAt = null;
          if (sessionData.completedAt) {
            // Handle Firestore Timestamp
            if (sessionData.completedAt.toDate && typeof sessionData.completedAt.toDate === 'function') {
              completedAt = sessionData.completedAt.toDate();
            } 
            // Handle ISO string
            else if (typeof sessionData.completedAt === 'string') {
              completedAt = new Date(sessionData.completedAt);
            }
            // Handle if already a Date object
            else if (sessionData.completedAt instanceof Date) {
              completedAt = sessionData.completedAt;
            }
          }
          
          // Only include sessions with valid completedAt
          if (completedAt && !isNaN(completedAt.getTime())) {
            sessions.push({
              ...sessionData,
              completedAt: completedAt
            });
          }
        });
        
        logger.log('📊 Total sessions retrieved:', sessions.length);

        // Filter sessions by selected time period
        const { startDate, endDate } = getTimePeriodDateRange(selectedPeriod);
        const filteredSessions = sessions.filter(session => {
          const sessionDate = session.completedAt; // Already converted to Date
          return sessionDate >= startDate && sessionDate <= endDate;
        });

        // Calculate total sessions
        const totalSessions = filteredSessions.length;
        
        logger.log('📊 Sessions in period:', totalSessions, 'out of', sessions.length);

        // Calculate favorite program (most sessions) - use filtered sessions
        const programCounts = {};
        filteredSessions.forEach(session => {
          const programName = session.courseName || 'Unknown';
          programCounts[programName] = (programCounts[programName] || 0) + 1;
        });
        const favoriteProgram = Object.entries(programCounts)
          .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

        // Calculate all exercises (for pie chart) - use filtered sessions
        const exerciseCounts = {};
        filteredSessions.forEach(session => {
          if (session.exercises) {
            Object.keys(session.exercises).forEach(exerciseKey => {
              const exerciseName = session.exercises[exerciseKey]?.exerciseName || exerciseKey;
              exerciseCounts[exerciseName] = (exerciseCounts[exerciseName] || 0) + 1;
            });
          }
        });
        // Store all exercises (not just top 5) for pie chart
        const allExercises = Object.entries(exerciseCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([name, count]) => ({ name, count }));

        // OPTIMIZATION: Reuse creator document from state instead of fetching again
        const userDoc = creatorDoc || await firestoreService.getUser(creatorId);
        const currentEstimates = userDoc?.oneRepMaxEstimates || {};
        const weeklyMuscleVolume = userDoc?.weeklyMuscleVolume || {};
        
        // Get PRs from history subcollections
        // PRs are stored in: users/{userId}/oneRepMaxHistory/{exerciseKey}/records
        // A PR is when the estimate increases from the previous entry
        const allPRs = [];
        
        // Get all exercises with current estimates
        const exerciseKeys = Object.keys(currentEstimates);
        
        // OPTIMIZATION: Batch PR history queries in parallel instead of sequential
        const prHistoryPromises = exerciseKeys.map(async (exerciseKey) => {
          try {
            const historyRef = collection(
              firestore,
              'users',
              creatorId,
              'oneRepMaxHistory',
              exerciseKey,
              'records'
            );
            
            const historyQuery = query(historyRef, orderBy('date', 'asc'));
            const historySnapshot = await getDocs(historyQuery);
            
            if (historySnapshot.empty) {
              return [];
            }
            
            const historyEntries = historySnapshot.docs.map(doc => ({
              ...doc.data(),
              date: doc.data().date?.toDate?.() || doc.data().date || new Date(),
            })).sort((a, b) => a.date - b.date);
            
            // Find entries where estimate increased (indicating a PR)
            // Skip the first entry as it's not a PR (first time doing the exercise)
            const prs = [];
            if (historyEntries.length > 1) {
              let previousEstimate = historyEntries[0]?.estimate || 0;
              for (let i = 1; i < historyEntries.length; i++) {
                const entry = historyEntries[i];
                if (entry.estimate && entry.estimate > previousEstimate) {
                  const exerciseName = exerciseKey.split('_').slice(1).join('_') || exerciseKey;
                  prs.push({
                    exerciseName,
                    exerciseKey,
                    value: entry.estimate,
                    date: entry.date,
                  });
                  previousEstimate = entry.estimate;
                } else if (entry.estimate) {
                  previousEstimate = entry.estimate;
                }
              }
            }
            return prs;
          } catch (error) {
            // Skip exercises without history subcollection or query errors
            logger.log('Error getting history for exercise:', exerciseKey, error.message);
            return [];
          }
        });
        
        // Execute all PR history queries in parallel
        const allPRsArrays = await Promise.all(prHistoryPromises);
        allPRs.push(...allPRsArrays.flat());
        
        // Group PRs by exercise and keep only the latest one per exercise
        const prsByExercise = {};
        allPRs.forEach(pr => {
          const exerciseKey = pr.exerciseKey;
          if (!prsByExercise[exerciseKey] || pr.date > prsByExercise[exerciseKey].date) {
            prsByExercise[exerciseKey] = pr;
          }
        });
        
        // Convert to array, sort by date, and get latest 3
        const recentPRs = Object.values(prsByExercise)
          .sort((a, b) => {
            const dateA = a.date instanceof Date ? a.date : new Date(a.date);
            const dateB = b.date instanceof Date ? b.date : new Date(b.date);
            return dateB - dateA;
          })
          .slice(0, 3);

        // OPTIMIZATION: Batch PR history loading for top 3 exercises in parallel
        const prHistoryDataPromises = recentPRs.map(async (pr) => {
          try {
            const [libraryId, ...exerciseNameParts] = pr.exerciseKey.split('_');
            const exerciseName = exerciseNameParts.join('_');
            
            const history = await oneRepMaxService.getHistoryForExercise(
              creatorId,
              libraryId,
              exerciseName
            );
            
            if (history && history.length > 0) {
              return {
                exerciseName: pr.exerciseName,
                exerciseKey: pr.exerciseKey,
                history: history.sort((a, b) => {
                  const dateA = a.date?.toDate?.() || a.date || new Date(0);
                  const dateB = b.date?.toDate?.() || b.date || new Date(0);
                  return dateA - dateB;
                }),
              };
            }
            return null;
          } catch (error) {
            logger.log('Error loading PR history for exercise:', pr.exerciseKey, error.message);
            return null;
          }
        });
        
        const prHistoryDataResults = await Promise.all(prHistoryDataPromises);
        const prHistoryData = prHistoryDataResults.filter(Boolean); // Remove nulls

        // Calculate volume for selected time period
        const periodWeeks = getWeeksBetween(startDate, endDate);
        const periodVolume = {};
        let weeksWithData = 0; // Count only weeks that actually have data
        
        periodWeeks.forEach(weekKey => {
          const weekVolume = weeklyMuscleVolume[weekKey] || {};
          
          // Check if this week has any data
          const hasData = Object.values(weekVolume).some(volume => volume > 0);
          if (hasData) {
            weeksWithData++; // Only count weeks with actual data
          }
          
          Object.entries(weekVolume).forEach(([muscle, volume]) => {
            periodVolume[muscle] = (periodVolume[muscle] || 0) + (volume || 0);
          });
        });

        const stats = {
          totalSessions,
          favoriteProgram,
          topExercises: allExercises, // Now contains all exercises, not just top 5
          recentPRs,
          prHistoryData,
          lastMonthVolume: periodVolume,
          weeksWithData: weeksWithData || 1, // Default to 1 to avoid division by zero
          loading: false,
        };
        
        // Cache the results (5 minute TTL)
        creatorProfileCache.set(cacheKey, stats, 5 * 60 * 1000);
        
        if (isMounted) {
          setLabStats(stats);
        }
      } catch (error) {
        logger.error('Error loading lab stats:', error);
        if (isMounted) {
          setLabStats(prev => ({ ...prev, loading: false }));
        }
      }
    };

    loadLabStats();

    return () => {
      isMounted = false;
    };
  }, [creatorId, selectedPeriod, creatorDoc]); // Add creatorDoc as dependency to reuse cached document

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
    const scrollRefs = [perfilScrollRef, labScrollRef, programasScrollRef];
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
      useNativeDriver: true,
    }).start();
  };

  const hidePRTooltip = () => {
    Animated.timing(prTooltipOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
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
        <ImageBackground
          source={{ uri: imageUrl }}
          style={styles.heroImage}
          imageStyle={styles.heroImageStyle}
        />
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
  const TAB_BAR_HEIGHT = 60;
  const MAX_HEADER_HEIGHT = MAX_HERO_HEIGHT + TAB_BAR_HEIGHT;
  const MIN_HEADER_HEIGHT = MIN_HERO_HEIGHT + TAB_BAR_HEIGHT;
  const SCROLL_THRESHOLD = 200; // Distance to scroll before fully shrunk (increased for smoother animation)

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
          <View style={styles.heroGradient}>
            <Svg
              style={StyleSheet.absoluteFillObject}
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
            >
              <Defs>
                <SvgLinearGradient id="heroGradientFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#1a1a1a" stopOpacity={0} />
                  <Stop offset="0.6" stopColor="#1a1a1a" stopOpacity={0.2} />
                  <Stop offset="1" stopColor="#1a1a1a" stopOpacity={1} />
                </SvgLinearGradient>
              </Defs>
              <Rect x="0" y="0" width="1" height="1" fill="url(#heroGradientFill)" />
            </Svg>
          </View>
        </Animated.View>
        <View style={styles.fixedTabBar}>
          <View
            style={styles.tabHeaderContainer}
            onLayout={(event) => {
              const { width } = event.nativeEvent.layout;
              setTabWidth(width / TAB_CONFIG.length);
            }}
          >
              {tabWidth > 0 && (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.tabIndicator,
                    {
                      width: Math.max(tabWidth - 12, 0),
                      transform: [
                        {
                          translateX: scrollX.interpolate({
                            inputRange: TAB_CONFIG.map((_, index) => index * screenWidth),
                            outputRange: TAB_CONFIG.map(
                              (_, index) => index * tabWidth + 6
                            ),
                            extrapolate: 'clamp',
                          }),
                        },
                      ],
                    },
                  ]}
                />
              )}
              {TAB_CONFIG.map((tab, index) => {
                const isActive = currentTabIndex === index;
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
                      // Restore scroll position for the new tab
                      const scrollRefs = [perfilScrollRef, labScrollRef, programasScrollRef];
                      const newScrollRef = scrollRefs[index];
                      if (newScrollRef?.current) {
                        // Small delay to ensure tab switch completes
                        setTimeout(() => {
                          newScrollRef.current.scrollTo({
                            y: tabScrollPositions.current[index],
                            animated: false,
                          });
                          // Update scrollY to match the new tab's position
                          scrollY.setValue(tabScrollPositions.current[index]);
                        }, 50);
                      }
                    }}
                  >
                    <Animated.Text
                      style={[
                        styles.tabTitle,
                        {
                          opacity: scrollX.interpolate({
                            inputRange: TAB_CONFIG.map((_, tabIndex) => tabIndex * screenWidth),
                            outputRange: TAB_CONFIG.map((_, tabIndex) => (tabIndex === index ? 1 : 0.45)),
                            extrapolate: 'clamp',
                          }),
                        },
                        isActive && styles.tabTitleActive,
                      ]}
                    >
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
              const scrollRef = [perfilScrollRef, labScrollRef, programasScrollRef][newIndex];
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
          {/* Tab 0: Perfil */}
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
              tabScrollPositions.current[0] = offsetY;
              // Only update scrollY if this is the active tab
              if (currentTabIndex === 0) {
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
                          { useNativeDriver: true }
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
                            isPerfilTabActive={currentTabIndex === 0}
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
            </View>
          </ScrollView>

          {/* Tab 1: Lab */}
          <ScrollView
            ref={labScrollRef}
            style={[styles.tabScrollView, { width: screenWidth }]}
            contentContainerStyle={[
              styles.tabScrollContent,
              { paddingTop: MAX_HEADER_HEIGHT },
            ]}
            showsVerticalScrollIndicator={false}
            onScroll={(event) => {
              const offsetY = event.nativeEvent.contentOffset.y;
              tabScrollPositions.current[1] = offsetY;
              // Only update scrollY if this is the active tab
              if (currentTabIndex === 1) {
                scrollY.setValue(offsetY);
              }
            }}
            scrollEventThrottle={8}
          >
            <View style={styles.tabPageContent}>
              {/* Time Period Selector Header */}
                  <View style={styles.labHeaderContainer}>
                    <View style={styles.labHeaderSpacer} />
                    <TouchableOpacity
                      style={styles.periodSelectorButton}
                      onPress={() => setIsPeriodModalVisible(true)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.periodSelectorButtonText}>
                        {getPeriodLabel(selectedPeriod)}
                      </Text>
                      <View style={styles.periodSelectorArrow}>
                        <SvgChevronRight 
                          width={16} 
                          height={16} 
                          stroke="#ffffff" 
                          strokeWidth={2}
                        />
                      </View>
                    </TouchableOpacity>
                  </View>

                  {labStats.loading ? (
                    <View style={styles.labLoadingContainer}>
                      <ActivityIndicator size="large" color="#ffffff" />
                      <Text style={styles.labLoadingText}>Cargando estadísticas...</Text>
                    </View>
                  ) : (
                    <>
                      {/* Total Sessions and Favorite Program - Side by Side */}
                      <View style={styles.labStatRow}>
                        {/* Total Sessions */}
                        <View style={styles.labStatCardHalf}>
                          <Text style={styles.labStatLabel}>Sesiones Completadas</Text>
                          <Text style={styles.labStatValueLarge}>{labStats.totalSessions}</Text>
                        </View>

                        {/* Favorite Program */}
                        {labStats.favoriteProgram && (
                          <View style={[styles.labStatCardHalf, { marginRight: 0, marginLeft: 6 }]}>
                            <Text style={styles.labStatLabel}>Programa Favorito</Text>
                            <Text style={styles.labStatValue}>{labStats.favoriteProgram}</Text>
                          </View>
                        )}
                      </View>

                      {/* Exercises Distribution - Pie Chart */}
                      {labStats.topExercises.length > 0 && (
                        <View style={styles.labStatCard}>
                          <Text style={styles.labStatLabel}>Ejercicios Realizados</Text>
                          {/* Info icon indicator */}
                          <View style={styles.exerciseInfoIconContainer}>
                            <SvgInfo width={14} height={14} color="rgba(255, 255, 255, 0.6)" />
                          </View>
                          {renderTopExercisesChart()}
                        </View>
                      )}

                      {/* PR Progression Chart */}
                      {labStats.prHistoryData.length > 0 && (
                        <TouchableOpacity
                          style={styles.labStatCard}
                          onPress={() => setIsPRInfoModalVisible(true)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.labStatCardHeader}>
                            <Text style={styles.labStatLabel}>Progresión de PRs</Text>
                            <View style={styles.prInfoIconContainer}>
                              <SvgInfo width={16} height={16} color="rgba(255, 255, 255, 0.6)" />
                            </View>
                          </View>
                          {renderPRProgressionChart()}
                        </TouchableOpacity>
                      )}

                      {/* Period Volume - Muscle Silhouette and List */}
                      {Object.keys(labStats.lastMonthVolume).length > 0 && (
                        <View style={styles.muscleVolumeSectionWrapper}>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            snapToInterval={screenWidth - Math.max(40, screenWidth * 0.1) + 15}
                            snapToAlignment="start"
                            decelerationRate="fast"
                            contentContainerStyle={styles.muscleCardsScrollContainer}
                            style={styles.muscleVolumeSection}
                            onScroll={Animated.event(
                              [{ nativeEvent: { contentOffset: { x: muscleScrollX } } }],
                              { useNativeDriver: false }
                            )}
                            scrollEventThrottle={16}
                          >
                            {/* CARD 1: Muscle Silhouette */}
                            <View style={styles.muscleCardFirst}>
                              <MuscleSilhouette
                                muscleVolumes={labStats.lastMonthVolume}
                                numberOfWeeks={labStats.weeksWithData || 1}
                                weekDisplayName={getPeriodLabel(selectedPeriod)}
                                showCurrentWeekLabel={false}
                                availableWeeks={[]}
                                selectedWeek={null}
                                currentWeek={getMondayWeek()}
                                isReadOnly={true}
                                onInfoPress={handleMuscleVolumeInfoPress}
                                showWeeklyAverageNote={true}
                              />
                            </View>
                            
                            {/* CARD 2: Muscle Sets List */}
                            <View style={styles.muscleCardSecond}>
                              {renderMuscleVolumeList()}
                            </View>
                          </ScrollView>
                          
                          {/* Pagination Indicators */}
                          <View style={styles.musclePaginationContainer}>
                            {[0, 1].map((index) => {
                              const cardWidth = screenWidth - Math.max(40, screenWidth * 0.1) + 15;
                              const inputRange = [
                                (index - 1) * cardWidth,
                                index * cardWidth,
                                (index + 1) * cardWidth,
                              ];
                              
                              const opacity = muscleScrollX.interpolate({
                                inputRange,
                                outputRange: [0.3, 1.0, 0.3],
                                extrapolate: 'clamp',
                              });
                              
                              const scale = muscleScrollX.interpolate({
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
                                    opacity: opacity,
                                    transform: [{ scale: scale }],
                                  }}
                                />
                              );
                            })}
                          </View>
                        </View>
                      )}
                    </>
                  )}
            </View>
          </ScrollView>

          {/* Tab 2: Programas */}
          <ScrollView
            ref={programasScrollRef}
            style={[styles.tabScrollView, { width: screenWidth }]}
            contentContainerStyle={[
              styles.tabScrollContent,
              { paddingTop: MAX_HEADER_HEIGHT },
            ]}
            showsVerticalScrollIndicator={false}
            onScroll={(event) => {
              const offsetY = event.nativeEvent.contentOffset.y;
              tabScrollPositions.current[2] = offsetY;
              // Only update scrollY if this is the active tab
              if (currentTabIndex === 2) {
                scrollY.setValue(offsetY);
              }
            }}
            scrollEventThrottle={8}
          >
            <View style={styles.tabPageContent}>
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
                      {/* Program Statistics */}
                      {programStats.loading ? (
                        <View style={styles.programStatsLoadingContainer}>
                          <ActivityIndicator size="small" color="#ffffff" />
                        </View>
                      ) : (
                        <View style={styles.programStatsContainer}>
                          {/* Unique Users */}
                          <View style={styles.programStatCard}>
                            <Text style={styles.programStatLabel}>Usuarios Únicos</Text>
                            <Text style={styles.programStatValue}>{programStats.uniqueUsers}</Text>
                          </View>

                          {/* Most Popular Program */}
                          {programStats.mostPopularProgram && (
                            <View style={styles.programStatCard}>
                              <Text style={styles.programStatLabel}>Programa Más Popular</Text>
                              <Text style={styles.programStatProgramName} numberOfLines={1}>
                                {programStats.mostPopularProgram.title}
                              </Text>
                              <Text style={styles.programStatSubValue}>
                                {programStats.mostPopularProgram.sessions} sesiones
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                      {/* Programs List */}
                      <View style={styles.programsContainer}>
                        {creatorPrograms.map((program, index) => (
                          <TouchableOpacity
                            key={program.id || index}
                            style={[
                              styles.programCard,
                              program.image_url && { borderWidth: 0 },
                            ]}
                            activeOpacity={0.85}
                            onPress={() => navigation.navigate('CourseDetail', { course: program })}
                          >
                            {program.image_url ? (
                              <ImageBackground
                                source={{ uri: program.image_url }}
                                style={styles.programImageBackground}
                                imageStyle={styles.programImage}
                                resizeMode="cover"
                              >
                                <View style={styles.programImageOverlay}>
                                  <View style={styles.programOverlayInfo}>
                                    <Text style={styles.programTitle} numberOfLines={1}>
                                      {program.title || `Programa ${index + 1}`}
                                    </Text>
                                    <Text style={styles.programDiscipline}>
                                      {program.discipline || 'Disciplina general'}
                                    </Text>
                                  </View>
                                </View>
                              </ImageBackground>
                            ) : (
                              <View style={styles.programFallback}>
                                <SvgCloudOff
                                  width={40}
                                  height={40}
                                  stroke="#ffffff"
                                  strokeWidth={1.5}
                                />
                                <Text style={styles.programTitle} numberOfLines={1}>
                                  {program.title || `Programa ${index + 1}`}
                                </Text>
                                <Text style={styles.programDiscipline}>
                                  {program.discipline || 'Disciplina general'}
                                </Text>
                              </View>
                            )}
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}
            </View>
          </ScrollView>
        </Animated.ScrollView>
      </View>

      {/* Period Selector Modal */}
      <Modal
        visible={isPeriodModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsPeriodModalVisible(false)}
      >
        <Pressable 
          style={styles.periodModalOverlay}
          onPress={() => setIsPeriodModalVisible(false)}
        >
          <View style={styles.periodModalContent}>
            <View style={styles.periodModalHeader}>
              <Text style={styles.periodModalTitle}>Seleccionar Período</Text>
              <TouchableOpacity 
                style={styles.periodModalCloseButton}
                onPress={() => setIsPeriodModalVisible(false)}
              >
                <Text style={styles.periodModalCloseButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.periodModalScrollView} showsVerticalScrollIndicator={false}>
              {[
                { key: 'month', label: '1 Mes' },
                { key: '3months', label: '3 Meses' },
                { key: '6months', label: '6 Meses' },
                { key: 'year', label: '1 Año' },
                { key: 'alltime', label: 'Todo el historial' }
              ].map((period, index) => (
                <TouchableOpacity
                  key={period.key}
                  style={[
                    styles.periodModalItem,
                    selectedPeriod === period.key && styles.periodModalItemSelected,
                    index === 4 && styles.periodModalItemLast
                  ]}
                  onPress={() => {
                    setSelectedPeriod(period.key);
                    setIsPeriodModalVisible(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.periodModalItemText,
                    selectedPeriod === period.key && styles.periodModalItemTextSelected
                  ]}>
                    {period.label}
                  </Text>
                  {selectedPeriod === period.key && (
                    <Text style={styles.periodModalCheckmark}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Exercise Breakdown Modal */}
      <Modal
        visible={isExerciseModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsExerciseModalVisible(false)}
      >
        <View style={styles.exerciseModalContainer}>
          {/* Header */}
          <View style={styles.exerciseModalHeader}>
            <Text style={styles.exerciseModalTitle}>
              {getPeriodLabel(selectedPeriod)}
            </Text>
            
            <TouchableOpacity 
              style={styles.exerciseModalBackButton}
              onPress={() => setIsExerciseModalVisible(false)}
            >
              <Text style={styles.exerciseModalBackText}>✕</Text>
            </TouchableOpacity>
          </View>
          
          {/* Content */}
          <ScrollView style={styles.exerciseModalContent} showsVerticalScrollIndicator={false}>
            {labStats.topExercises && labStats.topExercises.length > 0 ? (
              (() => {
                const total = labStats.topExercises.reduce((sum, ex) => sum + ex.count, 0);
                const pieChartData = prepareExercisePieChartData(labStats.topExercises);
                
                return pieChartData.map((exercise, index) => {
                  const percentage = total > 0 ? ((exercise.population / total) * 100).toFixed(1) : 0;
                  return (
                    <View key={exercise.name} style={styles.exerciseModalLegendItem}>
                      <View 
                        style={[
                          styles.exerciseModalColorIndicator, 
                          { backgroundColor: exercise.color }
                        ]} 
                      />
                      <Text style={styles.exerciseModalExerciseName}>
                        {exercise.name}
                      </Text>
                      <Text style={styles.exerciseModalPercentage}>
                        {percentage}%
                      </Text>
                    </View>
                  );
                });
              })()
            ) : (
              <View style={styles.exerciseModalEmptyContainer}>
                <Text style={styles.exerciseModalEmptyText}>No hay datos de ejercicios disponibles</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* PR Info Modal */}
      <Modal
        visible={isPRInfoModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsPRInfoModalVisible(false)}
      >
        <View style={styles.infoModalOverlay}>
          <TouchableOpacity 
            style={styles.infoModalBackdrop}
            activeOpacity={1}
            onPress={() => setIsPRInfoModalVisible(false)}
          />
          <View style={styles.infoModalContent}>
            <View style={styles.infoModalHeader}>
              <Text style={styles.infoModalTitle}>Cómo calculamos tus pesos</Text>
              <TouchableOpacity 
                style={styles.infoModalCloseButton}
                onPress={() => setIsPRInfoModalVisible(false)}
              >
                <Text style={styles.infoModalCloseButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.infoModalScrollContainer}>
              <ScrollView 
                style={styles.infoModalScrollView}
                showsVerticalScrollIndicator={true}
              >
                <Text style={styles.infoModalDescription}>
                  Tu 1RM (una repetición máxima) es el peso máximo que podrías levantar una sola vez con perfecta técnica.{'\n\n'}
                  
                  ¿Cómo lo calculamos?{'\n\n'}
                  
                  Usamos una fórmula científica derivada de la fórmula de Epley, pero desarrollada específicamente por nosotros para considerar:{'\n'}
                  • El peso que levantaste{'\n'}
                  • Las repeticiones que completaste{'\n'}
                  • La intensidad del esfuerzo (escala del 1 al 10){'\n\n'}
                  
                  Fórmula:{'\n'}
                  1RM = Peso × (1 + 0.0333 × Reps) / (1 - 0.025 × (10 - Intensidad)){'\n\n'}
                  
                  Ejemplo práctico:{'\n'}
                  Si hiciste 80kg × 8 reps a intensidad 8/10:{'\n'}
                  → Tu 1RM estimado sería: 100kg{'\n\n'}
                  
                  ¿Por qué es útil?{'\n\n'}
                  
                  • Te sugiere pesos personalizados para cada entrenamiento{'\n'}
                  • Rastrea tu progreso real en fuerza{'\n'}
                  • Se actualiza automáticamente después de cada sesión{'\n'}
                  • Te ayuda a entrenar en el rango correcto de intensidad{'\n\n'}
                  
                  Nota: El sistema redondea las sugerencias a 5kg o 2,5kg dependiendo del ejercicio para facilitar el uso de discos estándar.
                </Text>
                
                {/* Disclaimers Section */}
                <View style={styles.disclaimersSection}>
                  <Text style={styles.disclaimersTitle}>Importante:</Text>
                  <Text style={styles.disclaimerText}>
                    • Estas son solo estimaciones y sugerencias
                  </Text>
                  <Text style={styles.disclaimerText}>
                    • Cada persona debe usar pesos con los que se sienta cómoda
                  </Text>
                  <Text style={styles.disclaimerText}>
                    • Busca ayuda profesional para cada ejercicio
                  </Text>
                  <Text style={styles.disclaimerText}>
                    • No nos hacemos responsables de lesiones
                  </Text>
                  <Text style={styles.disclaimerText}>
                    • Siempre usa técnica perfecta
                  </Text>
                  <Text style={styles.disclaimerText}>
                    • Consulta nuestros términos y condiciones
                  </Text>
                </View>
              </ScrollView>
              
              {/* Scroll indicator */}
              <View style={styles.scrollIndicator}>
                <Text style={styles.scrollIndicatorText}>Desliza</Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Muscle Volume Info Modal */}
      <Modal
        visible={isMuscleVolumeInfoModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsMuscleVolumeInfoModalVisible(false)}
      >
        <View style={styles.muscleVolumeInfoModalOverlay}>
          <TouchableOpacity 
            style={styles.muscleVolumeInfoModalBackdrop}
            activeOpacity={1}
            onPress={() => setIsMuscleVolumeInfoModalVisible(false)}
          />
          <View style={styles.muscleVolumeInfoModalContent}>
            <View style={styles.muscleVolumeInfoModalHeader}>
              <Text style={styles.muscleVolumeInfoModalTitle}>
                {selectedMuscleVolumeInfo?.title || ''}
              </Text>
              <TouchableOpacity 
                style={styles.muscleVolumeInfoCloseButton}
                onPress={() => setIsMuscleVolumeInfoModalVisible(false)}
              >
                <Text style={styles.muscleVolumeInfoCloseButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.muscleVolumeInfoScrollContainer}>
              <ScrollView 
                style={styles.muscleVolumeInfoScrollView}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.muscleVolumeInfoModalDescription}>
                  {selectedMuscleVolumeInfo?.description || ''}
                </Text>
                
                {/* Disclaimers Section */}
                {selectedMuscleVolumeInfo?.disclaimers && selectedMuscleVolumeInfo.disclaimers.length > 0 && (
                  <View style={styles.disclaimersSection}>
                    <Text style={styles.disclaimersTitle}>Importante:</Text>
                    {selectedMuscleVolumeInfo.disclaimers.map((disclaimer, index) => (
                      <Text key={index} style={styles.disclaimerText}>
                        • {disclaimer}
                      </Text>
                    ))}
                  </View>
                )}
              </ScrollView>
              
              {/* Scroll indicator */}
              <View style={styles.scrollIndicator}>
                <Text style={styles.scrollIndicatorText}>Desliza</Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <FixedWakeHeader
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
        backgroundColor="transparent"
      />
    </View>
  );
};

const createStyles = (screenWidth, screenHeight, STORY_CARD_WIDTH, STORY_CARD_HEIGHT) => StyleSheet.create({
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
  fixedTabBar: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  heroContainer: {
    width: '100%',
    backgroundColor: '#1f1f1f',
    overflow: 'hidden',
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 0,
    position: 'relative',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  tabTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500',
  },
  tabTitleActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  tabIndicator: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
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
  },
  storyMedia: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  storyMediaImage: {
    borderRadius: 16,
  },
  storyPauseOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  storyVolumeContainer: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  storyRestartContainer: {
    position: 'absolute',
    top: 60,
    right: 12,
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
  programStatsLoadingContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  programStatsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  programStatCard: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    padding: 16,
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  programStatLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '500',
    marginBottom: 8,
  },
  programStatValue: {
    fontSize: 24,
    color: '#ffffff',
    fontWeight: '600',
  },
  programStatProgramName: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
    marginBottom: 4,
  },
  programStatSubValue: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '400',
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
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 160,
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
    paddingBottom: Math.max(100, screenHeight * 0.12),
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
    paddingBottom: Math.max(100, screenHeight * 0.12), // Added bottom padding for desliza overlay
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

