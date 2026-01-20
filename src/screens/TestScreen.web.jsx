// Web wrapper for TestScreen - minimal test page
import React from 'react';
// Import the base component using require pattern like other screens
const TestScreenModule = require('./TestScreen.js');
const TestScreenBase = TestScreenModule.default || TestScreenModule;

const TestScreen = () => {
  console.log('[TEST_SCREEN_WEB] Web wrapper mounted');
  return <TestScreenBase />;
};

export default TestScreen;
