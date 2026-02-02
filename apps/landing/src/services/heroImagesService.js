import { collection, getDocs } from 'firebase/firestore';
import { firestore } from '../config/firebase';

/**
 * Fetches the main_hero_landing image URLs from the app_resources collection.
 * Finds the first document that has a main_hero_landing array.
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
 * Fetches the cards array (image URLs) from the app_resources collection.
 * Same document as main_hero_landing. cards[0] = first card image, etc.
 * @returns {Promise<string[]>} Array of card image URLs
 */
export async function getLandingCards() {
  const snapshot = await getDocs(collection(firestore, 'app_resources'));
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.cards && Array.isArray(data.cards)) {
      return data.cards;
    }
  }
  return [];
}

/**
 * Fetches the dos_formas image URL (string) from the app_resources collection.
 * @returns {Promise<string|null>} Image URL or null
 */
export async function getDosFormasImage() {
  const snapshot = await getDocs(collection(firestore, 'app_resources'));
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.dos_formas && typeof data.dos_formas === 'string') {
      return data.dos_formas;
    }
  }
  return null;
}
