// Web-specific wrapper for WorkoutExecutionScreen (MINIMAL TEST VERSION)
// Provides React Router navigation for minimal test screen

import React, { useMemo, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import logger from '../utils/logger';

// Import base component directly (like LoginScreen and MainScreen)
const WorkoutExecutionScreenModule = require('./WorkoutExecutionScreen.js');
const WorkoutExecutionScreenBase = WorkoutExecutionScreenModule.default || WorkoutExecutionScreenModule;

// MINIMAL TEST VERSION - Simplified wrapper

const WorkoutExecutionScreen = () => {
  logger.debug('[WORKOUT_TEST_WEB] Web wrapper mounted');
  
  const navigate = useNavigate();
  const location = useLocation();
  const { courseId } = useParams();
  
  // Memoize navigation adapter
  const navigation = useMemo(() => ({
    navigate: (routeName, params) => {
      logger.log('🧭 [WorkoutExecution Web] Navigation called:', { routeName, params, courseId });
      
      const routeMap = {
        'WorkoutCompletion': () => {
          const cId = params?.course?.courseId || params?.course?.id || courseId;
          const targetPath = `/course/${cId}/workout/completion`;
          logger.log('🧭 [WorkoutExecution Web] Navigating to WorkoutCompletion:', {
            courseId: cId,
            targetPath,
            hasParams: !!params,
            paramsKeys: params ? Object.keys(params) : []
          });
          navigate(targetPath, { state: params });
        },
        'DailyWorkout': () => {
          const cId = params?.course?.courseId || params?.course?.id || courseId;
          navigate(`/course/${cId}/workout`, { state: params });
        },
        'Main': () => navigate('/'),
        'MainScreen': () => navigate('/'),
      };
      
      if (routeMap[routeName]) {
        logger.log('🧭 [WorkoutExecution Web] Using route map for:', routeName);
        routeMap[routeName]();
      } else {
        logger.log('🧭 [WorkoutExecution Web] No route map, using fallback:', routeName);
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

  // Debug: log route params and first exercise snapshot when wrapper mounts/updates
  React.useEffect(() => {
    const workout = route?.params?.workout;
    const firstExercise = workout?.exercises?.[0] || null;
    logger.log('[WORKOUT_TEST_WEB] Route params snapshot for WorkoutExecutionScreen:', {
      courseIdFromUrl: courseId,
      hasCourseInState: !!location.state?.course,
      hasWorkoutInState: !!location.state?.workout,
      routeParamsKeys: route?.params ? Object.keys(route.params) : [],
      workoutHasExercises: !!workout?.exercises,
      workoutExercisesCount: workout?.exercises?.length || 0,
      firstExercise: firstExercise ? {
        name: firstExercise.name,
        libraryId: firstExercise.libraryId,
        objectives: firstExercise.objectives || [],
        measures: firstExercise.measures || [],
        primary: firstExercise.primary || null
      } : null
    });
  }, [courseId, location.state, route]);
  
  return (
    <WorkoutExecutionScreenBase 
      navigation={navigation} 
      route={route} 
    />
  );
};

export default WorkoutExecutionScreen;
