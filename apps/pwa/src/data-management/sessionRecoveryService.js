// Session Recovery Service — clears stale local state on startup and surfaces
// any in-progress server checkpoint through the normal RecoveryModal flow.
import AsyncStorage from '@react-native-async-storage/async-storage';

import logger from '../utils/logger.js';
import apiClient, { WakeApiError } from '../utils/apiClient.js';
import { auth } from '../config/firebase';

const LOCAL_SESSION_KEYS = [
  'current_session',
  'session_metadata',
  'session_backup_0',
  'session_backup_1',
  'session_backup_2',
];

class SessionRecoveryService {
  async initializeRecovery() {
    try {
      await this.detectAndRecoverSessions();
    } catch (error) {
      logger.error('Recovery initialization failed:', error);
    }
  }

  async detectAndRecoverSessions() {
    try {
      // Discard any stale local session data. The server checkpoint (activeSession
      // Firestore doc) is the source of truth. If a valid checkpoint exists, it
      // will be surfaced via RecoveryModal on the workout screen.
      await Promise.all(
        LOCAL_SESSION_KEYS.map(k => AsyncStorage.removeItem(k).catch(() => {}))
      );

      if (auth.currentUser) {
        await this.recoverFromServerCheckpoint();
      }
    } catch (error) {
      logger.error('Session detection failed:', error);
    }
  }

  async recoverFromServerCheckpoint() {
    try {
      const response = await apiClient.get('/workout/checkpoint');
      if (!response?.data?.checkpoint) return;

      const checkpoint = response.data.checkpoint;
      // Write into AsyncStorage so the workout screen can detect and offer resume.
      await AsyncStorage.setItem('current_session', JSON.stringify(checkpoint));
    } catch (error) {
      if (error instanceof WakeApiError && error.status === 404) return;
      logger.error('Error al recuperar sesión del servidor:', error);
    }
  }

  async getRecoveryStatus() {
    try {
      const activeSession = await AsyncStorage.getItem('current_session');
      return {
        hasActiveSession: !!activeSession,
        lastRecoveryCheck: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }
}

export default new SessionRecoveryService();
