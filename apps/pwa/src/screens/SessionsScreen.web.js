// Web wrapper for SessionsScreen - provides React Router navigation
import React from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
const SessionsScreenModule = require('./SessionsScreen.js');
const SessionsScreenBase = SessionsScreenModule.SessionsScreenBase || SessionsScreenModule.default;

const SessionsScreen = () => {
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();

  const navigation = {
    navigate: (routeName, routeParams) => {
      const routeMap = {
        'SessionDetail': () => {
          // Navigate with sessionId in URL and other params in state
          const sessionId = routeParams?.sessionId || routeParams?.session?.id || '';
          navigate(`/sessions/${sessionId}`, { state: routeParams });
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
  };

  const route = {
    params: {
      ...params,
      ...(location.state || {})
    }
  };

  return <SessionsScreenBase navigation={navigation} route={route} />;
};

export default SessionsScreen;

