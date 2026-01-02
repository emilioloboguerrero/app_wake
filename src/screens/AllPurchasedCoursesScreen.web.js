// Web wrapper for AllPurchasedCoursesScreen - provides React Router navigation
import React from 'react';
import { useNavigate } from 'react-router-dom';
// Import the base component - use the same pattern as MainScreen and LoginScreen
// Metro should resolve AllPurchasedCoursesScreen.js (not .web.js) when we use explicit .js extension
const AllPurchasedCoursesScreenModule = require('./AllPurchasedCoursesScreen.js');
const AllPurchasedCoursesScreenBase = AllPurchasedCoursesScreenModule.AllPurchasedCoursesScreenBase || AllPurchasedCoursesScreenModule.default;

const AllPurchasedCoursesScreen = () => {
  const navigate = useNavigate();

  // Create navigation adapter that matches React Navigation API
  const navigation = {
    navigate: (routeName, params) => {
      // Map React Navigation routes to React Router paths
      const routeMap = {
        'CourseDetail': () => navigate(`/course/${params?.course?.courseId || params?.course?.id}`),
        'Main': (screenParams) => {
          if (screenParams?.screen === 'ProgramLibrary') {
            navigate('/library');
          } else {
            navigate('/');
          }
        },
      };

      if (routeMap[routeName]) {
        routeMap[routeName](params);
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

  return <AllPurchasedCoursesScreenBase navigation={navigation} route={route} />;
};

export default AllPurchasedCoursesScreen;

