import React from 'react';
import { View, TouchableOpacity, Text, ScrollView } from 'react-native';
import SvgListChecklist from './icons/SvgListChecklist';

const WorkoutHorizontalCards = ({
  horizontalCardsContent,
  styles,
  isEditMode,
  handleOpenSetInput,
  workout,
  currentExerciseIndex,
  currentSetIndex,
  scrollViewRef,
  screenWidth,
}) => {
  return (
    <>
      {/* Objetivos Section */}
      <View style={styles.objetivosSection}>
        <Text style={styles.objetivosTitle}>Objetivos</Text>
      </View>
      
      {/* Dynamic Horizontal Cards Layout */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalCardsContainer}
        style={styles.horizontalCardsScrollView}
      >
        {horizontalCardsContent}
      </ScrollView>
          
      {/* Button Container */}
      <View style={styles.buttonContainer}>
        {/* Simple Set Input Button */}
        <TouchableOpacity 
          style={[
            styles.inputSetButton,
            isEditMode && styles.inputSetButtonDisabled
          ]}
          onPress={handleOpenSetInput}
          disabled={isEditMode}
        >
          <Text style={[
            styles.inputSetButtonText,
            isEditMode && styles.inputSetButtonTextDisabled
          ]}>
            Registrar: serie {currentSetIndex + 1} de {workout?.exercises?.[currentExerciseIndex]?.sets?.length || 0}
          </Text>
        </TouchableOpacity>
        
        {/* List Screen Button */}
        <TouchableOpacity 
          style={styles.listScreenButton}
          onPress={() => {
            // Switch to list view (index 1)
            if (scrollViewRef.current) {
              scrollViewRef.current.scrollTo({ x: screenWidth, animated: true });
            }
          }}
        >
          <SvgListChecklist width={24} height={24} color="rgba(191, 168, 77, 1)" />
        </TouchableOpacity>
      </View>
    </>
  );
};

export default WorkoutHorizontalCards;
