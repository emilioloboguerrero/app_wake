import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ExerciseDetailContent from './ExerciseDetailContent';
import SvgChevronLeft from './icons/vectors_fig/Arrow/ChevronLeft';
import logger from '../utils/logger.js';

const ExerciseDetailModal = ({ 
  visible, 
  onClose, 
  exerciseKey, 
  exerciseName, 
  libraryId, 
  currentEstimate, 
  lastUpdated 
}) => {
  const componentStartTime = performance.now();
  console.log(`[CHILD] [CHECKPOINT] ExerciseDetailModal render started - ${componentStartTime.toFixed(2)}ms`);
  
  // CRITICAL: Early return BEFORE expensive operations to avoid blocking paint
  const visibilityCheckStart = performance.now();
  if (!visible) {
    return null;
  }
  const visibilityCheckDuration = performance.now() - visibilityCheckStart;
  if (visibilityCheckDuration > 1) {
    console.warn(`[CHILD] ⚠️ SLOW: ExerciseDetailModal visibility check took ${visibilityCheckDuration.toFixed(2)}ms`);
  }
  
  // Get safe area insets for proper header positioning
  const insets = useSafeAreaInsets();
  
  // Get dimensions inside component to avoid blocking module initialization
  // Only do this AFTER we know we're actually rendering
  const dimensionsStartTime = performance.now();
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const dimensionsDuration = performance.now() - dimensionsStartTime;
  console.log(`[CHILD] [TIMING] ExerciseDetailModal Dimensions.get took ${dimensionsDuration.toFixed(2)}ms`);
  if (dimensionsDuration > 5) {
    console.warn(`[CHILD] ⚠️ SLOW: ExerciseDetailModal Dimensions.get took ${dimensionsDuration.toFixed(2)}ms`);
  }
  
  // Create styles with dimensions and safe area insets
  const stylesStartTime = performance.now();
  const styles = createStyles(screenWidth, screenHeight, insets);
  const stylesDuration = performance.now() - stylesStartTime;
  console.log(`[CHILD] [TIMING] ExerciseDetailModal createStyles took ${stylesDuration.toFixed(2)}ms`);
  if (stylesDuration > 10) {
    console.warn(`[CHILD] ⚠️ SLOW: ExerciseDetailModal createStyles took ${stylesDuration.toFixed(2)}ms`);
  }
  
  const handleViewAllHistory = () => {
    // Navigate to full history screen (if implemented)
    logger.log('📊 View all history for:', exerciseKey);
  };

  const handleResetPR = () => {
    // Modal doesn't support reset functionality
    logger.log('📊 Reset PR requested for:', exerciseKey);
  };

  const jsxStartTime = performance.now();
  console.log(`[CHILD] [TIMING] ExerciseDetailModal JSX creation starting - ${jsxStartTime.toFixed(2)}ms`);
  
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {(() => {
        const jsxContentStartTime = performance.now();
        console.log(`[CHILD] [TIMING] ExerciseDetailModal JSX content starting - ${jsxContentStartTime.toFixed(2)}ms`);
        return null;
      })()}
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={onClose}
          >
            <SvgChevronLeft width={24} height={24} stroke="#ffffff" />
          </TouchableOpacity>
          
          <Text style={styles.headerTitle}>{exerciseName}</Text>
          
          <View style={styles.infoButton} />
        </View>

        {/* Shared Content Component - Only render when modal is visible */}
        {visible && (
          <ExerciseDetailContent
            exerciseKey={exerciseKey}
            exerciseName={exerciseName}
            libraryId={libraryId}
            currentEstimate={currentEstimate}
            lastUpdated={lastUpdated}
            onResetPR={handleResetPR}
            onViewAllHistory={handleViewAllHistory}
            showResetButton={false}
            showInfoModal={true}
            showTitle={false}
          />
        )}
      </View>
      {(() => {
        const jsxEndTime = performance.now();
        const jsxDuration = jsxEndTime - jsxStartTime;
        console.log(`[CHILD] [TIMING] ExerciseDetailModal JSX creation completed - ${jsxEndTime.toFixed(2)}ms (took ${jsxDuration.toFixed(2)}ms)`);
        if (jsxDuration > 50) {
          console.warn(`[CHILD] ⚠️ SLOW: ExerciseDetailModal JSX creation took ${jsxDuration.toFixed(2)}ms`);
        }
        return null;
      })()}
    </Modal>
  );
  
  // Track component render completion using useEffect
  useEffect(() => {
    const componentEndTime = performance.now();
    const componentDuration = componentEndTime - componentStartTime;
    console.log(`[CHILD] [CHECKPOINT] ExerciseDetailModal render completed - ${componentEndTime.toFixed(2)}ms (took ${componentDuration.toFixed(2)}ms)`);
    if (componentDuration > 50) {
      console.warn(`[CHILD] ⚠️ SLOW: ExerciseDetailModal render took ${componentDuration.toFixed(2)}ms (threshold: 50ms)`);
    }
  });
};

// Styles function - takes screenWidth, screenHeight, and insets as parameters
const createStyles = (screenWidth, screenHeight, insets) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    paddingTop: Math.max(Math.max(10, insets.top) + 10, screenHeight * 0.04),
    paddingBottom: Math.max(20, screenHeight * 0.025),
    backgroundColor: '#1a1a1a',
  },
  backButton: {
    padding: Math.max(8, screenWidth * 0.02),
  },
  headerTitle: {
    fontSize: Math.min(screenWidth * 0.05, 20),
    fontWeight: '600',
    color: '#ffffff',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: Math.max(20, screenWidth * 0.05),
  },
  infoButton: {
    padding: Math.max(8, screenWidth * 0.02),
  },
  infoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
  },
  infoModalContent: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    padding: Math.max(24, screenWidth * 0.06),
    width: '100%',
    maxWidth: Math.min(screenWidth * 0.9, 400),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  infoModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Math.max(16, screenHeight * 0.02),
  },
  infoModalTitle: {
    fontSize: Math.min(screenWidth * 0.05, 20),
    fontWeight: '600',
    color: '#ffffff',
    flex: 1,
  },
  infoModalCloseButton: {
    padding: Math.max(4, screenWidth * 0.01),
  },
  infoModalCloseButtonText: {
    fontSize: Math.min(screenWidth * 0.05, 20),
    color: '#ffffff',
    fontWeight: '600',
  },
  infoModalDescription: {
    fontSize: Math.min(screenWidth * 0.04, 16),
    color: '#ffffff',
    lineHeight: Math.min(screenWidth * 0.06, 24),
  },
});

export default ExerciseDetailModal;
