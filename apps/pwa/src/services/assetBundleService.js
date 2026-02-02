import AsyncStorage from '@react-native-async-storage/async-storage';
// Use legacy filesystem API to avoid deprecation/runtime issues in SDK 54+
import * as FileSystem from 'expo-file-system/legacy';

import appResourcesService from './appResourcesService';
import logger from '../utils/logger';

/**
 * Asset bundle service
 *
 * Responsibility:
 * - Check remote assets version in `app_resources` (field: version on title == "assets")
 * - If local bundle version differs or is missing → download ALL assets for that version once
 * - Expose synchronous getters for local file paths used by screens
 *
 * Notes:
 * - If initialization fails (no network / errors), screens will fall back to bundled assets.
 * - Changing URLs in Firestore WITHOUT bumping `version` will NOT affect users who
 *   already downloaded that version (by design).
 */
class AssetBundleService {
  constructor() {
    this.MANIFEST_KEY = 'asset_bundle_manifest_v1';
    // FIX: Defer FileSystem access to prevent blocking on web
    // FileSystem.documentDirectory can block when accessed at import time
    this._baseDir = null;
    this._baseDirInitialized = false;
    this._manifest = null;
    this._initPromise = null;
  }

  // Lazy getter for BASE_DIR - only access FileSystem when actually needed
  get BASE_DIR() {
    if (!this._baseDirInitialized) {
      try {
        this._baseDir = FileSystem.documentDirectory
          ? `${FileSystem.documentDirectory}assets`
          : null;
      } catch (error) {
        logger.error('❌ Error accessing FileSystem.documentDirectory:', error);
        this._baseDir = null;
      }
      this._baseDirInitialized = true;
    }
    return this._baseDir;
  }

  async _loadManifest() {
    try {
      const raw = await AsyncStorage.getItem(this.MANIFEST_KEY);
      if (!raw) return null;
      const manifest = JSON.parse(raw);
      // Set manifest in memory for immediate access
      this._manifest = manifest;
      return manifest || null;
    } catch (error) {
      logger.error('❌ Error loading asset bundle manifest:', error);
      return null;
    }
  }

  async _saveManifest(manifest) {
    try {
      await AsyncStorage.setItem(this.MANIFEST_KEY, JSON.stringify(manifest));
      this._manifest = manifest;
    } catch (error) {
      logger.error('❌ Error saving asset bundle manifest:', error);
    }
  }

  async _ensureDir(path) {
    try {
      if (!path) {
        throw new Error('Path is undefined');
      }
      const info = await FileSystem.getInfoAsync(path);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(path, { intermediates: true });
      }
    } catch (error) {
      logger.error('❌ Error ensuring directory:', path, error);
      throw error;
    }
  }

  /**
   * Initialize assets bundle for current remote version.
   * This should be called once on app startup.
   */
  async initialize() {
    if (this._initPromise) {
      return this._initPromise;
    }

    this._initPromise = (async () => {
      try {
        logger.log('📦 AssetBundleService: Initializing asset bundle...');

        if (!this.BASE_DIR) {
          logger.log(
            'ℹ️ AssetBundleService: documentDirectory is not available on this platform; skipping bundle downloads.'
          );
          return;
        }

        // 1. Get remote resources + version from Firestore
        const resources = await appResourcesService.getAppResources();
        const remoteVersion = resources?.version || null;

        if (!remoteVersion) {
          logger.log('ℹ️ AssetBundleService: No remote version found, skipping bundle initialization.');
          return;
        }

        // 2. Load local manifest
        const localManifest = await this._loadManifest();

        if (
          localManifest &&
          localManifest.version === remoteVersion &&
          localManifest.status === 'complete'
        ) {
          logger.log('✅ AssetBundleService: Local bundle is up to date:', remoteVersion);
          this._manifest = localManifest;
          return;
        }

        logger.log('⬇️ AssetBundleService: Downloading full asset bundle for version:', remoteVersion);
        await this._downloadFullBundle(remoteVersion, resources);
      } catch (error) {
        logger.error('❌ AssetBundleService: Error during initialization');
        logger.error('Error details:', {
          code: error.code,
          message: error.message,
          name: error.name,
          stack: error.stack?.split('\n').slice(0, 10).join('\n')
        });
        
        // Check if this is a Firestore permission error
        if (error.code === 'permission-denied' || error.message?.includes('permission')) {
          logger.error('🚫 Permission error detected - This is likely a Firestore rules issue');
          logger.error('💡 Check that:');
          logger.error('   1. Firestore rules have been deployed: firebase deploy --only firestore:rules');
          logger.error('   2. Rules allow public read access to app_resources collection');
          logger.error('   3. The collection name matches exactly: "app_resources"');
        }
        
        logger.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
        // Do not throw further to avoid breaking app startup; screens will use fallbacks.
      } finally {
        this._initPromise = null;
      }
    })();

    return this._initPromise;
  }

  async _downloadFullBundle(version, resources) {
    const warmupMap = resources?.warmupVideos || {};
    const intensityMap = resources?.intensityVideos || {};
    const libraryImageUrl = resources?.libraryImageUrl || null;

    const baseVersionDir = `${this.BASE_DIR}/${version}`;
    const warmupDir = `${baseVersionDir}/warmup`;
    const intensityDir = `${baseVersionDir}/intensity`;
    const imagesDir = `${baseVersionDir}/images`;

    // Ensure all directories exist
    await this._ensureDir(baseVersionDir);
    await this._ensureDir(warmupDir);
    await this._ensureDir(intensityDir);
    await this._ensureDir(imagesDir);

    const files = {};

    // Helper to sanitize keys for filenames (e.g. "7/10" -> "7-10")
    const sanitize = (key) => key.replace(/[^\w\-]/g, '-');

    // 1) Download all warmup videos
    for (const [logicalKey, url] of Object.entries(warmupMap)) {
      if (!url) continue;
      try {
        const filePath = `${warmupDir}/${sanitize(logicalKey)}.mp4`;
        logger.log('⬇️ Downloading warmup video:', logicalKey, '→', filePath);
        await FileSystem.downloadAsync(url, filePath);
        files[`warmup.${logicalKey}`] = filePath;
      } catch (error) {
        logger.error('❌ Error downloading warmup video:', logicalKey, error);
        // If one fails, we still continue; bundle will be marked incomplete if needed.
      }
    }

    // 2) Download all intensity videos
    for (const [scoreKey, url] of Object.entries(intensityMap)) {
      if (!url) continue;
      try {
        const sanitized = sanitize(scoreKey); // e.g. "7/10" -> "7-10"
        const filePath = `${intensityDir}/${sanitized}.mp4`;
        logger.log('⬇️ Downloading intensity video:', scoreKey, '→', filePath);
        await FileSystem.downloadAsync(url, filePath);
        files[`intensity.${scoreKey}`] = filePath;
      } catch (error) {
        logger.error('❌ Error downloading intensity video:', scoreKey, error);
      }
    }

    // 3) Download library image
    if (libraryImageUrl) {
      try {
        const filePath = `${imagesDir}/library.jpg`;
        logger.log('⬇️ Downloading library image →', filePath);
        await FileSystem.downloadAsync(libraryImageUrl, filePath);
        files['library'] = filePath;
      } catch (error) {
        logger.error('❌ Error downloading library image:', error);
      }
    }

    // Determine completion status: require at least library + some videos
    const hasAnyWarmup = Object.keys(files).some((k) => k.startsWith('warmup.'));
    const hasAnyIntensity = Object.keys(files).some((k) => k.startsWith('intensity.'));
    const hasLibrary = !!files['library'];

    const status =
      hasAnyWarmup && hasAnyIntensity && hasLibrary ? 'complete' : 'incomplete';

    const manifest = {
      version,
      status,
      files,
    };

    logger.log('📦 AssetBundleService: Bundle download finished with status:', status, {
      version,
      fileCount: Object.keys(files).length,
    });

    await this._saveManifest(manifest);
  }

  /**
   * Get local path for a warmup video by logical key (e.g. "cardio").
   * Returns null if not available locally.
   * Note: Manifest must be loaded first via initialize() or _loadManifest()
   */
  getWarmupLocalPath(logicalKey) {
    if (!this._manifest || this._manifest.status !== 'complete') {
      return null;
    }
    return this._manifest.files?.[`warmup.${logicalKey}`] || null;
  }

  /**
   * Get local path for an intensity video by numeric score (7, 8, 9, 10)
   * or raw key string ("7/10").
   */
  getIntensityLocalPath(scoreOrKey) {
    if (!this._manifest || this._manifest.status !== 'complete') return null;

    if (typeof scoreOrKey === 'string') {
      return this._manifest.files?.[`intensity.${scoreOrKey}`] || null;
    }

    const key = `${scoreOrKey}/10`;
    return this._manifest.files?.[`intensity.${key}`] || null;
  }

  /**
   * Get local path for the library image.
   */
  getLibraryLocalPath() {
    if (!this._manifest || this._manifest.status !== 'complete') return null;
    return this._manifest.files?.library || null;
  }
}

export default new AssetBundleService();


