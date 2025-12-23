import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

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
      <Stack.Screen name="ProfileHome" component={ProfileScreen} />
      <Stack.Screen name="AllPurchasedCourses" component={AllPurchasedCoursesScreen} />
      <Stack.Screen name="Subscriptions" component={SubscriptionsScreen} />
      <Stack.Screen name="CourseDetail" component={CourseDetailScreen} />
      <Stack.Screen name="ExercisePanel" component={PRsScreen} />
      <Stack.Screen name="ExerciseDetail" component={PRDetailScreen} />
      <Stack.Screen name="WeeklyVolumeHistory" component={WeeklyVolumeHistoryScreen} />
      <Stack.Screen name="Sessions" component={SessionsScreen} />
      <Stack.Screen name="SessionDetail" component={SessionDetailScreen} />
    </Stack.Navigator>
  );
};

export default ProfileStackNavigator;
