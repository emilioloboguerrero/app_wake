import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import ExerciseDetailContent from './ExerciseDetailContent';
import SvgChevronLeft from './icons/vectors_fig/Arrow/ChevronLeft';
import logger from '../utils/logger.js';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const ExerciseDetailModal = ({ 
  visible, 
  onClose, 
  exerciseKey, 
  exerciseName, 
  libraryId, 
  currentEstimate, 
  lastUpdated 
}) => {
  const handleViewAllHistory = () => {
    // Navigate to full history screen (if implemented)
    logger.log('📊 View all history for:', exerciseKey);
  };

  const handleResetPR = () => {
    // Modal doesn't support reset functionality
    logger.log('📊 Reset PR requested for:', exerciseKey);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
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

        {/* Shared Content Component */}
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
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    paddingTop: Math.max(50, screenHeight * 0.06),
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
