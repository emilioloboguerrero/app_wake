import apiClient from '../utils/apiClient';

class BundleService {
  async getBundlesByCreator() {
    const res = await apiClient.get('/creator/bundles');
    return res.data;
  }

  async getBundleById(bundleId) {
    const res = await apiClient.get(`/creator/bundles/${bundleId}`);
    return res.data;
  }

  async getBundleAnalytics(bundleId) {
    const res = await apiClient.get(`/creator/bundles/${bundleId}/analytics`);
    return res.data;
  }

  async createBundle(payload) {
    const res = await apiClient.post('/creator/bundles', payload);
    return res.data;
  }

  async updateBundle(bundleId, updates) {
    const res = await apiClient.patch(`/creator/bundles/${bundleId}`, updates);
    return res.data;
  }

  async updateBundleStatus(bundleId, status) {
    const res = await apiClient.patch(`/creator/bundles/${bundleId}/status`, { status });
    return res.data;
  }

  async deleteBundle(bundleId) {
    const res = await apiClient.delete(`/creator/bundles/${bundleId}`);
    return res.data;
  }
}

export default new BundleService();
