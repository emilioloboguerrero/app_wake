import apiClient from '../utils/apiClient';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO_EXTENSIONS = ['mp4', 'm4v', 'mov'];
const ALLOWED_VIDEO_MIMES = ['video/mp4', 'video/x-m4v', 'video/quicktime'];

class CardService {
  async uploadCardImage(_userId, imageFile, onProgress = null) {
    if (!imageFile) throw new Error('No se proporcionó ningún archivo');
    if (!imageFile.type.startsWith('image/')) throw new Error('El archivo debe ser una imagen');
    if (imageFile.size > 10 * 1024 * 1024) throw new Error('El archivo es demasiado grande. El tamaño máximo es 10MB');
    if (!ALLOWED_IMAGE_TYPES.includes(imageFile.type)) throw new Error('Formato de imagen no soportado');

    const { data } = await apiClient.post('/creator/profile/card-media/upload-url', {
      contentType: imageFile.type,
    });

    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', data.uploadUrl);
      xhr.setRequestHeader('Content-Type', imageFile.type);
      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress((e.loaded / e.total) * 100);
        };
      }
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
      xhr.onerror = () => reject(new Error('Error de red al subir la imagen'));
      xhr.send(imageFile);
    });

    const confirmRes = await apiClient.post('/creator/profile/card-media/confirm', {
      storagePath: data.storagePath,
    });
    return confirmRes.data.mediaUrl;
  }

  async uploadCardVideo(_userId, videoFile, onProgress = null) {
    if (!videoFile) throw new Error('No se proporcionó ningún archivo');
    const ext = (videoFile.name.split('.').pop() || '').toLowerCase();
    const isValidMime = videoFile.type && ALLOWED_VIDEO_MIMES.includes(videoFile.type);
    const isValidExt = ALLOWED_VIDEO_EXTENSIONS.includes(ext);
    if (!isValidMime && !isValidExt) {
      throw new Error('El video debe estar en formato MP4. Formatos aceptados: MP4, M4V, MOV');
    }

    const contentType = 'video/mp4';
    const { data } = await apiClient.post('/creator/profile/card-media/upload-url', { contentType });

    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', data.uploadUrl);
      xhr.setRequestHeader('Content-Type', contentType);
      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress((e.loaded / e.total) * 100);
        };
      }
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
      xhr.onerror = () => reject(new Error('Error de red al subir el video'));
      xhr.send(videoFile);
    });

    const confirmRes = await apiClient.post('/creator/profile/card-media/confirm', {
      storagePath: data.storagePath,
    });
    return confirmRes.data.mediaUrl;
  }
}

export default new CardService();
