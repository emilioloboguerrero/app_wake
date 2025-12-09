// Library Service for Wake Web Dashboard
// Handles fetching and managing exercise libraries
import { firestore, storage } from '../config/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs,
  doc,
  getDoc,
  addDoc,
  deleteDoc,
  updateDoc,
  deleteField,
  serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

class LibraryService {
  // Get all libraries for a specific creator
  async getLibrariesByCreator(creatorId) {
    try {
      const librariesRef = collection(firestore, 'exercises_library');
      const q = query(librariesRef, where('creator_id', '==', creatorId));
      const querySnapshot = await getDocs(q);
      
      const libraries = [];
      querySnapshot.forEach((doc) => {
        libraries.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return libraries;
    } catch (error) {
      console.error('Error fetching libraries:', error);
      throw error;
    }
  }

  // Get a single library by ID
  async getLibraryById(libraryId) {
    try {
      const libraryDocRef = doc(firestore, 'exercises_library', libraryId);
      const libraryDoc = await getDoc(libraryDocRef);
      
      if (!libraryDoc.exists()) {
        return null;
      }
      
      return {
        id: libraryDoc.id,
        ...libraryDoc.data()
      };
    } catch (error) {
      console.error('Error fetching library:', error);
      throw error;
    }
  }

  // Get exercise count for a library
  getExerciseCount(libraryData) {
    if (!libraryData) return 0;
    
    // Count all fields minus the metadata fields: created_at, creator_id, creator_name, title, updated_at, id
    // The 'id' field is added when we fetch the document, so we exclude it too
    const metadataFields = ['created_at', 'creator_id', 'creator_name', 'title', 'updated_at', 'id'];
    const allFields = Object.keys(libraryData);
    const exerciseFields = allFields.filter(
      key => !metadataFields.includes(key)
    );
    
    return exerciseFields.length;
  }

  // Create a new library
  async createLibrary(creatorId, creatorName, title) {
    try {
      const librariesRef = collection(firestore, 'exercises_library');
      const newLibrary = {
        creator_id: creatorId,
        creator_name: creatorName,
        title: title,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      };
      
      const docRef = await addDoc(librariesRef, newLibrary);
      return {
        id: docRef.id,
        ...newLibrary
      };
    } catch (error) {
      console.error('Error creating library:', error);
      throw error;
    }
  }

  // Delete a library
  async deleteLibrary(libraryId) {
    try {
      const libraryDocRef = doc(firestore, 'exercises_library', libraryId);
      await deleteDoc(libraryDocRef);
    } catch (error) {
      console.error('Error deleting library:', error);
      throw error;
    }
  }

  // Get exercises from a library document
  getExercisesFromLibrary(libraryData) {
    if (!libraryData) return [];
    
    const metadataFields = ['created_at', 'creator_id', 'creator_name', 'title', 'updated_at', 'id'];
    const exercises = [];
    
    Object.keys(libraryData).forEach(key => {
      if (!metadataFields.includes(key)) {
        exercises.push({
          name: key,
          data: libraryData[key]
        });
      }
    });
    
    return exercises;
  }

  // Delete an exercise from a library
  async deleteExercise(libraryId, exerciseName) {
    try {
      const libraryDocRef = doc(firestore, 'exercises_library', libraryId);
      await updateDoc(libraryDocRef, {
        [exerciseName]: deleteField(),
        updated_at: serverTimestamp()
      });
    } catch (error) {
      console.error('Error deleting exercise:', error);
      throw error;
    }
  }

  // Upload video for an exercise with progress callback
  async uploadExerciseVideo(libraryId, exerciseName, videoFile, onProgress) {
    try {
      // Sanitize exercise name for use in file path (remove invalid characters)
      const sanitizedExerciseName = exerciseName.replace(/[^a-zA-Z0-9_-]/g, '_');
      
      // Create storage reference: exercises_library/{libraryId}/{exerciseName}/video.{ext}
      const fileExtension = videoFile.name.split('.').pop() || 'mp4';
      const fileName = `video.${fileExtension}`;
      const storagePath = `exercises_library/${libraryId}/${sanitizedExerciseName}/${fileName}`;
      const storageRef = ref(storage, storagePath);

      // Use uploadBytesResumable for progress tracking
      const uploadTask = uploadBytesResumable(storageRef, videoFile);

      // Return a promise that resolves when upload completes
      return new Promise((resolve, reject) => {
        // Listen for state changes, errors, and completion
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            // Calculate progress percentage
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            
            // Call the progress callback if provided
            if (onProgress) {
              onProgress(progress);
            }
          },
          (error) => {
            // Handle errors
            console.error('Error uploading exercise video:', error);
            reject(error);
          },
          async () => {
            // Upload completed successfully
            try {
              // Get download URL
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);

              // Update the exercise document with the video URL
              const libraryDocRef = doc(firestore, 'exercises_library', libraryId);
              const libraryDoc = await getDoc(libraryDocRef);
              
              if (!libraryDoc.exists()) {
                throw new Error('Library not found');
              }

              const libraryData = libraryDoc.data();
              const exerciseData = libraryData[exerciseName];

              if (!exerciseData) {
                throw new Error('Exercise not found');
              }

              // Update the exercise data with the new video URL
              await updateDoc(libraryDocRef, {
                [`${exerciseName}.video_url`]: downloadURL,
                [`${exerciseName}.video_path`]: storagePath,
                updated_at: serverTimestamp()
              });

              resolve(downloadURL);
            } catch (error) {
              reject(error);
            }
          }
        );
      });
    } catch (error) {
      console.error('Error uploading exercise video:', error);
      throw error;
    }
  }

  // Delete video for an exercise
  async deleteExerciseVideo(libraryId, exerciseName) {
    try {
      // Get the exercise data to find the video path
      const libraryDocRef = doc(firestore, 'exercises_library', libraryId);
      const libraryDoc = await getDoc(libraryDocRef);
      
      if (!libraryDoc.exists()) {
        throw new Error('Library not found');
      }

      const libraryData = libraryDoc.data();
      const exerciseData = libraryData[exerciseName];

      if (!exerciseData) {
        throw new Error('Exercise not found');
      }

      // Delete from Storage if path exists
      if (exerciseData.video_path) {
        const storageRef = ref(storage, exerciseData.video_path);
        try {
          await deleteObject(storageRef);
        } catch (storageError) {
          // If file doesn't exist in storage, continue with Firestore update
          console.warn('Video file not found in storage:', storageError);
        }
      }

      // Remove video_url and video_path from Firestore
      await updateDoc(libraryDocRef, {
        [`${exerciseName}.video_url`]: deleteField(),
        [`${exerciseName}.video_path`]: deleteField(),
        updated_at: serverTimestamp()
      });
    } catch (error) {
      console.error('Error deleting exercise video:', error);
      throw error;
    }
  }

  // Update exercise data (for instructions, etc.)
  async updateExercise(libraryId, exerciseName, updates) {
    try {
      const libraryDocRef = doc(firestore, 'exercises_library', libraryId);
      const updateData = {
        updated_at: serverTimestamp()
      };

      // Update nested fields using dot notation
      Object.keys(updates).forEach(key => {
        updateData[`${exerciseName}.${key}`] = updates[key];
      });

      await updateDoc(libraryDocRef, updateData);
    } catch (error) {
      console.error('Error updating exercise:', error);
      throw error;
    }
  }
}

export default new LibraryService();

