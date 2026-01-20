import React from 'react';
import { View, Text, ScrollView, Dimensions } from 'react-native';
import WorkoutMuscleSVG from './WorkoutMuscleSVG';

const { height: screenHeight } = Dimensions.get('window');

const WorkoutTopCardSection = ({
  currentExercise,
  muscleVolumesForCurrentExercise,
  showMuscleSVG,
  styles,
}) => {
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

      {/* Spacer between muscle silhouette and implements */}
      <View style={{ 
        width: '100%', 
        height: Math.max(20, screenHeight * 0.04), 
        flexShrink: 0,
        flexGrow: 0,
      }} />

      {/* Implements section (horizontal, styled like "Editar" pill) */}
      <View style={styles.implementsSection}>
        <Text style={[styles.instructionsTitle, styles.implementsSubtitle]}>
          Implementos
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.implementsRow}
        >
          {currentExercise?.implements && currentExercise.implements.length > 0 ? (
            currentExercise.implements.map((impl, index) => (
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
            ))
          ) : (
            <View style={styles.muscleEmptyStateInline}>
              <Text style={styles.muscleEmptyTextInline}>Sin implementos</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
};

export default WorkoutTopCardSection;
