import apiClient from '../utils/apiClient';

class StorageService {
  async getDownloadURL(filePath) {
    const result = await apiClient.get('/storage/download-url', { params: { path: filePath } });
    return result.data.url;
  }
}

export default new StorageService();
