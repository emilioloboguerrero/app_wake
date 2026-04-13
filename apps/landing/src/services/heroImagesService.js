import apiClient from '../utils/apiClient';

let cachedData = null;
let cachedAt = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getAppResources() {
  if (cachedData && Date.now() - cachedAt < CACHE_TTL) return cachedData;
  try {
    const { data } = await apiClient.get('/app-resources');
    // API returns an array of docs — find the landing doc
    const resolved = Array.isArray(data)
      ? data.find((d) => d.id === 'landing') || {}
      : data || {};
    cachedData = resolved;
    cachedAt = Date.now();
    return resolved;
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

export async function getAthleteGalleryImages() {
  const data = await getAppResources();
  return Array.isArray(data.athleteGallery) ? data.athleteGallery : [];
}

export async function getFlowBackgrounds() {
  const data = await getAppResources();
  return data.flowBackgrounds && typeof data.flowBackgrounds === 'object'
    ? data.flowBackgrounds
    : null;
}
