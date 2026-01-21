import React, { memo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import MuscleSilhouetteSVG from './MuscleSilhouetteSVG';

// Memoized MuscleSilhouetteSVG to prevent unnecessary re-renders
const MemoizedMuscleSVG = memo(MuscleSilhouetteSVG, (prevProps, nextProps) => {
  // Only re-render if muscle volumes actually change
  const prevVolumes = JSON.stringify(prevProps.muscleVolumes || {});
  const nextVolumes = JSON.stringify(nextProps.muscleVolumes || {});
  return prevVolumes === nextVolumes && 
         prevProps.useWorkoutExecutionColors === nextProps.useWorkoutExecutionColors &&
         prevProps.height === nextProps.height;
});

import { isWeb } from '../utils/platform';
import { useState, useEffect } from 'react';

const WorkoutMuscleSVG = ({ 
  muscleVolumesForCurrentExercise, 
  showMuscleSVG,
  styles 
}) => {
  const { height: screenHeight } = useWindowDimensions();
  // On web, defer SVG rendering even when showMuscleSVG is true to prevent blocking
  // Use a longer delay to ensure the UI is fully interactive first
  const [shouldRenderSVG, setShouldRenderSVG] = useState(!isWeb && showMuscleSVG);

  useEffect(() => {
    if (isWeb && showMuscleSVG && !shouldRenderSVG) {
      // Defer SVG rendering for 2 seconds on web to ensure UI is responsive first
      const timeoutId = setTimeout(() => {
        // Only render if component is still mounted and showMuscleSVG is still true
        setShouldRenderSVG(true);
      }, 2000);

      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [isWeb, showMuscleSVG, shouldRenderSVG]);

  // Update immediately if showMuscleSVG changes on native
  useEffect(() => {
    if (!isWeb) {
      setShouldRenderSVG(showMuscleSVG);
    }
  }, [isWeb, showMuscleSVG]);

  return (
    <View style={styles.muscleSilhouetteWrapper}>
      <View style={styles.muscleSilhouetteContainerCard}>
        {muscleVolumesForCurrentExercise && Object.keys(muscleVolumesForCurrentExercise).length > 0 ? (
          shouldRenderSVG ? (
            <MemoizedMuscleSVG
              muscleVolumes={muscleVolumesForCurrentExercise}
              useWorkoutExecutionColors={true}
              height={280}
            />
          ) : (
            <View style={styles.muscleEmptyState}>
              <Text style={styles.muscleEmptyText}>
                Cargando visualización...
              </Text>
            </View>
          )
        ) : (
          <View style={styles.muscleEmptyState}>
            <Text style={styles.muscleEmptyText}>
              No hay datos de activación muscular para este ejercicio.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

export default WorkoutMuscleSVG;
