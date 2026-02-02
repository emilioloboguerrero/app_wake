// Web wrapper for WorkoutCompletionScreen - provides React Router navigation
import React from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import logger from '../utils/logger';
import { useAuth } from '../contexts/AuthContext';
import LoadingScreen from './LoadingScreen';

// Import the base component
const WorkoutCompletionScreenModule = require('./WorkoutCompletionScreen.js');
const WorkoutCompletionScreenBase = WorkoutCompletionScreenModule.default;

const WorkoutCompletionScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { courseId } = useParams();
  const { user } = useAuth(); // Get user from AuthContext
  
  // Get params from location state
  const course = location.state?.course;
  const workout = location.state?.workout;
  const sessionData = location.state?.sessionData;
  
  // Create navigation adapter
  const navigation = {
    navigate: (routeName, params) => {
      logger.log('🧭 [WorkoutCompletion Web] Navigating to:', routeName, params);
      
      const routeMap = {
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
        const path = `/${routeName.toLowerCase()}`;
        navigate(path, { state: params });
      }
    },
    goBack: () => navigate(-1),
    setParams: (params) => {
      logger.log('🧭 [WorkoutCompletion Web] setParams:', params);
    },
  };
  
  const route = {
    params: {
      course,
      workout,
      sessionData,
      ...(location.state || {})
    }
  };
  
  return <WorkoutCompletionScreenBase navigation={navigation} route={route} />;
};

export default WorkoutCompletionScreen;
