// Web wrapper for ProgramLibraryScreen - provides React Router navigation
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
// Import the base component - Metro should resolve ProgramLibraryScreen.js (not .web.js) when we use explicit .js extension
// The metro.config.js is configured to prioritize .js over .web.js for explicit imports
const ProgramLibraryScreenModule = require('./ProgramLibraryScreen.js');
const ProgramLibraryScreenBase = ProgramLibraryScreenModule.ProgramLibraryScreenBase || ProgramLibraryScreenModule.default;

const ProgramLibraryScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Create navigation adapter that matches React Navigation API
  const navigation = {
    navigate: (routeName, params) => {
      // Map React Navigation routes to React Router paths
      const routeMap = {
        'CourseDetail': () => {
          // Fix: Pass course in state to avoid refetching in CourseDetailScreen
          const courseId = params?.course?.courseId || params?.course?.id;
          navigate(`/course/${courseId}`, { state: { course: params?.course } });
        },
        'DailyWorkout': () => navigate(`/course/${params?.course?.courseId || params?.course?.id}/workout`),
        'CreatorProfile': () => {
          const creatorId = params?.creatorId;
          if (creatorId) navigate(`/creator/${creatorId}`);
        },
        'Main': () => navigate('/'),
        'MainScreen': () => navigate('/'),
      };

      if (routeMap[routeName]) {
        routeMap[routeName]();
      } else {
        // Fallback: try to construct path from route name
        const path = `/${routeName.toLowerCase()}`;
        navigate(path, { state: params });
      }
    },
    goBack: () => {
      navigate(-1); // Go back in browser history
    },
  };

  // Create route object for compatibility
  const route = {
    params: {}
  };

  return <ProgramLibraryScreenBase navigation={navigation} route={route} />;
};

export default ProgramLibraryScreen;
