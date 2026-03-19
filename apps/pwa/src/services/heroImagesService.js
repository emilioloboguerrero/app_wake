import apiClient from '../utils/apiClient';

export async function getMainHeroLandingImages() {
  const result = await apiClient.get('/app-resources');
  return result?.data?.mainHeroLanding ?? [];
}

export async function getHeroAppPageImages() {
  const result = await apiClient.get('/app-resources');
  return result?.data?.heroAppPage ?? [];
}
