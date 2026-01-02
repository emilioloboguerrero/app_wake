// Profile picture upload service for Wake Web Dashboard
import { storage } from '../config/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { updateProfile } from 'firebase/auth';
import { auth } from '../config/firebase';
import { updateUser } from './firestoreService';
import { serverTimestamp } from 'firebase/firestore';

class ProfilePictureService {
  // Compress and resize image (similar to mobile app which resizes to 400px width)
  async compressImage(imageFile) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // Create canvas to resize image
          const canvas = document.createElement('canvas');
          const maxWidth = 400; // Same as mobile app
          const maxHeight = 400;
          
          let width = img.width;
          let height = img.height;
          
          // Calculate new dimensions maintaining aspect ratio
          if (width > height) {
            if (width > maxWidth) {
              height = (height * maxWidth) / width;
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = (width * maxHeight) / height;
              height = maxHeight;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          // Convert to blob as JPEG (same as mobile app)
          canvas.toBlob(
            (blob) => {
              if (blob) {
                // Create a new File object with the compressed image
                const compressedFile = new File([blob], 'profile.jpg', {
                  type: 'image/jpeg',
                  lastModified: Date.now()
                });
                resolve(compressedFile);
              } else {
                reject(new Error('Error al comprimir la imagen'));
              }
            },
            'image/jpeg',
            0.8 // Quality 0.8 (same as mobile app)
          );
        };
        img.onerror = () => reject(new Error('Error al cargar la imagen'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Error al leer el archivo'));
      reader.readAsDataURL(imageFile);
    });
  }

  // Upload profile picture
  async uploadProfilePicture(userId, imageFile, onProgress = null) {
    try {
      // Validate file
      if (!imageFile) {
        throw new Error('No se proporcionó ningún archivo');
      }

      // Validate file type
      if (!imageFile.type.startsWith('image/')) {
        throw new Error('El archivo debe ser una imagen');
      }

      // Compress and resize image before upload (similar to mobile app)
      const processedFile = await this.compressImage(imageFile);

      // Use same path structure as mobile app: profiles/{userId}/profile.jpg
      const storagePath = `profiles/${userId}/profile.jpg`;
      const storageRef = ref(storage, storagePath);

      // Upload file with progress tracking
      const uploadTask = uploadBytesResumable(storageRef, processedFile);

      return new Promise((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            // Track upload progress
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            if (onProgress) {
              onProgress(progress);
            }
          },
          (error) => {
            console.error('Error uploading profile picture:', error);
            reject(error);
          },
          async () => {
            // Upload successful, get download URL
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              
              // Update Firebase Auth profile
              const currentUser = auth.currentUser;
              if (currentUser) {
                await updateProfile(currentUser, {
                  photoURL: downloadURL
                });
              }

              // Update Firestore with photo URL (same structure as mobile app)
              await updateUser(userId, {
                profilePictureUrl: downloadURL,
                profilePicturePath: storagePath,
                profilePictureUpdatedAt: serverTimestamp()
              });

              resolve(downloadURL);
            } catch (error) {
              console.error('Error updating profile:', error);
              reject(error);
            }
          }
        );
      });
    } catch (error) {
      throw error;
    }
  }
}

export default new ProfilePictureService();

