// Web wrapper for MainScreen - provides React Router navigation
import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { NavigationContainer } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { queryKeys } from '../config/queryClient';
import { TrainingNutritionChoiceModal } from '../components/TrainingNutritionChoiceModal.web';

const MainScreenModule = require('./MainScreen.js');
const MainScreenBase = MainScreenModule.MainScreenBase || MainScreenModule.default;

const MainScreen = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [programChoiceVisible, setProgramChoiceVisible] = useState(false);
  const [programChoiceCourse, setProgramChoiceCourse] = useState(null);

  const goToWorkout = useCallback(
    (course) => {
      const id = course?.courseId || course?.id;
      if (id) navigate(`/course/${id}/workout`);
    },
    [navigate]
  );

  const goToNutrition = useCallback(
    () => navigate('/nutrition'),
    [navigate]
  );

  const handleTapCourse = useCallback(
    (course) => {
      const profile = user?.uid ? queryClient.getQueryData(queryKeys.user.detail(user.uid)) : null;
      const hasNutritionFallback = user?.uid ? queryClient.getQueryData(['nutrition', 'has-assignment', user.uid]) : false;
      const hasNutrition = !!profile?.pinnedNutritionAssignmentId || hasNutritionFallback === true;
      if (hasNutrition) {
        setProgramChoiceCourse(course);
        setProgramChoiceVisible(true);
      } else {
        goToWorkout(course);
      }
    },
    [user?.uid, queryClient, goToWorkout]
  );

  const handleCloseChoice = useCallback(() => {
    setProgramChoiceVisible(false);
    setProgramChoiceCourse(null);
  }, []);

  const handleChooseTraining = useCallback(() => {
    if (programChoiceCourse) goToWorkout(programChoiceCourse);
    handleCloseChoice();
  }, [programChoiceCourse, goToWorkout, handleCloseChoice]);

  const handleChooseNutrition = useCallback(() => {
    goToNutrition();
    handleCloseChoice();
  }, [goToNutrition, handleCloseChoice]);

  const navigation = React.useMemo(() => ({
    navigate: (routeName, params) => {
      if (routeName === 'DailyWorkout' && params?.course) {
        handleTapCourse(params.course);
        return;
      }

      const routeMap = {
        'CourseDetail': () => navigate(`/course/${params?.course?.courseId || params?.course?.id}`),
        'DailyWorkout': () => goToWorkout(params?.course),
        'ProgramLibrary': () => navigate('/library'),
        'UpcomingCallDetail': () =>
          navigate(`/call/${params?.booking?.id}`, {
            state: { booking: params?.booking, course: params?.course, creatorName: params?.creatorName },
          }),
      };

      if (routeMap[routeName]) {
        routeMap[routeName]();
      } else {
        const path = `/${routeName.toLowerCase()}`;
        navigate(path, { state: params });
      }
    },
    setParams: () => {},
  }), [navigate, goToWorkout, handleTapCourse]);

  const route = { params: {} };

  return (
    <NavigationContainer independent={true}>
      <MainScreenBase navigation={navigation} route={route} />
      <TrainingNutritionChoiceModal
        visible={programChoiceVisible}
        onClose={handleCloseChoice}
        programTitle={programChoiceCourse?.title ?? null}
        creatorName={programChoiceCourse?.creatorName ?? programChoiceCourse?.creator_name ?? null}
        onChooseTraining={handleChooseTraining}
        onChooseNutrition={handleChooseNutrition}
      />
    </NavigationContainer>
  );
};

export default MainScreen;
