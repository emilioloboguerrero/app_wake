import apiClient from '../utils/apiClient';
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
    this._cachedAt = 0;
    this._loadingPromise = null;
    this._maxAgeMs = 5 * 60 * 1000;
  }

  async _loadResources() {
    if (this._cache && (Date.now() - this._cachedAt) < this._maxAgeMs) {
      return this._cache;
    }

    if (this._loadingPromise) {
      return this._loadingPromise;
    }

    this._loadingPromise = (async () => {
      try {
        const result = await apiClient.get('/app-resources', { includeAuth: false });
        const a = result?.data?.assets;
        if (!a) {
          logger.error('❌ No assets found in app-resources response');
          this._cache = null;
          return null;
        }
        const resources = {
          version: a.version ?? null,
          libraryImageUrl: a.library ?? null,
          warmupVideos: a.warmup ?? {},
          intensityVideos: a.intensity ?? {},
        };
        this._cache = resources;
        this._cachedAt = Date.now();
        return resources;
      } catch (error) {
        logger.error('❌ Error loading app resources:', error);
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


