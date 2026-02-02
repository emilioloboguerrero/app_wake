// Web wrapper for CreatorProfileScreen - provides React Router navigation
import React from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import LoadingScreen from './LoadingScreen';
import logger from '../utils/logger';

// Import the base component
const CreatorProfileScreenModule = require('./CreatorProfileScreen.js');
const CreatorProfileScreenBase = CreatorProfileScreenModule.default;

const CreatorProfileScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { creatorId } = useParams();
  
  // Get imageUrl from location state if passed
  const imageUrl = location.state?.imageUrl || null;
  
  if (!creatorId) {
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
        <p>ID del creador no encontrado</p>
        <button 
          onClick={() => navigate(-1)}
          style={{
            padding: '12px 24px',
            backgroundColor: '#007AFF',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          Volver
        </button>
      </div>
    );
  }
  
  // Create navigation adapter that matches React Navigation API
  const navigation = {
    navigate: (routeName, params) => {
      logger.log('🧭 [CreatorProfile Web] Navigating to:', routeName, params);
      
      const routeMap = {
        'CourseDetail': () => {
          const courseId = params?.course?.courseId || params?.course?.id;
          if (courseId) {
            navigate(`/course/${courseId}`, { state: params });
          }
        },
        'DailyWorkout': () => {
          const courseId = params?.course?.courseId || params?.course?.id;
          if (courseId) {
            navigate(`/course/${courseId}/workout`, { state: params });
          }
        },
        'Main': () => navigate('/'),
        'MainScreen': () => navigate('/'),
        'Library': () => navigate('/library'),
      };
      
      if (routeMap[routeName]) {
        routeMap[routeName]();
      } else {
        // Fallback: try to construct path from route name
        const path = `/${routeName.toLowerCase()}`;
        logger.log('🧭 [CreatorProfile Web] Using fallback path:', path);
        navigate(path, { state: params });
      }
    },
    goBack: () => {
      navigate(-1); // Go back in browser history
    },
    setParams: (params) => {
      // On web, we can update location state
      logger.log('🧭 [CreatorProfile Web] setParams called:', params);
    },
  };
  
  // Create route object for compatibility
  const route = {
    params: {
      creatorId: creatorId,
      imageUrl: imageUrl
    }
  };
  
  logger.log('🧭 [CreatorProfile Web] Rendering with params:', route.params);
  
  return <CreatorProfileScreenBase navigation={navigation} route={route} />;
};

export default CreatorProfileScreen;
