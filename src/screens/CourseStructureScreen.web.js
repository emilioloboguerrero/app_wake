// Web wrapper for CourseStructureScreen - provides React Router navigation
import React from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import LoadingScreen from './LoadingScreen';
import logger from '../utils/logger';
import firestoreService from '../services/firestoreService';
import { useAuth } from '../contexts/AuthContext';

// Import the base component
const CourseStructureScreenModule = require('./CourseStructureScreen.js');
const CourseStructureScreenBase = CourseStructureScreenModule.default;

const CourseStructureScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { courseId } = useParams();
  const { user } = useAuth(); // Get user from AuthContext
  
  const [course, setCourse] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const hasFetchedRef = React.useRef(false);
  
  // Get course from location state or fetch it
  React.useEffect(() => {
    if (hasFetchedRef.current) return;
    
    const fetchCourse = async () => {
      hasFetchedRef.current = true;
      
      if (location.state?.course) {
        setCourse(location.state.course);
        setLoading(false);
        return;
      }
      
      if (!courseId) {
        setLoading(false);
        return;
      }
      
      try {
        const courseData = await firestoreService.getCourse(courseId);
        if (courseData) {
          const transformedCourse = {
            id: courseData.id || courseId,
            courseId: courseData.id || courseId,
            title: courseData.title || 'Programa sin título',
            ...courseData
          };
          setCourse(transformedCourse);
        }
      } catch (error) {
        logger.error('Error fetching course:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchCourse();
  }, [courseId, location.state?.course]);
  
  // Create navigation adapter
  const navigation = {
    navigate: (routeName, params) => {
      logger.log('🧭 [CourseStructure Web] Navigating to:', routeName, params);
      
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
      logger.log('🧭 [CourseStructure Web] setParams:', params);
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
