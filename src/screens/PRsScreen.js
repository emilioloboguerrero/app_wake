import React, { useState, useEffect } from 'react';
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
  Pressable,
  TouchableWithoutFeedback,
  TextInput,
  Keyboard,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import oneRepMaxService from '../services/oneRepMaxService';
import exerciseHistoryService from '../services/exerciseHistoryService';
import { FixedWakeHeader, WakeHeaderSpacer } from '../components/WakeHeader';
import SvgChevronLeft from '../components/icons/vectors_fig/Arrow/ChevronLeft';
import SvgInfo from '../components/icons/SvgInfo';
import SvgSearchMagnifyingGlass from '../components/icons/vectors_fig/Interface/SearchMagnifyingGlass';
import logger from '../utils/logger.js';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const PRsScreen = ({ navigation }) => {
  const { user } = useAuth();
  const [estimates, setEstimates] = useState({});
  const [loading, setLoading] = useState(true);
  const [isInfoModalVisible, setIsInfoModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadEstimates();
  }, []);

  const loadEstimates = async () => {
    try {
      setLoading(true);
      
      // Fetch both PRs and exercise history in parallel
      const [estimates, allExerciseKeys] = await Promise.all([
        oneRepMaxService.getEstimatesForUser(user.uid),
        exerciseHistoryService.getAllExerciseKeysFromExerciseHistory(user.uid)
      ]);
      
      // Create a merged data structure
      const mergedData = {};
      allExerciseKeys.forEach(exerciseKey => {
        if (estimates[exerciseKey]) {
          // Exercise has PR - use existing data
          mergedData[exerciseKey] = estimates[exerciseKey];
        } else {
          // Exercise has history but no PR - create placeholder
          mergedData[exerciseKey] = {
            current: null, // No weight
            lastUpdated: 'Historial disponible' // Placeholder
          };
        }
      });
      
      setEstimates(mergedData);
      logger.log('✅ All exercises loaded:', Object.keys(mergedData).length, 'exercises');
      logger.log('📊 PRs:', Object.keys(estimates).length, '| History only:', allExerciseKeys.length - Object.keys(estimates).length);
    } catch (error) {
      logger.error('❌ Error loading exercises:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const parseExerciseKey = (key) => {
    // Format: "libraryId_exerciseName"
    const parts = key.split('_');
    const libraryId = parts[0];
    const exerciseName = parts.slice(1).join('_'); // Handle names with underscores
    return { libraryId, exerciseName };
  };

  const handleExercisePress = (exerciseKey) => {
    const { libraryId, exerciseName } = parseExerciseKey(exerciseKey);
    const estimate = estimates[exerciseKey];
    
    navigation.navigate('ExerciseDetail', {
      exerciseKey,
      exerciseName,
      libraryId,
      currentEstimate: estimate.current,
      lastUpdated: estimate.lastUpdated,
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <FixedWakeHeader />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.loadingText}>Cargando panel de ejercicios...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const exerciseKeys = Object.keys(estimates);
  
  // Filter exercises based on search query
  const filteredExerciseKeys = exerciseKeys.filter(exerciseKey => {
    if (!searchQuery.trim()) return true;
    const { exerciseName } = parseExerciseKey(exerciseKey);
    return exerciseName.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <SafeAreaView style={styles.container}>
      <FixedWakeHeader />
      
      {/* Back Button */}
      <TouchableOpacity 
        style={styles.backButton}
        onPress={() => navigation.goBack()}
      >
        <SvgChevronLeft width={24} height={24} stroke="#ffffff" />
      </TouchableOpacity>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <WakeHeaderSpacer />
        
        <View style={styles.content}>
          <TouchableOpacity 
            style={styles.titleContainer}
            onPress={() => setIsInfoModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.title}>Panel de ejercicios</Text>
            <View style={styles.infoButton}>
              <SvgInfo width={20} height={20} color="rgba(255, 255, 255, 0.6)" />
            </View>
          </TouchableOpacity>
          
          {/* Search Box */}
          <View style={styles.searchContainer}>
            <View style={styles.searchInputContainer}>
              <SvgSearchMagnifyingGlass 
                width={18} 
                height={18} 
                stroke="#ffffff" 
                strokeWidth={1} 
                style={styles.searchIcon}
              />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar ejercicios..."
                placeholderTextColor="#ffffff"
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                blurOnSubmit={true}
              />
            </View>
          </View>
          
          {filteredExerciseKeys.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {searchQuery.trim() ? 
                  `No se encontraron ejercicios que coincidan con "${searchQuery}"` :
                  'No has completado ejercicios aún.\nCompleta entrenamientos para empezar a registrar tus ejercicios.'
                }
              </Text>
            </View>
          ) : (
            filteredExerciseKeys.map((exerciseKey) => {
              const { exerciseName } = parseExerciseKey(exerciseKey);
              
              return (
                <TouchableOpacity
                  key={exerciseKey}
                  style={styles.exerciseCard}
                  onPress={() => handleExercisePress(exerciseKey)}
                >
                  <View style={styles.exerciseInfo}>
                    <Text style={styles.exerciseName}>{exerciseName}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>
      
      {/* Info Modal */}
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
              <Text style={styles.infoModalTitle}>Panel de ejercicios</Text>
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
                El Panel de Ejercicios te permite explorar el progreso detallado de cada ejercicio que has realizado.{'\n\n'}
                
                ¿Qué puedes encontrar en cada ejercicio?{'\n\n'}
                
                • Progreso visual: Gráficos que muestran tu evolución en peso y repeticiones{'\n'}
                • Historial completo: Todas las series que has realizado ordenadas por fecha{'\n'}
                • Estimaciones de 1RM: Cálculo automático de tu fuerza máxima (ejercicios con peso){'\n'}
                • Sugerencias de peso: Recomendaciones personalizadas para tu próximo entrenamiento{'\n\n'}
                
                ¿Cómo funciona?{'\n\n'}
                
                • Se actualiza automáticamente después de cada entrenamiento{'\n'}
                • Muestra TODOS los ejercicios que has completado (con y sin peso){'\n'}
                • Los ejercicios con peso muestran estimaciones de 1RM{'\n'}
                • Los ejercicios sin peso muestran "Historial disponible"{'\n'}
                • Los gráficos muestran hasta 50 sesiones recientes{'\n\n'}
                
                ¿Por qué es útil?{'\n\n'}
                
                • Visualiza tu progreso a largo plazo{'\n'}
                • Identifica patrones en tu rendimiento{'\n'}
                • Recibe sugerencias de peso personalizadas{'\n'}
                • Mantén un registro completo de tu evolución{'\n'}
                • Ve todos tus ejercicios en un solo lugar{'\n\n'}
                
                Nota: Los datos se sincronizan automáticamente y están disponibles en todos tus dispositivos.
                </Text>
              </ScrollView>
              
              {/* Scroll indicator */}
              <View style={styles.scrollIndicator}>
                <Text style={styles.scrollIndicatorText}>Desliza</Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>
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
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Math.max(24, screenWidth * 0.06),
    paddingBottom: Math.max(40, screenHeight * 0.05),
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Math.max(20, screenHeight * 0.025),
    paddingLeft: Math.max(24, screenWidth * 0.06),
  },
  title: {
    fontSize: Math.min(screenWidth * 0.08, 32),
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'left',
  },
  infoButton: {
    padding: Math.max(8, screenWidth * 0.02),
    marginLeft: Math.max(8, screenWidth * 0.02),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    marginTop: Math.max(12, screenHeight * 0.015),
    opacity: 0.7,
  },
  emptyContainer: {
    paddingVertical: Math.max(60, screenHeight * 0.075),
    alignItems: 'center',
  },
  emptyText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    textAlign: 'center',
    opacity: 0.6,
    lineHeight: Math.max(24, screenHeight * 0.03),
  },
  exerciseCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    padding: Math.max(20, screenWidth * 0.05),
    marginBottom: Math.max(12, screenHeight * 0.015),
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
    textAlign: 'left',
  },
  // Search Box Styles
  searchContainer: {
    marginBottom: 15,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    paddingHorizontal: Math.max(16, screenWidth * 0.04),
    paddingVertical: Math.max(12, screenHeight * 0.015),
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#ffffff',
    opacity: 0.8,
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
});

export default PRsScreen;

