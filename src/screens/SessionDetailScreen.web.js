// Web wrapper for SessionDetailScreen - provides React Router navigation
import React from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
const SessionDetailScreenModule = require('./SessionDetailScreen.js');
const SessionDetailScreenBase = SessionDetailScreenModule.SessionDetailScreenBase || SessionDetailScreenModule.default;

const SessionDetailScreen = () => {
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();

  // Get params from both URL params and location state
  const stateParams = location.state || {};

  const navigation = {
    navigate: (routeName, routeParams) => {
      const routeMap = {
        'ExerciseDetail': () => {
          const exerciseKey = routeParams?.exerciseKey || routeParams?.exercise?.id || '';
          navigate(`/prs/${exerciseKey}`, { state: routeParams });
        },
        'Main': () => navigate('/'),
        'Profile': () => navigate('/profile'),
        'Sessions': () => navigate('/sessions'),
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
      sessionId: params.sessionId,
      sessionName: stateParams.sessionName,
      date: stateParams.date,
      sessionData: stateParams.sessionData,
      ...stateParams,
      ...params
    }
  };

  return <SessionDetailScreenBase navigation={navigation} route={route} />;
};

export default SessionDetailScreen;

