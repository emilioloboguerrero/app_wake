import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import exerciseLibraryService from './exerciseLibraryService';
import logger from '../utils/logger';

/**
 * Program Media Service
 * 
 * Downloads and manages media files (videos, images) for programs in the background.
 * - Downloads happen asynchronously (non-blocking)
 * - Users can access programs immediately (streams from remote until local files ready)
 * - Local files used automatically once downloaded
 * - Handles version updates and expiration cleanup
 */
class ProgramMediaService {
  constructor() {
    this.BASE_DIR = FileSystem.documentDirectory
      ? `${FileSystem.documentDirectory}program_media`
      : null;
    this.MANIFESTS_KEY = 'program_media_manifests';
    this._manifests = {}; // Initialize as empty for immediate access
    this._downloadPromises = new Map(); // Track ongoing downloads
    this._manifestsLoaded = false;
    
    // Load manifests in background (delayed to not block startup)
    setTimeout(() => {
      this._loadAllManifests().catch(error => {
        logger.error('❌ Error loading manifests:', error);
      });
    }, 500); // Delay to not block app startup
  }

  /**
   * Initialize media downloads for a course (DISABLED)
   */
  async initializeForCourse(courseId, courseData) {
    // Media downloads disabled - do nothing
    return;
  }

  /**
   * Background download process (DISABLED - no downloads)
   */
  async _downloadCourseMedia(courseId, courseData, version, expiresAt) {
    // Media downloads disabled - do nothing
    return Promise.resolve();
  }

  /**
   * Get local path for exercise video (returns local path or fallback URL)
   * Non-blocking: returns fallback immediately if local file not ready
   */
  getExerciseVideoPath(courseId, primaryRef, fallbackUrl) {
    if (!courseId || !primaryRef || !this.BASE_DIR) {
      return fallbackUrl || null;
    }

    try {
      // If manifests not loaded yet, return fallback immediately
      if (!this._manifestsLoaded) {
        return fallbackUrl || null;
      }

      const manifest = this._manifests[courseId];
      if (!manifest || manifest.status !== 'complete') {
        return fallbackUrl || null;
      }

      const libraryId = Object.keys(primaryRef)[0];
      const exerciseName = primaryRef[libraryId];
      const mediaKey = `${libraryId}_${exerciseName}`;

      const exerciseMedia = manifest.media?.exercises?.[mediaKey];
      if (exerciseMedia && exerciseMedia.filePath) {
        return exerciseMedia.filePath;
      }

      return fallbackUrl || null;
    } catch (error) {
      logger.error(`❌ Error getting exercise video path:`, error);
      return fallbackUrl || null;
    }
  }

  /**
   * Get local path for session image (returns local path or fallback URL)
   */
  getSessionImagePath(courseId, sessionId, fallbackUrl) {
    if (!courseId || !sessionId || !this.BASE_DIR) {
      return fallbackUrl || null;
    }

    try {
      // If manifests not loaded yet, return fallback immediately
      if (!this._manifestsLoaded) {
        return fallbackUrl || null;
      }

      const manifest = this._manifests[courseId];
      if (!manifest || manifest.status !== 'complete') {
        return fallbackUrl || null;
      }

      const sessionMedia = manifest.media?.sessions?.[sessionId];
      if (sessionMedia && sessionMedia.filePath) {
        return sessionMedia.filePath;
      }

      return fallbackUrl || null;
    } catch (error) {
      logger.error(`❌ Error getting session image path:`, error);
      return fallbackUrl || null;
    }
  }

  /**
   * Get local path for program image (returns local path or fallback URL)
   */
  getProgramImagePath(courseId, fallbackUrl) {
    if (!courseId || !this.BASE_DIR) {
      return fallbackUrl || null;
    }

    try {
      // If manifests not loaded yet, return fallback immediately
      if (!this._manifestsLoaded) {
        return fallbackUrl || null;
      }

      const manifest = this._manifests[courseId];
      if (!manifest || manifest.status !== 'complete') {
        return fallbackUrl || null;
      }

      const programMedia = manifest.media?.program?.image;
      if (programMedia && programMedia.filePath) {
        return programMedia.filePath;
      }

      return fallbackUrl || null;
    } catch (error) {
      logger.error(`❌ Error getting program image path:`, error);
      return fallbackUrl || null;
    }
  }

  /**
   * Handle version update (DISABLED - no downloads or deletes)
   */
  async handleVersionUpdate(courseId, oldVersion, newVersion, courseData) {
    // Media downloads disabled - do nothing
    return;
  }

  /**
   * Cleanup expired programs (DISABLED - no deletes)
   */
  async cleanupExpiredPrograms() {
    // Media cleanup disabled - do nothing
    return 0;
  }

  /**
   * Delete all media for a program (DISABLED - no deletes)
   */
  async deleteProgramMedia(courseId) {
    // Media deletion disabled - do nothing
    return;
  }

  // Private helper methods

  async _ensureDir(path) {
    try {
      if (!path) throw new Error('Path is undefined');
      const info = await FileSystem.getInfoAsync(path);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(path, { intermediates: true });
        // Verify directory was created
        const verifyInfo = await FileSystem.getInfoAsync(path);
        if (!verifyInfo.exists) {
          throw new Error(`Failed to create directory: ${path}`);
        }
        logger.log(`✅ Created directory: ${path}`);
      }
    } catch (error) {
      logger.error(`❌ Error ensuring directory ${path}:`, error);
      throw error;
    }
  }

  _sanitize(key) {
    return key.replace(/[^\w\-]/g, '-');
  }

  async getManifest(courseId) {
    if (!this._manifestsLoaded) {
      await this._loadAllManifests();
    }
    return this._manifests[courseId] || null;
  }

  async getAllManifests() {
    if (!this._manifestsLoaded) {
      await this._loadAllManifests();
    }
    return Object.values(this._manifests);
  }

  async _loadAllManifests() {
    if (this._manifestsLoaded) return;

    try {
      // FIX: Add retry logic for device issues
      let retries = 3;
      let raw = null;
      
      while (retries > 0 && !raw) {
        try {
          raw = await AsyncStorage.getItem(this.MANIFESTS_KEY);
          if (raw) break;
        } catch (error) {
          logger.error(`❌ Error loading manifests (${retries} retries left):`, error);
          retries--;
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
          }
        }
      }
      
      if (!raw) {
        this._manifests = {};
        this._manifestsLoaded = true;
        logger.log('⚠️ No manifests found, starting fresh');
        return;
      }
      
      this._manifests = JSON.parse(raw);
      this._manifestsLoaded = true;
      logger.log(`✅ Loaded ${Object.keys(this._manifests).length} program media manifests`);
    } catch (error) {
      logger.error(`❌ Error loading manifests:`, error);
      this._manifests = {};
      this._manifestsLoaded = true; // FIX: Mark as loaded even on error to prevent blocking
    }
  }

  async _saveManifest(courseId, manifest) {
    try {
      if (!this._manifestsLoaded) {
        await this._loadAllManifests();
      }

      this._manifests[courseId] = manifest;
      await AsyncStorage.setItem(this.MANIFESTS_KEY, JSON.stringify(this._manifests));
    } catch (error) {
      logger.error(`❌ Error saving manifest:`, error);
    }
  }

  async _removeManifest(courseId) {
    try {
      if (!this._manifestsLoaded) {
        await this._loadAllManifests();
      }

      delete this._manifests[courseId];
      await AsyncStorage.setItem(this.MANIFESTS_KEY, JSON.stringify(this._manifests));
    } catch (error) {
      logger.error(`❌ Error removing manifest:`, error);
    }
  }
}

export default new ProgramMediaService();
