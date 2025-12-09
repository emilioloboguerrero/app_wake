import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  Dimensions,
  Modal,
  Pressable,
  TouchableWithoutFeedback,
  ScrollView,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import oneRepMaxService from '../services/oneRepMaxService';
import ExerciseDetailContent from '../components/ExerciseDetailContent';
import { FixedWakeHeader, WakeHeaderSpacer } from '../components/WakeHeader';
import SvgChevronLeft from '../components/icons/vectors_fig/Arrow/ChevronLeft';
import logger from '../utils/logger.js';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const PRDetailScreen = ({ navigation, route }) => {
  const { exerciseKey, exerciseName, libraryId, currentEstimate, lastUpdated } = route.params;
  const { user } = useAuth();
  const [isInfoModalVisible, setIsInfoModalVisible] = useState(false);

  const handleResetPR = () => {
    Alert.alert(
      '¿Resetear PR?',
      `Esto eliminará el récord actual de ${exerciseName}. El historial se mantendrá pero el sistema recalculará desde cero en tu próximo entrenamiento.`,
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Resetear',
          style: 'destructive',
          onPress: async () => {
            try {
              await oneRepMaxService.resetEstimate(user.uid, exerciseKey);
              Alert.alert('PR Reseteado', 'El récord ha sido eliminado exitosamente.');
              navigation.goBack();
            } catch (error) {
              logger.error('❌ Error resetting PR:', error);
              Alert.alert('Error', 'No se pudo resetear el récord. Inténtalo de nuevo.');
            }
          },
        },
      ]
    );
  };

  const handleViewAllHistory = () => {
    navigation.navigate('ExerciseHistory', {
      exerciseId: exerciseKey,
      exerciseName: exerciseName
    });
  };

  const handleBackPress = () => {
    // Simple back navigation - just go back
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <FixedWakeHeader />
      
      {/* Back Button */}
      <TouchableOpacity 
        style={styles.backButton}
        onPress={handleBackPress}
      >
        <SvgChevronLeft width={24} height={24} stroke="#ffffff" />
      </TouchableOpacity>
      
      {/* Reset Button */}
      <TouchableOpacity 
        style={styles.resetButton}
        onPress={handleResetPR}
      >
        <Text style={styles.resetButtonText}>Resetear</Text>
      </TouchableOpacity>

      <WakeHeaderSpacer />
      
      {/* Shared Content Component */}
      <ExerciseDetailContent
        exerciseKey={exerciseKey}
        exerciseName={exerciseName}
        libraryId={libraryId}
        currentEstimate={currentEstimate}
        lastUpdated={lastUpdated}
        onResetPR={handleResetPR}
        onViewAllHistory={handleViewAllHistory}
        showResetButton={true}
        showInfoModal={true}
        showTitle={true}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  backButton: {
    position: 'absolute',
    top: Math.max(50, screenHeight * 0.075),
    left: Math.max(24, screenWidth * 0.06),
    zIndex: 1000,
    padding: Math.max(8, screenWidth * 0.02),
  },
  resetButton: {
    position: 'absolute',
    top: Math.max(50, screenHeight * 0.075),
    right: Math.max(24, screenWidth * 0.06),
    zIndex: 1000,
    backgroundColor: 'rgba(255, 68, 68, 0.2)',
    paddingHorizontal: Math.max(16, screenWidth * 0.04),
    paddingVertical: Math.max(8, screenHeight * 0.01),
    borderRadius: Math.max(8, screenWidth * 0.02),
    borderWidth: 1,
    borderColor: 'rgba(255, 68, 68, 0.4)',
  },
  resetButtonText: {
    color: '#ff4444',
    fontSize: Math.min(screenWidth * 0.035, 14),
    fontWeight: '600',
  },
});

export default PRDetailScreen;

