// Web wrapper for WarmupScreen - provides React Router navigation
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import logger from '../utils/logger';
import { useAuth } from '../contexts/AuthContext';
import LoadingScreen from './LoadingScreen';

// Import the base component
const WarmupScreenModule = require('./WarmupScreen.js');
const WarmupScreenBase = WarmupScreenModule.default;

const WarmupScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth(); // Get user from AuthContext
  
  // Get params from location state
  const course = location.state?.course;
  const workout = location.state?.workout;
  const sessionId = location.state?.sessionId;
  
  // Create navigation adapter
  const navigation = {
    navigate: (routeName, params) => {
      logger.log('🧭 [Warmup Web] Navigating to:', routeName, params);
      
      const routeMap = {
        'WorkoutExecution': () => {
          const courseId = params?.course?.courseId || params?.course?.id;
          if (courseId) {
            navigate(`/course/${courseId}/workout/execution`, { state: params });
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
      logger.log('🧭 [Warmup Web] setParams:', params);
    },
  };
  
  const route = {
    params: {
      course,
      workout,
      sessionId,
      ...(location.state || {})
    }
  };
  
  if (!course || !workout) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignments: 'center', 
        height: '100vh',
        backgroundColor: '#1a1a1a',
        color: '#ffffff',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <p>Datos de calentamiento no encontrados</p>
        <button 
          onClick={() => navigate('/')}
          style={{
            padding: '12px 24px',
            backgroundColor: '#007AFF',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          Volver al Inicio
        </button>
      </div>
    );
  }
  
  return <WarmupScreenBase navigation={navigation} route={route} />;
};

export default WarmupScreen;
