import { isWeb } from '../utils/platform';
import logger from '../utils/logger';
import apiClient from '../utils/apiClient';

class ProfilePictureService {
  constructor() {
    this.cache = new Map();
  }

  // Request camera/photo library permissions (React Native only)
  async requestPermissions() {
    if (isWeb) {
      return true; // No permissions needed on web
    }
    const ImagePicker = require('expo-image-picker');
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Permission to access photo library was denied');
    }
    return true;
  }

  // Compress image before upload
  async compressImage(uri) {
    if (isWeb) {
      // Web: Use canvas API for compression
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxWidth = 400;
          const maxHeight = 400;
          let width = img.width;
          let height = img.height;

          // Calculate new dimensions
          if (width > height) {
            if (width > maxWidth) {
              height = (height * maxWidth) / width;
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = (width * maxHeight) / height;
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              const url = URL.createObjectURL(blob);
              resolve(url);
            },
            'image/jpeg',
            0.8
          );
        };
        img.onerror = reject;
        img.src = uri;
      });
    } else {
      // React Native: Use expo-image-manipulator
      const { manipulateAsync, SaveFormat } = require('expo-image-manipulator');
      const result = await manipulateAsync(
        uri,
        [{ resize: { width: 400 } }],
        { 
          compress: 0.8, 
          format: SaveFormat.JPEG 
        }
      );
      return result.uri;
    }
  }

  // Pick image from library
  async pickImage() {
    if (isWeb) {
      // Web: Use HTML5 file input. Do NOT remove input before user selects - removing
      // it right after click() can prevent the change event from firing in some browsers.
      return new Promise((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
          try {
            if (input.parentNode) input.parentNode.removeChild(input);
          } catch (_) {}
          window.removeEventListener('focus', onWindowFocus);
        };
        const done = (value) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(value);
        };

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';

        input.onchange = () => {
          const file = input.files && input.files[0];
          if (!file) {
            done(null);
            return;
          }
          const objectUrl = URL.createObjectURL(file);
          done(objectUrl);
        };

        input.onerror = () => {
          done(null);
        };

        const onWindowFocus = () => {
          // User may have closed the file dialog without selecting (cancel).
          // After a short delay, if we haven't resolved yet, treat as cancel.
          setTimeout(() => {
            if (!settled) done(null);
          }, 500);
        };

        document.body.appendChild(input);
        input.click();
        window.addEventListener('focus', onWindowFocus, { once: true });
      });
    } else {
      // React Native: Use expo-image-picker
      try {
        await this.requestPermissions();
        const ImagePicker = require('expo-image-picker');
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });

        if (result.canceled) {
          return null;
        }

        return result.assets[0].uri;
      } catch (error) {
        logger.error('Error picking image:', error);
        throw error;
      }
    }
  }

  // Upload profile picture via signed URL flow
  async uploadProfilePicture(userId, imageUri) {
    try {
      // Compress image first
      const compressedUri = await this.compressImage(imageUri);

      // Get a signed upload URL from the API
      const { data } = await apiClient.post('/users/me/profile-picture/upload-url', {
        contentType: 'image/jpeg',
      });

      // Convert URI to blob for upload
      const response = await fetch(compressedUri);
      const blob = await response.blob();

      // Upload directly to Firebase Storage via signed URL
      const uploadResponse = await fetch(data.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: blob,
      });
      if (!uploadResponse.ok) {
        throw new Error(`Storage upload failed: ${uploadResponse.status}`);
      }

      // Confirm the upload and persist the URL
      const confirmResult = await apiClient.post('/users/me/profile-picture/confirm', {
        storagePath: data.storagePath,
      });

      const downloadUrl = confirmResult.data.profilePictureUrl;

      // Cache the URL
      this.cache.set(userId, downloadUrl);
      if (isWeb) {
        try { localStorage.setItem(`profile_${userId}`, downloadUrl); } catch (_) {}
      } else {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        await AsyncStorage.setItem(`profile_${userId}`, downloadUrl);
      }

      return downloadUrl;
    } catch (error) {
      logger.error('Error uploading profile picture:', error);
      throw error;
    }
  }

  // Get profile picture URL for a user
  async getProfilePictureUrl(userId) {
    try {
      // Check cache first
      if (this.cache.has(userId)) {
        return this.cache.get(userId);
      }

      // Check storage
      let cached;
      if (isWeb) {
        try { cached = localStorage.getItem(`profile_${userId}`); } catch (_) { cached = null; }
      } else {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        cached = await AsyncStorage.getItem(`profile_${userId}`);
      }
      if (cached) {
        this.cache.set(userId, cached);
        return cached;
      }

      // Fetch from API
      const { data } = await apiClient.get('/profile');
      const profilePictureUrl = data?.profilePictureUrl ?? null;

      if (profilePictureUrl) {
        // Cache the result
        this.cache.set(userId, profilePictureUrl);
        if (isWeb) {
          try { localStorage.setItem(`profile_${userId}`, profilePictureUrl); } catch (_) {}
        } else {
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          await AsyncStorage.setItem(`profile_${userId}`, profilePictureUrl);
        }
      }

      return profilePictureUrl;
    } catch (error) {
      logger.error('Error getting profile picture URL:', error);
      return null;
    }
  }

  // Delete profile picture
  async deleteProfilePicture(userId) {
    try {
      await apiClient.patch('/profile', {
        profilePictureUrl: null,
        profilePicturePath: null,
        profilePictureUpdatedAt: null,
      });

      // Clear cache
      this.cache.delete(userId);
      try {
        if (isWeb) {
          localStorage.removeItem(`profile_${userId}`);
        } else {
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          await AsyncStorage.removeItem(`profile_${userId}`);
        }
      } catch (cacheError) {
        logger.debug('Could not clear cache');
      }

      return true;
    } catch (error) {
      logger.error('Error deleting profile picture:', error);
      throw error;
    }
  }

  // Complete flow: pick, compress, and upload
  async pickAndUploadProfilePicture(userId) {
    try {
      const imageUri = await this.pickImage();
      if (!imageUri) {
        return null; // User cancelled
      }

      const downloadUrl = await this.uploadProfilePicture(userId, imageUri);
      return downloadUrl;
    } catch (error) {
      logger.error('Error in pick and upload flow:', error);
      throw error;
    }
  }

  // Clear all cached data for a specific user (for sign out)
  async clearUserCache(userId) {
    try {
      // Clear from memory cache
      this.cache.delete(userId);

      // Clear from storage
      if (isWeb) {
        localStorage.removeItem(`profile_${userId}`);
      } else {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        await AsyncStorage.removeItem(`profile_${userId}`);
      }

      logger.debug(`✅ Cleared profile picture cache for user: ${userId}`);
    } catch (error) {
      logger.error('Error clearing profile picture cache:', error);
    }
  }
}

export default new ProfilePictureService();
