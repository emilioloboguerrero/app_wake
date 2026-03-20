import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
  Animated,
  Modal,
  Pressable,
  TouchableWithoutFeedback,
} from 'react-native';
import { auth } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import oneRepMaxService from '../services/oneRepMaxService';
import exerciseHistoryService from '../services/exerciseHistoryService';
import PRHistoryChart from '../components/PRHistoryChart';
import RepEstimatesCard from '../components/RepEstimatesCard';
import ExerciseHistoryCard from '../components/ExerciseHistoryCard';
import ExerciseProgressChart from '../components/ExerciseProgressChart';
import SvgInfo from '../components/icons/SvgInfo';
import { filterSessionsByPeriod, getSessionDateAsDate } from '../utils/sessionFilter';
import { getGapAfterHeader } from './WakeHeader';
import logger from '../utils/logger.js';
import WakeLoader from './WakeLoader';

const ExerciseDetailContent = ({ 
  exerciseKey, 
  exerciseName, 
  libraryId, 
  currentEstimate, 
  lastUpdated,
  onResetPR,
  onViewAllHistory,
  showResetButton = false,
  showInfoModal = true,
  showTitle = true,
  headerSpacerHeight = 0
}) => {
  const componentStartTime = performance.now();
  
  // Use hook for reactive dimensions that update on orientation change
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  
  // Create styles with dimensions
  const stylesStartTime = performance.now();
  const styles = createStyles(screenWidth, screenHeight);
  const stylesDuration = performance.now() - stylesStartTime;
  if (stylesDuration > 10) {
    logger.warn(`[CHILD] ⚠️ SLOW: ExerciseDetailContent createStyles took ${stylesDuration.toFixed(2)}ms`);
  }
  
  const { user: contextUser } = useAuth();
  const user = contextUser || auth.currentUser;
  const [history, setHistory] = useState([]);
  const [exerciseHistory, setExerciseHistory] = useState([]);
  
  // Debug: Log when exerciseHistory changes
  useEffect(() => {
    logger.debug('📊 ExerciseDetailContent: exerciseHistory state changed:', {
      length: exerciseHistory.length,
      isArray: Array.isArray(exerciseHistory),
      firstSession: exerciseHistory[0] ? {
        hasDate: !!exerciseHistory[0].date,
        date: exerciseHistory[0].date,
        hasCompletedAt: !!exerciseHistory[0].completedAt,
        completedAt: exerciseHistory[0].completedAt
      } : null
    });
  }, [exerciseHistory]);
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [isInfoModalVisible, setIsInfoModalVisible] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('3months');

  // Scroll tracking for pagination indicator
  const scrollX = new Animated.Value(0);

  // Scroll handler for pagination indicator
  const onHorizontalScroll = (event) => {
    scrollX.setValue(event.nativeEvent.contentOffset.x);
  };

  useEffect(() => {
    logger.debug('🔍 ExerciseDetailContent useEffect triggered:', {
      exerciseKey,
      libraryId,
      exerciseName,
      hasUser: !!user,
      userUid: user?.uid,
      shouldLoad: !!(exerciseKey && libraryId && exerciseName && user?.uid)
    });
    
    // Reset loading states when exercise changes
    setLoading(true);
    setLoadingHistory(true);
    setHistory([]);
    setExerciseHistory([]);
    
    if (exerciseKey && libraryId && exerciseName && user?.uid) {
      logger.debug('🔍 Calling loadHistory() and loadExerciseHistory()');
      loadHistory();
      loadExerciseHistory();
    } else {
      logger.warn('⚠️ ExerciseDetailContent: Cannot load history - missing required data:', {
        hasExerciseKey: !!exerciseKey,
        hasLibraryId: !!libraryId,
        hasExerciseName: !!exerciseName,
        hasUserUid: !!user?.uid
      });
      // Set loading to false if we can't load (to avoid infinite loading)
      setLoading(false);
      setLoadingHistory(false);
    }
  }, [exerciseKey, libraryId, exerciseName, user?.uid]);

  const loadHistory = async () => {
    if (!user?.uid) {
      logger.warn('⚠️ ExerciseDetailContent: Cannot load history - user not available');
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      logger.debug('📊 Loading PR history for:', { exerciseKey, libraryId, exerciseName });
      const data = await oneRepMaxService.getHistoryForExercise(
        user.uid,
        libraryId,
        exerciseName
      );
      setHistory(data || []);
      logger.debug('✅ PR history loaded:', (data || []).length, 'entries for', exerciseName);
    } catch (error) {
      logger.error('❌ Error loading PR history:', error);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  };

  const loadExerciseHistory = async () => {
    if (!user?.uid) {
      logger.warn('⚠️ ExerciseDetailContent: Cannot load exercise history - user not available');
      setLoadingHistory(false);
      return;
    }
    
    try {
      setLoadingHistory(true);
      logger.debug('📊 Loading exercise history for:', exerciseKey);
      const data = await exerciseHistoryService.getExerciseHistory(user.uid, exerciseKey);
      const sessions = data?.sessions || [];
      logger.debug('✅ Exercise history loaded:', sessions.length, 'sessions for', exerciseKey);
      logger.debug('📊 Exercise history data structure:', {
        hasSessions: !!sessions,
        sessionsLength: sessions.length,
        firstSession: sessions[0] ? {
          hasDate: !!sessions[0].date,
          date: sessions[0].date,
          hasSets: !!sessions[0].sets,
          setsLength: sessions[0].sets?.length || 0
        } : null
      });
      setExerciseHistory(sessions);
    } catch (error) {
      logger.error('❌ Error loading exercise history:', error);
      setExerciseHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const handlePeriodChange = (period) => {
    setSelectedPeriod(period);
  };

  const filteredSessions = useMemo(() => {
    logger.debug('📊 ExerciseDetailContent: Calculating filteredSessions:', {
      exerciseHistoryLength: exerciseHistory.length,
      selectedPeriod,
      exerciseHistoryType: Array.isArray(exerciseHistory) ? 'array' : typeof exerciseHistory
    });
    const filtered = filterSessionsByPeriod(exerciseHistory, selectedPeriod);
    logger.debug('📊 ExerciseDetailContent: Filtered sessions result:', {
      totalSessions: exerciseHistory.length,
      filteredCount: filtered.length,
      period: selectedPeriod,
      filteredType: Array.isArray(filtered) ? 'array' : typeof filtered
    });
    if (filtered.length > 0) {
      const first = filtered[0];
      const dateRaw = first.date || first.completedAt;
      logger.debug('📊 ExerciseDetailContent: First filtered session debug:', {
        hasDate: !!dateRaw,
        dateType: dateRaw == null ? 'null' : typeof dateRaw,
        dateSeconds: dateRaw?.seconds,
        hasSets: !!first.sets,
        setsLength: first.sets?.length ?? 0,
        firstSetKeys: first.sets?.[0] ? Object.keys(first.sets[0]) : [],
        firstSetSample: first.sets?.[0] ? { reps: first.sets[0].reps, weight: first.sets[0].weight } : null
      });
    } else if (exerciseHistory.length > 0) {
      const first = exerciseHistory[0];
      const dateRaw = first.date || first.completedAt;
      const parsed = getSessionDateAsDate(dateRaw);
      logger.debug('📊 ExerciseDetailContent: All sessions filtered out – date debug:', {
        period: selectedPeriod,
        totalSessions: exerciseHistory.length,
        firstSessionDateRaw: dateRaw,
        firstSessionDateParsed: parsed ? parsed.toISOString() : null,
        hasDateSeconds: typeof dateRaw?.seconds === 'number'
      });
    }
    return filtered;
  }, [exerciseHistory, selectedPeriod]);

  const renderPaginationIndicators = () => {
    return (
      <View style={styles.paginationContainer}>
        {[0, 1].map((index) => {
          const cardWidth = screenWidth - Math.max(48, screenWidth * 0.12);
          const inputRange = [
            (index - 1) * cardWidth,
            index * cardWidth,
            (index + 1) * cardWidth,
          ];
          
          const opacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.3, 1.0, 0.3],
            extrapolate: 'clamp',
          });
          
          const scale = scrollX.interpolate({
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
    );
  };

  const jsxStartTime = performance.now();
  
  return (
    <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
      {(() => {
        const contentStartTime = performance.now();
        return null;
      })()}
      <View style={styles.content}>
        {/* Spacer for fixed header - matches header height */}
        {headerSpacerHeight > 0 && <View style={{ height: headerSpacerHeight }} />}
        {/* Same gap between header and content as WakeHeaderContent (getGapAfterHeader is PWA-aware on web) */}
        {headerSpacerHeight > 0 && <View style={{ marginTop: getGapAfterHeader(), height: Math.max(48, screenHeight * 0.1) }} />}
        
        {/* Top padding when used in modal (no title, no header spacer) */}
        {!showTitle && headerSpacerHeight === 0 && (
          <View style={{ height: Math.max(10, screenHeight * 0.01) }} />
        )}
        
        {/* Title */}
        {showTitle && <Text style={styles.title}>{exerciseName}</Text>}
        
        {/* Current PR Info */}
        {currentEstimate && showInfoModal && (
          <TouchableOpacity 
            style={styles.currentPRCard}
            onPress={() => setIsInfoModalVisible(true)}
            activeOpacity={0.7}
          >
            <View style={styles.currentPRLabelContainer}>
              <Text style={styles.currentPRLabel}>1RM Estimado</Text>
              <View style={styles.cardInfoButton}>
                <SvgInfo width={16} height={16} color="rgba(255, 255, 255, 0.6)" />
              </View>
            </View>
            <Text style={styles.currentPRValue}>{currentEstimate}kg</Text>
            <Text style={styles.currentPRDate}>
              Última actualización: {formatDate(lastUpdated)}
            </Text>
          </TouchableOpacity>
        )}
        
        {/* History Chart Card */}
        {loading ? (
          <View style={styles.chartCard}>
            <Text style={styles.cardTitle}>Historial de los PRs</Text>
            <View style={styles.loadingContainer}>
              <WakeLoader />
            </View>
          </View>
        ) : (
          <PRHistoryChart history={history} />
        )}
        
        {/* Rep Estimates Card */}
        {currentEstimate && (
          <RepEstimatesCard oneRM={currentEstimate} />
        )}
        
        {/* Spacer for vertical separation */}
        <View style={styles.verticalSpacer} />
        
        
        {/* Exercise History and Progress Charts */}
        <ScrollView 
          horizontal={true}
          showsHorizontalScrollIndicator={false}
          style={styles.horizontalScrollContainer}
          contentContainerStyle={styles.horizontalScrollContent}
          onScroll={onHorizontalScroll}
          scrollEventThrottle={16}
          snapToInterval={screenWidth - Math.max(48, screenWidth * 0.12) + Math.max(12, screenWidth * 0.03)}
          snapToAlignment="start"
          decelerationRate="fast"
        >
          <View style={styles.cardContainer}>
            <ExerciseProgressChart 
              exerciseKey={exerciseKey}
              exerciseName={exerciseName}
              sessions={filteredSessions} 
              loading={loadingHistory}
              selectedPeriod={selectedPeriod}
              onPeriodChange={handlePeriodChange}
            />
          </View>
          <View style={styles.cardContainer}>
            <ExerciseHistoryCard 
              exerciseKey={exerciseKey}
              exerciseName={exerciseName}
              sessions={filteredSessions} 
              loading={loadingHistory}
              maxSessions={5}
              onViewAll={onViewAllHistory}
            />
          </View>
        </ScrollView>
        
        {/* Pagination Indicators */}
        {renderPaginationIndicators()}
      </View>

      {/* Info Modal */}
      {showInfoModal && (
        <Modal
          visible={isInfoModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setIsInfoModalVisible(false)}
        >
          <View style={styles.infoModalOverlay}>
            <TouchableOpacity 
              style={styles.infoModalBackdrop}
              activeOpacity={1}
              onPress={() => setIsInfoModalVisible(false)}
            />
            <View style={styles.infoModalContent}>
              <View style={styles.infoModalHeader}>
                <Text style={styles.infoModalTitle}>Cómo calculamos tus pesos</Text>
                <TouchableOpacity 
                  style={styles.infoModalCloseButton}
                  onPress={() => setIsInfoModalVisible(false)}
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
      )}
      {(() => {
        const jsxEndTime = performance.now();
        const jsxDuration = jsxEndTime - jsxStartTime;
        if (jsxDuration > 50) {
          logger.warn(`[CHILD] ⚠️ SLOW: ExerciseDetailContent JSX creation took ${jsxDuration.toFixed(2)}ms`);
        }
        return null;
      })()}
    </ScrollView>
  );
  
  // Track component render completion using useEffect
  useEffect(() => {
    const componentEndTime = performance.now();
    const componentDuration = componentEndTime - componentStartTime;
    if (componentDuration > 50) {
      logger.warn(`[CHILD] ⚠️ SLOW: ExerciseDetailContent total render took ${componentDuration.toFixed(2)}ms`);
    }
  });
};

// Styles function - takes screenWidth and screenHeight as parameters
const createStyles = (screenWidth, screenHeight) => StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Math.max(24, screenWidth * 0.06),
    paddingBottom: Math.max(40, screenHeight * 0.05),
  },
  title: {
    fontSize: Math.min(screenWidth * 0.07, 28),
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'left',
    paddingLeft: Math.max(24, screenWidth * 0.06),
    marginTop: 0, // No margin - spacer in parent handles it
    marginBottom: Math.max(20, screenHeight * 0.025),
  },
  currentPRCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    padding: Math.max(20, screenWidth * 0.05),
    marginBottom: Math.max(20, screenHeight * 0.025),
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  currentPRLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Math.max(8, screenHeight * 0.01),
  },
  currentPRLabel: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '500',
    opacity: 0.7,
  },
  cardInfoButton: {
    padding: Math.max(4, screenWidth * 0.01),
    marginLeft: Math.max(6, screenWidth * 0.015),
  },
  currentPRValue: {
    color: 'rgba(255, 255, 255, 1)',
    fontSize: Math.min(screenWidth * 0.12, 48),
    fontWeight: '700',
    marginBottom: Math.max(8, screenHeight * 0.01),
  },
  currentPRDate: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.035, 14),
    opacity: 0.5,
  },
  chartCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    padding: Math.max(20, screenWidth * 0.05),
    marginBottom: Math.max(20, screenHeight * 0.025),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.05, 20),
    fontWeight: '600',
    marginBottom: Math.max(16, screenHeight * 0.02),
  },
  chartContainer: {
    overflow: 'hidden',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: Math.max(60, screenHeight * 0.075),
    paddingBottom: Math.max(60, screenHeight * 0.075),
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    justifyContent: 'center',
  },
  loadingText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    marginTop: Math.max(12, screenHeight * 0.015),
    marginBottom: Math.max(10, screenHeight * 0.012),
    opacity: 0.7,
    textAlign: 'center',
  },
  horizontalScrollContainer: {
    marginHorizontal: Math.max(-24, -screenWidth * 0.06),
    overflow: 'visible', // Allow content to extend beyond container bounds
  },
  horizontalScrollContent: {
    paddingHorizontal: Math.max(24, screenWidth * 0.06),
    gap: Math.max(12, screenWidth * 0.03),
    overflow: 'visible', // Allow content to extend beyond container bounds
  },
  cardContainer: {
    width: screenWidth - Math.max(48, screenWidth * 0.12),
    height: 600, // Increased height to accommodate taller charts
  },
  verticalSpacer: {
    height: Math.max(20, screenHeight * 0.025),
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Math.max(16, screenHeight * 0.02),
    marginBottom: Math.max(20, screenHeight * 0.025),
  },
  // Info Modal Styles
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
    borderRadius: Math.max(16, screenWidth * 0.04),
    width: Math.max(350, screenWidth * 0.9),
    maxWidth: 400,
    height: Math.max(500, screenHeight * 0.65),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    overflow: 'hidden',
  },
  infoModalScrollContainer: {
    flex: 1,
    position: 'relative',
  },
  infoModalScrollView: {
    flex: 1,
    paddingHorizontal: Math.max(24, screenWidth * 0.06),
  },
  infoModalDescription: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '400',
    lineHeight: Math.max(24, screenHeight * 0.03),
    opacity: 0.9,
    paddingBottom: 50,
  },
  scrollIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 35,
    backgroundColor: 'rgba(42, 42, 42, 0.9)',
    borderBottomLeftRadius: Math.max(16, screenWidth * 0.04),
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    paddingBottom: 8,
  },
  scrollIndicatorText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#ffffff',
    textAlign: 'center',
  },
  infoModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Math.max(16, screenHeight * 0.02),
    paddingHorizontal: Math.max(24, screenWidth * 0.06),
    paddingTop: Math.max(24, screenWidth * 0.06),
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
  disclaimersSection: {
    marginTop: Math.max(20, screenHeight * 0.025),
    paddingTop: Math.max(16, screenHeight * 0.02),
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  disclaimersTitle: {
    color: 'rgba(255, 255, 255, 1)',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
    marginBottom: Math.max(12, screenHeight * 0.015),
  },
  disclaimerText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.035, 14),
    fontWeight: '400',
    lineHeight: Math.max(20, screenHeight * 0.025),
    opacity: 0.8,
    marginBottom: Math.max(8, screenHeight * 0.01),
  },
});

export default ExerciseDetailContent;
