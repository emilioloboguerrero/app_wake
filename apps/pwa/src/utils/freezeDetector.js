// Freeze Detector - Helps identify where the app is freezing
// This will log when components render and help identify infinite loops
import logger from './logger';

let renderCounts = {};
let lastRenderTime = {};

export const trackRender = (componentName) => {
  const now = Date.now();
  const lastTime = lastRenderTime[componentName] || 0;
  const timeSinceLastRender = now - lastTime;
  
  renderCounts[componentName] = (renderCounts[componentName] || 0) + 1;
  lastRenderTime[componentName] = now;
  
  // Warn if component is rendering too frequently (potential infinite loop)
  if (timeSinceLastRender < 100 && renderCounts[componentName] > 10) {
    logger.warn(`⚠️ [FREEZE DETECTOR] ${componentName} is rendering too frequently!`, {
      count: renderCounts[componentName],
      timeSinceLastRender,
      potentialLoop: true
    });
  }
  
};

export const resetCounters = () => {
  renderCounts = {};
  lastRenderTime = {};
};

export const getRenderCounts = () => ({ ...renderCounts });


