import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { withErrorBoundary } from '../utils/withErrorBoundary';

// Import screens
import ProfileScreen from '../screens/ProfileScreen';
import AllPurchasedCoursesScreen from '../screens/AllPurchasedCoursesScreen';
import SubscriptionsScreen from '../screens/SubscriptionsScreen';
import CourseDetailScreen from '../screens/CourseDetailScreen';
import PRsScreen from '../screens/PRsScreen';
import PRDetailScreen from '../screens/PRDetailScreen';
import WeeklyVolumeHistoryScreen from '../screens/WeeklyVolumeHistoryScreen';
import SessionsScreen from '../screens/SessionsScreen';
import SessionDetailScreen from '../screens/SessionDetailScreen';

const Stack = createStackNavigator();

const ProfileStackNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        cardStyle: { backgroundColor: '#1a1a1a' },
      }}
    >
      <Stack.Screen name="ProfileHome" component={withErrorBoundary(ProfileScreen, 'ProfileHome')} />
      <Stack.Screen name="AllPurchasedCourses" component={withErrorBoundary(AllPurchasedCoursesScreen, 'AllPurchasedCourses')} />
      <Stack.Screen name="Subscriptions" component={withErrorBoundary(SubscriptionsScreen, 'Subscriptions')} />
      <Stack.Screen name="CourseDetail" component={withErrorBoundary(CourseDetailScreen, 'CourseDetail')} />
      <Stack.Screen name="ExercisePanel" component={withErrorBoundary(PRsScreen, 'ExercisePanel')} />
      <Stack.Screen name="ExerciseDetail" component={withErrorBoundary(PRDetailScreen, 'ExerciseDetail')} />
      <Stack.Screen name="WeeklyVolumeHistory" component={withErrorBoundary(WeeklyVolumeHistoryScreen, 'WeeklyVolumeHistory')} />
      <Stack.Screen name="Sessions" component={withErrorBoundary(SessionsScreen, 'Sessions')} />
      <Stack.Screen name="SessionDetail" component={withErrorBoundary(SessionDetailScreen, 'SessionDetail')} />
    </Stack.Navigator>
  );
};

export default ProfileStackNavigator;
