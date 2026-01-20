// Web-specific wrapper for WorkoutExecutionScreen (MINIMAL TEST VERSION)
// Provides React Router navigation for minimal test screen

import React, { useMemo, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';

// Import base component directly (like LoginScreen and MainScreen)
const WorkoutExecutionScreenModule = require('./WorkoutExecutionScreen.js');
const WorkoutExecutionScreenBase = WorkoutExecutionScreenModule.default || WorkoutExecutionScreenModule;

// MINIMAL TEST VERSION - Simplified wrapper

const WorkoutExecutionScreen = () => {
  console.log('[WORKOUT_TEST_WEB] Web wrapper mounted');
  
  const navigate = useNavigate();
  const location = useLocation();
  const { courseId } = useParams();
  
  // Memoize navigation adapter
  const navigation = useMemo(() => ({
    navigate: (routeName, params) => {
      const routeMap = {
        'WorkoutCompletion': () => {
          const cId = params?.course?.courseId || params?.course?.id || courseId;
          navigate(`/course/${cId}/workout/completion`, { state: params });
        },
        'DailyWorkout': () => {
          const cId = params?.course?.courseId || params?.course?.id || courseId;
          navigate(`/course/${cId}/workout`, { state: params });
        },
        'Main': () => navigate('/'),
        'MainScreen': () => navigate('/'),
      };
      
      if (routeMap[routeName]) {
        routeMap[routeName]();
      } else {
        navigate(`/${routeName.toLowerCase()}`, { state: params });
      }
    },
    goBack: () => navigate(-1),
    setParams: () => {},
  }), [navigate, courseId]);
  
  // Create route object from location state
  const route = useMemo(() => ({
    params: {
      course: location.state?.course || null,
      workout: location.state?.workout || null,
      sessionId: location.state?.sessionId || null,
    }
  }), [location.state]);
  
  return (
    <WorkoutExecutionScreenBase 
      navigation={navigation} 
      route={route} 
    />
  );
};

export default WorkoutExecutionScreen;
