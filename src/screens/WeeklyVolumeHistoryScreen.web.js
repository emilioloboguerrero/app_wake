// Web wrapper for WeeklyVolumeHistoryScreen - provides React Router navigation
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
const WeeklyVolumeHistoryScreenModule = require('./WeeklyVolumeHistoryScreen.js');
const WeeklyVolumeHistoryScreenBase = WeeklyVolumeHistoryScreenModule.WeeklyVolumeHistoryScreenBase || WeeklyVolumeHistoryScreenModule.default;

const WeeklyVolumeHistoryScreen = () => {
  const navigate = useNavigate();
  const params = useParams();

  const navigation = {
    navigate: (routeName, routeParams) => {
      const routeMap = {
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
    params: params || {}
  };

  return <WeeklyVolumeHistoryScreenBase navigation={navigation} route={route} />;
};

export default WeeklyVolumeHistoryScreen;

