// Web wrapper for CourseDetailScreen - provides React Router navigation
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import firestoreService from '../services/firestoreService';
import LoadingScreen from './LoadingScreen';
import logger from '../utils/logger';

// Import the base component
const CourseDetailScreenModule = require('./CourseDetailScreen.js');
const CourseDetailScreenBase = CourseDetailScreenModule.CourseDetailScreenBase || CourseDetailScreenModule.default;

const CourseDetailScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { courseId } = useParams();
  const { user } = useAuth();
  
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Fetch course data from URL param
  useEffect(() => {
    const fetchCourse = async () => {
      if (!courseId) {
        setError('Course ID is required');
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        setError(null);
        logger.log('🔍 Fetching course data for courseId:', courseId);
        
        const courseData = await firestoreService.getCourse(courseId);
        
        if (!courseData) {
          setError('Course not found');
          setLoading(false);
          return;
        }
        
        // Transform to match expected format
        const transformedCourse = {
          id: courseData.id || courseId,
          courseId: courseData.id || courseId,
          title: courseData.title || 'Programa sin título',
          image_url: courseData.image_url || null,
          discipline: courseData.discipline || 'General',
          creator_id: courseData.creator_id || null,
          creatorName: courseData.creatorName || courseData.creator_name || 'Creador no especificado',
          description: courseData.description || null,
          difficulty: courseData.difficulty || null,
          duration: courseData.duration || null,
          price: courseData.price || null,
          access_duration: courseData.access_duration || null,
          free_trial: courseData.free_trial || {},
          ...courseData // Include any other properties
        };
        
        logger.log('✅ Course data loaded:', transformedCourse);
        setCourse(transformedCourse);
      } catch (err) {
        logger.error('❌ Error fetching course:', err);
        setError(err.message || 'Error al cargar el programa');
      } finally {
        setLoading(false);
      }
    };
    
    if (user?.uid && courseId) {
      fetchCourse();
    }
  }, [courseId, user?.uid]);
  
  // Create navigation adapter that matches React Navigation API
  const navigation = {
    navigate: (routeName, params) => {
      const routeMap = {
        'CourseDetail': () => navigate(`/course/${params?.course?.courseId || params?.course?.id}`),
        'DailyWorkout': () => navigate(`/course/${params?.course?.courseId || params?.course?.id}/workout`),
        'CourseStructure': () => navigate(`/course/${params?.course?.courseId || params?.course?.id}/structure`),
        'WorkoutExercises': () => navigate(`/course/${params?.course?.courseId || params?.course?.id}/exercises`),
        'WorkoutExecution': () => navigate(`/course/${params?.course?.courseId || params?.course?.id}/workout/execution`, { state: params }),
        'WorkoutCompletion': () => navigate(`/course/${params?.course?.courseId || params?.course?.id}/workout/completion`, { state: params }),
        'Warmup': () => navigate('/warmup', { state: params }),
        'Main': () => navigate('/'),
        'MainScreen': () => navigate('/'),
        'CreatorProfile': () => {
          if (params?.creatorId) {
            navigate(`/creator/${params.creatorId}`, { state: { imageUrl: params?.imageUrl } });
          }
        },
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
    params: {
      course: course
    }
  };
  
  // Show loading screen while fetching course
  if (loading) {
    return <LoadingScreen />;
  }
  
  // Show error if course not found
  if (error || !course) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        backgroundColor: '#1a1a1a',
        color: '#ffffff',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <p>{error || 'Curso no encontrado'}</p>
        <button 
          onClick={() => navigate('/library')}
          style={{
            padding: '12px 24px',
            backgroundColor: '#007AFF',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          Volver a la Biblioteca
        </button>
      </div>
    );
  }
  
  return <CourseDetailScreenBase navigation={navigation} route={route} />;
};

export default CourseDetailScreen;
