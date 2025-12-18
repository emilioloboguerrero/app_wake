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
  serverTimestamp,
  writeBatch,
  orderBy,
  limit
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
    
    // Count all fields minus the metadata fields: created_at, creator_id, creator_name, title, updated_at, id, icon_url
    // The 'id' field is added when we fetch the document, so we exclude it too
    const metadataFields = ['created_at', 'creator_id', 'creator_name', 'title', 'updated_at', 'id', 'icon_url', 'icon'];
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

  // Upload library icon
  async uploadLibraryIcon(libraryId, imageFile, onProgress = null) {
    try {
      // Validate file type
      if (!imageFile.type.startsWith('image/')) {
        throw new Error('El archivo debe ser una imagen');
      }

      // Validate file size (e.g., max 5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (imageFile.size > maxSize) {
        throw new Error('El archivo es demasiado grande. El tamaño máximo es 5MB');
      }

      // Sanitize library ID for storage path
      const sanitizedLibraryId = libraryId.replace(/[^a-zA-Z0-9_-]/g, '_');
      
      // Get file extension
      const fileExtension = imageFile.name.split('.').pop() || 'jpg';
      
      // Create storage reference: exercises_library/{libraryId}/icon.{ext}
      const fileName = `icon.${fileExtension}`;
      const storagePath = `exercises_library/${sanitizedLibraryId}/${fileName}`;
      const storageRef = ref(storage, storagePath);

      // Upload file with progress tracking
      const uploadTask = uploadBytesResumable(storageRef, imageFile);

      return new Promise((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            if (onProgress) {
              onProgress(progress);
            }
          },
          (error) => {
            console.error('Error uploading library icon:', error);
            reject(error);
          },
          async () => {
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              
              // Update the library document with the icon URL
              const libraryDocRef = doc(firestore, 'exercises_library', libraryId);
              await updateDoc(libraryDocRef, {
                icon_url: downloadURL,
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
      console.error('Error uploading library icon:', error);
      throw error;
    }
  }

  // Update library (for updating title, etc.)
  async updateLibrary(libraryId, updates) {
    try {
      const libraryDocRef = doc(firestore, 'exercises_library', libraryId);
      await updateDoc(libraryDocRef, {
        ...updates,
        updated_at: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating library:', error);
      throw error;
    }
  }

  // Get exercises from a library document
  getExercisesFromLibrary(libraryData) {
    if (!libraryData) return [];
    
    const metadataFields = ['created_at', 'creator_id', 'creator_name', 'title', 'updated_at', 'id', 'icon_url', 'icon'];
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

      // Sanitize exercise name for use in file path (remove invalid characters)
      const sanitizedExerciseName = exerciseName.replace(/[^a-zA-Z0-9_-]/g, '_');
      
      // STANDARD FORMAT: Force MP4 extension and content type
      const standardExtension = 'mp4';
      const fileName = `video.${standardExtension}`;
      const storagePath = `exercises_library/${libraryId}/${sanitizedExerciseName}/${fileName}`;
      const storageRef = ref(storage, storagePath);

      // Set metadata with cache headers and standard MP4 content type
      const metadata = {
        contentType: 'video/mp4', // Always MP4
        cacheControl: 'public, max-age=31536000' // Cache for 1 year
      };

      // Use uploadBytesResumable for progress tracking with cache headers
      const uploadTask = uploadBytesResumable(storageRef, videoFile, metadata);

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

  // ========== SESSION LIBRARY METHODS ==========

  /**
   * Get all library sessions for a creator
   */
  async getSessionLibrary(creatorId) {
    try {
      const sessionsRef = collection(firestore, 'creator_libraries', creatorId, 'sessions');
      const querySnapshot = await getDocs(sessionsRef);
      
      const sessions = [];
      querySnapshot.forEach((doc) => {
        sessions.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return sessions.sort((a, b) => {
        const dateA = a.created_at?.toDate?.() || new Date(0);
        const dateB = b.created_at?.toDate?.() || new Date(0);
        return dateB - dateA; // Newest first
      });
    } catch (error) {
      console.error('Error fetching session library:', error);
      throw error;
    }
  }

  /**
   * Get a single library session by ID with exercises
   */
  async getLibrarySessionById(creatorId, sessionId) {
    try {
      const sessionRef = doc(firestore, 'creator_libraries', creatorId, 'sessions', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      
      if (!sessionDoc.exists()) {
        return null;
      }
      
      const sessionData = {
        id: sessionDoc.id,
        ...sessionDoc.data()
      };
      
      // Fetch exercises
      const exercisesRef = collection(
        firestore, 
        'creator_libraries', creatorId, 
        'sessions', sessionId, 
        'exercises'
      );
      const exercisesSnapshot = await getDocs(exercisesRef);
      
      const exercises = await Promise.all(
        exercisesSnapshot.docs.map(async (exerciseDoc) => {
          const exerciseData = { id: exerciseDoc.id, ...exerciseDoc.data() };
          
        // Fetch sets from subcollection: creator_libraries/{creatorId}/sessions/{sessionId}/exercises/{exerciseId}/sets
        const setsRef = collection(
          firestore,
          'creator_libraries', creatorId,
          'sessions', sessionId,
          'exercises', exerciseDoc.id,
          'sets'
        );
        const setsQuery = query(setsRef, orderBy('order', 'asc'));
        const setsSnapshot = await getDocs(setsQuery);
          
          exerciseData.sets = setsSnapshot.docs.map(setDoc => ({
            id: setDoc.id,
            ...setDoc.data()
          }));
          
          return exerciseData;
        })
      );
      
      sessionData.exercises = exercises.sort((a, b) => (a.order || 0) - (b.order || 0));
      
      return sessionData;
    } catch (error) {
      console.error('Error fetching library session:', error);
      throw error;
    }
  }

  /**
   * Create a library session directly (without needing a program session first)
   */
  async createLibrarySession(creatorId, sessionData) {
    try {
      const librarySessionsRef = collection(firestore, 'creator_libraries', creatorId, 'sessions');
      const newLibrarySession = {
        title: sessionData.title,
        image_url: sessionData.image_url || null,
        creator_id: creatorId,
        version: 1,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      };
      
      const librarySessionDocRef = await addDoc(librarySessionsRef, newLibrarySession);
      
      return {
        id: librarySessionDocRef.id,
        ...newLibrarySession
      };
    } catch (error) {
      console.error('Error creating library session:', error);
      throw error;
    }
  }

  /**
   * Upload image for library session
   */
  async uploadLibrarySessionImage(creatorId, sessionId, imageFile, onProgress) {
    try {
      // Validate file type
      if (!imageFile.type.startsWith('image/')) {
        throw new Error('El archivo debe ser una imagen');
      }

      // Validate file size (e.g., max 10MB)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (imageFile.size > maxSize) {
        throw new Error('El archivo es demasiado grande. El tamaño máximo es 10MB');
      }

      // Get file extension
      const fileExtension = imageFile.name.split('.').pop() || 'jpg';
      
      // Use timestamp-based filename (same pattern as programService.uploadProgramImage and cardService)
      const timestamp = Date.now();
      const fileName = `${timestamp}.${fileExtension}`;
      
      // Use user-owned path structure (same pattern as cards/{userId}/ and profiles/{userId}/)
      // This path structure works because storage rules check request.auth.uid == userId
      // Use cards path with subfolder to leverage existing permissions
      // Path: cards/{creatorId}/library_sessions/{sessionId}/{timestamp}.{ext}
      const storagePath = `cards/${creatorId}/library_sessions/${sessionId}/${fileName}`;
      const storageRef = ref(storage, storagePath);

      // Upload file with progress tracking (no metadata needed, same as programService.uploadProgramImage)
      const uploadTask = uploadBytesResumable(storageRef, imageFile);

      return new Promise((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            if (onProgress) {
              onProgress(progress);
            }
          },
          (error) => {
            console.error('Error uploading library session image:', error);
            reject(error);
          },
          async () => {
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              
              // Update the library session document with the image URL
              const sessionRef = doc(firestore, 'creator_libraries', creatorId, 'sessions', sessionId);
              await updateDoc(sessionRef, {
                image_url: downloadURL,
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
      console.error('Error uploading library session image:', error);
      throw error;
    }
  }

  /**
   * Save session to library
   */
  async saveSessionToLibrary(creatorId, programId, moduleId, sessionId) {
    try {
      // Get session data from program
      const sessionRef = doc(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      
      if (!sessionDoc.exists()) {
        throw new Error('Session not found');
      }
      
      const sessionData = sessionDoc.data();
      
      // Create library session
      const librarySessionsRef = collection(firestore, 'creator_libraries', creatorId, 'sessions');
      const newLibrarySession = {
        title: sessionData.title,
        image_url: sessionData.image_url || null,
        creator_id: creatorId,
        version: 1,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      };
      
      const librarySessionDocRef = await addDoc(librarySessionsRef, newLibrarySession);
      
      // Get exercises from program session
      const exercisesRef = collection(
        firestore,
        'courses', programId,
        'modules', moduleId,
        'sessions', sessionId,
        'exercises'
      );
      const exercisesSnapshot = await getDocs(exercisesRef);
      
      // Copy each exercise with sets
      for (const exerciseDoc of exercisesSnapshot.docs) {
        const exerciseData = exerciseDoc.data();
        
        // Create exercise in library
        const libraryExerciseRef = collection(
          firestore,
          'creator_libraries', creatorId,
          'sessions', librarySessionDocRef.id,
          'exercises'
        );
        
        const newLibraryExercise = {
          primary: exerciseData.primary || {},
          alternatives: exerciseData.alternatives || {},
          measures: exerciseData.measures || [],
          objectives: exerciseData.objectives || [],
          order: exerciseData.order || 0,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp()
        };
        
        const libraryExerciseDocRef = await addDoc(libraryExerciseRef, newLibraryExercise);
        
        // Copy sets
        const setsRef = collection(
          firestore,
          'courses', programId,
          'modules', moduleId,
          'sessions', sessionId,
          'exercises', exerciseDoc.id,
          'sets'
        );
        const setsSnapshot = await getDocs(setsRef);
        
        for (const setDoc of setsSnapshot.docs) {
          const setData = setDoc.data();
          const librarySetsRef = collection(
            firestore,
            'creator_libraries', creatorId,
            'sessions', librarySessionDocRef.id,
            'exercises', libraryExerciseDocRef.id,
            'sets'
          );
          
          await addDoc(librarySetsRef, {
            ...setData,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
          });
        }
      }
      
      return {
        id: librarySessionDocRef.id,
        ...newLibrarySession
      };
    } catch (error) {
      console.error('Error saving session to library:', error);
      throw error;
    }
  }

  /**
   * Delete library session (with usage check)
   */
  async deleteLibrarySession(creatorId, sessionId) {
    try {
      // Check if session is used in any programs
      const usageResult = await this.checkLibrarySessionUsage(creatorId, sessionId);
      
      if (usageResult.inUse) {
        throw new Error(`Session is used in ${usageResult.count} programs. Cannot delete.`);
      }
      
      // Delete session (exercises and sets will be deleted by Firestore rules or cascade)
      const sessionRef = doc(firestore, 'creator_libraries', creatorId, 'sessions', sessionId);
      await deleteDoc(sessionRef);
    } catch (error) {
      console.error('Error deleting library session:', error);
      throw error;
    }
  }

  /**
   * Check if library session is used in any programs
   */
  async checkLibrarySessionUsage(creatorId, sessionId) {
    try {
      // Get all programs by creator
      const programsRef = collection(firestore, 'courses');
      const programsQuery = query(programsRef, where('creator_id', '==', creatorId));
      const programsSnapshot = await getDocs(programsQuery);
      
      let usageCount = 0;
      const usedIn = [];
      
      for (const programDoc of programsSnapshot.docs) {
        const modulesRef = collection(firestore, 'courses', programDoc.id, 'modules');
        const modulesSnapshot = await getDocs(modulesRef);
        
        for (const moduleDoc of modulesSnapshot.docs) {
          const sessionsRef = collection(
            firestore,
            'courses', programDoc.id,
            'modules', moduleDoc.id,
            'sessions'
          );
          const sessionsSnapshot = await getDocs(sessionsRef);
          
          for (const sessionDoc of sessionsSnapshot.docs) {
            const sessionData = sessionDoc.data();
            if (sessionData.librarySessionRef === sessionId) {
              usageCount++;
              usedIn.push({
                programId: programDoc.id,
                moduleId: moduleDoc.id,
                sessionId: sessionDoc.id
              });
            }
          }
        }
      }
      
      return {
        inUse: usageCount > 0,
        count: usageCount,
        usedIn
      };
    } catch (error) {
      console.error('Error checking library session usage:', error);
      return { inUse: false, count: 0, usedIn: [] };
    }
  }

  /**
   * Update library session
   */
  async updateLibrarySession(creatorId, sessionId, updates) {
    try {
      const sessionRef = doc(firestore, 'creator_libraries', creatorId, 'sessions', sessionId);
      
      // Increment version on any update
      const sessionDoc = await getDoc(sessionRef);
      if (!sessionDoc.exists()) {
        throw new Error('Library session not found');
      }
      
      const currentVersion = sessionDoc.data().version || 0;
      
      await updateDoc(sessionRef, {
        ...updates,
        version: currentVersion + 1,
        updated_at: serverTimestamp()
      });
      
      return currentVersion + 1;
    } catch (error) {
      console.error('Error updating library session:', error);
      throw error;
    }
  }

  /**
   * Update library session version (increment on changes)
   */
  async incrementLibrarySessionVersion(creatorId, sessionId) {
    try {
      const sessionRef = doc(firestore, 'creator_libraries', creatorId, 'sessions', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      
      if (!sessionDoc.exists()) {
        throw new Error('Library session not found');
      }
      
      const currentVersion = sessionDoc.data().version || 0;
      
      await updateDoc(sessionRef, {
        version: currentVersion + 1,
        updated_at: serverTimestamp()
      });
      
      return currentVersion + 1;
    } catch (error) {
      console.error('Error incrementing library session version:', error);
      throw error;
    }
  }

  // ========== MODULE LIBRARY METHODS ==========

  /**
   * Get all library modules for a creator
   */
  async getModuleLibrary(creatorId) {
    try {
      const modulesRef = collection(firestore, 'creator_libraries', creatorId, 'modules');
      const querySnapshot = await getDocs(modulesRef);
      
      const modules = [];
      querySnapshot.forEach((doc) => {
        modules.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return modules.sort((a, b) => {
        const dateA = a.created_at?.toDate?.() || new Date(0);
        const dateB = b.created_at?.toDate?.() || new Date(0);
        return dateB - dateA; // Newest first
      });
    } catch (error) {
      console.error('Error fetching module library:', error);
      throw error;
    }
  }

  /**
   * Get a single library module by ID
   */
  async getLibraryModuleById(creatorId, moduleId) {
    try {
      const moduleRef = doc(firestore, 'creator_libraries', creatorId, 'modules', moduleId);
      const moduleDoc = await getDoc(moduleRef);
      
      if (!moduleDoc.exists()) {
        return null;
      }
      
      return {
        id: moduleDoc.id,
        ...moduleDoc.data()
      };
    } catch (error) {
      console.error('Error fetching library module:', error);
      throw error;
    }
  }

  /**
   * Create a library module directly (without needing a program module first)
   */
  async createLibraryModule(creatorId, moduleData) {
    try {
      const libraryModulesRef = collection(firestore, 'creator_libraries', creatorId, 'modules');
      const newLibraryModule = {
        title: moduleData.title,
        creator_id: creatorId,
        sessionRefs: moduleData.sessionRefs || [],
        order: moduleData.order !== undefined ? moduleData.order : null,
        version: 1,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      };
      
      const libraryModuleDocRef = await addDoc(libraryModulesRef, newLibraryModule);
      
      return {
        id: libraryModuleDocRef.id,
        ...newLibraryModule
      };
    } catch (error) {
      console.error('Error creating library module:', error);
      throw error;
    }
  }

  /**
   * Save module to library
   */
  async saveModuleToLibrary(creatorId, programId, moduleId) {
    try {
      // Get module data from program
      const moduleRef = doc(firestore, 'courses', programId, 'modules', moduleId);
      const moduleDoc = await getDoc(moduleRef);
      
      if (!moduleDoc.exists()) {
        throw new Error('Module not found');
      }
      
      const moduleData = moduleDoc.data();
      
      // Get sessions from module
      const sessionsRef = collection(
        firestore,
        'courses', programId,
        'modules', moduleId,
        'sessions'
      );
      const sessionsSnapshot = await getDocs(sessionsRef);
      
      const sessionRefs = [];
      
      // For each session, save to library if not already there
      for (const sessionDoc of sessionsSnapshot.docs) {
        const sessionData = sessionDoc.data();
        
        // Check if session has librarySessionRef (already in library)
        if (sessionData.librarySessionRef) {
          sessionRefs.push({
            librarySessionRef: sessionData.librarySessionRef,
            order: sessionData.order || 0
          });
        } else {
          // Save session to library first
          const librarySession = await this.saveSessionToLibrary(
            creatorId,
            programId,
            moduleId,
            sessionDoc.id
          );
          
          sessionRefs.push({
            librarySessionRef: librarySession.id,
            order: sessionData.order || 0
          });
        }
      }
      
      // Create library module
      const libraryModulesRef = collection(firestore, 'creator_libraries', creatorId, 'modules');
      const newLibraryModule = {
        title: moduleData.title,
        creator_id: creatorId,
        sessionRefs: sessionRefs,
        version: 1,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      };
      
      const libraryModuleDocRef = await addDoc(libraryModulesRef, newLibraryModule);
      
      return {
        id: libraryModuleDocRef.id,
        ...newLibraryModule
      };
    } catch (error) {
      console.error('Error saving module to library:', error);
      throw error;
    }
  }

  /**
   * Delete library module (with usage check)
   */
  async deleteLibraryModule(creatorId, moduleId) {
    try {
      // Check if module is used in any programs
      const usageResult = await this.checkLibraryModuleUsage(creatorId, moduleId);
      
      if (usageResult.inUse) {
        throw new Error(`Module is used in ${usageResult.count} programs. Cannot delete.`);
      }
      
      // Delete module
      const moduleRef = doc(firestore, 'creator_libraries', creatorId, 'modules', moduleId);
      await deleteDoc(moduleRef);
    } catch (error) {
      console.error('Error deleting library module:', error);
      throw error;
    }
  }

  /**
   * Check if library module is used in any programs
   */
  async checkLibraryModuleUsage(creatorId, moduleId) {
    try {
      // Get all programs by creator
      const programsRef = collection(firestore, 'courses');
      const programsQuery = query(programsRef, where('creator_id', '==', creatorId));
      const programsSnapshot = await getDocs(programsQuery);
      
      let usageCount = 0;
      const usedIn = [];
      
      for (const programDoc of programsSnapshot.docs) {
        const modulesRef = collection(firestore, 'courses', programDoc.id, 'modules');
        const modulesSnapshot = await getDocs(modulesRef);
        
        for (const moduleDoc of modulesSnapshot.docs) {
          const moduleData = moduleDoc.data();
          if (moduleData.libraryModuleRef === moduleId) {
            usageCount++;
            usedIn.push({
              programId: programDoc.id,
              moduleId: moduleDoc.id
            });
          }
        }
      }
      
      return {
        inUse: usageCount > 0,
        count: usageCount,
        usedIn
      };
    } catch (error) {
      console.error('Error checking library module usage:', error);
      return { inUse: false, count: 0, usedIn: [] };
    }
  }

  /**
   * Update library module
   */
  async updateLibraryModule(creatorId, moduleId, updates) {
    try {
      const moduleRef = doc(firestore, 'creator_libraries', creatorId, 'modules', moduleId);
      
      // Increment version on any update
      const moduleDoc = await getDoc(moduleRef);
      const currentVersion = moduleDoc.exists() ? (moduleDoc.data().version || 0) : 0;
      
      await updateDoc(moduleRef, {
        ...updates,
        version: currentVersion + 1,
        updated_at: serverTimestamp()
      });
      
      return currentVersion + 1;
    } catch (error) {
      console.error('Error updating library module:', error);
      throw error;
    }
  }

  /**
   * Update library module version (increment on changes)
   */
  async incrementLibraryModuleVersion(creatorId, moduleId) {
    try {
      const moduleRef = doc(firestore, 'creator_libraries', creatorId, 'modules', moduleId);
      const moduleDoc = await getDoc(moduleRef);
      
      if (!moduleDoc.exists()) {
        throw new Error('Library module not found');
      }
      
      const currentVersion = moduleDoc.data().version || 0;
      
      await updateDoc(moduleRef, {
        version: currentVersion + 1,
        updated_at: serverTimestamp()
      });
      
      return currentVersion + 1;
    } catch (error) {
      console.error('Error incrementing library module version:', error);
      throw error;
    }
  }

  // ========== LIBRARY SESSION EXERCISES METHODS ==========

  /**
   * Get exercises for a library session
   */
  async getLibrarySessionExercises(creatorId, sessionId) {
    try {
      const exercisesRef = collection(
        firestore, 
        'creator_libraries', creatorId, 
        'sessions', sessionId, 
        'exercises'
      );
      const q = query(exercisesRef, orderBy('order', 'asc'));
      const querySnapshot = await getDocs(q);
      
      const exercises = [];
      for (const exerciseDoc of querySnapshot.docs) {
        const exerciseData = { id: exerciseDoc.id, ...exerciseDoc.data() };
        
        // Fetch sets from subcollection: creator_libraries/{creatorId}/sessions/{sessionId}/exercises/{exerciseId}/sets
        const setsRef = collection(
          firestore,
          'creator_libraries', creatorId,
          'sessions', sessionId,
          'exercises', exerciseDoc.id,
          'sets'
        );
        const setsQuery = query(setsRef, orderBy('order', 'asc'));
        const setsSnapshot = await getDocs(setsQuery);
        
        exerciseData.sets = setsSnapshot.docs.map(setDoc => ({
          id: setDoc.id,
          ...setDoc.data()
        }));
        
        console.log('📦 Loaded sets for library exercise:', {
          exerciseId: exerciseDoc.id,
          exerciseTitle: exerciseData.title || exerciseData.name,
          setsCount: exerciseData.sets.length,
          sets: exerciseData.sets.map(set => ({ id: set.id, order: set.order, reps: set.reps, intensity: set.intensity }))
        });
        
        exercises.push(exerciseData);
      }
      
      console.log('📦 Total exercises with sets loaded:', {
        sessionId,
        exercisesCount: exercises.length,
        totalSetsCount: exercises.reduce((sum, ex) => sum + (ex.sets?.length || 0), 0)
      });
      
      return exercises;
    } catch (error) {
      console.error('Error fetching library session exercises:', error);
      throw error;
    }
  }

  /**
   * Create exercise in library session
   */
  async createLibrarySessionExercise(creatorId, sessionId, exerciseData, order = null) {
    try {
      let exerciseOrder = order;
      if (exerciseOrder === null) {
        const exercisesRef = collection(
          firestore, 
          'creator_libraries', creatorId, 
          'sessions', sessionId, 
          'exercises'
        );
        const q = query(exercisesRef, orderBy('order', 'desc'), limit(1));
        const querySnapshot = await getDocs(q);
        exerciseOrder = 0;
        if (!querySnapshot.empty) {
          const lastExercise = querySnapshot.docs[0].data();
          exerciseOrder = (lastExercise.order !== undefined && lastExercise.order !== null) ? lastExercise.order + 1 : 0;
        }
      }
      
      const exercisesRef = collection(
        firestore, 
        'creator_libraries', creatorId, 
        'sessions', sessionId, 
        'exercises'
      );
      const newExercise = {
        ...exerciseData,
        order: exerciseOrder,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      };
      
      const docRef = await addDoc(exercisesRef, newExercise);
      
      // Increment session version
      await this.incrementLibrarySessionVersion(creatorId, sessionId);
      
      return {
        id: docRef.id,
        ...newExercise
      };
    } catch (error) {
      console.error('Error creating library session exercise:', error);
      throw error;
    }
  }

  /**
   * Update exercise in library session
   */
  async updateLibrarySessionExercise(creatorId, sessionId, exerciseId, updates) {
    try {
      // Increment session version when exercise is updated
      await this.incrementLibrarySessionVersion(creatorId, sessionId);
      
      const exerciseRef = doc(
        firestore, 
        'creator_libraries', creatorId, 
        'sessions', sessionId, 
        'exercises', exerciseId
      );
      await updateDoc(exerciseRef, {
        ...updates,
        updated_at: serverTimestamp()
      });
      
      // Increment session version (already done at start of function, but keep for safety)
    } catch (error) {
      console.error('Error updating library session exercise:', error);
      throw error;
    }
  }

  /**
   * Delete exercise from library session
   */
  async deleteLibrarySessionExercise(creatorId, sessionId, exerciseId) {
    try {
      // Delete all sets for this exercise
      const setsRef = collection(
        firestore,
        'creator_libraries', creatorId,
        'sessions', sessionId,
        'exercises', exerciseId,
        'sets'
      );
      const setsSnapshot = await getDocs(setsRef);
      
      for (const setDoc of setsSnapshot.docs) {
        const setDocRef = doc(
          firestore,
          'creator_libraries', creatorId,
          'sessions', sessionId,
          'exercises', exerciseId,
          'sets', setDoc.id
        );
        await deleteDoc(setDocRef);
      }
      
      // Delete the exercise document
      const exerciseDocRef = doc(
        firestore, 
        'creator_libraries', creatorId, 
        'sessions', sessionId, 
        'exercises', exerciseId
      );
      await deleteDoc(exerciseDocRef);
      
      // Increment session version
      await this.incrementLibrarySessionVersion(creatorId, sessionId);
    } catch (error) {
      console.error('Error deleting library session exercise:', error);
      throw error;
    }
  }

  /**
   * Update exercise order in library session
   */
  async updateLibrarySessionExerciseOrder(creatorId, sessionId, exerciseOrders) {
    try {
      if (!exerciseOrders || exerciseOrders.length === 0) {
        return;
      }

      const batch = writeBatch(firestore);
      
      exerciseOrders.forEach(({ exerciseId, order }) => {
        if (!exerciseId) return;
        const exerciseDocRef = doc(
          firestore, 
          'creator_libraries', creatorId, 
          'sessions', sessionId, 
          'exercises', exerciseId
        );
        batch.update(exerciseDocRef, {
          order: order,
          updated_at: serverTimestamp()
        });
      });
      
      await batch.commit();
      
      // Increment session version
      await this.incrementLibrarySessionVersion(creatorId, sessionId);
    } catch (error) {
      console.error('Error updating library session exercise order:', error);
      throw error;
    }
  }

  // ========== LIBRARY MODULE SESSIONS METHODS ==========

  /**
   * Get sessions for a library module
   */
  async getLibraryModuleSessions(creatorId, moduleId) {
    try {
      const moduleDoc = await getDoc(doc(firestore, 'creator_libraries', creatorId, 'modules', moduleId));
      if (!moduleDoc.exists()) {
        return [];
      }
      
      const moduleData = moduleDoc.data();
      const sessionRefs = moduleData.sessionRefs || [];
      
      // Fetch all sessions
      const sessions = await Promise.all(
        sessionRefs.map(async (sessionId, index) => {
          const sessionDoc = await getDoc(doc(firestore, 'creator_libraries', creatorId, 'sessions', sessionId));
          if (sessionDoc.exists()) {
            return {
              id: sessionDoc.id,
              ...sessionDoc.data(),
              order: index
            };
          }
          return null;
        })
      );
      
      return sessions.filter(s => s !== null);
    } catch (error) {
      console.error('Error fetching library module sessions:', error);
      throw error;
    }
  }

  /**
   * Add session to library module
   */
  async addSessionToLibraryModule(creatorId, moduleId, sessionId) {
    try {
      const moduleRef = doc(firestore, 'creator_libraries', creatorId, 'modules', moduleId);
      const moduleDoc = await getDoc(moduleRef);
      
      if (!moduleDoc.exists()) {
        throw new Error('Library module not found');
      }
      
      const moduleData = moduleDoc.data();
      const sessionRefs = moduleData.sessionRefs || [];
      
      // Check if session already exists
      if (sessionRefs.includes(sessionId)) {
        return;
      }
      
      // Add session to array
      await updateDoc(moduleRef, {
        sessionRefs: [...sessionRefs, sessionId],
        updated_at: serverTimestamp()
      });
      
      // Increment module version
      await this.incrementLibraryModuleVersion(creatorId, moduleId);
    } catch (error) {
      console.error('Error adding session to library module:', error);
      throw error;
    }
  }

  /**
   * Remove session from library module
   */
  async removeSessionFromLibraryModule(creatorId, moduleId, sessionId) {
    try {
      const moduleRef = doc(firestore, 'creator_libraries', creatorId, 'modules', moduleId);
      const moduleDoc = await getDoc(moduleRef);
      
      if (!moduleDoc.exists()) {
        throw new Error('Library module not found');
      }
      
      const moduleData = moduleDoc.data();
      const sessionRefs = (moduleData.sessionRefs || []).filter(id => id !== sessionId);
      
      await updateDoc(moduleRef, {
        sessionRefs: sessionRefs,
        updated_at: serverTimestamp()
      });
      
      // Increment module version
      await this.incrementLibraryModuleVersion(creatorId, moduleId);
    } catch (error) {
      console.error('Error removing session from library module:', error);
      throw error;
    }
  }

  /**
   * Update session order in library module
   */
  async updateLibraryModuleSessionOrder(creatorId, moduleId, sessionIds) {
    try {
      const moduleRef = doc(firestore, 'creator_libraries', creatorId, 'modules', moduleId);
      
      await updateDoc(moduleRef, {
        sessionRefs: sessionIds,
        updated_at: serverTimestamp()
      });
      
      // Increment module version
      await this.incrementLibraryModuleVersion(creatorId, moduleId);
    } catch (error) {
      console.error('Error updating library module session order:', error);
      throw error;
    }
  }

  // ========== EXERCISE MANAGEMENT IN LIBRARY SESSIONS ==========

  /**
   * Get exercises for a library session
   */
  async getExercisesByLibrarySession(creatorId, librarySessionId) {
    try {
      const exercisesRef = collection(
        firestore, 
        'creator_libraries', creatorId, 
        'sessions', librarySessionId, 
        'exercises'
      );
      const q = query(exercisesRef, orderBy('order', 'asc'));
      const querySnapshot = await getDocs(q);
      
      const exercises = [];
      querySnapshot.forEach((doc) => {
        exercises.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return exercises;
    } catch (error) {
      console.error('Error fetching exercises for library session:', error);
      throw error;
    }
  }

  /**
   * Create an exercise in a library session
   */
  async createExerciseInLibrarySession(creatorId, librarySessionId, exerciseName, order = null) {
    try {
      // Calculate order if not provided
      let exerciseOrder = order;
      if (exerciseOrder === null) {
        const exercisesRef = collection(
          firestore, 
          'creator_libraries', creatorId, 
          'sessions', librarySessionId, 
          'exercises'
        );
        const q = query(exercisesRef, orderBy('order', 'desc'), limit(1));
        const querySnapshot = await getDocs(q);
        exerciseOrder = 0;
        if (!querySnapshot.empty) {
          const lastExercise = querySnapshot.docs[0].data();
          exerciseOrder = (lastExercise.order !== undefined && lastExercise.order !== null) ? lastExercise.order + 1 : 0;
        }
      }
      
      const exercisesRef = collection(
        firestore, 
        'creator_libraries', creatorId, 
        'sessions', librarySessionId, 
        'exercises'
      );
      const newExercise = {
        title: exerciseName.trim(),
        name: exerciseName.trim(),
        order: exerciseOrder,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      };
      
      const docRef = await addDoc(exercisesRef, newExercise);
      return {
        id: docRef.id,
        ...newExercise
      };
    } catch (error) {
      console.error('Error creating exercise in library session:', error);
      throw error;
    }
  }

  /**
   * Update an exercise in a library session
   */
  async updateExerciseInLibrarySession(creatorId, librarySessionId, exerciseId, updates) {
    try {
      const exerciseDocRef = doc(
        firestore, 
        'creator_libraries', creatorId, 
        'sessions', librarySessionId, 
        'exercises', exerciseId
      );
      await updateDoc(exerciseDocRef, {
        ...updates,
        updated_at: serverTimestamp()
      });
      
      // Increment session version
      await this.incrementLibrarySessionVersion(creatorId, librarySessionId);
    } catch (error) {
      console.error('Error updating exercise in library session:', error);
      throw error;
    }
  }

  /**
   * Get sets for an exercise in a library session
   */
  async getSetsByLibraryExercise(creatorId, librarySessionId, exerciseId) {
    try {
      const setsRef = collection(
        firestore,
        'creator_libraries', creatorId,
        'sessions', librarySessionId,
        'exercises', exerciseId,
        'sets'
      );
      const q = query(setsRef, orderBy('order', 'asc'));
      const querySnapshot = await getDocs(q);
      
      const sets = [];
      querySnapshot.forEach((doc) => {
        sets.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return sets;
    } catch (error) {
      console.error('Error fetching sets for library exercise:', error);
      throw error;
    }
  }

  /**
   * Create a set for an exercise in a library session
   */
  async createSetInLibraryExercise(creatorId, librarySessionId, exerciseId, order = null) {
    try {
      // Calculate order if not provided
      let setOrder = order;
      if (setOrder === null) {
        const setsRef = collection(
          firestore,
          'creator_libraries', creatorId,
          'sessions', librarySessionId,
          'exercises', exerciseId,
          'sets'
        );
        const q = query(setsRef, orderBy('order', 'desc'), limit(1));
        const querySnapshot = await getDocs(q);
        setOrder = 0;
        if (!querySnapshot.empty) {
          const lastSet = querySnapshot.docs[0].data();
          setOrder = (lastSet.order !== undefined && lastSet.order !== null) ? lastSet.order + 1 : 0;
        }
      }
      
      const setsRef = collection(
        firestore,
        'creator_libraries', creatorId,
        'sessions', librarySessionId,
        'exercises', exerciseId,
        'sets'
      );
      const newSet = {
        order: setOrder,
        title: `Serie ${setOrder + 1}`,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      };
      
      const docRef = await addDoc(setsRef, newSet);
      return {
        id: docRef.id,
        ...newSet
      };
    } catch (error) {
      console.error('Error creating set in library exercise:', error);
      throw error;
    }
  }

  /**
   * Update a set for an exercise in a library session
   */
  async updateSetInLibraryExercise(creatorId, librarySessionId, exerciseId, setId, updates) {
    try {
      const setDocRef = doc(
        firestore,
        'creator_libraries', creatorId,
        'sessions', librarySessionId,
        'exercises', exerciseId,
        'sets', setId
      );
      await updateDoc(setDocRef, {
        ...updates,
        updated_at: serverTimestamp()
      });
      
      // Increment session version
      await this.incrementLibrarySessionVersion(creatorId, librarySessionId);
    } catch (error) {
      console.error('Error updating set in library exercise:', error);
      throw error;
    }
  }

  /**
   * Delete a set from an exercise in a library session
   */
  async deleteSetFromLibraryExercise(creatorId, librarySessionId, exerciseId, setId) {
    try {
      const setDocRef = doc(
        firestore,
        'creator_libraries', creatorId,
        'sessions', librarySessionId,
        'exercises', exerciseId,
        'sets', setId
      );
      await deleteDoc(setDocRef);
      
      // Increment session version
      await this.incrementLibrarySessionVersion(creatorId, librarySessionId);
    } catch (error) {
      console.error('Error deleting set from library exercise:', error);
      throw error;
    }
  }
}

export default new LibraryService();

