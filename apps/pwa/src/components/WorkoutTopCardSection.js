import React from 'react';
import { View, Text, ScrollView, useWindowDimensions } from 'react-native';
import WorkoutMuscleSVG from './WorkoutMuscleSVG';

const WorkoutTopCardSection = ({
  currentExercise,
  muscleVolumesForCurrentExercise,
  showMuscleSVG,
  styles,
}) => {
  const { height: screenHeight } = useWindowDimensions();
  return (
    <View style={styles.exerciseTitleCard}>
      {/* Title */}
      <Text style={styles.instructionsTitle}>Activación muscular</Text>
      
      {/* Muscle silhouette with spacing wrapper */}
      <WorkoutMuscleSVG 
        muscleVolumesForCurrentExercise={muscleVolumesForCurrentExercise}
        showMuscleSVG={showMuscleSVG}
        styles={styles}
      />

      {/* Implements section: only show when exercise has implements */}
      {currentExercise?.implements && currentExercise.implements.length > 0 ? (
        <>
          <View style={{ 
            width: '100%', 
            height: Math.max(20, screenHeight * 0.04), 
            flexShrink: 0,
            flexGrow: 0,
          }} />
          <View style={styles.implementsSection}>
            <Text style={[styles.instructionsTitle, styles.implementsSubtitle]}>
              Implementos
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.implementsRow}
            >
              {currentExercise.implements.map((impl, index) => (
                <View
                  key={`${impl}-${index}`}
                  style={[
                    styles.implementsPillContainer,
                    index > 0 && { marginLeft: 10 },
                  ]}
                >
                  <View style={styles.editButton}>
                    <Text style={styles.editButtonText}>
                      {impl}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </>
      ) : null}
    </View>
  );
};

export default WorkoutTopCardSection;
