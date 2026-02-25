// Web wrapper for MainScreen - provides React Router navigation
import React, { useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../config/firebase';
import firestoreService from '../services/firestoreService';
import * as nutritionDb from '../services/nutritionFirestoreService';
import { TrainingNutritionChoiceModal } from '../components/TrainingNutritionChoiceModal.web';
import logger from '../utils/logger';

const MainScreenModule = require('./MainScreen.js');
const MainScreenBase = MainScreenModule.MainScreenBase || MainScreenModule.default;

const MainScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const userId = user?.uid ?? auth.currentUser?.uid ?? '';

  const [programChoiceVisible, setProgramChoiceVisible] = useState(false);
  const [programChoiceCourse, setProgramChoiceCourse] = useState(null);
  const [programChoiceAssignmentId, setProgramChoiceAssignmentId] = useState(null);

  const goToWorkout = useCallback(
    (course) => {
      const id = course?.courseId || course?.id;
      if (id) navigate(`/course/${id}/workout`);
    },
    [navigate]
  );

  const goToNutrition = useCallback(
    (preferredAssignmentId) => {
      navigate('/nutrition', { state: preferredAssignmentId ? { preferredAssignmentId } : {} });
    },
    [navigate]
  );

  const navigation = React.useMemo(() => ({
    navigate: (routeName, params) => {
      if (routeName === 'DailyWorkout' && params?.course) {
        const course = params.course;
        const courseId = course.courseId || course.id;
        (async () => {
          if (!userId) {
            goToWorkout(course);
            return;
          }
          try {
            const assignments = await nutritionDb.getAssignmentsByUser(userId);
            const active = nutritionDb.getActiveAssignmentsForDate(assignments);
            let creatorId = course.creator_id || course.creatorId;
            if (!creatorId && courseId) {
              const courseDoc = await firestoreService.getCourse(courseId);
              creatorId = courseDoc?.creator_id ?? courseDoc?.creatorId ?? null;
            }
            const assignmentForCreator = active.find((a) => a.assignedBy === creatorId);
            if (assignmentForCreator && creatorId) {
              setProgramChoiceCourse(course);
              setProgramChoiceAssignmentId(assignmentForCreator.id);
              setProgramChoiceVisible(true);
            } else {
              goToWorkout(course);
            }
          } catch (e) {
            logger.warn('[MainScreen.web] program choice check failed', e);
            goToWorkout(course);
          }
        })();
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
  }), [userId, navigate, goToWorkout]);

  const route = { params: {} };

  const handleCloseChoice = useCallback(() => {
    setProgramChoiceVisible(false);
    setProgramChoiceCourse(null);
    setProgramChoiceAssignmentId(null);
  }, []);

  const handleChooseTraining = useCallback(() => {
    if (programChoiceCourse) goToWorkout(programChoiceCourse);
    handleCloseChoice();
  }, [programChoiceCourse, goToWorkout, handleCloseChoice]);

  const handleChooseNutrition = useCallback(() => {
    goToNutrition(programChoiceAssignmentId);
    handleCloseChoice();
  }, [programChoiceAssignmentId, goToNutrition, handleCloseChoice]);

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

