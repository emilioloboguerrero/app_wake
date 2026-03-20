import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../utils/apiClient';

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
      const result = await apiClient.get('/app-resources');
      const raw = result?.data?.disciplineImages ?? {};
      const disciplineImages = {};
      for (const [key, value] of Object.entries(raw)) {
        if (typeof value === 'string' && value.trim() !== '') {
          const firstWord = key.split(/[\s\-–—]/)[0].toLowerCase().trim();
          disciplineImages[firstWord] = value;
          disciplineImages[key] = value;
        }
      }
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
        logger.debug('⏰ Discipline images cache expired');
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
      const result = await apiClient.get('/app-resources');
      const images = result?.data?.disciplineImages ?? {};
      return { success: true, documentCount: Object.keys(images).length, documents: [{ id: 'discipline_img', data: images }] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

export default new DisciplineImagesService();
