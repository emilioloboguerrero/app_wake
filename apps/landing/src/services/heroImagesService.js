import apiClient from '../utils/apiClient';

let cachedData = null;

async function getAppResources() {
  if (cachedData) return cachedData;
  const { data } = await apiClient.get('/app-resources');
  cachedData = data;
  return data;
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
