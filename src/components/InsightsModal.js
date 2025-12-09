import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
  Dimensions,
} from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const InsightsModal = ({ visible, onClose, onNavigateToPRs, onNavigateToVolume, onNavigateToSessions }) => {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text style={styles.title}>Lab</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.cardsContainer}>
            {/* Exercise Panel Card */}
            <TouchableOpacity 
              style={styles.insightCard}
              onPress={() => {
                onClose();
                onNavigateToPRs();
              }}
            >
              <Text style={styles.cardTitle}>Panel de ejercicios</Text>
              <Text style={styles.cardDescription}>Ver progreso y estadísticas de ejercicios</Text>
            </TouchableOpacity>

            {/* Volume Card */}
            <TouchableOpacity 
              style={styles.insightCard}
              onPress={() => {
                onClose();
                onNavigateToVolume();
              }}
            >
              <Text style={styles.cardTitle}>Volumen</Text>
              <Text style={styles.cardDescription}>Ver historial de volumen semanal</Text>
            </TouchableOpacity>

            {/* Sessions Card */}
            <TouchableOpacity 
              style={styles.insightCard}
              onPress={() => {
                onClose();
                onNavigateToSessions();
              }}
            >
              <Text style={styles.cardTitle}>Sesiones</Text>
              <Text style={styles.cardDescription}>Ver historial de sesiones completadas</Text>
            </TouchableOpacity>

            {/* Future categories can be added here */}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#2a2a2a',
    borderTopLeftRadius: Math.max(20, screenWidth * 0.05),
    borderTopRightRadius: Math.max(20, screenWidth * 0.05),
    padding: Math.max(24, screenWidth * 0.06),
    width: '100%',
    height: '70%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Math.max(20, screenHeight * 0.025),
  },
  title: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.06, 24),
    fontWeight: '600',
  },
  closeButton: {
    width: Math.max(30, screenWidth * 0.075),
    height: Math.max(30, screenWidth * 0.075),
    borderRadius: Math.max(15, screenWidth * 0.037),
    backgroundColor: '#44454B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
  },
  cardsContainer: {
    gap: Math.max(12, screenHeight * 0.015),
  },
  insightCard: {
    backgroundColor: '#3a3a3a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    padding: Math.max(20, screenWidth * 0.05),
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
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
    marginBottom: Math.max(4, screenHeight * 0.005),
  },
  cardDescription: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.035, 14),
    fontWeight: '400',
    opacity: 0.7,
  },
});

export default InsightsModal;

