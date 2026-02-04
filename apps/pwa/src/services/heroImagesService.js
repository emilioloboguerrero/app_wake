import { collection, getDocs } from 'firebase/firestore';
import { firestore } from '../config/firebase';

/**
 * Fetches the main_hero_landing image URLs from the app_resources collection.
 * Same data source as the landing page hero. Finds the first document that has a main_hero_landing array.
 * @returns {Promise<string[]>} Array of image URLs
 */
export async function getMainHeroLandingImages() {
  const snapshot = await getDocs(collection(firestore, 'app_resources'));
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.main_hero_landing && Array.isArray(data.main_hero_landing)) {
      return data.main_hero_landing;
    }
  }
  return [];
}

/**
 * Fetches the hero_app_page image URLs from the app_resources collection.
 * Used for the PWA install screen hero. Finds the first document that has a hero_app_page array.
 * @returns {Promise<string[]>} Array of image URLs
 */
export async function getHeroAppPageImages() {
  const snapshot = await getDocs(collection(firestore, 'app_resources'));
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.hero_app_page && Array.isArray(data.hero_app_page)) {
      return data.hero_app_page;
    }
  }
  return [];
}
