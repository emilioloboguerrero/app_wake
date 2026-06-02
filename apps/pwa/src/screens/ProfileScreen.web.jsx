// Web wrapper for ProfileScreen — renders the rich shared base component
// (ProfileScreen.js) and adapts React Router to the React Navigation API
// the base component expects.
import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { OpenReadinessModalContext } from '../navigation/WebAppNavigator';

// Explicit .js extension so Metro picks the shared base, not this .web.jsx file.
const ProfileScreenModule = require('./ProfileScreen.js');
const ProfileScreenBase = ProfileScreenModule.ProfileScreenBase || ProfileScreenModule.default;

const ProfileScreen = () => {
  const navigate = useNavigate();
  const readinessContext = useContext(OpenReadinessModalContext);
  const onOpenReadinessModal = readinessContext?.openReadinessModal ?? null;

  const navigation = {
    navigate: (routeName, params) => {
      const routeMap = {
        AllPurchasedCourses: () => navigate('/courses'),
        Subscriptions: () => navigate('/subscriptions'),
        ExercisePanel: () => navigate('/prs'),
        WeeklyVolumeHistory: () => navigate('/volume'),
        Sessions: () => navigate('/sessions'),
        CourseDetail: () => navigate(`/course/${params?.course?.courseId || params?.course?.id}`),
        Main: () => navigate('/'),
        CreatorEvents: () => navigate('/creator/events'),
        Library: () => navigate('/library'),
      };

      if (routeMap[routeName]) {
        routeMap[routeName]();
      } else {
        navigate(`/${routeName.toLowerCase()}`, { state: params });
      }
    },
    reset: (config) => {
      if (config?.routes && config.routes.length > 0) {
        const firstRoute = config.routes[0];
        if (firstRoute.name === 'Main') {
          navigate('/');
        } else {
          navigate(`/${firstRoute.name.toLowerCase()}`);
        }
      } else {
        navigate('/');
      }
    },
    goBack: () => {
      navigate(-1);
    },
  };

  const route = { params: {} };

  return (
    <ProfileScreenBase
      navigation={navigation}
      route={route}
      onOpenReadinessModal={onOpenReadinessModal}
    />
  );
};

export default ProfileScreen;
