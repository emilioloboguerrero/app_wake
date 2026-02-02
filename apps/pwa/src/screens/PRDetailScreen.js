import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  useWindowDimensions,
  Modal,
  Pressable,
  TouchableWithoutFeedback,
  ScrollView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import oneRepMaxService from '../services/oneRepMaxService';
import ExerciseDetailContent from '../components/ExerciseDetailContent';
import { FixedWakeHeader } from '../components/WakeHeader';
import logger from '../utils/logger.js';

const PRDetailScreen = ({ navigation, route }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const headerHeight = Platform.OS === 'web' ? 32 : Math.max(40, Math.min(44, screenHeight * 0.055));
  const safeAreaTopForSpacer = Platform.OS === 'web' ? Math.max(0, insets.top) : Math.max(0, insets.top - 8);
  const headerTotalHeight = headerHeight + safeAreaTopForSpacer;
  // Safety check for route
  if (!route || !route.params) {
    logger.error('❌ PRDetailScreen: route or route.params is undefined', { route, navigation });
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#ffffff' }}>Error: Missing route parameters</Text>
      </SafeAreaView>
    );
  }
  
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
    if (navigation && navigation.goBack) {
      navigation.goBack();
    } else {
      logger.error('❌ PRDetailScreen: navigation.goBack is not available');
      // Fallback: try browser back
      if (typeof window !== 'undefined' && window.history) {
        window.history.back();
      }
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
      <FixedWakeHeader 
        showBackButton={true}
        onBackPress={handleBackPress}
        showResetButton={true}
        onResetPress={handleResetPR}
        resetButtonText="Resetear"
      />
      
      {/* Shared Content Component */}
      <ExerciseDetailContent
        headerSpacerHeight={headerTotalHeight}
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
});

export { PRDetailScreen as PRDetailScreenBase };
export default PRDetailScreen;

