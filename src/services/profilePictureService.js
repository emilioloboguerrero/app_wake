import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { getFirestore, doc, updateDoc, deleteField, serverTimestamp, getDoc } from 'firebase/firestore';
import { isWeb } from '../utils/platform';
import webStorageService from './webStorageService';
import logger from '../utils/logger';

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
      // Web: Use HTML5 file input
      return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';
        
        input.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) {
            resolve(null);
            return;
          }

          // Create object URL for the file
          const objectUrl = URL.createObjectURL(file);
          resolve(objectUrl);
        };

        input.onerror = reject;
        document.body.appendChild(input);
        input.click();
        document.body.removeChild(input);
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

  // Upload profile picture to Firebase Storage
  async uploadProfilePicture(userId, imageUri) {
    try {
      // Compress image first
      const compressedUri = await this.compressImage(imageUri);
      
      // Create storage reference
      const storage = getStorage();
      const storageRef = ref(storage, `profiles/${userId}/profile.jpg`);
      
      // Convert URI to blob for upload
      const response = await fetch(compressedUri);
      const blob = await response.blob();
      
      // Upload file
      await uploadBytes(storageRef, blob);
      
      // Get download URL
      const downloadUrl = await getDownloadURL(storageRef);
      
      // Update user document in Firestore
      const firestore = getFirestore();
      const userRef = doc(firestore, 'users', userId);
      await updateDoc(userRef, {
        profilePictureUrl: downloadUrl,
        profilePicturePath: `profiles/${userId}/profile.jpg`,
        profilePictureUpdatedAt: serverTimestamp()
      });

      // Cache the URL
      this.cache.set(userId, downloadUrl);
      if (isWeb) {
        await webStorageService.setItem(`profile_${userId}`, downloadUrl);
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
        cached = await webStorageService.getItem(`profile_${userId}`);
      } else {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        cached = await AsyncStorage.getItem(`profile_${userId}`);
      }
      if (cached) {
        this.cache.set(userId, cached);
        return cached;
      }

      // Fetch from Firestore
      const firestore = getFirestore();
      const userRef = doc(firestore, 'users', userId);
      const userDoc = await getDoc(userRef);
      const profilePictureUrl = userDoc.data()?.profilePictureUrl;

      if (profilePictureUrl) {
        // Cache the result
        this.cache.set(userId, profilePictureUrl);
        if (isWeb) {
          await webStorageService.setItem(`profile_${userId}`, profilePictureUrl);
        } else {
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          await AsyncStorage.setItem(`profile_${userId}`, profilePictureUrl);
        }
      }

      return profilePictureUrl || null;
    } catch (error) {
      logger.error('Error getting profile picture URL:', error);
      return null;
    }
  }

  // Delete profile picture
  async deleteProfilePicture(userId) {
    try {
      // Delete from Firebase Storage first
      const storage = getStorage();
      const storageRef = ref(storage, `profiles/${userId}/profile.jpg`);
      
      try {
        await deleteObject(storageRef);
      } catch (storageError) {
        // If file doesn't exist, that's okay - just continue
        if (storageError.code === 'storage/object-not-found') {
          logger.debug('Profile picture does not exist in Storage, skipping deletion');
        } else {
          // Re-throw other storage errors
          throw storageError;
        }
      }

      // Try to update Firestore document if it still exists
      // (It might already be deleted if this is called during account deletion)
      try {
        const firestore = getFirestore();
        const userRef = doc(firestore, 'users', userId);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          await updateDoc(userRef, {
            profilePictureUrl: deleteField(),
            profilePicturePath: deleteField(),
            profilePictureUpdatedAt: deleteField()
          });
        }
      } catch (firestoreError) {
        // If document doesn't exist or can't update, that's okay
        // This can happen during account deletion
        logger.debug('Could not update Firestore document (may already be deleted)');
      }

      // Clear cache (this should always work)
      this.cache.delete(userId);
      try {
        if (isWeb) {
          await webStorageService.removeItem(`profile_${userId}`);
        } else {
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          await AsyncStorage.removeItem(`profile_${userId}`);
        }
      } catch (cacheError) {
        // Ignore cache errors
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
        await webStorageService.removeItem(`profile_${userId}`);
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
