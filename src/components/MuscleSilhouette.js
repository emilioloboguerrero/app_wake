import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Modal, Pressable, ScrollView } from 'react-native';
import MuscleSilhouetteSVG from './MuscleSilhouetteSVG';
import SvgChevronRight from './icons/vectors_fig/Arrow/ChevronRight';
import SvgInfo from '../components/icons/SvgInfo';
import { formatWeekDisplay } from '../utils/weekCalculation';
import muscleVolumeInfoService from '../services/muscleVolumeInfoService';
import logger from '../utils/logger';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const MuscleSilhouette = ({ 
  muscleVolumes, 
  numberOfWeeks = 1,
  weekDisplayName, 
  showCurrentWeekLabel = false,
  availableWeeks = [],
  selectedWeek,
  currentWeek,
  onWeekChange,
  isReadOnly = false,
  onInfoPress,
  showWeeklyAverageNote = false
}) => {
  const [isWeekSelectorVisible, setIsWeekSelectorVisible] = useState(false);
  
  // Normalize volumes to weekly averages
  const normalizedVolumes = useMemo(() => {
    if (!muscleVolumes || numberOfWeeks === 0) return {};
    
    return Object.entries(muscleVolumes).reduce((acc, [muscle, totalSets]) => {
      acc[muscle] = totalSets / numberOfWeeks; // Convert to sets per week
      return acc;
    }, {});
  }, [muscleVolumes, numberOfWeeks]);

  // Helper function to extract just the dates from formatWeekDisplay
  const getWeekDatesOnly = (weekKey) => {
    const fullDisplay = formatWeekDisplay(weekKey);
    // Extract just the date part (e.g., "15-22 Ene" from "Semana del 15-22 Ene")
    return fullDisplay.replace('Semana del ', '');
  };

  const handleWeekSelect = (week) => {
    if (onWeekChange) {
      onWeekChange(week);
    }
    setIsWeekSelectorVisible(false);
  };
  // Show empty state if no data, but still allow week selection
  const hasData = normalizedVolumes && Object.keys(normalizedVolumes).length > 0;

  const hasInfo = muscleVolumeInfoService.hasInfo('series_efectivas');

  return (
    <TouchableOpacity 
      style={styles.container}
      onPress={() => onInfoPress && onInfoPress('series_efectivas')}
      disabled={!hasInfo}
      activeOpacity={hasInfo ? 0.7 : 1}
    >
      {/* Header with Week Selector */}
      <View style={styles.header}>
        <Text style={styles.title}>Series efectivas</Text>
        {availableWeeks.length > 0 && !isReadOnly && (
          <TouchableOpacity 
            style={styles.weekSelectorContainer}
            onPress={() => setIsWeekSelectorVisible(true)}
          >
            <Text style={styles.weekSelectorText}>
              {selectedWeek ? getWeekDatesOnly(selectedWeek) : getWeekDatesOnly(currentWeek)}
            </Text>
            <View style={styles.weekSelectorArrow}>
              <SvgChevronRight 
                width={16} 
                height={16} 
                stroke="#ffffff" 
                strokeWidth={2}
              />
            </View>
          </TouchableOpacity>
        )}
        {availableWeeks.length > 0 && isReadOnly && (
          <View style={styles.weekSelectorContainer}>
            <Text style={styles.weekSelectorText}>
              Esta semana
            </Text>
          </View>
        )}
      </View>
      
      {/* Info icon indicator */}
      {hasInfo && (
        <View style={styles.infoIconContainer}>
          <SvgInfo width={14} height={14} color="rgba(255, 255, 255, 0.6)" />
        </View>
      )}
      
      {/* Muscle Silhouette - All Views */}
      <View style={styles.silhouetteContainer}>
        {hasData ? (
          <MuscleSilhouetteSVG muscleVolumes={normalizedVolumes} />
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              No hay datos de volumen muscular para esta semana
            </Text>
          </View>
        )}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: '#FFFFFF', opacity: 0.1 }]} />
          <Text style={styles.legendText}>0 sets</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: '#FFFFFF', opacity: 0.5 }]} />
          <Text style={styles.legendText}>1-6 sets</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: '#BFA84D', opacity: 0.6 }]} />
          <Text style={styles.legendText}>6-18 sets</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: '#8B0000', opacity: 0.8 }]} />
          <Text style={styles.legendText}>18+ sets</Text>
        </View>
      </View>
      
      {/* Weekly average note (optional) */}
      {showWeeklyAverageNote && (
        <Text style={styles.legendNote}>
          Valores corresponden a promedios semanales
        </Text>
      )}

      {/* Week Selector Modal */}
      <Modal
        visible={isWeekSelectorVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsWeekSelectorVisible(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setIsWeekSelectorVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleccionar Semana</Text>
              <TouchableOpacity 
                style={styles.modalCloseButton}
                onPress={() => setIsWeekSelectorVisible(false)}
              >
                <Text style={styles.modalCloseButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator={false}>
              {availableWeeks.map((week, index) => (
                <TouchableOpacity
                  key={week}
                  style={[
                    styles.modalItem,
                    selectedWeek === week && styles.modalItemSelected,
                    index === availableWeeks.length - 1 && styles.modalItemLast
                  ]}
                  onPress={() => handleWeekSelect(week)}
                >
                  <Text style={[
                    styles.modalItemText,
                    selectedWeek === week && styles.modalItemTextSelected
                  ]}>
                    {getWeekDatesOnly(week)}
                  </Text>
                  <View style={styles.modalItemRight}>
                    {week === currentWeek && (
                      <Text style={styles.currentWeekIndicator}>ACTUAL</Text>
                    )}
                    {selectedWeek === week && (
                      <Text style={styles.modalCheckmark}>✓</Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
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
    height: 500, // Fixed height to match WeeklyMuscleVolumeCard
  },
  title: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
    textAlign: 'left',
    flex: 1,
  },
  subtitle: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.035, 14),
    opacity: 0.6,
    marginBottom: Math.max(16, screenHeight * 0.02),
    textAlign: 'left',
    paddingLeft: Math.max(10, screenWidth * 0.02),
  },
  silhouetteContainer: {
    alignItems: 'center',
    marginBottom: Math.max(16, screenHeight * 0.02),
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: Math.max(8, screenWidth * 0.02),
    padding: Math.max(10, screenWidth * 0.025),
    height: 350,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Math.max(16, screenWidth * 0.04),
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Math.max(4, screenWidth * 0.01),
  },
  legendColor: {
    width: Math.max(12, screenWidth * 0.03),
    height: Math.max(12, screenWidth * 0.03),
    borderRadius: Math.max(2, screenWidth * 0.005),
  },
  legendText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.03, 12),
    fontWeight: '400',
  },
  legendNote: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: Math.min(screenWidth * 0.028, 11),
    fontWeight: '400',
    textAlign: 'center',
    marginTop: Math.max(8, screenHeight * 0.01),
    fontStyle: 'italic',
  },
  emptyState: {
    paddingVertical: Math.max(40, screenHeight * 0.05),
    alignItems: 'center',
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: Math.min(screenWidth * 0.035, 14),
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Math.max(16, screenHeight * 0.02),
    paddingHorizontal: 5,
  },
  weekSelectorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
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
    marginRight: Math.max(15, screenWidth * 0.03), // Added margin to push away from info icon
  },
  weekSelectorText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginRight: Math.max(4, screenWidth * 0.01),
  },
  weekSelectorArrow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
  },
  modalContent: {
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
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    paddingVertical: Math.max(16, screenHeight * 0.02),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.05, 20),
    fontWeight: '600',
    flex: 1,
  },
  modalCloseButton: {
    width: Math.max(30, screenWidth * 0.075),
    height: Math.max(30, screenWidth * 0.075),
    borderRadius: Math.max(15, screenWidth * 0.037),
    backgroundColor: '#44454B',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Math.max(12, screenWidth * 0.03),
  },
  modalCloseButtonText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
  },
  modalScrollView: {
    maxHeight: Math.max(300, screenHeight * 0.4),
  },
  modalItem: {
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    paddingVertical: Math.max(16, screenHeight * 0.02),
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'transparent',
  },
  modalItemSelected: {
    backgroundColor: 'rgba(191, 168, 77, 0.1)',
  },
  modalItemLast: {
    borderBottomWidth: 0,
  },
  modalItemText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '500',
    flex: 1,
  },
  modalItemTextSelected: {
    color: 'rgba(191, 168, 77, 1)',
    fontWeight: '600',
  },
  modalItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  currentWeekIndicator: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  modalCheckmark: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
    marginLeft: 8,
  },
  // Info icon container (top-right of card)
  infoIconContainer: {
    position: 'absolute',
    top: Math.max(16, screenHeight * 0.02),
    right: Math.max(16, screenWidth * 0.04),
    zIndex: 10,
  },
});

export default MuscleSilhouette;
