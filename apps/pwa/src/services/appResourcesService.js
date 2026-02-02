import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { auth, firestore } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import logger from '../utils/logger';

/**
 * Service to load app-wide resources (images/videos) from Firestore.
 *
 * Firestore structure:
 * Collection: app_resources
 *   Document: (any id) with field:
 *     - title: "assets"
 *     - library: string (image_url)
 *     - warmup: map<string, string> (e.g. "cardio" -> video_url)
 *     - intensity: map<string, string> (e.g. "7/10" -> video_url)
 *     - version: string (assets version identifier)
 */
class AppResourcesService {
  constructor() {
    this._cache = null;
    this._loadingPromise = null;
  }

  async _loadResources() {
    if (this._cache) {
      return this._cache;
    }

    if (this._loadingPromise) {
      return this._loadingPromise;
    }

    this._loadingPromise = (async () => {
      try {
        // Check authentication state
        const checkAuthState = () => {
          return new Promise((resolve) => {
            const unsubscribe = onAuthStateChanged(auth, (user) => {
              unsubscribe();
              resolve(user);
            });
            // Timeout after 2 seconds if auth state doesn't resolve quickly
            setTimeout(() => {
              unsubscribe();
              resolve(auth.currentUser);
            }, 2000);
          });
        };

        const currentUser = await checkAuthState();
        const isAuthenticated = !!currentUser;
        const userId = currentUser?.uid || null;
        
        logger.log('📦 Loading app resources from Firestore...');
        logger.log('🔐 Authentication state:', {
          isAuthenticated,
          userId: userId || 'not authenticated',
          email: currentUser?.email || 'no email'
        });

        logger.log('🔍 Firestore configuration:', {
          projectId: firestore.app.options.projectId,
          collection: 'app_resources',
          query: 'title == "assets"'
        });

        const q = query(
          collection(firestore, 'app_resources'),
          where('title', '==', 'assets'),
          limit(1)
        );

        logger.log('📡 Executing Firestore query...');
        const snapshot = await getDocs(q);

        logger.log('📊 Query result:', {
          empty: snapshot.empty,
          size: snapshot.size,
          hasDocs: snapshot.docs.length > 0
        });

        if (snapshot.empty) {
          logger.error('❌ No app_resources document with title == "assets" found');
          logger.log('💡 Debug info: Collection may be empty or query may not match any documents');
          this._cache = null;
          return null;
        }

        const doc = snapshot.docs[0];
        const docId = doc.id;
        const data = doc.data() || {};

        logger.log('📄 Document retrieved:', {
          docId,
          hasData: Object.keys(data).length > 0,
          fields: Object.keys(data)
        });

        const libraryImageUrl = data.library || null;
        const warmupMap = data.warmup || {};
        const intensityMap = data.intensity || {};
        const version = data.version || null;

        const resources = {
          version,
          libraryImageUrl,
          warmupVideos: warmupMap,
          intensityVideos: intensityMap,
        };

        logger.log('✅ App resources loaded:', {
          version,
          hasLibraryImage: !!libraryImageUrl,
          warmupKeys: Object.keys(warmupMap || {}),
          intensityKeys: Object.keys(intensityMap || {}),
        });

        this._cache = resources;
        return resources;
      } catch (error) {
        logger.error('❌ Error loading app resources from Firestore');
        logger.error('Error details:', {
          code: error.code,
          message: error.message,
          stack: error.stack,
          name: error.name
        });
        
        // Log specific error types
        if (error.code === 'permission-denied') {
          logger.error('🚫 Permission denied - Possible causes:');
          logger.error('   1. Firestore rules not deployed or updated');
          logger.error('   2. Rules still require authentication');
          logger.error('   3. User not authenticated when rules require it');
          logger.error('   4. Collection or document structure mismatch');
        }
        
        if (error.code === 'unavailable') {
          logger.error('🌐 Service unavailable - Check network connection');
        }

        logger.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
        
        this._cache = null;
        throw error;
      } finally {
        this._loadingPromise = null;
      }
    })();

    return this._loadingPromise;
  }

  /**
   * Get all app resources (cached after first load)
   */
  async getAppResources() {
    return await this._loadResources();
  }

  /**
   * Get warmup video URL by logical key (e.g. "cardio", "circulos_adelante").
   */
  async getWarmupVideoUrl(key) {
    const resources = await this._loadResources();
    return resources?.warmupVideos?.[key] || null;
  }

  /**
   * Get intensity video URL by numeric score (e.g. 7 -> "7/10" field).
   * Also accepts the raw string key ("7/10") for flexibility.
   */
  async getIntensityVideoUrl(scoreOrKey) {
    const resources = await this._loadResources();
    if (!resources) return null;

    const map = resources.intensityVideos || {};
    if (typeof scoreOrKey === 'string') {
      return map[scoreOrKey] || null;
    }

    const key = `${scoreOrKey}/10`;
    return map[key] || null;
  }

  /**
   * Get the library image URL.
   */
  async getLibraryImageUrl() {
    const resources = await this._loadResources();
    return resources?.libraryImageUrl || null;
  }

  /**
   * Get the current remote assets version from Firestore.
   * This is the canonical version field to compare against any local/cache version.
   */
  async getAssetsVersion() {
    const resources = await this._loadResources();
    return resources?.version || null;
  }
}

export default new AppResourcesService();


