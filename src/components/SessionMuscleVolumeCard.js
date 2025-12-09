import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { getMuscleDisplayName } from '../constants/muscles';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const SessionMuscleVolumeCard = ({ muscleVolumes }) => {
  if (!muscleVolumes || Object.keys(muscleVolumes).length === 0) {
    return null;
  }

  // Sort muscles by volume (highest first)
  const sortedMuscles = Object.entries(muscleVolumes)
    .sort(([, a], [, b]) => b - a);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Músculos Trabajados</Text>
      <Text style={styles.subtitle}>Esta Sesión</Text>
      
      <View style={styles.musclesList}>
        {sortedMuscles.map(([muscle, volume]) => (
          <View key={muscle} style={styles.muscleRow}>
            <Text style={styles.muscleName}>{getMuscleDisplayName(muscle)}</Text>
            <Text style={styles.muscleVolume}>{volume.toFixed(1)}kg</Text>
          </View>
        ))}
      </View>
    </View>
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
    width: Math.max(280, screenWidth * 0.7),
  },
  title: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
    marginBottom: Math.max(4, screenHeight * 0.005),
  },
  subtitle: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.035, 14),
    opacity: 0.6,
    marginBottom: Math.max(16, screenHeight * 0.02),
  },
  musclesList: {
    gap: Math.max(10, screenHeight * 0.012),
  },
  muscleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  muscleName: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '500',
    opacity: 0.9,
  },
  muscleVolume: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
  },
});

export default SessionMuscleVolumeCard;

