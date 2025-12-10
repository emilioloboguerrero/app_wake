import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { getFirestore, doc, updateDoc, deleteField, serverTimestamp, getDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

class ProfilePictureService {
  constructor() {
    this.cache = new Map();
  }

  // Request camera/photo library permissions
  async requestPermissions() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Permission to access photo library was denied');
    }
    return true;
  }

  // Compress image before upload
  async compressImage(uri) {
    try {
      const result = await manipulateAsync(
        uri,
        [{ resize: { width: 400 } }], // Resize to 400px width (good quality for profile pics)
        { 
          compress: 0.8, 
          format: SaveFormat.JPEG 
        }
      );
      return result.uri;
    } catch (error) {
      console.error('Error compressing image:', error);
      throw error;
    }
  }

  // Pick image from library
  async pickImage() {
    try {
      await this.requestPermissions();
      
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1], // Square aspect ratio for profile pictures
        quality: 0.8,
      });

      if (result.canceled) {
        return null;
      }

      return result.assets[0].uri;
    } catch (error) {
      console.error('Error picking image:', error);
      throw error;
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
      await AsyncStorage.setItem(`profile_${userId}`, downloadUrl);

      return downloadUrl;
    } catch (error) {
      console.error('Error uploading profile picture:', error);
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

      // Check AsyncStorage
      const cached = await AsyncStorage.getItem(`profile_${userId}`);
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
        await AsyncStorage.setItem(`profile_${userId}`, profilePictureUrl);
      }

      return profilePictureUrl || null;
    } catch (error) {
      console.error('Error getting profile picture URL:', error);
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
          console.log('Profile picture does not exist in Storage, skipping deletion');
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
        console.log('Could not update Firestore document (may already be deleted)');
      }

      // Clear cache (this should always work)
      this.cache.delete(userId);
      try {
        await AsyncStorage.removeItem(`profile_${userId}`);
      } catch (cacheError) {
        // Ignore cache errors
        console.log('Could not clear cache');
      }

      return true;
    } catch (error) {
      console.error('Error deleting profile picture:', error);
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
      console.error('Error in pick and upload flow:', error);
      throw error;
    }
  }

  // Clear all cached data for a specific user (for sign out)
  async clearUserCache(userId) {
    try {
      // Clear from memory cache
      this.cache.delete(userId);
      
      // Clear from AsyncStorage
      await AsyncStorage.removeItem(`profile_${userId}`);
      
      console.log(`✅ Cleared profile picture cache for user: ${userId}`);
    } catch (error) {
      console.error('Error clearing profile picture cache:', error);
    }
  }
}

export default new ProfilePictureService();
