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
      
      const data = programDoc.data();
      return {
        id: programDoc.id,
        ...data,
        published_version: data.published_version ?? data.version
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
      // Canonical fields for versioning/PWA: version, published_version, deliveryType; plus metadata and settings.
      const newProgram = {
        creator_id: creatorId,
        creatorName: creatorName,
        title: programData.title || '',
        description: programData.description || '',
        discipline: programData.discipline || '',
        access_duration: access_duration,
        deliveryType: programData.deliveryType || 'low_ticket', // one_on_one | low_ticket; required for PWA version/load path
        status: programData.status || 'draft',
        price: programData.price ? parseInt(programData.price, 10) : null,
        free_trial: programData.freeTrialActive ? {
          active: true,
          duration_days: parseInt(programData.freeTrialDurationDays || '0', 10)
        } : { active: false, duration_days: 0 },
        duration: programData.duration || null,
        programSettings: programData.streakEnabled ? {
          streakEnabled: true,
          minimumSessionsPerWeek: parseInt(programData.minimumSessionsPerWeek || '0', 10)
        } : { streakEnabled: false, minimumSessionsPerWeek: 0 },
        weight_suggestions: programData.weightSuggestions || false,
        availableLibraries: programData.availableLibraries || [],
        content_plan_id: programData.contentPlanId || null, // Pre-created content from plans (for low-ticket)
        tutorials: programData.tutorials || {},
        version,
        published_version: version, // Only updated on Release; PWA compares to this
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

  // Update a program (draft). Does not change published_version; use releaseProgram to publish.
  async updateProgram(programId, updates) {
    try {
      const programDocRef = doc(firestore, 'courses', programId);
      const { published_version: _pv, ...rest } = updates;
      if (_pv !== undefined) {
        console.warn('[updateProgram] published_version is ignored; use releaseProgram to publish');
      }
      // Strip undefined so Firestore does not receive invalid values
      const clean = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      console.log('[updateProgram] Updating program:', { programId, updates: clean });
      const timestamp = serverTimestamp();
      await updateDoc(programDocRef, {
        ...clean,
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

  /**
   * Release current program state as the version users see (low-ticket).
   * Sets published_version = version so PWA version check sees the new release.
   */
  async releaseProgram(programId) {
    try {
      const program = await this.getProgramById(programId);
      if (!program) {
        throw new Error('Program not found');
      }
      const version = program.version || `${new Date().getFullYear()}-01`;
      const programDocRef = doc(firestore, 'courses', programId);
      await updateDoc(programDocRef, {
        published_version: version,
        last_update: serverTimestamp(),
        updated_at: serverTimestamp()
      });
      return { published_version: version };
    } catch (error) {
      console.error('Error releasing program:', error);
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

  // Get modules for a program (with library resolution, or from plan when content_plan_id set)
  async getModulesByProgram(programId) {
    try {
      // Get program to get creator_id and content_plan_id
      const program = await this.getProgramById(programId);
      const creatorId = program?.creator_id;
      const contentPlanId = program?.content_plan_id;

      // If program references a plan for content, load from plans
      if (contentPlanId && contentPlanId !== '') {
        const { default: plansService } = await import('./plansService');
        const planModules = await plansService.getModulesByPlan(contentPlanId);
        // Resolve sessions for each plan module (plan modules don't have sessions nested)
        const modulesWithSessions = await Promise.all(
          planModules.map(async (mod, index) => {
            const sessions = await plansService.getSessionsByModule(contentPlanId, mod.id);
            const sessionsWithExercises = await Promise.all(
              sessions.map(async (sess) => {
                const exercises = await plansService.getExercisesBySession(contentPlanId, mod.id, sess.id);
                return { ...sess, exercises };
              })
            );
            return {
              ...mod,
              title: mod.title || `Semana ${index + 1}`,
              order: mod.order !== undefined ? mod.order : index,
              sessions: sessionsWithExercises,
            };
          })
        );
        return modulesWithSessions;
      }

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
            
            // Fetch library module from creator_libraries/{creatorId}/modules/{libraryModuleRef}
            const libraryModule = await libraryService.getLibraryModuleById(creatorId, moduleData.libraryModuleRef);
            
            if (libraryModule) {
              console.log('Resolved library module:', {
                programModuleId: docSnapshot.id,
                libraryModuleRef: moduleData.libraryModuleRef,
                libraryModuleTitle: libraryModule.title,
                libraryModuleName: libraryModule.name,
                sessionRefsCount: (libraryModule.sessionRefs || []).length
              });
              // Resolve library sessions
              // sessionRefs can be either:
              // - Array of strings: [sessionId1, sessionId2, ...]
              // - Array of objects: [{ librarySessionRef, order }, ...]
              const sessionRefs = libraryModule.sessionRefs || [];
              const resolvedSessions = await Promise.all(
                sessionRefs.map(async (sessionRef, index) => {
                  // Handle both formats
                  const librarySessionId = typeof sessionRef === 'string' 
                    ? sessionRef 
                    : (sessionRef.librarySessionRef || sessionRef.id || sessionRef);
                  const sessionOrder = typeof sessionRef === 'object' && sessionRef.order !== undefined
                    ? sessionRef.order
                    : index;
                  
                  // Find program session with this librarySessionRef
                  const programSessionsRef = collection(
                    firestore,
                    'courses', programId,
                    'modules', docSnapshot.id,
                    'sessions'
                  );
                  const programSessionsSnapshot = await getDocs(programSessionsRef);
                  
                  const matchingSession = programSessionsSnapshot.docs.find(sessionDoc =>
                    sessionDoc.data().librarySessionRef === librarySessionId
                  );
                  
                  const programSessionId = matchingSession?.id;
                  
                  try {
                    const librarySession = await libraryService.getLibrarySessionById(creatorId, librarySessionId);
                    if (librarySession) {
                      const overrides = matchingSession 
                        ? await this.getSessionOverrides(programId, docSnapshot.id, matchingSession.id)
                        : null;
                      
                      // Merge library session data with overrides
                      const mergedSessionData = {
                        ...librarySession,
                        ...(overrides || {}), // Apply overrides on top of library data
                        id: programSessionId || librarySessionId, // Use program session ID for override support
                        librarySessionRef: librarySessionId,
                        order: matchingSession?.data().order ?? sessionOrder,
                        _overrides: overrides // Keep reference to overrides
                      };
                      
                      return mergedSessionData;
                    }
                  } catch (error) {
                    console.error(`Error resolving library session ${librarySessionId}:`, error);
                    return null;
                  }
                  
                  return null;
                })
              );
              
              // Merge with program-specific data
              // Title should be "Semana {order + 1}" based on program order
              // Library module title goes in description field
              const semanaTitle = `Semana ${(moduleData.order !== undefined && moduleData.order !== null) ? moduleData.order + 1 : 1}`;
              const libraryTitle = libraryModule.title || libraryModule.name || null;
              
              const mergedModule = {
                id: docSnapshot.id,
                ...libraryModule, // Library module data (for sessions, etc.)
                title: semanaTitle, // Override title to "Semana X"
                description: libraryTitle, // Store library module title in description
                libraryModuleRef: moduleData.libraryModuleRef, // Keep the reference
                order: moduleData.order, // Use program's order
                sessions: resolvedSessions.filter(Boolean)
              };
              
              // Debug: Log full merged module data
              console.log('🔵 Merged module data:', {
                id: mergedModule.id,
                title: mergedModule.title,
                description: mergedModule.description,
                libraryModuleRef: mergedModule.libraryModuleRef,
                hasSessions: mergedModule.sessions.length > 0,
                fullModuleData: mergedModule
              });
              
              modules.push(mergedModule);
              continue;
            }
          } catch (error) {
            console.error('Error resolving library module:', error);
            // Fall through to use standalone module data
          }
        }
        
        // Standalone module or resolution failed
        // Ensure title is set to "Semana X" based on order
        const standaloneModule = {
          id: docSnapshot.id,
          ...moduleData
        };
        
        // If module doesn't have a title or it's not in "Semana X" format, set it
        if (!standaloneModule.title || !standaloneModule.title.startsWith('Semana ')) {
          const moduleOrder = standaloneModule.order !== undefined && standaloneModule.order !== null 
            ? standaloneModule.order 
            : modules.length;
          standaloneModule.title = `Semana ${moduleOrder + 1}`;
        }
        
        modules.push(standaloneModule);
      }
      
      // Sort by order
      modules.sort((a, b) => {
        const orderA = a.order !== undefined && a.order !== null ? a.order : Infinity;
        const orderB = b.order !== undefined && b.order !== null ? b.order : Infinity;
        return orderA - orderB;
      });
      
      // After sorting, ensure all modules have correct "Semana X" titles based on their final order
      modules.forEach((module, index) => {
        const expectedOrder = module.order !== undefined && module.order !== null ? module.order : index;
        const expectedTitle = `Semana ${expectedOrder + 1}`;
        if (module.title !== expectedTitle) {
          module.title = expectedTitle;
        }
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
      
      // Set title to "Semana {order + 1}"
      const semanaTitle = `Semana ${newOrder + 1}`;
      
      const newModule = {
        order: newOrder,
        title: semanaTitle, // Always set title to "Semana X"
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      };
      
      // ✅ NEW: If libraryModuleRef provided, store only reference
      if (libraryModuleRef) {
        newModule.libraryModuleRef = libraryModuleRef;
        // Store library module title in description field for display
        // We'll fetch and set this when the module is loaded
      } else {
        // Standalone module - store original name in description if provided
        if (moduleName && typeof moduleName === 'string') {
          newModule.description = moduleName.trim();
        }
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
        // Update title to "Semana {order + 1}" when order changes
        const semanaTitle = `Semana ${order + 1}`;
        batch.update(moduleDocRef, {
          order: order,
          title: semanaTitle,
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
      // Get program to get creator_id and content_plan_id
      const program = await this.getProgramById(programId);
      const creatorId = program?.creator_id;
      const contentPlanId = program?.content_plan_id;

      // If program uses plan-based content, load sessions from plan
      if (contentPlanId) {
        const { default: plansService } = await import('./plansService');
        return plansService.getSessionsByModule(contentPlanId, moduleId);
      }
      
      // ✅ NEW: Check if this module is a library reference
      const moduleRef = doc(firestore, 'courses', programId, 'modules', moduleId);
      const moduleDoc = await getDoc(moduleRef);
      
      if (moduleDoc.exists()) {
        const moduleData = moduleDoc.data();
        
        // If this is a library module reference, get sessions from the library module
        if (moduleData.libraryModuleRef && creatorId) {
          try {
            // Import libraryService dynamically to avoid circular dependencies
            const { default: libraryService } = await import('./libraryService');
            
            // Get the library module from creator_libraries/{creatorId}/modules/{libraryModuleRef}
            const libraryModule = await libraryService.getLibraryModuleById(creatorId, moduleData.libraryModuleRef);
            
            console.log('🟢 Loading sessions for library module:', {
              programModuleId: moduleId,
              libraryModuleRef: moduleData.libraryModuleRef,
              libraryModuleTitle: libraryModule?.title,
              libraryModuleName: libraryModule?.name,
              fullLibraryModule: libraryModule,
              hasSessionRefs: !!libraryModule?.sessionRefs,
              sessionRefsCount: (libraryModule?.sessionRefs || []).length,
              sessionRefsData: libraryModule?.sessionRefs
            });
            
            if (libraryModule && libraryModule.sessionRefs) {
              // Resolve all library sessions
              // sessionRefs can be either:
              // - Array of strings: [sessionId1, sessionId2, ...]
              // - Array of objects: [{ librarySessionRef, order }, ...]
              const sessionRefs = libraryModule.sessionRefs;
              
              console.log('📋 Processing sessionRefs:', {
                sessionRefsType: Array.isArray(sessionRefs) ? 'array' : typeof sessionRefs,
                sessionRefsLength: Array.isArray(sessionRefs) ? sessionRefs.length : 0,
                sessionRefs: sessionRefs
              });
              
              const resolvedSessions = await Promise.all(
                sessionRefs.map(async (sessionRef, index) => {
                  // Handle both formats
                  const librarySessionId = typeof sessionRef === 'string' 
                    ? sessionRef 
                    : (sessionRef.librarySessionRef || sessionRef.id || sessionRef);
                  const sessionOrder = typeof sessionRef === 'object' && sessionRef.order !== undefined
                    ? sessionRef.order
                    : index;
                  
                  console.log('📋 Processing sessionRef item:', {
                    index,
                    sessionRef,
                    librarySessionId,
                    sessionOrder
                  });
                  
                  try {
                    const librarySession = await libraryService.getLibrarySessionById(creatorId, librarySessionId);
                    
                    if (librarySession) {
                      // Find the corresponding program session document (if it exists)
                      const programSessionsRef = collection(firestore, 'courses', programId, 'modules', moduleId, 'sessions');
                      const programSessionsSnapshot = await getDocs(programSessionsRef);
                      
                      console.log('🔍 Looking for matching program session:', {
                        librarySessionId: librarySessionId,
                        programSessionsCount: programSessionsSnapshot.docs.length,
                        programSessions: programSessionsSnapshot.docs.map(doc => ({
                          id: doc.id,
                          librarySessionRef: doc.data().librarySessionRef
                        }))
                      });
                      
                      let matchingSession = programSessionsSnapshot.docs.find(sessionDoc =>
                        sessionDoc.data().librarySessionRef === librarySessionId
                      );
                      
                      console.log('🔍 Matching session found:', {
                        found: !!matchingSession,
                        matchingSessionId: matchingSession?.id,
                        matchingSessionData: matchingSession ? matchingSession.data() : null
                      });
                      
                      // If no program session document exists, create one for override support
                      let programSessionId;
                      if (!matchingSession) {
                        console.log('⚠️ No program session document found, creating one for override support');
                        programSessionId = await this.ensureProgramSessionDocument(programId, moduleId, librarySessionId, sessionOrder);
                        // Re-fetch to get the created document
                        const sessionsRef2 = collection(firestore, 'courses', programId, 'modules', moduleId, 'sessions');
                        const sessionsSnapshot2 = await getDocs(sessionsRef2);
                        matchingSession = sessionsSnapshot2.docs.find(sessionDoc => sessionDoc.id === programSessionId);
                      } else {
                        programSessionId = matchingSession.id;
                      }
                      
                      // Get overrides if program session exists
                      const overrides = programSessionId 
                        ? await this.getSessionOverrides(programId, moduleId, programSessionId)
                        : null;
                      
                      // Merge library session data with overrides
                      const resolvedSession = {
                        ...librarySession,
                        ...(overrides || {}), // Apply overrides on top of library data
                        id: matchingSession?.id || librarySessionId, // Use program session ID if exists, otherwise library session ID
                        title: (overrides?.title || librarySession.title || librarySession.name), // Use override title if available
                        librarySessionRef: librarySessionId, // Always include librarySessionRef for exercise loading
                        order: matchingSession?.data().order ?? sessionOrder,
                        _overrides: overrides // Keep reference to overrides
                      };
                      
                      console.log('🔷 Resolved library session:', {
                        programSessionId: matchingSession?.id,
                        librarySessionId: librarySessionId,
                        finalSessionId: resolvedSession.id,
                        title: resolvedSession.title,
                        hasLibrarySessionRef: !!resolvedSession.librarySessionRef
                      });
                      
                      return resolvedSession;
                    }
                  } catch (error) {
                    console.error(`Error resolving library session ${librarySessionId}:`, error);
                    return null;
                  }
                  
                  return null;
                })
              );
              
              // Filter out nulls and sort by order
              const sessions = resolvedSessions.filter(Boolean);
              sessions.sort((a, b) => {
                const orderA = a.order !== undefined && a.order !== null ? a.order : Infinity;
                const orderB = b.order !== undefined && b.order !== null ? b.order : Infinity;
                return orderA - orderB;
              });
              
              return sessions;
            }
          } catch (error) {
            console.error('Error resolving library module sessions:', error);
            // Fall through to regular session loading
          }
        }
      }
      
      // Regular module or library resolution failed - load sessions from program module
      const sessionsRef = collection(firestore, 'courses', programId, 'modules', moduleId, 'sessions');
      const querySnapshot = await getDocs(sessionsRef);
      
      const sessions = [];
      
      for (const docSnapshot of querySnapshot.docs) {
        const sessionData = docSnapshot.data();
        
        // ✅ Check if library reference
        if (sessionData.librarySessionRef && creatorId) {
          try {
            // Import libraryService dynamically to avoid circular dependencies
            const { default: libraryService } = await import('./libraryService');
            
            // Fetch library session
            const librarySession = await libraryService.getLibrarySessionById(creatorId, sessionData.librarySessionRef);
            
            if (librarySession) {
              // Fetch overrides
              const overrides = await this.getSessionOverrides(programId, moduleId, docSnapshot.id);
              
              // Merge library session data with overrides
              const resolvedSession = {
                ...librarySession,
                ...(overrides || {}), // Apply overrides on top of library data
                id: docSnapshot.id, // Always use program session ID
                title: (overrides?.title || librarySession.title || librarySession.name), // Use override title if available
                librarySessionRef: sessionData.librarySessionRef, // Keep library reference for exercise loading
                order: sessionData.order,
                _overrides: overrides // Keep reference to overrides
              };
              
              console.log('🔶 Resolved library session (from program sessions):', {
                programSessionId: docSnapshot.id,
                librarySessionRef: sessionData.librarySessionRef,
                title: resolvedSession.title,
                hasLibrarySessionRef: !!resolvedSession.librarySessionRef
              });
              
              sessions.push(resolvedSession);
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
        if (sessionName && typeof sessionName === 'string') {
          newSession.title = sessionName.trim();
        }
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
   * This creates a program session document that references the library session
   */
  async createSessionFromLibrary(programId, moduleId, librarySessionRef, order = null) {
    // Ensure a program session document exists for override support
    return await this.createSession(programId, moduleId, null, order, null, librarySessionRef);
  }
  
  /**
   * Ensure program session document exists for a library session reference
   * This is needed when loading sessions from library modules where no program session document exists yet
   */
  async ensureProgramSessionDocument(programId, moduleId, librarySessionRef, order = null) {
    try {
      // Check if a program session document already exists for this library session
      const sessionsRef = collection(firestore, 'courses', programId, 'modules', moduleId, 'sessions');
      const sessionsSnapshot = await getDocs(sessionsRef);
      
      const existingSession = sessionsSnapshot.docs.find(sessionDoc =>
        sessionDoc.data().librarySessionRef === librarySessionRef
      );
      
      if (existingSession) {
        // Program session document already exists
        return existingSession.id;
      }
      
      // Create program session document if it doesn't exist
      const sessionOrder = order !== null ? order : sessionsSnapshot.docs.length;
      const newSession = {
        order: sessionOrder,
        librarySessionRef: librarySessionRef,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      };
      
      const docRef = await addDoc(sessionsRef, newSession);
      return docRef.id;
    } catch (error) {
      console.error('Error ensuring program session document:', error);
      throw error;
    }
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
      // Get program to get creator_id and content_plan_id for library resolution
      const program = await this.getProgramById(programId);
      const creatorId = program?.creator_id;
      const contentPlanId = program?.content_plan_id;

      // If program uses plan-based content, load exercises from plan
      if (contentPlanId) {
        const { default: plansService } = await import('./plansService');
        return plansService.getExercisesBySession(contentPlanId, moduleId, sessionId);
      }
      
      // Check if this session is a library reference
      const sessionRef = doc(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      
      console.log('🔴 getExercisesBySession called:', {
        programId,
        moduleId,
        sessionId,
        sessionDocExists: sessionDoc.exists(),
        sessionData: sessionDoc.exists() ? sessionDoc.data() : null,
        creatorId
      });
      
      if (sessionDoc.exists()) {
        const sessionData = sessionDoc.data();
        
        // If this is a library session reference, get exercises from the library session
        if (sessionData.librarySessionRef && creatorId) {
          console.log('✅ Session has librarySessionRef, loading from library:', {
            librarySessionRef: sessionData.librarySessionRef
          });
          try {
            // Import libraryService dynamically to avoid circular dependencies
            const { default: libraryService } = await import('./libraryService');
            
            // Get exercises from library session
            const libraryExercises = await libraryService.getLibrarySessionExercises(creatorId, sessionData.librarySessionRef);
            
            console.log('🟡 Loaded exercises from library session:', {
              programSessionId: sessionId,
              librarySessionRef: sessionData.librarySessionRef,
              exercisesCount: libraryExercises.length,
              exercises: libraryExercises.map(ex => ({ id: ex.id, title: ex.title, name: ex.name, setsCount: ex.sets?.length || 0 }))
            });
            
            return libraryExercises;
          } catch (error) {
            console.error('Error resolving library session exercises:', error);
            // Fall through to regular exercise loading
          }
        }
      } else {
        // Session document doesn't exist - check if this module is a library module reference
        // If so, the sessionId might be a library session ID
        console.log('🔵 Session document does not exist, checking if module is library reference...');
        
        const moduleRef = doc(firestore, 'courses', programId, 'modules', moduleId);
        const moduleDoc = await getDoc(moduleRef);
        
        console.log('🔵 Module document check:', {
          moduleDocExists: moduleDoc.exists(),
          moduleData: moduleDoc.exists() ? moduleDoc.data() : null
        });
        
        if (moduleDoc.exists()) {
          const moduleData = moduleDoc.data();
          
          console.log('🔵 Module data:', {
            hasLibraryModuleRef: !!moduleData.libraryModuleRef,
            libraryModuleRef: moduleData.libraryModuleRef,
            hasCreatorId: !!creatorId,
            creatorId: creatorId
          });
          
          // If this module is a library module reference, try loading from library session directly
          if (moduleData.libraryModuleRef && creatorId) {
            console.log('✅⚠️ Session document not found, but module is library reference. Loading from library session directly:', {
              sessionId,
              libraryModuleRef: moduleData.libraryModuleRef,
              creatorId: creatorId
            });
            
            try {
              // Import libraryService dynamically to avoid circular dependencies
              const { default: libraryService } = await import('./libraryService');
              
              // Try to load exercises from library session directly using sessionId as library session ID
              // The sessionId here IS the library session ID when no program session document exists
              console.log('🔵 Calling getLibrarySessionExercises with:', {
                creatorId,
                sessionId
              });
              
              const libraryExercises = await libraryService.getLibrarySessionExercises(creatorId, sessionId);
              
              console.log('🟡✅ Loaded exercises from library session (using sessionId directly as library session ID):', {
                sessionId,
                exercisesCount: libraryExercises.length,
                exercises: libraryExercises.map(ex => ({ id: ex.id, title: ex.title, name: ex.name, setsCount: ex.sets?.length || 0 }))
              });
              
              return libraryExercises;
            } catch (error) {
              console.error('❌ Error loading exercises from library session:', error);
              console.error('❌ Error details:', {
                message: error.message,
                stack: error.stack,
                creatorId,
                sessionId
              });
              // Fall through to regular exercise loading
            }
          } else {
            console.log('⚠️ Module is not a library reference or creatorId missing:', {
              hasLibraryModuleRef: !!moduleData.libraryModuleRef,
              hasCreatorId: !!creatorId
            });
          }
        } else {
          console.log('⚠️ Module document does not exist');
        }
      }
      
      // Regular session or library resolution failed - load exercises from program session
      console.log('⚠️ Falling back to program session exercises (not a library reference or resolution failed)');
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
      
      console.log('🔴 Loaded exercises from program session:', {
        sessionId,
        exercisesCount: exercises.length,
        exercises: exercises.map(ex => ({ id: ex.id, title: ex.title }))
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
      // Get program to get creator_id for library resolution
      const program = await this.getProgramById(programId);
      const creatorId = program?.creator_id;
      
      // Check if this session is a library reference
      const sessionRef = doc(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      
      if (sessionDoc.exists()) {
        const sessionData = sessionDoc.data();
        
        // If this is a library session reference, get sets from the library session exercise
        if (sessionData.librarySessionRef && creatorId) {
          try {
            // Import libraryService dynamically to avoid circular dependencies
            const { default: libraryService } = await import('./libraryService');
            
            // Get sets from library session exercise
            const setsRef = collection(
              firestore,
              'creator_libraries', creatorId,
              'sessions', sessionData.librarySessionRef,
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
            
            console.log('🟠 Loaded sets from library session exercise:', {
              programSessionId: sessionId,
              librarySessionRef: sessionData.librarySessionRef,
              exerciseId: exerciseId,
              setsCount: sets.length,
              sets: sets
            });
            
            return sets;
          } catch (error) {
            console.error('Error resolving library session exercise sets:', error);
            // Fall through to regular set loading
          }
        }
      } else {
        // Session document doesn't exist - check if this module is a library module reference
        // When a library module is used, program session documents may not exist
        // The sessionId passed here is likely the library session ID directly
        console.log('🔵 getSetsByExercise: Session document does not exist, checking if module is library reference...');
        
        const moduleRef = doc(firestore, 'courses', programId, 'modules', moduleId);
        const moduleDoc = await getDoc(moduleRef);
        
        if (moduleDoc.exists()) {
          const moduleData = moduleDoc.data();
          
          // If this module is a library module reference, the sessionId is likely a library session ID
          if (moduleData.libraryModuleRef && creatorId) {
            console.log('✅⚠️ getSetsByExercise: Session document not found, but module is library reference. Loading sets from library session directly:', {
              sessionId,
              exerciseId,
              libraryModuleRef: moduleData.libraryModuleRef,
              creatorId: creatorId
            });
            
            try {
              // Import libraryService dynamically to avoid circular dependencies
              const { default: libraryService } = await import('./libraryService');
              
              // Load sets directly from library session exercise
              // The sessionId here IS the library session ID when no program session document exists
              const setsRef = collection(
                firestore,
                'creator_libraries', creatorId,
                'sessions', sessionId,
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
              
              console.log('🟠✅ Loaded sets from library session exercise (direct):', {
                librarySessionId: sessionId,
                exerciseId: exerciseId,
                setsCount: sets.length,
                sets: sets
              });
              
              return sets;
            } catch (error) {
              console.error('❌ Error loading sets from library session exercise (direct):', error);
              // Fall through to regular set loading
            }
          }
        }
      }
      
      // Regular session or library resolution failed - load sets from program session exercise
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
      
      console.log('📚 Creating sessions from library module:', {
        moduleId: newModule.id,
        sessionRefsCount: sessionRefs.length,
        sessionRefs: sessionRefs
      });
      
      for (let i = 0; i < sessionRefs.length; i++) {
        const sessionRef = sessionRefs[i];
        try {
          // Handle both formats:
          // - Array of strings: [sessionId1, sessionId2, ...]
          // - Array of objects: [{ librarySessionRef, order }, ...]
          const librarySessionRef = typeof sessionRef === 'string' 
            ? sessionRef 
            : (sessionRef?.librarySessionRef || sessionRef?.id || sessionRef);
          const sessionOrder = typeof sessionRef === 'object' && sessionRef.order !== undefined
            ? sessionRef.order
            : i;
          
          if (librarySessionRef) {
            console.log(`📝 Creating session ${i + 1}/${sessionRefs.length}:`, {
              librarySessionRef,
              order: sessionOrder,
              moduleId: newModule.id
            });
            await this.createSessionFromLibrary(programId, newModule.id, librarySessionRef, sessionOrder);
            console.log(`✅ Session ${i + 1} created successfully`);
          } else {
            console.warn(`⚠️ Skipping session ${i + 1}: invalid librarySessionRef`, sessionRef);
          }
        } catch (error) {
          console.error(`❌ Error creating session ${i + 1}/${sessionRefs.length}:`, error);
          // Continue with other sessions instead of failing completely
          // This allows partial success - some sessions might be created even if one fails
        }
      }
      
      return newModule;
    } catch (error) {
      console.error('Error creating module from library:', error);
      throw error;
    }
  }

  // Client Program Methods
  /**
   * Assign program to a client user
   * Creates client program document with version snapshot
   */
  async assignProgramToClient(programId, userId, initialOverrides = {}) {
    try {
      const { default: clientProgramService } = await import('./clientProgramService');
      return await clientProgramService.assignProgramToClient(programId, userId, initialOverrides);
    } catch (error) {
      console.error('Error assigning program to client:', error);
      throw error;
    }
  }

  /**
   * Get client program for a user
   */
  async getClientProgram(programId, userId) {
    try {
      const { default: clientProgramService } = await import('./clientProgramService');
      return await clientProgramService.getClientProgram(programId, userId);
    } catch (error) {
      console.error('Error getting client program:', error);
      throw error;
    }
  }

  /**
   * Update client program override
   */
  async updateClientOverride(programId, userId, path, value) {
    try {
      const { default: clientProgramService } = await import('./clientProgramService');
      return await clientProgramService.updateClientOverride(programId, userId, path, value);
    } catch (error) {
      console.error('Error updating client override:', error);
      throw error;
    }
  }

  /**
   * Get all client programs for a program (for creator dashboard)
   */
  async getClientProgramsForProgram(programId) {
    try {
      const { default: clientProgramService } = await import('./clientProgramService');
      return await clientProgramService.getClientProgramsForProgram(programId);
    } catch (error) {
      console.error('Error getting client programs:', error);
      throw error;
    }
  }

  /**
   * Bulk update client programs
   */
  async bulkUpdateClientPrograms(programId, userIds, path, value) {
    try {
      const { default: clientProgramService } = await import('./clientProgramService');
      return await clientProgramService.bulkUpdateClientPrograms(programId, userIds, path, value);
    } catch (error) {
      console.error('Error in bulk update:', error);
      throw error;
    }
  }
}

export default new ProgramService();

