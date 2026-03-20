// App Session Manager - Tracks cold starts vs app resumes
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

import logger from '../utils/logger.js';
class AppSessionManager {
  constructor() {
    this.isFirstLoad = true;
    this.sessionId = null;
    this.appStateSubscription = null;
  }

  /**
   * Initialize session tracking
   */
  async initialize() {
    try {
      // Generate new session ID for this app start
      this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Mark that app has started
      await this.markAppStarted();
      
      // Listen for app state changes
      this.setupAppStateListener();
      
      return true;
    } catch (error) {
      logger.error('❌ Failed to initialize session manager:', error);
      return false;
    }
  }

  /**
   * Check if this is a cold start (app was closed and reopened)
   */
  async isColdStart() {
    try {
      const lastSessionData = await AsyncStorage.getItem('app_session_data');
      
      if (!lastSessionData) {
        return true;
      }
      
      const sessionData = JSON.parse(lastSessionData);
      
      // Check if app was properly closed (background state saved)
      if (sessionData.appState === 'background' || sessionData.appState === 'inactive') {
        // Check how long ago the app went to background
        const backgroundTime = new Date(sessionData.backgroundAt);
        const now = new Date();
        const minutesInBackground = (now - backgroundTime) / (1000 * 60);
        
        // If app was in background for more than 30 minutes, consider it a cold start
        if (minutesInBackground > 30) {
          return true;
        } else {
          return false;
        }
      }
      
      return true;
      
    } catch (error) {
      logger.error('❌ Error checking cold start:', error);
      // Default to cold start if we can't determine
      return true;
    }
  }

  /**
   * Mark that app has started
   */
  async markAppStarted() {
    try {
      const sessionData = {
        sessionId: this.sessionId,
        startedAt: new Date().toISOString(),
        appState: 'active'
      };
      
      await AsyncStorage.setItem('app_session_data', JSON.stringify(sessionData));
    } catch (error) {
      logger.error('❌ Failed to mark app started:', error);
    }
  }

  /**
   * Setup app state listener to track background/foreground
   */
  setupAppStateListener() {
    this.appStateSubscription = AppState.addEventListener('change', async (nextAppState) => {
      try {
        const sessionData = {
          sessionId: this.sessionId,
          appState: nextAppState,
          backgroundAt: nextAppState === 'background' ? new Date().toISOString() : null,
          lastStateChange: new Date().toISOString()
        };
        
        await AsyncStorage.setItem('app_session_data', JSON.stringify(sessionData));
        
      } catch (error) {
        logger.error('❌ Failed to update app state:', error);
      }
    });
  }

  /**
   * Check if app needs cache refresh (cold start only)
   */
  async shouldRefreshCache() {
    return await this.isColdStart();
  }

  /**
   * Get current session info
   */
  getSessionInfo() {
    return {
      sessionId: this.sessionId,
      isFirstLoad: this.isFirstLoad
    };
  }

  /**
   * Cleanup session manager
   */
  cleanup() {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
  }
}

export default new AppSessionManager();
