import apiClient from '../utils/apiClient';

let cachedData = null;
let cachedAt = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getAppResources() {
  if (cachedData && Date.now() - cachedAt < CACHE_TTL) return cachedData;
  try {
    const { data } = await apiClient.get('/app-resources');
    cachedData = data;
    cachedAt = Date.now();
    return data;
  } catch (err) {
    if (cachedData) return cachedData;
    return {};
  }
}

export async function getMainHeroLandingImages() {
  const data = await getAppResources();
  return Array.isArray(data.mainHeroLanding) ? data.mainHeroLanding : [];
}

export async function getLandingCards() {
  const data = await getAppResources();
  return Array.isArray(data.cards) ? data.cards : [];
}

export async function getDosFormasImage() {
  const data = await getAppResources();
  return typeof data.dosFormas === 'string' ? data.dosFormas : null;
}
