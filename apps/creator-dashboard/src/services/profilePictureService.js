import { storage } from '../config/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { updateProfile } from 'firebase/auth';
import { auth } from '../config/firebase';
import { updateUser } from './firestoreService';
import { serverTimestamp } from 'firebase/firestore';
import logger from '../utils/logger';

class ProfilePictureService {
  // Resize to 400×400 max, convert to JPEG at 0.8 quality — matches mobile app behavior
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

    // Mirror the mobile app path: profiles/{userId}/profile.jpg
    const storagePath = `profiles/${userId}/profile.jpg`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, processedFile);

    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          if (onProgress) {
            onProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          }
        },
        (error) => {
          logger.error('Error uploading profile picture:', error);
          reject(error);
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);

            const currentUser = auth.currentUser;
            if (currentUser) {
              await updateProfile(currentUser, { photoURL: downloadURL });
            }

            await updateUser(userId, {
              profilePictureUrl: downloadURL,
              profilePicturePath: storagePath,
              profilePictureUpdatedAt: serverTimestamp()
            });

            resolve(downloadURL);
          } catch (error) {
            logger.error('Error updating profile after upload:', error);
            reject(error);
          }
        }
      );
    });
  }
}

export default new ProfilePictureService();
