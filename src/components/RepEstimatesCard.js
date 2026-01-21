import React, { useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import oneRepMaxService from '../services/oneRepMaxService';

const RepEstimatesCard = ({ oneRM }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  
  // Create styles with current dimensions - memoized to prevent recalculation
  const styles = useMemo(() => StyleSheet.create({
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
    },
    title: {
      color: '#ffffff',
      fontSize: Math.min(screenWidth * 0.05, 20),
      fontWeight: '600',
      marginBottom: Math.max(4, screenHeight * 0.005),
    },
    subtitle: {
      color: '#ffffff',
      fontSize: Math.min(screenWidth * 0.035, 14),
      opacity: 0.6,
      marginBottom: Math.max(16, screenHeight * 0.02),
    },
    gridContainer: {
      flexDirection: 'row',
      gap: Math.max(20, screenWidth * 0.05),
    },
    column: {
      flex: 1,
      gap: Math.max(12, screenHeight * 0.015),
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    repsText: {
      color: '#ffffff',
      fontSize: Math.min(screenWidth * 0.04, 16),
      fontWeight: '500',
      opacity: 0.8,
    },
    weightText: {
      color: 'rgba(191, 168, 77, 1)',
      fontSize: Math.min(screenWidth * 0.04, 16),
      fontWeight: '600',
    },
  }), [screenWidth, screenHeight]);
  
  // Calculate weight estimates for 1-10 reps at 10/10 intensity (no rounding)
  const calculateRepEstimates = () => {
    const estimates = [];
    for (let reps = 1; reps <= 10; reps++) {
      // For 1 rep at 10/10 intensity, weight should equal 1RM
      // For more reps, use inverse formula: weight = 1RM / (1 + 0.0333 × (reps - 1))
      // We subtract 1 from reps because 1 rep should give us the full 1RM
      const weight = oneRM / (1 + 0.0333 * (reps - 1));
      const rounded = Math.round(weight * 10) / 10; // Round to 1 decimal
      estimates.push({ reps, weight: rounded });
    }
    return estimates;
  };

  const estimates = calculateRepEstimates();

  // Split into two columns
  const leftColumn = estimates.slice(0, 5); // 1-5 reps
  const rightColumn = estimates.slice(5, 10); // 6-10 reps

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Estimados por Reps</Text>
      <Text style={styles.subtitle}>Intensidad 10/10</Text>
      
      <View style={styles.gridContainer}>
        {/* Left Column */}
        <View style={styles.column}>
          {leftColumn.map(({ reps, weight }) => (
            <View key={reps} style={styles.row}>
              <Text style={styles.repsText}>{reps} {reps === 1 ? 'rep' : 'reps'}:</Text>
              <Text style={styles.weightText}>{weight}kg</Text>
            </View>
          ))}
        </View>
        
        {/* Right Column */}
        <View style={styles.column}>
          {rightColumn.map(({ reps, weight }) => (
            <View key={reps} style={styles.row}>
              <Text style={styles.repsText}>{reps} reps:</Text>
              <Text style={styles.weightText}>{weight}kg</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
};

export default RepEstimatesCard;

