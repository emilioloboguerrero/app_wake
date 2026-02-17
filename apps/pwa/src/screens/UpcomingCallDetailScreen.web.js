// Web wrapper for UpcomingCallDetailScreen - React Router navigation
import React from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
const UpcomingCallDetailScreenModule = require('./UpcomingCallDetailScreen.js');
const UpcomingCallDetailScreenBase = UpcomingCallDetailScreenModule.default;

const UpcomingCallDetailScreen = () => {
  const navigate = useNavigate();
  const { bookingId } = useParams();
  const location = useLocation();
  const state = location.state || {};

  const navigation = {
    goBack: () => navigate(-1),
  };

  const route = {
    params: {
      bookingId,
      booking: state.booking,
      course: state.course,
      creatorName: state.creatorName,
    },
  };

  return <UpcomingCallDetailScreenBase navigation={navigation} route={route} />;
};

export default UpcomingCallDetailScreen;
