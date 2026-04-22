import apiClient from '../utils/apiClient';

class VideoExchangeService {
  async getThreads(params = {}) {
    const query = new URLSearchParams();
    if (params.oneOnOneClientId) query.set('oneOnOneClientId', params.oneOnOneClientId);
    if (params.status) query.set('status', params.status);
    const qs = query.toString();
    const res = await apiClient.get(`/video-exchanges${qs ? `?${qs}` : ''}`);
    return res.data || res;
  }

  async getThread(exchangeId) {
    const res = await apiClient.get(`/video-exchanges/${exchangeId}`);
    return res.data || res;
  }

  async createThread({ clientId, oneOnOneClientId, exerciseKey, exerciseName, initialMessage }) {
    const res = await apiClient.post('/video-exchanges', {
      clientId,
      oneOnOneClientId,
      ...(exerciseKey && { exerciseKey }),
      ...(exerciseName && { exerciseName }),
      ...(initialMessage && { initialMessage }),
    });
    return res.data || res;
  }

  async markRead(exchangeId) {
    const res = await apiClient.patch(`/video-exchanges/${exchangeId}`, { markRead: true });
    return res.data || res;
  }

  async closeThread(exchangeId) {
    const res = await apiClient.patch(`/video-exchanges/${exchangeId}`, { status: 'closed' });
    return res.data || res;
  }

  async sendMessage(exchangeId, { note, videoPath, videoDurationSec, thumbnailPath }) {
    const res = await apiClient.post(`/video-exchanges/${exchangeId}/messages`, {
      ...(note && { note }),
      ...(videoPath && { videoPath }),
      ...(videoDurationSec && { videoDurationSec }),
      ...(thumbnailPath && { thumbnailPath }),
    });
    return res.data || res;
  }

  async getUploadUrl(exchangeId, { contentType, fileType }) {
    const res = await apiClient.post(`/video-exchanges/${exchangeId}/upload-url`, {
      contentType,
      fileType,
    });
    return res.data || res;
  }

  async confirmUpload(exchangeId, { storagePath, messageId }) {
    const res = await apiClient.post(`/video-exchanges/${exchangeId}/upload-url/confirm`, {
      storagePath,
      messageId,
    });
    return res.data || res;
  }

  async toggleSaved(exchangeId, messageId, savedByCreator) {
    const res = await apiClient.patch(
      `/video-exchanges/${exchangeId}/messages/${messageId}`,
      { savedByCreator }
    );
    return res.data || res;
  }
}

export default new VideoExchangeService();
