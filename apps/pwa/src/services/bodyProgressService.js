import apiClient from '../utils/apiClient';
import logger from '../utils/logger';

async function compressProgressPhoto(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const MAX = 1080;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width >= height) {
          height = Math.round((height * MAX) / width);
          width = MAX;
        } else {
          width = Math.round((width * MAX) / height);
          height = MAX;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(resolve, 'image/jpeg', 0.85);
    };
    img.onerror = reject;
    img.src = objectUrl;
  });
}

class BodyProgressService {
  async saveEntry(userId, dateStr, { weight, note } = {}) {
    const body = {};
    if (weight !== undefined) body.weight = weight;
    if (note !== undefined) body.note = note;
    await apiClient.put(`/progress/body-log/${dateStr}`, body);
  }

  async getEntry(userId, dateStr) {
    try {
      const res = await apiClient.get(`/progress/body-log/${dateStr}`);
      return res?.data ?? null;
    } catch (err) {
      if (err.code === 'NOT_FOUND') return null;
      throw err;
    }
  }

  async getEntries(userId) {
    const entries = [];
    let pageToken = undefined;
    do {
      const params = { limit: 100 };
      if (pageToken) params.pageToken = pageToken;
      const res = await apiClient.get('/progress/body-log', { params });
      if (res?.data) entries.push(...res.data);
      pageToken = res?.nextPageToken;
    } while (pageToken);
    // legacy contract returned ascending; API returns descending
    return entries.reverse();
  }

  async uploadPhoto(userId, dateStr, file, angle, onProgress) {
    // 1. Get signed URL
    const urlRes = await apiClient.post(`/progress/body-log/${dateStr}/photos/upload-url`, {
      angle,
      contentType: 'image/jpeg',
    });
    const { uploadUrl, storagePath, photoId } = urlRes.data;

    // 2. Compress
    const blob = await compressProgressPhoto(file);

    // 3. Upload directly to Storage via signed URL
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', 'image/jpeg');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
      xhr.onerror = () => reject(new Error('Upload network error'));
      xhr.send(blob);
    });

    // 4. Confirm
    await apiClient.post(`/progress/body-log/${dateStr}/photos/confirm`, { photoId, storagePath, angle });
    return { id: photoId, angle, storagePath };
  }

  async cleanupPhoto(storagePath) {
    // no-op: photo cleanup is now handled server-side via DELETE endpoints
    logger.warn('[bodyProgress] cleanupPhoto is a no-op; use deletePhoto or deleteEntry');
  }

  async deleteEntry(userId, dateStr) {
    try {
      await apiClient.delete(`/progress/body-log/${dateStr}`);
    } catch (err) {
      if (err.code === 'NOT_FOUND') return;
      throw err;
    }
  }

  async setGoalWeight(userId, goalWeightKg) {
    await apiClient.patch('/users/me', { goalWeight: goalWeightKg });
  }
}

export default new BodyProgressService();
