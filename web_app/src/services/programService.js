// Program Service for Wake Web Dashboard
// Handles fetching and managing workout programs
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
  setDoc,
  writeBatch,
  serverTimestamp,
  orderBy,
  limit,
  deleteField
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

class ProgramService {
  // Get all programs for a specific creator
  async getProgramsByCreator(creatorId) {
    try {
      const coursesRef = collection(firestore, 'courses');
      const q = query(coursesRef, where('creator_id', '==', creatorId));
      const querySnapshot = await getDocs(q);
      
      const programs = [];
      querySnapshot.forEach((doc) => {
        programs.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return programs;
    } catch (error) {
      console.error('Error fetching programs:', error);
      throw error;
    }
  }

  // Get a single program by ID
  async getProgramById(programId) {
    try {
      const programDocRef = doc(firestore, 'courses', programId);
      const programDoc = await getDoc(programDocRef);
      
      if (!programDoc.exists()) {
        return null;
      }
      
      return {
        id: programDoc.id,
        ...programDoc.data()
      };
    } catch (error) {
      console.error('Error fetching program:', error);
      throw error;
    }
  }

  // Create a new program
  async createProgram(creatorId, creatorName, programData) {
    try {
      const coursesRef = collection(firestore, 'courses');
      
      // Set access_duration based on programType
      const access_duration = programData.programType === 'subscription' ? 'monthly' : 'yearly';
      
      // Generate version in format "year-01" (e.g., "2025-01")
      const currentYear = new Date().getFullYear();
      const version = `${currentYear}-01`;
      
      const timestamp = serverTimestamp();
      
      const newProgram = {
        creator_id: creatorId,
        creatorName: creatorName,
        title: programData.title || '',
        description: programData.description || '',
        discipline: programData.discipline || '',
        access_duration: access_duration,
        status: programData.status || 'draft',
        price: programData.price ? parseInt(programData.price, 10) : null,
        free_trial: programData.freeTrialActive ? {
          active: true,
          duration_days: parseInt(programData.freeTrialDurationDays || '0', 10)
        } : { active: false, duration_days: 0 },
        duration: programData.duration || null, // Duration: "X semanas" for one-time, "Mensual" for subscription, or null
        programSettings: programData.streakEnabled ? {
          streakEnabled: true,
          minimumSessionsPerWeek: parseInt(programData.minimumSessionsPerWeek || '0', 10)
        } : { streakEnabled: false, minimumSessionsPerWeek: 0 },
        weight_suggestions: programData.weightSuggestions || false,
        availableLibraries: programData.availableLibraries || [],
        tutorials: programData.tutorials || {},
        version: version,
        created_at: timestamp,
        last_update: timestamp,
        updated_at: timestamp
      };
      
      // Add image_url if provided
      if (programData.imageUrl) {
        newProgram.image_url = programData.imageUrl;
      }
      
      const docRef = await addDoc(coursesRef, newProgram);
      return {
        id: docRef.id,
        ...newProgram
      };
    } catch (error) {
      console.error('Error creating program:', error);
      throw error;
    }
  }

  // Update a program
  async updateProgram(programId, updates) {
    try {
      const programDocRef = doc(firestore, 'courses', programId);
      console.log('[updateProgram] Updating program:', { programId, updates });
      const timestamp = serverTimestamp();
      await updateDoc(programDocRef, {
        ...updates,
        last_update: timestamp,
        updated_at: timestamp
      });
      console.log('[updateProgram] Program updated successfully');
    } catch (error) {
      console.error('[updateProgram] Error updating program:', error);
      console.error('[updateProgram] Error details:', {
        message: error.message,
        code: error.code,
        programId,
        updates
      });
      throw error;
    }
  }

  // Delete a program
  async deleteProgram(programId) {
    try {
      // Structure: courses/{programId}/modules/{moduleId}/sessions/{sessionId}/exercises/{exerciseId}/sets/{setId}
      // Need to delete: sets → exercises → sessions → modules → program
      
      // Get all modules in the program
      const modulesRef = collection(firestore, 'courses', programId, 'modules');
      const modulesSnapshot = await getDocs(modulesRef);
      
      // Delete all modules and their nested data
      for (const moduleDoc of modulesSnapshot.docs) {
        const moduleId = moduleDoc.id;
        
        // Get all sessions in the module
        const sessionsRef = collection(firestore, 'courses', programId, 'modules', moduleId, 'sessions');
        const sessionsSnapshot = await getDocs(sessionsRef);
        
        // Delete all sessions and their nested data
        for (const sessionDoc of sessionsSnapshot.docs) {
          const sessionId = sessionDoc.id;
          
          // Get all exercises in the session
          const exercisesRef = collection(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId, 'exercises');
          const exercisesSnapshot = await getDocs(exercisesRef);
          
          // Delete all exercises and their sets
          for (const exerciseDoc of exercisesSnapshot.docs) {
            const exerciseId = exerciseDoc.id;
            
            // Get all sets for this exercise
            const setsRef = collection(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId, 'sets');
            const setsSnapshot = await getDocs(setsRef);
            
            // Delete all sets for this exercise
            for (const setDoc of setsSnapshot.docs) {
              const setDocRef = doc(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId, 'sets', setDoc.id);
              await deleteDoc(setDocRef);
            }
            
            // Delete the exercise document
            const exerciseDocRef = doc(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId);
            await deleteDoc(exerciseDocRef);
          }
          
          // Delete the session document
          const sessionDocRef = doc(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId);
          await deleteDoc(sessionDocRef);
        }
        
        // Delete the module document
        const moduleDocRef = doc(firestore, 'courses', programId, 'modules', moduleId);
        await deleteDoc(moduleDocRef);
      }
      
      // Finally, delete the program document
      const programDocRef = doc(firestore, 'courses', programId);
      await deleteDoc(programDocRef);
    } catch (error) {
      console.error('Error deleting program:', error);
      throw error;
    }
  }

  // Get week count for a program (if programs have weeks structure)
  getWeekCount(programData) {
    if (!programData) return 0;
    
    // Count weeks if they exist in the program structure
    // This is a placeholder - adjust based on actual program structure
    if (programData.weeks && Array.isArray(programData.weeks)) {
      return programData.weeks.length;
    }
    
    // If no weeks structure, return 0 for now
    return 0;
  }

  // Upload program image
  async uploadProgramImage(programId, imageFile, onProgress = null) {
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

      // Sanitize program ID for storage path
      const sanitizedProgramId = programId.replace(/[^a-zA-Z0-9_-]/g, '_');
      
      // Get file extension
      const fileExtension = imageFile.name.split('.').pop() || 'jpg';
      
      // Create storage reference: courses/{programId}/image.{ext}
      const fileName = `image.${fileExtension}`;
      const storagePath = `courses/${sanitizedProgramId}/${fileName}`;
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
            console.error('Error uploading image:', error);
            reject(error);
          },
          async () => {
            // Upload successful, get download URL
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              
              // Update Firestore with image URL and path
              await this.updateProgram(programId, {
                image_url: downloadURL,
                image_path: storagePath
              });

              resolve(downloadURL);
            } catch (error) {
              console.error('Error getting download URL:', error);
              reject(error);
            }
          }
        );
      });
    } catch (error) {
      console.error('Error uploading program image:', error);
      throw error;
    }
  }

  // Delete program image
  async deleteProgramImage(programId, imagePath) {
    try {
      if (imagePath) {
        const storageRef = ref(storage, imagePath);
        await deleteObject(storageRef);
      }

      // Update Firestore to remove image URL and path
      await this.updateProgram(programId, {
        image_url: null,
        image_path: null
      });
    } catch (error) {
      console.error('Error deleting program image:', error);
      throw error;
    }
  }

  // Upload tutorial video
  async uploadTutorialVideo(programId, screenName, videoFile, onProgress = null) {
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

      // No file size limit for videos

      // Sanitize program ID and screen name for storage path
      const sanitizedProgramId = programId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const sanitizedScreenName = screenName.replace(/[^a-zA-Z0-9_-]/g, '_');
      
      // STANDARD FORMAT: Force MP4 extension and content type
      const standardExtension = 'mp4';
      const timestamp = Date.now();
      const fileName = `video_${timestamp}.${standardExtension}`;
      const storagePath = `courses/${sanitizedProgramId}/tutorials/${sanitizedScreenName}/${fileName}`;
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
            console.error('Error uploading tutorial video:', error);
            reject(error);
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
      console.error('Error uploading tutorial video:', error);
      throw error;
    }
  }

  // Delete tutorial video
  async deleteTutorialVideo(programId, screenName, videoURL) {
    try {
      // Extract storage path from URL or construct it
      // For now, we'll try to delete from the URL directly
      // In a production app, you might want to store the path separately
      if (videoURL) {
        try {
          // Try to extract path from URL or use a reference
          // This is a simplified approach - you may need to adjust based on your storage structure
          const storageRef = ref(storage, videoURL);
          await deleteObject(storageRef);
        } catch (storageError) {
          // If file doesn't exist in storage, continue with Firestore update
          console.warn('Video file not found in storage:', storageError);
        }
      }
    } catch (error) {
      console.error('Error deleting tutorial video:', error);
      throw error;
    }
  }

  // Upload program intro video
  async uploadProgramIntroVideo(programId, videoFile, onProgress = null) {
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

      // No file size limit for videos

      // Sanitize program ID for storage path
      const sanitizedProgramId = programId.replace(/[^a-zA-Z0-9_-]/g, '_');
      
      // STANDARD FORMAT: Force MP4 extension and content type
      const standardExtension = 'mp4';
      const fileName = `intro_video.${standardExtension}`;
      const storagePath = `courses/${sanitizedProgramId}/${fileName}`;
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
            console.error('Error uploading intro video:', error);
            reject(error);
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
      console.error('Error uploading program intro video:', error);
      throw error;
    }
  }

  // Delete program intro video
  async deleteProgramIntroVideo(programId, videoURL) {
    try {
      if (videoURL) {
        try {
          // Try to extract path from URL or use a reference
          // This is a simplified approach - you may need to adjust based on your storage structure
          const storageRef = ref(storage, videoURL);
          await deleteObject(storageRef);
        } catch (storageError) {
          // If file doesn't exist in storage, continue with Firestore update
          console.warn('Video file not found in storage:', storageError);
        }
      }
    } catch (error) {
      console.error('Error deleting program intro video:', error);
      throw error;
    }
  }

  // Get modules for a program (with library resolution)
  async getModulesByProgram(programId) {
    try {
      // Get program to get creator_id
      const program = await this.getProgramById(programId);
      const creatorId = program?.creator_id;
      
      const modulesRef = collection(firestore, 'courses', programId, 'modules');
      const querySnapshot = await getDocs(modulesRef);
      
      const modules = [];
      
      for (const docSnapshot of querySnapshot.docs) {
        const moduleData = docSnapshot.data();
        
        // ✅ NEW: Check if library reference
        if (moduleData.libraryModuleRef && creatorId) {
          try {
            // Import libraryService dynamically to avoid circular dependencies
            const { default: libraryService } = await import('./libraryService');
            
            // Fetch library module
            const libraryModule = await libraryService.getLibraryModuleById(creatorId, moduleData.libraryModuleRef);
            
            if (libraryModule) {
              // Resolve library sessions
              const resolvedSessions = await Promise.all(
                (libraryModule.sessionRefs || []).map(async ({ librarySessionRef, order }) => {
                  // Find program session with this librarySessionRef
                  const programSessionsRef = collection(
                    firestore,
                    'courses', programId,
                    'modules', docSnapshot.id,
                    'sessions'
                  );
                  const programSessionsSnapshot = await getDocs(programSessionsRef);
                  
                  const matchingSession = programSessionsSnapshot.docs.find(sessionDoc =>
                    sessionDoc.data().librarySessionRef === librarySessionRef
                  );
                  
                  if (matchingSession) {
                    const librarySession = await libraryService.getLibrarySessionById(creatorId, librarySessionRef);
                    if (librarySession) {
                      const overrides = await this.getSessionOverrides(programId, docSnapshot.id, matchingSession.id);
                      return {
                        id: matchingSession.id,
                        ...librarySession,
                        librarySessionRef,
                        order: matchingSession.data().order || order,
                        _overrides: overrides
                      };
                    }
                  }
                  
                  // Fallback if not found
                  const librarySession = await libraryService.getLibrarySessionById(creatorId, librarySessionRef);
                  return librarySession ? {
                    ...librarySession,
                    librarySessionRef,
                    order
                  } : null;
                })
              );
              
              // Merge with program-specific data
              modules.push({
                id: docSnapshot.id,
                ...libraryModule,
                libraryModuleRef: moduleData.libraryModuleRef,
                order: moduleData.order,
                sessions: resolvedSessions.filter(Boolean)
              });
              continue;
            }
          } catch (error) {
            console.error('Error resolving library module:', error);
            // Fall through to use standalone module data
          }
        }
        
        // Standalone module or resolution failed
        modules.push({
          id: docSnapshot.id,
          ...moduleData
        });
      }
      
      // Sort by order
      modules.sort((a, b) => {
        const orderA = a.order !== undefined && a.order !== null ? a.order : Infinity;
        const orderB = b.order !== undefined && b.order !== null ? b.order : Infinity;
        return orderA - orderB;
      });
      
      return modules;
    } catch (error) {
      console.error('Error fetching modules:', error);
      throw error;
    }
  }

  // Create a new module
  async createModule(programId, moduleName, libraryModuleRef = null) {
    try {
      const modulesRef = collection(firestore, 'courses', programId, 'modules');
      // Get the max order from existing modules
      const q = query(modulesRef, orderBy('order', 'desc'), limit(1));
      const querySnapshot = await getDocs(q);
      let newOrder = 0;
      if (!querySnapshot.empty) {
        const lastModule = querySnapshot.docs[0].data();
        newOrder = (lastModule.order !== undefined && lastModule.order !== null) ? lastModule.order + 1 : 0;
      }
      
      const newModule = {
        order: newOrder,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      };
      
      // ✅ NEW: If libraryModuleRef provided, store only reference
      if (libraryModuleRef) {
        newModule.libraryModuleRef = libraryModuleRef;
      } else {
        // Standalone module - store title directly
        newModule.title = moduleName.trim();
      }
      
      const docRef = await addDoc(modulesRef, newModule);
      return {
        id: docRef.id,
        ...newModule
      };
    } catch (error) {
      console.error('Error creating module:', error);
      throw error;
    }
  }

  /**
   * Create module from library (with reference)
   */
  async createModuleFromLibrary(programId, libraryModuleRef) {
    return await this.createModule(programId, null, libraryModuleRef);
  }

  // Delete a module
  async deleteModule(programId, moduleId) {
    try {
      console.log(`[deleteModule] Starting deletion for module: ${moduleId} in program: ${programId}`);
      // Structure: modules/{moduleId}/sessions/{sessionId}/exercises/{exerciseId}/sets/{setId}
      // Need to delete: sets → exercises → sessions → module
      
      // Get all sessions in the module
      const sessionsRef = collection(firestore, 'courses', programId, 'modules', moduleId, 'sessions');
      const sessionsSnapshot = await getDocs(sessionsRef);
      console.log(`[deleteModule] Found ${sessionsSnapshot.docs.length} sessions.`);
      
      // Delete all sessions and their nested data
      for (const sessionDoc of sessionsSnapshot.docs) {
        const sessionId = sessionDoc.id;
        console.log(`[deleteModule] Deleting session: ${sessionId}`);
        
        // Get all exercises in the session
        const exercisesRef = collection(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId, 'exercises');
        const exercisesSnapshot = await getDocs(exercisesRef);
        console.log(`[deleteModule] Found ${exercisesSnapshot.docs.length} exercises for session: ${sessionId}`);
        
        // Delete all exercises and their sets
        for (const exerciseDoc of exercisesSnapshot.docs) {
          const exerciseId = exerciseDoc.id;
          console.log(`[deleteModule] Deleting exercise: ${exerciseId} from session: ${sessionId}`);
          
          // Get all sets for this exercise
          const setsRef = collection(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId, 'sets');
          const setsSnapshot = await getDocs(setsRef);
          console.log(`[deleteModule] Found ${setsSnapshot.docs.length} sets for exercise: ${exerciseId}`);
          
          // Delete all sets for this exercise
          for (const setDoc of setsSnapshot.docs) {
            const setDocRef = doc(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId, 'sets', setDoc.id);
            await deleteDoc(setDocRef);
            console.log(`[deleteModule] Deleted set: ${setDoc.id} from exercise: ${exerciseId}`);
          }
          
          // Delete the exercise document
          const exerciseDocRef = doc(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId);
          await deleteDoc(exerciseDocRef);
          console.log(`[deleteModule] Deleted exercise document: ${exerciseId}`);
        }
        
        // Delete the session document
        const sessionDocRef = doc(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId);
        await deleteDoc(sessionDocRef);
        console.log(`[deleteModule] Deleted session document: ${sessionId}`);
      }
      
      // Finally, delete the module document
      const moduleDocRef = doc(firestore, 'courses', programId, 'modules', moduleId);
      await deleteDoc(moduleDocRef);
      console.log(`[deleteModule] Deleted module document: ${moduleId}`);
    } catch (error) {
      console.error(`[deleteModule] Error deleting module ${moduleId}:`, error);
      console.error(`[deleteModule] Error message:`, error.message);
      console.error(`[deleteModule] Error code:`, error.code);
      throw error;
    }
  }

  // Update module order (optimized with batch writes)
  async updateModuleOrder(programId, moduleOrders) {
    try {
      if (!moduleOrders || moduleOrders.length === 0) {
        return;
      }

      // Firestore batch limit is 500 operations
      if (moduleOrders.length > 500) {
        throw new Error('Too many modules to update at once (max 500)');
      }

      const batch = writeBatch(firestore);
      
      moduleOrders.forEach(({ moduleId, order }) => {
        if (!moduleId) {
          console.warn('Skipping invalid module order update: missing moduleId');
          return;
        }
        const moduleDocRef = doc(firestore, 'courses', programId, 'modules', moduleId);
        batch.update(moduleDocRef, {
          order: order,
          updated_at: serverTimestamp()
        });
      });
      
      await batch.commit();
    } catch (error) {
      console.error('Error updating module order:', error);
      throw error;
    }
  }

  // Get sessions for a module (with library resolution)
  async getSessionsByModule(programId, moduleId) {
    try {
      // Get program to get creator_id
      const program = await this.getProgramById(programId);
      const creatorId = program?.creator_id;
      
      const sessionsRef = collection(firestore, 'courses', programId, 'modules', moduleId, 'sessions');
      const querySnapshot = await getDocs(sessionsRef);
      
      const sessions = [];
      
      for (const docSnapshot of querySnapshot.docs) {
        const sessionData = docSnapshot.data();
        
        // ✅ NEW: Check if library reference
        if (sessionData.librarySessionRef && creatorId) {
          try {
            // Import libraryService dynamically to avoid circular dependencies
            const { default: libraryService } = await import('./libraryService');
            
            // Fetch library session
            const librarySession = await libraryService.getLibrarySessionById(creatorId, sessionData.librarySessionRef);
            
            if (librarySession) {
              // Merge with program-specific order
              sessions.push({
                id: docSnapshot.id,
                ...librarySession,
                librarySessionRef: sessionData.librarySessionRef,
                order: sessionData.order,
                // Fetch overrides if any
                _overrides: await this.getSessionOverrides(programId, moduleId, docSnapshot.id)
              });
              continue;
            }
          } catch (error) {
            console.error('Error resolving library session:', error);
            // Fall through to use standalone session data
          }
        }
        
        // Standalone session or resolution failed
        sessions.push({
          id: docSnapshot.id,
          ...sessionData
        });
      }
      
      // Sort by order
      sessions.sort((a, b) => {
        const orderA = a.order !== undefined && a.order !== null ? a.order : Infinity;
        const orderB = b.order !== undefined && b.order !== null ? b.order : Infinity;
        return orderA - orderB;
      });
      
      return sessions;
    } catch (error) {
      console.error('Error fetching sessions:', error);
      throw error;
    }
  }

  /**
   * Get session overrides
   */
  async getSessionOverrides(programId, moduleId, sessionId) {
    try {
      const overridesRef = doc(firestore,
        'courses', programId,
        'modules', moduleId,
        'sessions', sessionId,
        'overrides', 'data'
      );
      const docSnap = await getDoc(overridesRef);
      return docSnap.exists() ? docSnap.data() : null;
    } catch (error) {
      console.error('Error fetching session overrides:', error);
      return null;
    }
  }

  // Upload session image
  async uploadSessionImage(programId, moduleId, imageFile, onProgress = null) {
    try {
      console.log('Starting session image upload:', {
        programId,
        moduleId,
        fileName: imageFile.name,
        fileSize: imageFile.size,
        fileType: imageFile.type
      });
      
      // Validate file type
      if (!imageFile.type.startsWith('image/')) {
        throw new Error('El archivo debe ser una imagen');
      }

      // Validate file size (e.g., max 10MB)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (imageFile.size > maxSize) {
        throw new Error('El archivo es demasiado grande. El tamaño máximo es 10MB');
      }

      // Sanitize IDs for storage path
      const sanitizedProgramId = programId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const sanitizedModuleId = moduleId.replace(/[^a-zA-Z0-9_-]/g, '_');
      
      // Get file extension
      const fileExtension = imageFile.name.split('.').pop() || 'jpg';
      
      // Create storage reference: courses/{programId}/modules/{moduleId}/sessions/{timestamp}.{ext}
      const timestamp = Date.now();
      const fileName = `${timestamp}.${fileExtension}`;
      const storagePath = `courses/${sanitizedProgramId}/modules/${sanitizedModuleId}/sessions/${fileName}`;
      console.log('Storage path:', storagePath);
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
            console.error('Error uploading session image - Upload task error:', error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
            reject(error);
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
      console.error('Error uploading session image:', error);
      throw error;
    }
  }

  // Create a new session
  async createSession(programId, moduleId, sessionName, order = null, imageUrl = null, librarySessionRef = null) {
    try {
      // If order is not provided, calculate it by getting the max order from existing sessions
      let sessionOrder = order;
      if (sessionOrder === null) {
        const sessionsRef = collection(firestore, 'courses', programId, 'modules', moduleId, 'sessions');
        const q = query(sessionsRef, orderBy('order', 'desc'), limit(1));
        const querySnapshot = await getDocs(q);
        sessionOrder = 0;
        if (!querySnapshot.empty) {
          const lastSession = querySnapshot.docs[0].data();
          sessionOrder = (lastSession.order !== undefined && lastSession.order !== null) ? lastSession.order + 1 : 0;
        }
      }
      
      const sessionsRef = collection(firestore, 'courses', programId, 'modules', moduleId, 'sessions');
      const newSession = {
        order: sessionOrder,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      };
      
      // ✅ NEW: If librarySessionRef provided, store only reference
      if (librarySessionRef) {
        newSession.librarySessionRef = librarySessionRef;
      } else {
        // Standalone session - store title and image directly
        newSession.title = sessionName.trim();
        if (imageUrl) {
          newSession.image_url = imageUrl;
        }
      }
      
      const docRef = await addDoc(sessionsRef, newSession);
      return {
        id: docRef.id,
        ...newSession
      };
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  }

  /**
   * Create session from library (with reference)
   */
  async createSessionFromLibrary(programId, moduleId, librarySessionRef, order = null) {
    return await this.createSession(programId, moduleId, null, order, null, librarySessionRef);
  }

  /**
   * Update session override
   */
  async updateSessionOverride(programId, moduleId, sessionId, overrideData) {
    try {
      const overridesRef = doc(firestore,
        'courses', programId,
        'modules', moduleId,
        'sessions', sessionId,
        'overrides', 'data'
      );
      
      await updateDoc(overridesRef, {
        ...overrideData,
        updated_at: serverTimestamp()
      });
    } catch (error) {
      // If document doesn't exist, create it
      if (error.code === 'not-found') {
        const overridesRef = doc(firestore,
          'courses', programId,
          'modules', moduleId,
          'sessions', sessionId,
          'overrides', 'data'
        );
        await setDoc(overridesRef, {
          ...overrideData,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp()
        });
      } else {
        console.error('Error updating session override:', error);
        throw error;
      }
    }
  }

  // Update a session
  async updateSession(programId, moduleId, sessionId, updates) {
    try {
      const sessionDocRef = doc(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId);
      await updateDoc(sessionDocRef, {
        ...updates,
        updated_at: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating session:', error);
      throw error;
    }
  }

  // Delete a session
  async deleteSession(programId, moduleId, sessionId) {
    try {
      // Validate parameters
      if (!programId || !moduleId || !sessionId) {
        const missing = [];
        if (!programId) missing.push('programId');
        if (!moduleId) missing.push('moduleId');
        if (!sessionId) missing.push('sessionId');
        throw new Error(`Missing required parameters: ${missing.join(', ')}`);
      }
      
      console.log('Starting session deletion:', { programId, moduleId, sessionId });
      
      // Structure: sessions/{sessionId}/exercises/{exerciseId}/sets/{setId}
      // Need to delete: sets → exercises → session
      
      // Get all exercises in the session
      const exercisesRef = collection(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId, 'exercises');
      const exercisesSnapshot = await getDocs(exercisesRef);
      console.log(`Found ${exercisesSnapshot.docs.length} exercises to delete`);
      
      // Delete all exercises and their sets
      for (const exerciseDoc of exercisesSnapshot.docs) {
        const exerciseId = exerciseDoc.id;
        console.log(`Deleting exercise: ${exerciseId}`);
        
        // Get all sets for this exercise
        const setsRef = collection(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId, 'sets');
        const setsSnapshot = await getDocs(setsRef);
        console.log(`Found ${setsSnapshot.docs.length} sets to delete for exercise ${exerciseId}`);
        
        // Delete all sets for this exercise
        for (const setDoc of setsSnapshot.docs) {
          const setDocRef = doc(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId, 'sets', setDoc.id);
          try {
            await deleteDoc(setDocRef);
            console.log(`Deleted set: ${setDoc.id}`);
          } catch (setError) {
            console.error(`Error deleting set ${setDoc.id}:`, setError);
            throw new Error(`Failed to delete set ${setDoc.id}: ${setError.message}`);
          }
        }
        
        // Delete the exercise document
        const exerciseDocRef = doc(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId);
        try {
          await deleteDoc(exerciseDocRef);
          console.log(`Deleted exercise: ${exerciseId}`);
        } catch (exerciseError) {
          console.error(`Error deleting exercise ${exerciseId}:`, exerciseError);
          throw new Error(`Failed to delete exercise ${exerciseId}: ${exerciseError.message}`);
        }
      }
      
      // Finally, delete the session document
      const sessionDocRef = doc(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId);
      console.log('Deleting session document...');
      try {
        await deleteDoc(sessionDocRef);
        console.log('Session deleted successfully');
      } catch (sessionError) {
        console.error('Error deleting session document:', sessionError);
        throw new Error(`Failed to delete session document: ${sessionError.message}`);
      }
    } catch (error) {
      console.error('Error deleting session - Full error:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      throw error;
    }
  }

  // Update session order (optimized with batch writes)
  async updateSessionOrder(programId, moduleId, sessionOrders) {
    try {
      if (!sessionOrders || sessionOrders.length === 0) {
        return;
      }

      // Firestore batch limit is 500 operations
      if (sessionOrders.length > 500) {
        throw new Error('Too many sessions to update at once (max 500)');
      }

      const batch = writeBatch(firestore);
      
      sessionOrders.forEach(({ sessionId, order }) => {
        if (!sessionId) {
          console.warn('Skipping invalid session order update: missing sessionId');
          return;
        }
        const sessionDocRef = doc(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId);
        batch.update(sessionDocRef, {
          order: order,
          updated_at: serverTimestamp()
        });
      });
      
      await batch.commit();
    } catch (error) {
      console.error('Error updating session order:', error);
      throw error;
    }
  }

  // Get exercises for a session
  async getExercisesBySession(programId, moduleId, sessionId) {
    try {
      const exercisesRef = collection(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId, 'exercises');
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
      console.error('Error fetching exercises:', error);
      throw error;
    }
  }

  // Create a new exercise
  async createExercise(programId, moduleId, sessionId, exerciseName, order = null) {
    try {
      // If order is not provided, calculate it by getting the max order from existing exercises
      let exerciseOrder = order;
      if (exerciseOrder === null) {
        const exercisesRef = collection(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId, 'exercises');
        const q = query(exercisesRef, orderBy('order', 'desc'), limit(1));
        const querySnapshot = await getDocs(q);
        exerciseOrder = 0;
        if (!querySnapshot.empty) {
          const lastExercise = querySnapshot.docs[0].data();
          exerciseOrder = (lastExercise.order !== undefined && lastExercise.order !== null) ? lastExercise.order + 1 : 0;
        }
      }
      
      const exercisesRef = collection(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId, 'exercises');
      const newExercise = {
        title: exerciseName.trim(),
        name: exerciseName.trim(), // Also set name for compatibility
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
      console.error('Error creating exercise:', error);
      throw error;
    }
  }

  // Delete an exercise
  async deleteExercise(programId, moduleId, sessionId, exerciseId) {
    try {
      console.log(`[deleteExercise] Starting deletion for exercise: ${exerciseId} in session: ${sessionId}, module: ${moduleId}, program: ${programId}`);
      
      // Get all sets for this exercise
      const setsRef = collection(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId, 'sets');
      const setsSnapshot = await getDocs(setsRef);
      console.log(`[deleteExercise] Found ${setsSnapshot.docs.length} sets for exercise: ${exerciseId}`);
      
      // Delete all sets for this exercise
      for (const setDoc of setsSnapshot.docs) {
        const setDocRef = doc(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId, 'sets', setDoc.id);
        await deleteDoc(setDocRef);
        console.log(`[deleteExercise] Deleted set: ${setDoc.id} from exercise: ${exerciseId}`);
      }
      
      // Finally, delete the exercise document
      const exerciseDocRef = doc(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId);
      await deleteDoc(exerciseDocRef);
      console.log(`[deleteExercise] Deleted exercise document: ${exerciseId}`);
    } catch (error) {
      console.error(`[deleteExercise] Error deleting exercise ${exerciseId}:`, error);
      console.error(`[deleteExercise] Error message:`, error.message);
      console.error(`[deleteExercise] Error code:`, error.code);
      throw error;
    }
  }

  // Update exercise order (optimized with batch writes)
  async updateExerciseOrder(programId, moduleId, sessionId, exerciseOrders) {
    try {
      if (!exerciseOrders || exerciseOrders.length === 0) {
        return;
      }

      // Firestore batch limit is 500 operations
      if (exerciseOrders.length > 500) {
        throw new Error('Too many exercises to update at once (max 500)');
      }

      const batch = writeBatch(firestore);
      
      exerciseOrders.forEach(({ exerciseId, order }) => {
        if (!exerciseId) {
          console.warn('Skipping invalid exercise order update: missing exerciseId');
          return;
        }
        const exerciseDocRef = doc(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId);
        batch.update(exerciseDocRef, {
          order: order,
          updated_at: serverTimestamp()
        });
      });
      
      await batch.commit();
    } catch (error) {
      console.error('Error updating exercise order:', error);
      throw error;
    }
  }

  // Update an exercise
  async updateExercise(programId, moduleId, sessionId, exerciseId, updates) {
    try {
      const exerciseDocRef = doc(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId);
      await updateDoc(exerciseDocRef, {
        ...updates,
        updated_at: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating exercise:', error);
      throw error;
    }
  }

  // Get sets for an exercise
  async getSetsByExercise(programId, moduleId, sessionId, exerciseId) {
    try {
      const setsRef = collection(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId, 'sets');
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
      console.error('Error fetching sets:', error);
      throw error;
    }
  }

  // Create a new set
  async createSet(programId, moduleId, sessionId, exerciseId, order = null) {
    try {
      // If order is not provided, calculate it by getting the max order from existing sets
      let setOrder = order;
      if (setOrder === null) {
        const setsRef = collection(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId, 'sets');
        const q = query(setsRef, orderBy('order', 'desc'), limit(1));
        const querySnapshot = await getDocs(q);
        setOrder = 0;
        if (!querySnapshot.empty) {
          const lastSet = querySnapshot.docs[0].data();
          setOrder = (lastSet.order !== undefined && lastSet.order !== null) ? lastSet.order + 1 : 0;
        }
      }
      
      const setsRef = collection(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId, 'sets');
      const newSet = {
        title: `Serie ${setOrder + 1}`,
        order: setOrder,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      };
      
      const docRef = await addDoc(setsRef, newSet);
      return {
        id: docRef.id,
        ...newSet
      };
    } catch (error) {
      console.error('Error creating set:', error);
      throw error;
    }
  }

  // Update a set
  async updateSet(programId, moduleId, sessionId, exerciseId, setId, updates) {
    try {
      const setDocRef = doc(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId, 'sets', setId);
      await updateDoc(setDocRef, {
        ...updates,
        updated_at: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating set:', error);
      throw error;
    }
  }

  // Delete a set
  async deleteSet(programId, moduleId, sessionId, exerciseId, setId) {
    try {
      const setDocRef = doc(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId, 'sets', setId);
      await deleteDoc(setDocRef);
    } catch (error) {
      console.error('Error deleting set:', error);
      throw error;
    }
  }

  // Get modules with summary counts (optimized for initial load)
  async getModulesWithCounts(programId) {
    try {
      const modulesRef = collection(firestore, 'courses', programId, 'modules');
      const q = query(modulesRef, orderBy('order', 'asc'));
      const querySnapshot = await getDocs(q);
      
      const modules = [];
      for (const moduleDoc of querySnapshot.docs) {
        const moduleData = moduleDoc.data();
        modules.push({
          id: moduleDoc.id,
          ...moduleData,
          // Use denormalized counts if available, otherwise will be calculated
          sessionCount: moduleData.sessionCount || 0,
          exerciseCount: moduleData.exerciseCount || 0,
          isComplete: moduleData.isComplete !== undefined ? moduleData.isComplete : null
        });
      }
      
      return modules;
    } catch (error) {
      console.error('Error fetching modules with counts:', error);
      throw error;
    }
  }

  // Update session completeness flag
  async updateSessionCompleteness(programId, moduleId, sessionId, isComplete) {
    try {
      const sessionDocRef = doc(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId);
      await updateDoc(sessionDocRef, {
        isComplete: isComplete,
        completenessCheckedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating session completeness:', error);
      throw error;
    }
  }

  // Update module completeness flag
  async updateModuleCompleteness(programId, moduleId, isComplete) {
    try {
      const moduleDocRef = doc(firestore, 'courses', programId, 'modules', moduleId);
      await updateDoc(moduleDocRef, {
        isComplete: isComplete,
        completenessCheckedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating module completeness:', error);
      throw error;
    }
  }

  // Batch update completeness flags (for cascade updates)
  async batchUpdateCompleteness(updates) {
    try {
      if (!updates || updates.length === 0) {
        return;
      }

      if (updates.length > 500) {
        throw new Error('Too many completeness updates at once (max 500)');
      }

      const batch = writeBatch(firestore);
      
      updates.forEach(({ type, programId, moduleId, sessionId, exerciseId, isComplete }) => {
        let docRef;
        
        if (type === 'module') {
          docRef = doc(firestore, 'courses', programId, 'modules', moduleId);
        } else if (type === 'session') {
          docRef = doc(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId);
        } else {
          console.warn('Unknown completeness update type:', type);
          return;
        }
        
        batch.update(docRef, {
          isComplete: isComplete,
          completenessCheckedAt: serverTimestamp()
        });
      });
      
      await batch.commit();
    } catch (error) {
      console.error('Error batch updating completeness:', error);
      throw error;
    }
  }

  /**
   * Create module from library (creates module + all sessions from library module)
   */
  async createModuleFromLibrary(programId, libraryModuleRef) {
    try {
      // Get program to get creator_id
      const program = await this.getProgramById(programId);
      const creatorId = program?.creator_id;
      
      if (!creatorId) {
        throw new Error('Program creator not found');
      }
      
      // Import libraryService dynamically to avoid circular dependencies
      const { default: libraryService } = await import('./libraryService');
      
      // Get library module
      const libraryModule = await libraryService.getLibraryModuleById(creatorId, libraryModuleRef);
      if (!libraryModule) {
        throw new Error('Library module not found');
      }
      
      // Create module with reference
      const newModule = await this.createModule(programId, null, libraryModuleRef);
      
      // Create sessions from library module's session references
      const sessionRefs = libraryModule.sessionRefs || [];
      
      for (let i = 0; i < sessionRefs.length; i++) {
        const { librarySessionRef, order } = sessionRefs[i];
        await this.createSessionFromLibrary(programId, newModule.id, librarySessionRef, order);
      }
      
      return newModule;
    } catch (error) {
      console.error('Error creating module from library:', error);
      throw error;
    }
  }
}

export default new ProgramService();

