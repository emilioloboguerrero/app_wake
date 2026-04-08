import apiClient from '../utils/apiClient';
import logger from '../utils/logger';

class ProfilePictureService {
  async compressImage(imageFile) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxSize = 400;
          let { width, height } = img;

          if (width > height) {
            if (width > maxSize) { height = (height * maxSize) / width; width = maxSize; }
          } else {
            if (height > maxSize) { width = (width * maxSize) / height; height = maxSize; }
          }

          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(new File([blob], 'profile.jpg', { type: 'image/jpeg', lastModified: Date.now() }));
              } else {
                reject(new Error('Error al comprimir la imagen'));
              }
            },
            'image/jpeg',
            0.8
          );
        };
        img.onerror = () => reject(new Error('Error al cargar la imagen'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Error al leer el archivo'));
      reader.readAsDataURL(imageFile);
    });
  }

  async uploadProfilePicture(userId, imageFile, onProgress = null) {
    if (!imageFile) throw new Error('No se proporcionó ningún archivo');
    if (!imageFile.type.startsWith('image/')) throw new Error('El archivo debe ser una imagen');

    const processedFile = await this.compressImage(imageFile);

    const { data } = await apiClient.post('/users/me/profile-picture/upload-url', {
      contentType: 'image/jpeg',
    });

    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', data.uploadUrl);
      xhr.setRequestHeader('Content-Type', 'image/jpeg');

      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress((e.loaded / e.total) * 100);
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error('Error de red al subir la imagen'));
      xhr.send(processedFile);
    });

    const confirmResult = await apiClient.post('/users/me/profile-picture/confirm', {
      storagePath: data.storagePath,
    });

    return confirmResult.data.profilePictureUrl;
  }
}

export default new ProfilePictureService();
