// Web wrapper for LabScreen - provides React Router navigation
import React from 'react';
import { useNavigate } from 'react-router-dom';
const LabScreenModule = require('./LabScreen.js');
const LabScreenBase = LabScreenModule.LabScreenBase || LabScreenModule.default;

const LabScreen = () => {
  const navigate = useNavigate();

  const navigation = {
    navigate: (routeName, params) => {
      const routeMap = {
        'Sessions': () => navigate('/sessions'),
        'ExercisePanel': () => navigate('/prs'),
        'WeeklyVolumeHistory': () => navigate('/volume'),
        'Main': () => navigate('/'),
        'Profile': () => navigate('/profile'),
      };

      if (routeMap[routeName]) {
        routeMap[routeName]();
      } else {
        navigate(`/${routeName.toLowerCase()}`, { state: params });
      }
    },
    goBack: () => {
      navigate(-1);
    },
  };

  const route = { params: {} };

  return <LabScreenBase navigation={navigation} route={route} />;
};

export default LabScreen;
