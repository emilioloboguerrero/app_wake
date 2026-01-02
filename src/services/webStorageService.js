// Web Storage Service - IndexedDB wrapper for PWA
// Provides AsyncStorage-like API using IndexedDB

class WebStorageService {
  constructor() {
    this.db = null;
    this.dbName = 'WakeAppDB';
    this.dbVersion = 1;
    this.initPromise = null;
  }

  // Initialize IndexedDB
  async init() {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB not available'));
        return;
      }

      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object stores
        if (!db.objectStoreNames.contains('keyval')) {
          db.createObjectStore('keyval');
        }

        if (!db.objectStoreNames.contains('courses')) {
          const courseStore = db.createObjectStore('courses', { keyPath: 'courseId' });
          courseStore.createIndex('downloadedAt', 'downloadedAt');
        }

        if (!db.objectStoreNames.contains('sessions')) {
          const sessionStore = db.createObjectStore('sessions', { keyPath: 'sessionId' });
          sessionStore.createIndex('userId', 'userId');
          sessionStore.createIndex('courseId', 'courseId');
          sessionStore.createIndex('completedAt', 'completedAt');
        }

        if (!db.objectStoreNames.contains('progress')) {
          const progressStore = db.createObjectStore('progress', { keyPath: ['userId', 'courseId'] });
          progressStore.createIndex('userId', 'userId');
        }

        if (!db.objectStoreNames.contains('cache')) {
          const cacheStore = db.createObjectStore('cache', { keyPath: 'key' });
          cacheStore.createIndex('timestamp', 'timestamp');
        }
      };
    });

    return this.initPromise;
  }

  // AsyncStorage-compatible methods
  async getItem(key) {
    try {
      await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['keyval'], 'readonly');
        const store = transaction.objectStore('keyval');
        const request = store.get(key);

        request.onsuccess = () => {
          const result = request.result;
          resolve(result !== undefined ? result : null);
        };

        request.onerror = () => {
          reject(new Error('Failed to get item'));
        };
      });
    } catch (error) {
      console.error('Error getting item:', error);
      return null;
    }
  }

  async setItem(key, value) {
    try {
      await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['keyval'], 'readwrite');
        const store = transaction.objectStore('keyval');
        const request = store.put(value, key);

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          reject(new Error('Failed to set item'));
        };
      });
    } catch (error) {
      console.error('Error setting item:', error);
      throw error;
    }
  }

  async removeItem(key) {
    try {
      await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['keyval'], 'readwrite');
        const store = transaction.objectStore('keyval');
        const request = store.delete(key);

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          reject(new Error('Failed to remove item'));
        };
      });
    } catch (error) {
      console.error('Error removing item:', error);
      throw error;
    }
  }

  async clear() {
    try {
      await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['keyval'], 'readwrite');
        const store = transaction.objectStore('keyval');
        const request = store.clear();

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          reject(new Error('Failed to clear storage'));
        };
      });
    } catch (error) {
      console.error('Error clearing storage:', error);
      throw error;
    }
  }

  async getAllKeys() {
    try {
      await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['keyval'], 'readonly');
        const store = transaction.objectStore('keyval');
        const request = store.getAllKeys();

        request.onsuccess = () => {
          resolve(request.result);
        };

        request.onerror = () => {
          reject(new Error('Failed to get all keys'));
        };
      });
    } catch (error) {
      console.error('Error getting all keys:', error);
      return [];
    }
  }

  // Course-specific methods
  async storeCourse(courseId, courseData) {
    try {
      await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['courses'], 'readwrite');
        const store = transaction.objectStore('courses');
        const courseRecord = {
          courseId,
          ...courseData,
          downloadedAt: new Date().toISOString()
        };
        const request = store.put(courseRecord);

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          reject(new Error('Failed to store course'));
        };
      });
    } catch (error) {
      console.error('Error storing course:', error);
      throw error;
    }
  }

  async getCourse(courseId) {
    try {
      await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['courses'], 'readonly');
        const store = transaction.objectStore('courses');
        const request = store.get(courseId);

        request.onsuccess = () => {
          const result = request.result;
          if (result) {
            delete result.courseId; // Remove keyPath from result
          }
          resolve(result || null);
        };

        request.onerror = () => {
          reject(new Error('Failed to get course'));
        };
      });
    } catch (error) {
      console.error('Error getting course:', error);
      return null;
    }
  }

  async deleteCourse(courseId) {
    try {
      await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['courses'], 'readwrite');
        const store = transaction.objectStore('courses');
        const request = store.delete(courseId);

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          reject(new Error('Failed to delete course'));
        };
      });
    } catch (error) {
      console.error('Error deleting course:', error);
      throw error;
    }
  }

  // Session storage methods
  async storeSession(sessionData) {
    try {
      await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['sessions'], 'readwrite');
        const store = transaction.objectStore('sessions');
        const request = store.put(sessionData);

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          reject(new Error('Failed to store session'));
        };
      });
    } catch (error) {
      console.error('Error storing session:', error);
      throw error;
    }
  }

  async getSession(sessionId) {
    try {
      await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['sessions'], 'readonly');
        const store = transaction.objectStore('sessions');
        const request = store.get(sessionId);

        request.onsuccess = () => {
          resolve(request.result || null);
        };

        request.onerror = () => {
          reject(new Error('Failed to get session'));
        };
      });
    } catch (error) {
      console.error('Error getting session:', error);
      return null;
    }
  }

  // Progress storage methods
  async storeProgress(userId, courseId, progressData) {
    try {
      await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['progress'], 'readwrite');
        const store = transaction.objectStore('progress');
        const progressRecord = {
          userId,
          courseId,
          ...progressData,
          updatedAt: new Date().toISOString()
        };
        const request = store.put(progressRecord);

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          reject(new Error('Failed to store progress'));
        };
      });
    } catch (error) {
      console.error('Error storing progress:', error);
      throw error;
    }
  }

  async getProgress(userId, courseId) {
    try {
      await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['progress'], 'readonly');
        const store = transaction.objectStore('progress');
        const request = store.get([userId, courseId]);

        request.onsuccess = () => {
          const result = request.result;
          if (result) {
            delete result.userId;
            delete result.courseId;
          }
          resolve(result || null);
        };

        request.onerror = () => {
          reject(new Error('Failed to get progress'));
        };
      });
    } catch (error) {
      console.error('Error getting progress:', error);
      return null;
    }
  }

  // Cache management
  async getCacheSize() {
    try {
      if (!navigator.storage || !navigator.storage.estimate) {
        return null;
      }
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage || 0,
        quota: estimate.quota || 0,
        usagePercent: estimate.quota ? ((estimate.usage / estimate.quota) * 100).toFixed(2) : 0
      };
    } catch (error) {
      console.error('Error getting cache size:', error);
      return null;
    }
  }

  async clearOldCache(maxAge = 7 * 24 * 60 * 60 * 1000) {
    // Clear cache older than maxAge (default 7 days)
    try {
      await this.init();
      const cutoff = Date.now() - maxAge;

      // Clear old courses
      const courseTransaction = this.db.transaction(['courses'], 'readwrite');
      const courseStore = courseTransaction.objectStore('courses');
      const courseIndex = courseStore.index('downloadedAt');
      const courseRequest = courseIndex.openCursor();

      courseRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const downloadedAt = new Date(cursor.value.downloadedAt).getTime();
          if (downloadedAt < cutoff) {
            cursor.delete();
          }
          cursor.continue();
        }
      };

      // Clear old cache entries
      const cacheTransaction = this.db.transaction(['cache'], 'readwrite');
      const cacheStore = cacheTransaction.objectStore('cache');
      const cacheIndex = cacheStore.index('timestamp');
      const cacheRequest = cacheIndex.openCursor();

      cacheRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (cursor.value.timestamp < cutoff) {
            cursor.delete();
          }
          cursor.continue();
        }
      };
    } catch (error) {
      console.error('Error clearing old cache:', error);
    }
  }
}

// Export singleton instance
const webStorageService = new WebStorageService();

// Initialize on load
if (typeof window !== 'undefined') {
  webStorageService.init().catch((error) => {
    console.error('Failed to initialize WebStorageService:', error);
  });
}

export default webStorageService;


