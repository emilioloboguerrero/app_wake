import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

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
import IAPTestScreen from '../screens/IAPTestScreen'; // Temporary test screen

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
      <Stack.Screen name="MainScreen" component={MainScreen} />
      <Stack.Screen name="ProgramLibrary" component={ProgramLibraryScreen} />
      <Stack.Screen name="CourseDetail" component={CourseDetailScreen} />
      <Stack.Screen name="CreatorProfile" component={CreatorProfileScreen} />
      <Stack.Screen name="DailyWorkout" component={DailyWorkoutScreen} />
      <Stack.Screen name="WorkoutExercises" component={WorkoutExercisesScreen} />
      <Stack.Screen 
        name="Warmup" 
        component={WarmupScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="WorkoutExecution" component={WorkoutExecutionScreen} />
      <Stack.Screen name="WorkoutCompletion" component={WorkoutCompletionScreen} />
      <Stack.Screen name="CourseStructure" component={CourseStructureScreen} />
      {/* Temporary test screen - remove when done testing */}
      <Stack.Screen name="IAPTest" component={IAPTestScreen} />
    </Stack.Navigator>
  );
};

export default MainStackNavigator;
