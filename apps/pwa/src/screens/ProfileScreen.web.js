// Web wrapper for ProfileScreen - provides React Router navigation
import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { OpenReadinessModalContext } from '../navigation/WebAppNavigator';
// Import the base component - Metro should resolve ProfileScreen.js (not .web.js) when we use explicit .js extension
// The metro.config.js is configured to prioritize .js over .web.js for explicit imports
const ProfileScreenModule = require('./ProfileScreen.js');
const ProfileScreenBase = ProfileScreenModule.ProfileScreenBase || ProfileScreenModule.default;

const ProfileScreen = () => {
  const navigate = useNavigate();
  const readinessContext = useContext(OpenReadinessModalContext);
  const onOpenReadinessModal = readinessContext?.openReadinessModal ?? null;

  // Create navigation adapter that matches React Navigation API
  const navigation = {
    navigate: (routeName, params) => {
      // Map React Navigation routes to React Router paths
      const routeMap = {
        'AllPurchasedCourses': () => navigate('/courses'),
        'Subscriptions': () => navigate('/subscriptions'),
        'ExercisePanel': () => navigate('/prs'),
        'WeeklyVolumeHistory': () => navigate('/volume'),
        'Sessions': () => navigate('/sessions'),
        'CourseDetail': () => navigate(`/course/${params?.course?.courseId || params?.course?.id}`),
        'Main': () => navigate('/'),
      };

      if (routeMap[routeName]) {
        routeMap[routeName]();
      } else {
        // Fallback: try to construct path from route name
        const path = `/${routeName.toLowerCase()}`;
        navigate(path, { state: params });
      }
    },
    reset: (config) => {
      // Handle navigation.reset() - typically used for logout or resetting navigation stack
      // For web, we'll navigate to the first route
      if (config?.routes && config.routes.length > 0) {
        const firstRoute = config.routes[0];
        if (firstRoute.name === 'Main') {
          navigate('/');
        } else {
          navigate(`/${firstRoute.name.toLowerCase()}`);
        }
      } else {
        navigate('/');
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

  return <ProfileScreenBase navigation={navigation} route={route} onOpenReadinessModal={onOpenReadinessModal} />;
};

export default ProfileScreen;

