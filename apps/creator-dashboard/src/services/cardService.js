// Card service for uploading card images/videos
import { storage, auth } from '../config/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

class CardService {
  // Upload card image
  async uploadCardImage(userId, imageFile, onProgress = null) {
    try {
      // Verify user is authenticated (same pattern as other services)
      if (!auth.currentUser) {
        throw new Error('Debes estar autenticado para subir archivos');
      }

      // Verify userId matches authenticated user
      if (auth.currentUser.uid !== userId) {
        throw new Error('No tienes permiso para subir archivos para este usuario');
      }

      // Validate file
      if (!imageFile) {
        throw new Error('No se proporcionó ningún archivo');
      }

      // Validate file type
      if (!imageFile.type.startsWith('image/')) {
        throw new Error('El archivo debe ser una imagen');
      }

      // Validate file size (max 10MB)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (imageFile.size > maxSize) {
        throw new Error('El archivo es demasiado grande. El tamaño máximo es 10MB');
      }

      // Get file extension
      const fileExtension = imageFile.name.split('.').pop() || 'jpg';
      
      // Create storage reference: cards/{userId}/{timestamp}.{ext}
      // Note: userId is not sanitized because storage rules check request.auth.uid == userId
      const timestamp = Date.now();
      const fileName = `${timestamp}.${fileExtension}`;
      const storagePath = `cards/${userId}/${fileName}`;
      const storageRef = ref(storage, storagePath);

      // Upload file with progress tracking
      const uploadTask = uploadBytesResumable(storageRef, imageFile);

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
            console.error('Error uploading card image:', error);
            // Provide more specific error messages
            let errorMessage = 'Error al subir la imagen';
            if (error.code === 'storage/unauthorized') {
              errorMessage = 'No tienes permiso para subir archivos. Verifica tu autenticación.';
            } else if (error.code === 'storage/canceled') {
              errorMessage = 'La subida fue cancelada';
            } else if (error.code === 'storage/unknown') {
              errorMessage = 'Error desconocido al subir la imagen';
            } else if (error.code === 'storage/quota-exceeded') {
              errorMessage = 'Se ha excedido la cuota de almacenamiento';
            } else if (error.code === 'storage/unauthenticated') {
              errorMessage = 'Debes estar autenticado para subir archivos';
            }
            reject(new Error(errorMessage));
          },
          async () => {
            // Upload successful, get download URL
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(downloadURL);
            } catch (error) {
              console.error('Error getting download URL:', error);
              reject(error);
            }
          }
        );
      });
    } catch (error) {
      console.error('Error in uploadCardImage:', error);
      throw error;
    }
  }

  // Upload card video
  async uploadCardVideo(userId, videoFile, onProgress = null) {
    try {
      // Verify user is authenticated (same pattern as other services)
      if (!auth.currentUser) {
        throw new Error('Debes estar autenticado para subir archivos');
      }

      // Verify userId matches authenticated user
      if (auth.currentUser.uid !== userId) {
        throw new Error('No tienes permiso para subir archivos para este usuario');
      }

      // Validate file
      if (!videoFile) {
        throw new Error('No se proporcionó ningún archivo');
      }

      // STANDARD FORMAT: Validate MP4 format
      const allowedMimeTypes = ['video/mp4', 'video/x-m4v', 'video/quicktime']; // QuickTime .mov files
      const allowedExtensions = ['mp4', 'm4v', 'mov'];
      
      const fileExtension = (videoFile.name.split('.').pop() || '').toLowerCase();
      const isValidMimeType = videoFile.type && allowedMimeTypes.includes(videoFile.type);
      const isValidExtension = allowedExtensions.includes(fileExtension);
      
      if (!isValidMimeType && !isValidExtension) {
        throw new Error(
          'El video debe estar en formato MP4. ' +
          'Por favor convierte el video a MP4 antes de subirlo. ' +
          'Formatos aceptados: MP4, M4V, MOV'
        );
      }

      // No file size limit for videos (as per existing patterns)

      // STANDARD FORMAT: Force MP4 extension and content type
      const standardExtension = 'mp4';
      const timestamp = Date.now();
      const fileName = `${timestamp}.${standardExtension}`;
      const storagePath = `cards/${userId}/${fileName}`;
      const storageRef = ref(storage, storagePath);

      // Set metadata with cache headers and standard MP4 content type
      const metadata = {
        contentType: 'video/mp4', // Always MP4
        cacheControl: 'public, max-age=31536000' // Cache for 1 year
      };

      // Upload file with progress tracking and cache headers
      const uploadTask = uploadBytesResumable(storageRef, videoFile, metadata);

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
            console.error('Error uploading card video:', error);
            // Provide more specific error messages
            let errorMessage = 'Error al subir el video';
            if (error.code === 'storage/unauthorized') {
              errorMessage = 'No tienes permiso para subir archivos. Verifica tu autenticación.';
            } else if (error.code === 'storage/canceled') {
              errorMessage = 'La subida fue cancelada';
            } else if (error.code === 'storage/unknown') {
              errorMessage = 'Error desconocido al subir el video';
            } else if (error.code === 'storage/quota-exceeded') {
              errorMessage = 'Se ha excedido la cuota de almacenamiento';
            } else if (error.code === 'storage/unauthenticated') {
              errorMessage = 'Debes estar autenticado para subir archivos';
            }
            reject(new Error(errorMessage));
          },
          async () => {
            // Upload successful, get download URL
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(downloadURL);
            } catch (error) {
              console.error('Error getting download URL:', error);
              reject(error);
            }
          }
        );
      });
    } catch (error) {
      console.error('Error in uploadCardVideo:', error);
      throw error;
    }
  }
}

export default new CardService();

