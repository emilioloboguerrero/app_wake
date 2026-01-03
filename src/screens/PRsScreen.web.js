// Web wrapper for PRsScreen - provides React Router navigation
import React from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';

// Load base component at module scope
let PRsScreenBase;
try {
  const PRsScreenModule = require('./PRsScreen.js');
  PRsScreenBase = PRsScreenModule.PRsScreenBase || PRsScreenModule.default;
} catch (error) {
  console.error('[PRsScreen.web] Failed to load base component:', error);
}

const PRsScreen = () => {
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();
  
  // Ensure we have navigate hook
  if (!navigate) {
    console.error('[PRsScreen.web] useNavigate returned undefined - not inside Router context?');
    return <div style={{ padding: 20, color: 'white' }}>Error: Not inside Router context</div>;
  }

  // Create navigation adapter that matches React Navigation API
  // Use useMemo to ensure stable reference
  const navigation = React.useMemo(() => {
    if (!navigate) {
      console.error('[PRsScreen.web] useNavigate returned undefined!');
      return null;
    }
    
    return {
      navigate: (routeName, routeParams) => {
        const routeMap = {
          'ExerciseDetail': () => {
            // For ExerciseDetail, we need to encode the exerciseKey in the URL
            // Use exerciseKey if available, otherwise construct from other params
            const exerciseKey = routeParams?.exerciseKey || 
                               (routeParams?.libraryId && routeParams?.exerciseName 
                                 ? `${routeParams.libraryId}_${routeParams.exerciseName}` 
                                 : '');
            if (!exerciseKey) {
              console.error('[PRsScreen.web] Missing exerciseKey for ExerciseDetail navigation');
              return;
            }
            // Navigate with state to pass all params
            navigate(`/prs/${encodeURIComponent(exerciseKey)}`, { state: routeParams });
          },
          'Main': () => navigate('/'),
          'Profile': () => navigate('/profile'),
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
      replace: (routeName, params) => {
        // Handle replace navigation
        navigate(`/${routeName.toLowerCase()}`, { state: params, replace: true });
      },
    };
  }, [navigate]);

  // Create route object for compatibility
  const route = React.useMemo(() => ({
    params: {
      ...params,
      ...(location.state || {})
    }
  }), [params, location.state]);

  // Debug: Log if navigation is undefined
  if (!navigation) {
    console.error('[PRsScreen.web] Navigation object is undefined!', { navigate, params, location });
    return <div style={{ padding: 20, color: 'white' }}>Error: Navigation not available. Please refresh the page.</div>;
  }

  // Ensure PRsScreenBase exists
  if (!PRsScreenBase) {
    console.error('[PRsScreen.web] PRsScreenBase is undefined!');
    return <div style={{ padding: 20, color: 'white' }}>Error: PRsScreenBase not loaded</div>;
  }

  // Debug: Log navigation object before passing
  console.log('[PRsScreen.web] Passing navigation to base component:', {
    hasNavigation: !!navigation,
    hasNavigate: !!(navigation && navigation.navigate),
    hasGoBack: !!(navigation && navigation.goBack),
    navigationType: typeof navigation
  });

  return <PRsScreenBase navigation={navigation} route={route} />;
};

export default PRsScreen;

