import React from 'react';
import { ScrollView, View } from 'react-native';
import { WakeHeaderSpacer } from './WakeHeader';

// This component just wraps the renderExerciseListView function
// The actual implementation stays in WorkoutExecutionScreen
// but we can lazy load this component on web
const WorkoutExerciseList = ({ renderExerciseListView }) => {
  return renderExerciseListView();
};

export default WorkoutExerciseList;
