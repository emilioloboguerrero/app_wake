import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { Dimensions, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Import your main screens and navigators
import MainStackNavigator from './MainStackNavigator';
import ProfileStackNavigator from './ProfileStackNavigator';
// import CommunityScreen from '../screens/CommunityScreen'; // TODO: Re-enable when feature is ready

// Import your custom Figma icons
import { User02 as SvgUser02, House02 as SvgHouse02 } from '../components/icons';

const Tab = createBottomTabNavigator();
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const MainTabNavigator = () => {
  const insets = useSafeAreaInsets();
  
  // Responsive tab bar dimensions
  const tabBarHeight = Math.max(50, screenHeight * 0.1); // 8% of screen height, min 60
  const iconSize = Math.min(screenWidth * 0.06, 28); // 6% of screen width, max 28
  const bottomPadding = 0; // No bottom padding - flush with bottom
  
  const getTabBarVisibility = (route) => {
    const routeName = getFocusedRouteNameFromRoute(route) ?? 'MainScreen';
    
    // Hide tab bar for sub-screens
    const hideTabBarScreens = [
      'ProgramLibrary',
      'BrowseByCreator', 
      'BrowseByDiscipline',
      'CourseDetail',
      'DailyWorkout',
      'WorkoutExercises',
      'ExercisePanel',
      'ExerciseDetail',
      'Warmup',
      'WorkoutExecution',
      'WorkoutCompletion',
      'AllPurchasedCourses',
      'Subscriptions',
      'CourseStructure',
      'WeeklyVolumeHistory',
      'Sessions',
      'SessionDetail',
      'CreatorProfile'
    ];
    
    return !hideTabBarScreens.includes(routeName);
  };

  return (
    <Tab.Navigator
      initialRouteName="Main"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false, // Properly hide labels
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          height: tabBarHeight,
          paddingBottom: bottomPadding,
          paddingTop: 0,
          position: 'absolute',
          elevation: 0,
          display: getTabBarVisibility(route) ? 'flex' : 'none',
        },
        tabBarActiveTintColor: '#ffffff',
        tabBarInactiveTintColor: '#666',
        tabBarIconStyle: {
          marginTop: 0, // No negative margin - icons at bottom
        },
        tabBarIcon: ({ focused, color, size }) => {
          let iconColor = '#ffffff'; // Always white
          let fillColor = focused ? '#ffffff' : 'none'; // Fill when active
          let strokeWidth = focused ? 2.8 : 2.5; // Thicker stroke when active

          // Community tab hidden until feature is ready
          // if (route.name === 'Community') {
          //   return (
          //     <Image 
          //       source={require('../../assets/community-icon.png')} 
          //       style={{ 
          //         width: iconSize-2, 
          //         height: iconSize-2,
          //         tintColor: '#ffffff',
          //         opacity: focused ? 1 : 0.6
          //       }}
          //       resizeMode="contain"
          //     />
          //   );
          // } else 
          if (route.name === 'Main') {
            return <SvgHouse02 width={iconSize} height={iconSize} stroke={iconColor} fill={fillColor} strokeWidth={strokeWidth} style={{ opacity: focused ? 1 : 0.6 }} />;
          } else if (route.name === 'Profile') {
            return <SvgUser02 width={iconSize} height={iconSize} stroke={iconColor} fill={fillColor} strokeWidth={strokeWidth} style={{ opacity: focused ? 1 : 0.6 }} />;
          }

          return null;
        },
      })}
    >
      {/* Community tab hidden until feature is ready */}
      {/* <Tab.Screen 
        name="Community" 
        component={CommunityScreen}
      /> */}
      <Tab.Screen 
        name="Main" 
        component={MainStackNavigator}
        options={({ route }) => ({
          tabBarStyle: {
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            height: tabBarHeight,
            paddingBottom: bottomPadding,
            paddingTop: 0,
            position: 'absolute',
            elevation: 0,
            display: getTabBarVisibility(route) ? 'flex' : 'none',
          },
        })}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileStackNavigator}
        options={({ route }) => ({
          tabBarStyle: {
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            height: tabBarHeight,
            paddingBottom: bottomPadding,
            paddingTop: 0,
            position: 'absolute',
            elevation: 0,
            display: getTabBarVisibility(route) ? 'flex' : 'none',
          },
        })}
      />
    </Tab.Navigator>
  );
};

export default MainTabNavigator;
