import apiClient from '../utils/apiClient';
import { auth } from '../config/firebase';

export async function listFiles() {
  const result = await apiClient.get('/creator/media');
  return (result?.data ?? []).map((f) => ({ ...f, id: f.fileId }));
}

const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50MB

export async function uploadFile(_creatorId, file, onProgress = null) {
  if (file.size > MAX_UPLOAD_SIZE) {
    throw new Error('El archivo es demasiado grande. El tamaño máximo es 50MB');
  }

  if (onProgress) onProgress(10);

  const { data: uploadData } = await apiClient.post('/creator/media/upload-url', {
    filename: file.name,
    contentType: file.type,
  });

  if (onProgress) onProgress(20);

  const token = await auth.currentUser.getIdToken();
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadData.uploadUrl);
    xhr.setRequestHeader('Content-Type', uploadData.contentType);
    xhr.setRequestHeader('Authorization', `Firebase ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(20 + Math.round((e.loaded / e.total) * 70));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Error de red al subir archivo'));
    xhr.timeout = 5 * 60 * 1000;
    xhr.send(file);
  });

  if (onProgress) onProgress(95);

  const { data: confirmData } = await apiClient.post('/creator/media/upload-url/confirm', {
    storagePath: uploadData.storagePath,
    filename: file.name,
    contentType: file.type,
    downloadToken: uploadData.downloadToken,
  });

  if (onProgress) onProgress(100);
  return {
    id: confirmData.fileId,
    storagePath: confirmData.storagePath,
    url: confirmData.url,
    name: confirmData.name,
    contentType: confirmData.contentType,
  };
}

export async function deleteFile(_creatorId, fileId) {
  await apiClient.delete(`/creator/media/${fileId}`);
}
