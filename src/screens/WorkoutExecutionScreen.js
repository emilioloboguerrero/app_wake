// INCREMENTAL RESTORATION - Starting with minimal working version
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Modal,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  TextInput,
  Keyboard,
} from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Essential imports only
import { useAuth } from '../contexts/AuthContext';
import { useVideo } from '../contexts/VideoContext';
import { isWeb } from '../utils/platform';
import logger from '../utils/logger.js';
import sessionManager from '../services/sessionManager';
import { FixedWakeHeader, WakeHeaderSpacer } from '../components/WakeHeader';
import SvgListChecklist from '../components/icons/SvgListChecklist';

const WorkoutExecutionScreen = ({ navigation, route }) => {
  console.log('[INCREMENTAL] 🔴 Component START');
  
  // Extract route params
  const { course, workout, sessionId } = route.params || {};
  
  // Basic state
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false); // For button disable logic
  const [topCardIndex, setTopCardIndex] = useState(0); // For swipeable top cards pagination
  const [isSetInputVisible, setIsSetInputVisible] = useState(false);
  const [currentSetInputData, setCurrentSetInputData] = useState({});
  
  // Context hooks
  const { user } = useAuth();
  const { isMuted, toggleMute } = useVideo();
  
  // Refs
  const scrollViewRef = useRef(null);
  
  // Helper functions
  const getCurrentExercise = useCallback(() => {
    if (!workout?.exercises || workout.exercises.length === 0) return null;
    return workout.exercises[currentExerciseIndex];
  }, [workout, currentExerciseIndex]);

  const getCurrentSet = useCallback(() => {
    const exercise = getCurrentExercise();
    if (!exercise?.sets || exercise.sets.length === 0) return null;
    return exercise.sets[currentSetIndex];
  }, [getCurrentExercise, currentSetIndex]);
  
  const currentExercise = getCurrentExercise();
  const currentSet = getCurrentSet();

  // Handler for opening set input (from original)
  const handleOpenSetInput = useCallback(() => {
    console.log('[INCREMENTAL] Open set input button pressed');
    const currentSet = getCurrentSet();
    const currentExercise = getCurrentExercise();
    
    // Initialize input data with current set values or empty
    const measures = currentExercise?.measures || [];
    const initialData = {};
    measures.forEach(measure => {
      if (currentSet && currentSet[measure] !== undefined) {
        initialData[measure] = String(currentSet[measure]);
      } else {
        initialData[measure] = '';
      }
    });
    
    setCurrentSetInputData(initialData);
    setIsSetInputVisible(true);
  }, [getCurrentSet, getCurrentExercise]);

  // Handler for canceling set input
  const handleCancelSetInput = useCallback(() => {
        setIsSetInputVisible(false);
        setCurrentSetInputData({});
  }, []);

  // Handler for saving set data (simplified for now)
  const handleSaveSetData = useCallback(() => {
    console.log('[INCREMENTAL] Saving set data:', currentSetInputData);
    // TODO: Implement actual save functionality
    alert('Set data saved! (Functionality to be implemented)');
    handleCancelSetInput();
  }, [currentSetInputData, handleCancelSetInput]);

  // Get display name for field
  const getFieldDisplayName = useCallback((field) => {
    const fieldNames = {
      'weight': 'Peso',
      'reps': 'Repeticiones',
      'rpe': 'RPE',
      'rest': 'Descanso',
      'duration': 'Duración',
      'distance': 'Distancia',
    };
    return fieldNames[field.toLowerCase()] || field.charAt(0).toUpperCase() + field.slice(1);
  }, []);
  
  // Handler for top card scroll (from original)
  const onTopCardScroll = useCallback((event) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const cardWidth = screenWidth - 33; // snapToInterval width
    const newIndex = Math.round(offsetX / cardWidth);
    if (newIndex !== topCardIndex) {
      setTopCardIndex(newIndex);
    }
  }, [topCardIndex]);
  
  // Basic initialization
  useEffect(() => {
    const initializeWorkout = async () => {
      if (!workout || !user) return;
      
    try {
      setLoading(true);
        logger.log('[INCREMENTAL] Initializing workout...');
        
        // Check for existing session
        let session = await sessionManager.getCurrentSession();
      
        if (!session && sessionId) {
          session = await sessionManager.startSession(
            user.uid,
            course?.courseId,
            sessionId,
            workout.title || 'Workout Session'
        );
          logger.log('[INCREMENTAL] ✅ New session started');
        } else if (session) {
          logger.log('[INCREMENTAL] ✅ Using existing session');
        }
    } catch (error) {
        logger.error('[INCREMENTAL] ❌ Error initializing:', error);
    } finally {
      setLoading(false);
    }
  };

    // Defer on web
    if (isWeb) {
      setTimeout(() => initializeWorkout(), 0);
          } else {
      initializeWorkout();
    }
  }, [workout, user, sessionId, course]);
  
  // Early returns
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <FixedWakeHeader />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.loadingText}>Inicializando entrenamiento...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!currentExercise || !currentSet) {
    return (
      <SafeAreaView style={styles.container}>
        <FixedWakeHeader />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>No hay ejercicios disponibles</Text>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>Volver</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
    }
    
    return (
    <SafeAreaView style={styles.container}>
      <FixedWakeHeader 
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
      />
        <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
          ref={scrollViewRef}
      >
                  <WakeHeaderSpacer />
                  
        {/* Component 1: Exercise Title Section (ORIGINAL UI) */}
              <View style={styles.exerciseTitleSection}>
                <TouchableOpacity
                  onPress={() => {
              // TODO: Navigate to list view when we add that functionality
              console.log('[INCREMENTAL] Exercise title pressed - list view navigation');
                  }}
                  activeOpacity={0.7}
                >
                  <Text 
                    style={styles.exerciseTitle}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
              {workout?.exercises?.[currentExerciseIndex]?.name || 'Ejercicio'}
                  </Text>
                </TouchableOpacity>
              </View>
              
        {/* Component 2: Swipeable Top Cards (ORIGINAL UI) */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                onScroll={onTopCardScroll}
                scrollEventThrottle={16}
          style={styles.topCardsContainer}
                contentContainerStyle={{ gap: 15 }}
                snapToInterval={screenWidth - 33}
                snapToAlignment="start"
                decelerationRate="fast"
              >
                {/* First Card - Video */}
          <View style={styles.videoCard}>
                    <View style={styles.videoPlaceholder}>
                      <Text style={styles.videoPlaceholderText}>Video no disponible</Text>
                    </View>
                </View>
                
          {/* Second Card - Muscle Activation + Implements (placeholder for now) */}
                <View style={styles.exerciseTitleCard}>
                  <Text style={styles.instructionsTitle}>Activación muscular</Text>
                  <View style={styles.muscleSilhouetteWrapper}>
                        <View style={styles.muscleEmptyState}>
                          <Text style={styles.muscleEmptyText}>
                            No hay datos de activación muscular para este ejercicio.
                          </Text>
                        </View>
                  </View>
                </View>
              </ScrollView>
              
        {/* Component 2b: Top Cards Pagination Indicators (ORIGINAL UI) */}
              <View style={styles.topCardsIndicator}>
          {/* Simple pagination dots - will be enhanced later */}
          <View style={styles.paginationDots}>
            <View style={[styles.paginationDot, topCardIndex === 0 && styles.paginationDotActive]} />
            <View style={[styles.paginationDot, topCardIndex === 1 && styles.paginationDotActive]} />
          </View>
      </View>
      
        {/* Component 3: Objetivos Section (ORIGINAL UI) */}
              <View style={styles.objetivosSection}>
                <Text style={styles.objetivosTitle}>Objetivos</Text>
              </View>
              
        {/* Component 4: Dynamic Horizontal Cards Layout (ORIGINAL UI) */}
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalCardsContainer}
                style={styles.horizontalCardsScrollView}
              >
                {(() => {
            // Get objectives from current set
            const currentSet = getCurrentSet();
                  const objectives = workout?.exercises?.[currentExerciseIndex]?.objectives || [];
                  
            // Sort objectives: reps, previous first, then rest
                  const sortedObjectives = [...objectives].sort((a, b) => {
                    const order = ['reps', 'previous'];
                    const aIndex = order.indexOf(a.toLowerCase());
                    const bIndex = order.indexOf(b.toLowerCase());
                    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
                    if (aIndex !== -1) return -1;
                    if (bIndex !== -1) return 1;
                    return 0;
                  });
                  
                  return (
                    <>
                {/* Objectives Cards */}
                      {sortedObjectives.map((objective, index) => {
                  // Get value for this objective from current set
                  let value = '';
                  if (currentSet) {
                    value = currentSet[objective] || currentSet[objective.toLowerCase()] || 'N/A';
                  }
                  
                        return (
                          <TouchableOpacity
                            key={`objective-${currentExerciseIndex}-${index}-${objective}`}
                            style={styles.horizontalCard}
                      onPress={() => {
                        console.log('[INCREMENTAL] Objective card pressed:', objective);
                      }}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.metricTitle}>
                        {objective.charAt(0).toUpperCase() + objective.slice(1)}
                            </Text>
                            <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                        {value}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                      
                      {/* Progreso Card */}
                      <TouchableOpacity
                        key="progreso-card"
                        style={styles.horizontalCard}
                  onPress={() => {
                    console.log('[INCREMENTAL] Progreso card pressed');
                  }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.metricTitle}>Progreso</Text>
                  <Text style={styles.metricValue}>Ver</Text>
                      </TouchableOpacity>
                    </>
                  );
                })()}
              </ScrollView>
                  
        {/* Component 7: Button Container (from original) */}
                  <View style={styles.buttonContainer}>
                    {/* Simple Set Input Button */}
                    <TouchableOpacity 
                      style={[
                        styles.inputSetButton,
                        isEditMode && styles.inputSetButtonDisabled
                      ]}
                      onPress={handleOpenSetInput}
                      disabled={isEditMode}
          >
                      <Text style={[
                        styles.inputSetButtonText,
                        isEditMode && styles.inputSetButtonTextDisabled
                      ]}>
                        Registrar: serie {currentSetIndex + 1} de {workout?.exercises?.[currentExerciseIndex]?.sets?.length || 0}
                      </Text>
                    </TouchableOpacity>
                    
                    {/* List Screen Button */}
          <TouchableOpacity 
                      style={styles.listScreenButton}
                      onPress={() => {
              // TODO: Switch to list view when we add that functionality
              console.log('[INCREMENTAL] List screen button pressed');
                      }}
                    >
                      <SvgListChecklist width={24} height={24} color="rgba(191, 168, 77, 1)" />
                    </TouchableOpacity>
        </View>
            
        <View style={styles.testSection}>
          <Text style={styles.testTitle}>INCREMENTAL RESTORATION - Step 8</Text>
          <Text style={styles.testInfo}>
            ✅ Added: Title + Swipeable Top Cards + Pagination + Objetivos + Buttons
                    </Text>
          <Text style={styles.testInfo}>
            Set: {currentSetIndex + 1} / {currentExercise?.sets?.length || 0}
              </Text>
              
                  <TouchableOpacity 
            style={styles.testButton}
                      onPress={() => {
              console.log('[INCREMENTAL] 🟢 TEST BUTTON PRESSED - Screen is responsive!');
              alert('✅ Component 7 added successfully! Ready for next component.');
            }}
          >
            <Text style={styles.testButtonText}>TEST BUTTON</Text>
                                </TouchableOpacity>
                            </View>
              </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Math.max(24, screenWidth * 0.06),
    paddingTop: Math.max(10, screenHeight * 0.012),
    paddingBottom: Math.max(80, screenHeight * 0.1),
  },
  loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    paddingTop: Math.max(120, screenHeight * 0.15),
  },
  loadingText: {
    color: '#cccccc',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '400',
    marginTop: Math.max(12, screenHeight * 0.015),
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Math.max(24, screenWidth * 0.06),
  },
  errorText: {
    color: '#ff4444',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: Math.max(20, screenHeight * 0.025),
  },
  backButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    paddingVertical: Math.max(12, screenHeight * 0.015),
    borderRadius: Math.max(8, screenWidth * 0.02),
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
  },
  exerciseTitleSection: {
    marginBottom: Math.max(10, screenHeight * 0.012),
    paddingTop: 0,
    marginTop: Math.max(-15, screenHeight * -0.02),
  },
  exerciseTitle: {
    fontSize: Math.min(screenWidth * 0.08, 32),
    color: '#ffffff',
    fontWeight: '600',
    textAlign: 'left',
    paddingLeft: Math.max(24, screenWidth * 0.06),
  },
  descriptionSection: {
    paddingHorizontal: Math.max(24, screenWidth * 0.06),
    marginBottom: Math.max(15, screenHeight * 0.02),
  },
  setInfoSection: {
    paddingHorizontal: Math.max(24, screenWidth * 0.06),
    marginBottom: Math.max(10, screenHeight * 0.012),
  },
  setInfoText: {
    fontSize: Math.min(screenWidth * 0.045, 18),
    color: '#007AFF',
    fontWeight: '600',
    textAlign: 'center',
  },
  exerciseDescriptionText: {
    fontSize: Math.min(screenWidth * 0.035, 14),
    color: '#ffffff',
    lineHeight: Math.max(22, screenHeight * 0.03),
    textAlign: 'left',
    fontWeight: '500',
  },
  objetivosSection: {
    marginTop: Math.max(-20, screenHeight * -0.025),
    marginBottom: Math.max(15, screenHeight * 0.02),
    paddingLeft: Math.max(24, screenWidth * 0.06),
  },
  objetivosTitle: {
    fontSize: Math.min(screenWidth * 0.05, 20),
    fontWeight: '600',
    color: '#ffffff',
    marginLeft: 0,
  },
  topCardsContainer: {
    marginBottom: Math.max(5, screenHeight * 0.006),
    overflow: 'visible',
  },
  topCardsIndicator: {
    alignItems: 'center',
    marginBottom: Math.max(15, screenHeight * 0.018),
  },
  paginationDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  paginationDotActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    width: 24,
  },
  exerciseTitleCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    paddingTop: Math.max(20, screenWidth * 0.05),
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    paddingBottom: Math.max(10, screenWidth * 0.025),
    marginBottom: -5,
    marginTop: -5,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    height: Math.max(430, screenHeight * 0.53),
    overflow: 'visible',
    flexDirection: 'column',
    justifyContent: 'flex-start',
    width: screenWidth - Math.max(48, screenWidth * 0.12),
  },
  instructionsTitle: {
    fontSize: Math.min(screenWidth * 0.05, 20),
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: Math.max(12, screenHeight * 0.015),
  },
  muscleSilhouetteWrapper: {
    width: '100%',
    marginBottom: 0,
    paddingBottom: 0,
  },
  muscleEmptyState: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Math.max(16, screenWidth * 0.04),
    minHeight: 280,
  },
  muscleEmptyText: {
    color: '#cccccc',
    fontSize: Math.min(screenWidth * 0.035, 14),
    textAlign: 'center',
  },
  horizontalCardsScrollView: {
    marginBottom: Math.max(15, screenHeight * 0.018),
    overflow: 'visible',
  },
  horizontalCardsContainer: {
    flexDirection: 'row',
    gap: Math.max(10, screenWidth * 0.025),
    overflow: 'visible',
    paddingHorizontal: Math.max(24, screenWidth * 0.06),
  },
  horizontalCard: {
    minWidth: Math.max(140, screenWidth * 0.35),
    maxWidth: Math.max(160, screenWidth * 0.4),
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    height: Math.max(80, screenHeight * 0.1),
    justifyContent: 'center',
    alignItems: 'center',
    padding: Math.max(15, screenWidth * 0.04),
    paddingRight: Math.max(25, screenWidth * 0.06),
    position: 'relative',
  },
  metricTitle: {
    fontSize: Math.min(screenWidth * 0.03, 12),
    fontWeight: '500',
    color: '#ffffff',
    opacity: 0.8,
    textAlign: 'center',
    marginBottom: Math.max(4, screenHeight * 0.005),
  },
  metricValue: {
    fontSize: Math.min(screenWidth * 0.06, 24),
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
  },
  metricValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  videoCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    padding: 0,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    height: Math.max(430, screenHeight * 0.53),
    overflow: 'hidden',
    position: 'relative',
    width: screenWidth - Math.max(48, screenWidth * 0.12),
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#333333',
  },
  videoPlaceholderText: {
    fontSize: 16,
    color: '#ffffff',
    opacity: 0.6,
  },
  navigationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Math.max(12, screenWidth * 0.03),
    paddingHorizontal: Math.max(24, screenWidth * 0.06),
    marginBottom: Math.max(20, screenHeight * 0.025),
  },
  navButton: {
    flex: 1,
    paddingVertical: Math.max(16, screenHeight * 0.02),
    borderRadius: Math.max(12, screenWidth * 0.04),
    alignItems: 'center',
  },
  previousButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#666666',
  },
  nextButton: {
    backgroundColor: '#007AFF',
  },
  disabledButton: {
    opacity: 0.5,
  },
  navButtonText: {
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
    color: '#ffffff',
  },
  buttonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Math.max(10, screenWidth * 0.025),
    paddingHorizontal: Math.max(24, screenWidth * 0.06),
    marginBottom: Math.max(20, screenHeight * 0.025),
  },
  inputSetButton: {
    flex: 1,
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    borderRadius: Math.max(12, screenWidth * 0.04),
    paddingVertical: Math.max(16, screenHeight * 0.02),
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.2,
    borderColor: '#ffffff',
    shadowColor: 'rgba(191, 168, 77, 0.72)',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  inputSetButtonText: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
    textAlign: 'center',
  },
  inputSetButtonDisabled: {
    backgroundColor: '#666666',
    opacity: 0.6,
    shadowOpacity: 0,
  },
  inputSetButtonTextDisabled: {
    color: '#cccccc',
  },
  listScreenButton: {
    width: Math.max(60, screenWidth * 0.15),
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    borderRadius: Math.max(12, screenWidth * 0.04),
    paddingVertical: Math.max(14, screenHeight * 0.017),
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(191, 168, 77, 0.72)',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  testSection: {
    padding: 20,
    alignItems: 'center',
  },
  testTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  testInfo: {
    color: '#ffffff',
    fontSize: 16,
    marginBottom: 10,
  },
  testButton: {
    backgroundColor: '#BFA84D',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 8,
    marginTop: 30,
  },
  testButtonText: {
    color: '#1a1a1a',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default WorkoutExecutionScreen;
