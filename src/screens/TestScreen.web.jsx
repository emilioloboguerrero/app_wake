// Web wrapper for TestScreen - minimal test page
import React from 'react';
import logger from '../utils/logger';
// Import the base component using require pattern like other screens
const TestScreenModule = require('./TestScreen.js');
const TestScreenBase = TestScreenModule.default || TestScreenModule;

const TestScreen = () => {
  logger.debug('[TEST_SCREEN_WEB] Web wrapper mounted');
  return <TestScreenBase />;
};

export default TestScreen;
