// Web wrapper for MainScreen - provides React Router navigation
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { NavigationContainer } from '@react-navigation/native';
// Import the base component - Metro should resolve MainScreen.js (not .web.js) when we use explicit .js extension
// The metro.config.js is configured to prioritize .js over .web.js for explicit imports
const MainScreenModule = require('./MainScreen.js');
const MainScreenBase = MainScreenModule.MainScreenBase || MainScreenModule.default;

const MainScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Create navigation adapter that matches React Navigation API
  const navigation = {
    navigate: (routeName, params) => {
      // Map React Navigation routes to React Router paths
      const routeMap = {
        'CourseDetail': () => navigate(`/course/${params?.course?.courseId || params?.course?.id}`),
        'DailyWorkout': () => navigate(`/course/${params?.course?.courseId || params?.course?.id}/workout`),
        'ProgramLibrary': () => navigate('/library'),
      };

      if (routeMap[routeName]) {
        routeMap[routeName]();
      } else {
        // Fallback: try to construct path from route name
        const path = `/${routeName.toLowerCase()}`;
        navigate(path, { state: params });
      }
    },
    setParams: (params) => {
      // On web, params are handled via URL or state
      // This is a no-op for web
    }
  };

  // Create route object for compatibility
  const route = {
    params: {}
  };

  // Wrap in NavigationContainer so base MainScreen's useFocusEffect has a context and doesn't throw
  return (
    <NavigationContainer independent={true}>
      <MainScreenBase navigation={navigation} route={route} />
    </NavigationContainer>
  );
};

export default MainScreen;

