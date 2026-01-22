// Web wrapper for PRDetailScreen - provides React Router navigation
import React from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import logger from '../utils/logger';

// CRITICAL: Import web header FIRST to ensure Metro resolves it correctly
// Metro should automatically resolve WakeHeader to WakeHeader.web.jsx on web,
// but we explicitly import it to ensure it's in the bundle
import '../components/WakeHeader.web.jsx';

// Now require the base component - Metro should resolve its WakeHeader import to web version
const PRDetailScreenModule = require('./PRDetailScreen.js');
const PRDetailScreenBase = PRDetailScreenModule.PRDetailScreenBase || PRDetailScreenModule.default;

const PRDetailScreen = () => {
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();

  // Extract exerciseKey from URL param (exerciseId in route is actually exerciseKey)
  // Decode the URL-encoded exerciseKey
  const exerciseKey = params.exerciseId ? decodeURIComponent(params.exerciseId) : null;
  
  // Get additional params from location.state (passed from navigation)
  const stateParams = location.state || {};

  const navigation = {
    navigate: (routeName, routeParams) => {
      const routeMap = {
        'ExerciseHistory': () => {
          const key = routeParams?.exerciseKey || exerciseKey || '';
          navigate(`/prs/${key}`, { state: routeParams });
        },
        'ExerciseDetail': () => {
          const key = routeParams?.exerciseKey || exerciseKey || '';
          navigate(`/prs/${key}`, { state: routeParams });
        },
        'Main': () => navigate('/'),
        'Profile': () => navigate('/profile'),
        'ExercisePanel': () => navigate('/prs'),
      };

      if (routeMap[routeName]) {
        routeMap[routeName]();
      } else {
        const path = `/${routeName.toLowerCase()}`;
        navigate(path, { state: routeParams });
      }
    },
    goBack: () => {
      navigate(-1);
    },
  };

  // Parse exerciseKey to extract libraryId and exerciseName if needed
  const parseExerciseKey = (key) => {
    if (!key) return { libraryId: null, exerciseName: null };
    const parts = key.split('_');
    if (parts.length >= 2) {
      return {
        libraryId: parts[0],
        exerciseName: parts.slice(1).join('_')
      };
    }
    return { libraryId: null, exerciseName: key };
  };

  const { libraryId, exerciseName } = parseExerciseKey(exerciseKey);

  // Ensure route is always defined with params
  const route = React.useMemo(() => {
    if (!exerciseKey) {
      logger.error('[PRDetailScreen.web] exerciseKey is missing from URL params', { params, location });
    }
    
    return {
      params: {
        exerciseKey: exerciseKey || '',
        exerciseId: exerciseKey || '', // Alias for compatibility
        exerciseName: stateParams.exerciseName || exerciseName || '',
        libraryId: stateParams.libraryId || libraryId || '',
        currentEstimate: stateParams.currentEstimate,
        lastUpdated: stateParams.lastUpdated,
        ...stateParams
      }
    };
  }, [exerciseKey, stateParams, libraryId, exerciseName]);

  // Ensure PRDetailScreenBase exists
  if (!PRDetailScreenBase) {
    console.error('[PRDetailScreen.web] PRDetailScreenBase is undefined!');
    return <div style={{ padding: 20, color: 'white' }}>Error: PRDetailScreenBase not loaded</div>;
  }

  return <PRDetailScreenBase navigation={navigation} route={route} />;
};

export default PRDetailScreen;

