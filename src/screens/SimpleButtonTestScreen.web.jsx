// Web wrapper for SimpleButtonTestScreen - minimal test page with button
import React from 'react';
import logger from '../utils/logger';
// Import the base component using require pattern like other screens
const SimpleButtonTestScreenModule = require('./SimpleButtonTestScreen.js');
const SimpleButtonTestScreenBase = SimpleButtonTestScreenModule.default || SimpleButtonTestScreenModule;

const SimpleButtonTestScreen = () => {
  logger.debug('[SIMPLE_TEST_WEB] Web wrapper mounted');
  return <SimpleButtonTestScreenBase />;
};

export default SimpleButtonTestScreen;
