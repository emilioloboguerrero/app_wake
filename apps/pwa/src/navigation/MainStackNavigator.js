import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { withErrorBoundary } from '../utils/withErrorBoundary';

// Import screens
import MainScreen from '../screens/MainScreen';
import ProgramLibraryScreen from '../screens/ProgramLibraryScreen';
import CourseDetailScreen from '../screens/CourseDetailScreen';
import DailyWorkoutScreen from '../screens/DailyWorkoutScreen';
import WorkoutExercisesScreen from '../screens/WorkoutExercisesScreen';
import WorkoutExecutionScreen from '../screens/WorkoutExecutionScreen';
import WarmupScreen from '../screens/WarmupScreen';
import WorkoutCompletionScreen from '../screens/WorkoutCompletionScreen';
import CourseStructureScreen from '../screens/CourseStructureScreen';
import CreatorProfileScreen from '../screens/CreatorProfileScreen';

const Stack = createStackNavigator();

const MainStackNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        cardStyle: { backgroundColor: '#1a1a1a' },
      }}
    >
      <Stack.Screen name="MainScreen" component={withErrorBoundary(MainScreen, 'MainScreen')} />
      <Stack.Screen name="ProgramLibrary" component={withErrorBoundary(ProgramLibraryScreen, 'ProgramLibrary')} />
      <Stack.Screen name="CourseDetail" component={withErrorBoundary(CourseDetailScreen, 'CourseDetail')} />
      <Stack.Screen name="CreatorProfile" component={withErrorBoundary(CreatorProfileScreen, 'CreatorProfile')} />
      <Stack.Screen name="DailyWorkout" component={withErrorBoundary(DailyWorkoutScreen, 'DailyWorkout')} />
      <Stack.Screen name="WorkoutExercises" component={withErrorBoundary(WorkoutExercisesScreen, 'WorkoutExercises')} />
      <Stack.Screen 
        name="Warmup" 
        component={withErrorBoundary(WarmupScreen, 'Warmup')}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="WorkoutExecution" component={withErrorBoundary(WorkoutExecutionScreen, 'WorkoutExecution')} />
      <Stack.Screen name="WorkoutCompletion" component={withErrorBoundary(WorkoutCompletionScreen, 'WorkoutCompletion')} />
      <Stack.Screen name="CourseStructure" component={withErrorBoundary(CourseStructureScreen, 'CourseStructure')} />
    </Stack.Navigator>
  );
};

export default MainStackNavigator;
