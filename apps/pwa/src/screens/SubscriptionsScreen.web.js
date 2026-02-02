// Web wrapper for SubscriptionsScreen - provides React Router navigation
import React from 'react';
import { useNavigate } from 'react-router-dom';
import logger from '../utils/logger';
// Import the base component - Metro should resolve SubscriptionsScreen.js (not .web.js) when we use explicit .js extension
// The metro.config.js is configured to prioritize .js over .web.js for explicit imports
// IMPORTANT: Keep require at module scope (top level) to ensure Metro bundles it correctly
// Use a function to ensure require is evaluated immediately and all dependencies are resolved
let SubscriptionsScreenBase;
(function() {
  try {
    const SubscriptionsScreenModule = require('./SubscriptionsScreen.js');
    SubscriptionsScreenBase = SubscriptionsScreenModule.SubscriptionsScreenBase || SubscriptionsScreenModule.default;
    if (!SubscriptionsScreenBase) {
      throw new Error('SubscriptionsScreenBase not found');
    }
  } catch (e) {
    logger.error('[SubscriptionsScreen.web] Error loading base component:', e);
    // Fallback: create a simple error component
    SubscriptionsScreenBase = () => React.createElement('div', { style: { padding: 20, color: 'white' } }, 'Error loading subscriptions');
  }
})();

const SubscriptionsScreen = () => {
  const navigate = useNavigate();

  // Create navigation adapter that matches React Navigation API
  const navigation = {
    navigate: (routeName, params) => {
      // Map React Navigation routes to React Router paths
      const routeMap = {
        'Main': () => navigate('/'),
        'Profile': () => navigate('/profile'),
      };

      if (routeMap[routeName]) {
        routeMap[routeName]();
      } else {
        // Fallback: try to construct path from route name
        const path = `/${routeName.toLowerCase()}`;
        navigate(path, { state: params });
      }
    },
    goBack: () => {
      navigate(-1); // Go back in browser history
    },
  };

  // Create route object for compatibility
  const route = {
    params: {}
  };

  return <SubscriptionsScreenBase navigation={navigation} route={route} />;
};

export default SubscriptionsScreen;

