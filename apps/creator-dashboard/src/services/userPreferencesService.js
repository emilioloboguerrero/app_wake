import apiClient from '../utils/apiClient';

class UserPreferencesService {
  async getNavPreferences() {
    const data = await apiClient.get('/users/me');
    return data?.creatorNavPreferences ?? null;
  }

  async setNavPreferences(prefs) {
    await apiClient.patch('/users/me', { creatorNavPreferences: prefs });
  }
}

export default new UserPreferencesService();
