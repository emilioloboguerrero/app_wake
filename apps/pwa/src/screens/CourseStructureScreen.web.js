// Web wrapper for CourseStructureScreen - provides React Router navigation
import React from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { STALE_TIMES } from '../config/queryConfig';
import LoadingScreen from './LoadingScreen';
import firestoreService from '../services/firestoreService';
// Import the base component
const CourseStructureScreenModule = require('./CourseStructureScreen.js');
const CourseStructureScreenBase = CourseStructureScreenModule.default;

const CourseStructureScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { courseId } = useParams();
  const courseFromState = location.state?.course;

  const { data: course, isLoading: loading } = useQuery({
    queryKey: ['programs', courseId],
    queryFn: async () => {
      if (courseFromState) return courseFromState;
      const courseData = await firestoreService.getCourse(courseId);
      if (!courseData) return null;
      return {
        id: courseData.id || courseId,
        courseId: courseData.id || courseId,
        title: courseData.title || 'Programa sin título',
        ...courseData,
      };
    },
    enabled: !!courseId || !!courseFromState,
    staleTime: STALE_TIMES.programStructure,
  });
  
  // Create navigation adapter
  const navigation = {
    navigate: (routeName, params) => {
      const routeMap = {
        'DailyWorkout': () => {
          const cId = params?.course?.courseId || params?.course?.id || courseId;
          navigate(`/course/${cId}/workout`, { state: params });
        },
        'CourseDetail': () => {
          const cId = params?.course?.courseId || params?.course?.id || courseId;
          navigate(`/course/${cId}`, { state: params });
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
    },
  };
  
  const route = {
    params: {
      course: course,
      ...(location.state || {})
    }
  };
  
  if (loading) {
    return <LoadingScreen />;
  }
  
  if (!course) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        backgroundColor: '#1a1a1a',
        color: '#ffffff'
      }}>
        <p>Programa no encontrado</p>
      </div>
    );
  }
  
  return <CourseStructureScreenBase navigation={navigation} route={route} />;
};

export default CourseStructureScreen;
