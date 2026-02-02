import { collection, query, where, getDocs } from 'firebase/firestore';
import { firestore } from '../config/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';

import logger from '../utils/logger.js';
class DisciplineImagesService {
  constructor() {
    this.cacheKey = 'discipline_images_cache';
    this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  }

  async getDisciplineImages() {
    try {
      // First, try to get from cache
      const cachedData = await this.getCachedImages();
      if (cachedData) {
        return cachedData;
      }

      // If not cached, fetch from database
      const images = await this.fetchImagesFromDatabase();
      
      // Cache the result
      await this.cacheImages(images);
      
      return images;
    } catch (error) {
      logger.error('Error getting discipline images:', error);
      return {};
    }
  }

  async fetchImagesFromDatabase() {
    try {
      const appResourcesRef = collection(firestore, 'app_resources');
      const q = query(appResourcesRef, where('title', '==', 'discipline_img'));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        return {};
      }

      const disciplineImages = {};
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        
        // Extract discipline name -> image URL mappings
        Object.keys(data).forEach(key => {
          if (key !== 'title' && data[key] && typeof data[key] === 'string' && data[key].trim() !== '') {
            // Get the first word (before dash, space, or other separators)
            const firstWord = key.split(/[\s\-–—]/)[0].toLowerCase().trim();
            
            // Store with the first word as key
            disciplineImages[firstWord] = data[key];
            
            // Also store with original case for backward compatibility
            disciplineImages[key] = data[key];
          }
        });
      });

      return disciplineImages;
    } catch (error) {
      logger.error('Error fetching discipline images from database:', error);
      throw error;
    }
  }

  async getCachedImages() {
    try {
      const cachedData = await AsyncStorage.getItem(this.cacheKey);
      if (!cachedData) return null;

      const parsedData = JSON.parse(cachedData);
      const now = Date.now();

      // Check if cache is expired
      if (now - parsedData.timestamp > this.cacheExpiry) {
        logger.log('⏰ Discipline images cache expired');
        await AsyncStorage.removeItem(this.cacheKey);
        return null;
      }

      return parsedData.images;
    } catch (error) {
      logger.error('❌ Error reading cached discipline images:', error);
      return null;
    }
  }

  async cacheImages(images) {
    try {
      const cacheData = {
        images,
        timestamp: Date.now()
      };
      await AsyncStorage.setItem(this.cacheKey, JSON.stringify(cacheData));
    } catch (error) {
      logger.error('Error caching discipline images:', error);
    }
  }

  async testDatabaseConnection() {
    try {
      const appResourcesRef = collection(firestore, 'app_resources');
      const q = query(appResourcesRef, where('title', '==', 'discipline_img'));
      const querySnapshot = await getDocs(q);
      
      return {
        success: true,
        documentCount: querySnapshot.size,
        documents: querySnapshot.docs.map(doc => ({
          id: doc.id,
          data: doc.data()
        }))
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default new DisciplineImagesService();
