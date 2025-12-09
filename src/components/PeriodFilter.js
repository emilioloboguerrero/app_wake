import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Modal, Pressable, ScrollView } from 'react-native';
import SvgChevronDown from './icons/vectors_fig/Arrow/ChevronDown';
import SvgChevronRight from './icons/vectors_fig/Arrow/ChevronRight';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const PeriodFilter = ({ selectedPeriod, onPeriodChange }) => {
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  
  const periods = [
    { key: 'week', label: '1 Semana' },
    { key: 'month', label: '1 Mes' },
    { key: '3months', label: '3 Meses' },
    { key: '6months', label: '6 Meses' },
    { key: 'year', label: '1 Año' }
  ];

  const getSelectedPeriodLabel = () => {
    const selected = periods.find(p => p.key === selectedPeriod);
    return selected ? selected.label : 'Seleccionar período';
  };

  const handlePeriodSelect = (periodKey) => {
    onPeriodChange(periodKey);
    setIsDropdownVisible(false);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.dropdownButton}
        onPress={() => setIsDropdownVisible(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.dropdownButtonText}>
          {getSelectedPeriodLabel()}
        </Text>
        <View style={styles.dropdownArrow}>
          <SvgChevronRight 
            width={16} 
            height={16} 
            stroke="#ffffff" 
            strokeWidth={2}
          />
        </View>
      </TouchableOpacity>
      
      {/* Period Selector Modal */}
      <Modal
        visible={isDropdownVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsDropdownVisible(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setIsDropdownVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleccionar Período</Text>
              <TouchableOpacity 
                style={styles.modalCloseButton}
                onPress={() => setIsDropdownVisible(false)}
              >
                <Text style={styles.modalCloseButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator={false}>
              {periods.map((period, index) => (
                <TouchableOpacity
                  key={period.key}
                  style={[
                    styles.modalItem,
                    selectedPeriod === period.key && styles.modalItemSelected,
                    index === periods.length - 1 && styles.modalItemLast
                  ]}
                  onPress={() => handlePeriodSelect(period.key)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.modalItemText,
                    selectedPeriod === period.key && styles.modalItemTextSelected
                  ]}>
                    {period.label}
                  </Text>
                  {selectedPeriod === period.key && (
                    <Text style={styles.modalCheckmark}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: Math.max(12, screenHeight * 0.015),
  },
  dropdownButton: {
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
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  dropdownArrow: {
    marginLeft: Math.max(8, screenWidth * 0.02),
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
  modalCheckmark: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default PeriodFilter;
