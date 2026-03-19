import apiClient from '../utils/apiClient';

export async function getMainHeroLandingImages() {
  const { data } = await apiClient.get('/app-resources');
  return Array.isArray(data.mainHeroLanding) ? data.mainHeroLanding : [];
}

export async function getLandingCards() {
  const { data } = await apiClient.get('/app-resources');
  return Array.isArray(data.cards) ? data.cards : [];
}

export async function getDosFormasImage() {
  const { data } = await apiClient.get('/app-resources');
  return typeof data.dosFormas === 'string' ? data.dosFormas : null;
}
