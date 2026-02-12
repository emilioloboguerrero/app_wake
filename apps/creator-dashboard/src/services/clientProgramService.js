// Client Program Service for Web App
// Handles creating and managing client program customizations
import { firestore } from '../config/firebase';
import { 
  doc, 
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  getDocs,
  where,
  serverTimestamp
} from 'firebase/firestore';
import libraryService from './libraryService';
import programService from './programService';
import plansService from './plansService';
import clientSessionService from './clientSessionService';
import clientPlanContentService from './clientPlanContentService';
import clientSessionContentService from './clientSessionContentService';
import { getWeekDates } from '../utils/weekCalculation';

// Doc ID for creator_client_access: creatorId_userId (enables Firestore rules for creator → client user read/update)
const CREATOR_CLIENT_ACCESS_COLLECTION = 'creator_client_access';

function getCreatorClientAccessId(creatorId, userId) {
  return `${creatorId}_${userId}`;
}

class ClientProgramService {
  /**
   * Ensure creator_client_access doc exists so Firestore rules allow creator to read/update this user's document.
   * @param {string} creatorId - Creator user ID
   * @param {string} userId - Client user ID
   */
  async ensureCreatorClientAccess(creatorId, userId) {
    if (!creatorId || !userId) return;
    try {
      const accessId = getCreatorClientAccessId(creatorId, userId);
      const ref = doc(firestore, CREATOR_CLIENT_ACCESS_COLLECTION, accessId);
      await setDoc(ref, {
        creatorId,
        userId,
        updated_at: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.warn('ensureCreatorClientAccess failed:', err?.message);
    }
  }

  /**
   * Set access end date for a client's program (one-on-one). Updates users.courses[programId].expires_at.
   * Creator must have creator_client_access for this user (created when adding client or assigning program).
   * @param {string} userId - Client user ID
   * @param {string} programId - Program ID
   * @param {string|null} expiresAt - ISO date string, or null for "no end date" (stored as far future)
   * @returns {Promise<void>}
   */
  async setClientProgramAccessEndDate(userId, programId, expiresAt) {
    const userRef = doc(firestore, 'users', userId);
    const userDoc = await getDoc(userRef);
    if (!userDoc.exists()) {
      throw new Error('Usuario no encontrado');
    }
    const userData = userDoc.data();
    const courses = { ...(userData.courses || {}) };
    if (!courses[programId]) {
      throw new Error('Este cliente no tiene asignado este programa');
    }
    const entry = { ...courses[programId] };
    if (expiresAt == null || expiresAt === '') {
      const far = new Date();
      far.setFullYear(far.getFullYear() + 10);
      entry.expires_at = far.toISOString();
    } else {
      entry.expires_at = typeof expiresAt === 'string' ? expiresAt : new Date(expiresAt).toISOString();
    }
    courses[programId] = entry;
    await updateDoc(userRef, { courses });
  }

  /**
   * Add one-on-one program to user's courses object (for mobile app visibility)
   * @param {string} userId - User ID
   * @param {string} programId - Program ID
   * @param {Object} program - Program data
   * @param {string} creatorId - Creator ID (who assigned it)
   */
  async addOneOnOneProgramToUserCourses(userId, programId, program, creatorId) {
    try {
      const userRef = doc(firestore, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        throw new Error('User document does not exist');
      }

      const userData = userDoc.data();
      const courses = userData.courses || {};
      
      // Check if already exists (don't overwrite if already there)
      if (courses[programId] && courses[programId].deliveryType === 'one_on_one') {
        console.log('✅ Program already in user courses');
        return;
      }

      // Set expiration far in the future (or null for no expiration)
      const farFutureDate = new Date();
      farFutureDate.setFullYear(farFutureDate.getFullYear() + 10); // 10 years from now

      // Add one-on-one program to user's courses
      courses[programId] = {
        // Access control
        access_duration: 'one_on_one', // Special flag for one-on-one programs
        expires_at: farFutureDate.toISOString(), // Far future date (effectively no expiration)
        status: 'active',
        purchased_at: new Date().toISOString(),
        
        // One-on-one specific fields
        deliveryType: 'one_on_one', // KEY: Differentiates from low_ticket programs
        assigned_by: creatorId, // Who assigned this program
        assigned_at: new Date().toISOString(),
        
        // Minimal cached data for display (same as low_ticket)
        title: program.title || 'Untitled Program',
        image_url: program.image_url || null,
        discipline: program.discipline || 'General',
        creatorName: program.creatorName || program.creator_name || 'Unknown Creator',
        
        // Tutorial completion tracking
        completedTutorials: {
          dailyWorkout: [],
          warmup: [],
          workoutExecution: [],
          workoutCompletion: []
        }
      };

      // Update user document
      await updateDoc(userRef, {
        courses: courses
      });

      console.log('✅ One-on-one program added to user courses:', programId);
    } catch (error) {
      console.error('❌ Error adding one-on-one program to user courses:', error);
      throw error;
    }
  }

  /**
   * Remove one-on-one program from user's courses object
   * @param {string} userId - User ID
   * @param {string} programId - Program ID
   */
  async removeOneOnOneProgramFromUserCourses(userId, programId) {
    try {
      const userRef = doc(firestore, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        return; // User doesn't exist, nothing to remove
      }

      const userData = userDoc.data();
      const courses = userData.courses || {};
      
      // Only remove if it's a one-on-one program
      if (courses[programId] && courses[programId].deliveryType === 'one_on_one') {
        delete courses[programId];
        
        await updateDoc(userRef, {
          courses: courses
        });

        console.log('✅ One-on-one program removed from user courses:', programId);
      }
    } catch (error) {
      console.error('❌ Error removing one-on-one program from user courses:', error);
      throw error;
    }
  }

  /**
   * Assign a program to a client user
   * Creates a client program document with version snapshot
   * Also adds program to user's courses for mobile app visibility
   * Atomic: adds users.courses first; on failure rolls back
   *
   * @param {string} programId - Program ID
   * @param {string} userId - User ID to assign program to
   * @param {Object} initialOverrides - Optional initial overrides
   * @returns {Promise<string>} Client program document ID
   */
  async assignProgramToClient(programId, userId, initialOverrides = {}) {
    let usersCoursesAdded = false;
    const MAX_RETRIES = 3;

    try {
      console.log('📝 Assigning program to client:', { programId, userId });

      // Get program to extract version info
      const program = await programService.getProgramById(programId);
      if (!program) {
        throw new Error('Program not found');
      }

      // Get creator_id with fallback
      const creatorId = program.creator_id || program.creatorId || null;
      if (!creatorId) {
        console.warn('⚠️ Program missing creator_id:', programId);
      }

      // Extract library versions from program (only if creator_id exists)
      const libraryVersions = creatorId
        ? await this.extractLibraryVersionsFromProgram(programId, creatorId)
        : { sessions: {}, modules: {} };

      // Ensure creator can read/update this user's doc (for rules and future end-date edits)
      await this.ensureCreatorClientAccess(creatorId, userId);

      // Step 1: Add to users.courses FIRST (atomic - must succeed before client_programs)
      let lastError;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          await this.addOneOnOneProgramToUserCourses(userId, programId, program, creatorId);
          usersCoursesAdded = true;
          break;
        } catch (err) {
          lastError = err;
          console.warn(`⚠️ addOneOnOneProgramToUserCourses attempt ${attempt}/${MAX_RETRIES} failed:`, err?.message);
          if (attempt === MAX_RETRIES) {
            throw new Error(`No se pudo agregar el programa al usuario después de ${MAX_RETRIES} intentos. ${err?.message || ''}`);
          }
          await new Promise(r => setTimeout(r, 500 * attempt));
        }
      }

      // Step 2: Create client program document
      const clientProgramId = `${userId}_${programId}`;
      const clientProgramData = {
        program_id: programId,
        user_id: userId,
        content_plan_id: initialOverrides.content_plan_id ?? null,
        version_snapshot: {
          program_version: program.version || '1.0',
          library_versions: libraryVersions
        },
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        ...initialOverrides
      };

      try {
        await setDoc(doc(firestore, 'client_programs', clientProgramId), clientProgramData);
      } catch (err) {
        // Rollback: remove from users.courses
        if (usersCoursesAdded) {
          try {
            await this.removeOneOnOneProgramFromUserCourses(userId, programId);
          } catch (rollbackErr) {
            console.error('❌ Rollback failed after client_programs creation error:', rollbackErr);
          }
        }
        throw err;
      }

      // Step 3: Update one_on_one_clients.courseId
      if (creatorId) {
        try {
          const { default: oneOnOneService } = await import('./oneOnOneService');
          await oneOnOneService.addCourseToClient(creatorId, userId, programId);
        } catch (err) {
          console.warn('Could not update one_on_one_clients.courseId:', err);
        }
      }

      console.log('✅ Client program created:', clientProgramId);
      return clientProgramId;
    } catch (error) {
      console.error('❌ Error assigning program to client:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        programId,
        userId
      });
      throw error;
    }
  }

  /**
   * Extract library versions from a program
   */
  async extractLibraryVersionsFromProgram(programId, creatorId) {
    const versions = {
      sessions: {},
      modules: {}
    };

    try {
      // Get all modules for the program
      const modules = await programService.getModulesByProgram(programId);
      
      for (const module of modules) {
        // Check if module references a library
        if (module.libraryModuleRef) {
          try {
            const libraryModule = await libraryService.getLibraryModuleById(creatorId, module.libraryModuleRef);
            if (libraryModule) {
              versions.modules[module.libraryModuleRef] = libraryModule.version || '1.0';
            }
          } catch (error) {
            console.warn('Could not fetch library module version:', error);
          }
        }

        // Check sessions in module
        if (module.sessions) {
          for (const session of module.sessions) {
            if (session.librarySessionRef) {
              try {
                const librarySession = await libraryService.getLibrarySessionById(creatorId, session.librarySessionRef);
                if (librarySession) {
                  versions.sessions[session.librarySessionRef] = librarySession.version || '1.0';
                }
              } catch (error) {
                console.warn('Could not fetch library session version:', error);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error extracting library versions:', error);
    }

    return versions;
  }

  /**
   * Get client program document
   */
  async getClientProgram(programId, userId) {
    try {
      const clientProgramId = `${userId}_${programId}`;
      const clientProgramDoc = await getDoc(doc(firestore, 'client_programs', clientProgramId));
      
      if (clientProgramDoc.exists()) {
        return {
          id: clientProgramDoc.id,
          ...clientProgramDoc.data()
        };
      }
      return null;
    } catch (error) {
      console.error('Error getting client program:', error);
      throw error;
    }
  }

  /**
   * Update client program overrides at a specific path
   * 
   * @param {string} programId - Program ID
   * @param {string} userId - User ID
   * @param {string} path - Dot-separated path (e.g., 'modules.moduleId.sessions.sessionId.title')
   * @param {*} value - Value to set (null to delete)
   */
  async updateClientOverride(programId, userId, path, value) {
    try {
      const clientProgramId = `${userId}_${programId}`;
      const clientProgramRef = doc(firestore, 'client_programs', clientProgramId);
      
      // Build nested update object
      const pathParts = path.split('.');
      const updateData = {};
      let current = updateData;
      
      for (let i = 0; i < pathParts.length - 1; i++) {
        current[pathParts[i]] = {};
        current = current[pathParts[i]];
      }
      
      current[pathParts[pathParts.length - 1]] = value;
      
      await updateDoc(clientProgramRef, {
        ...updateData,
        updated_at: serverTimestamp()
      });
      
      console.log('✅ Client override updated:', path);
    } catch (error) {
      console.error('❌ Error updating client override:', error);
      throw error;
    }
  }

  /**
   * Set the content plan for a client's program (reference: content comes from this plan).
   * @param {string} programId - Program ID (general program / bucket)
   * @param {string} userId - User ID
   * @param {string|null} planId - Plan ID from plans collection, or null to clear
   */
  async setClientContentPlan(programId, userId, planId) {
    try {
      const clientProgramId = `${userId}_${programId}`;
      const clientProgramRef = doc(firestore, 'client_programs', clientProgramId);
      const clientProgramDoc = await getDoc(clientProgramRef);
      if (!clientProgramDoc.exists()) {
        throw new Error('Client program not found. Assign the program to the client first.');
      }
      await updateDoc(clientProgramRef, {
        content_plan_id: planId ?? null,
        updated_at: serverTimestamp()
      });
      console.log('✅ Client content plan set:', { programId, userId, planId });
    } catch (error) {
      console.error('❌ Error setting client content plan:', error);
      throw error;
    }
  }

  /**
   * Delete client program (unassign program from user)
   * Also removes: client_plan_content, client_sessions, client_session_content.
   * Keeps: users.courseProgress, users.sessionHistory (completion history).
   */
  async deleteClientProgram(programId, userId) {
    try {
      const clientProgramId = `${userId}_${programId}`;
      const clientProgramRef = doc(firestore, 'client_programs', clientProgramId);
      const program = await programService.getProgramById(programId);
      const creatorId = program?.creator_id || program?.creatorId;

      // Read planAssignments before deleting client_programs (needed for client_plan_content cleanup)
      const clientProgramDoc = await getDoc(clientProgramRef);
      const planAssignments = clientProgramDoc.exists() ? (clientProgramDoc.data().planAssignments || {}) : {};

      // Delete client_plan_content for each week (custom week copies)
      for (const weekKey of Object.keys(planAssignments)) {
        try {
          await clientPlanContentService.deleteClientPlanContent(userId, programId, weekKey);
        } catch (err) {
          console.warn('[clientProgramService] deleteClientProgram: could not delete client_plan_content for', weekKey, err?.message);
        }
      }

      // Delete all client_sessions and their client_session_content for this user+program
      try {
        const sessions = await clientSessionService.getSessionsForProgram(userId, programId);
        for (const s of sessions) {
          try {
            await clientSessionContentService.deleteClientSessionContent(s.id);
          } catch (err) {
            console.warn('[clientProgramService] deleteClientProgram: could not delete client_session_content for', s.id, err?.message);
          }
          await deleteDoc(doc(firestore, 'client_sessions', s.id));
        }
        if (sessions.length > 0) {
          console.log('[clientProgramService] deleteClientProgram: removed', sessions.length, 'client_sessions for', clientProgramId);
        }
      } catch (err) {
        console.warn('[clientProgramService] deleteClientProgram: could not delete client_sessions:', err?.message);
      }

      await deleteDoc(clientProgramRef);

      // ✅ Remove from user's courses
      await this.removeOneOnOneProgramFromUserCourses(userId, programId);

      // ✅ Update one_on_one_clients.courseId (dynamic import to avoid circular dependency)
      if (creatorId) {
        try {
          const { default: oneOnOneService } = await import('./oneOnOneService');
          await oneOnOneService.removeCourseFromClient(creatorId, userId, programId);
        } catch (err) {
          console.warn('Could not update one_on_one_clients.courseId:', err);
        }
      }

      console.log('✅ Client program deleted:', clientProgramId);
    } catch (error) {
      console.error('❌ Error deleting client program:', error);
      throw error;
    }
  }

  /**
   * Get all client programs for a specific program
   * Useful for creators to see all their clients
   */
  async getClientProgramsForProgram(programId) {
    try {
      const clientProgramsQuery = query(
        collection(firestore, 'client_programs'),
        where('program_id', '==', programId)
      );
      
      const snapshot = await getDocs(clientProgramsQuery);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error getting client programs for program:', error);
      throw error;
    }
  }

  /**
   * Bulk update client programs (apply same override to multiple clients)
   */
  async bulkUpdateClientPrograms(programId, userIds, path, value) {
    try {
      const updates = userIds.map(userId => {
        return this.updateClientOverride(programId, userId, path, value);
      });
      
      await Promise.all(updates);
      console.log(`✅ Bulk updated ${userIds.length} client programs`);
    } catch (error) {
      console.error('❌ Error in bulk update:', error);
      throw error;
    }
  }

  /**
   * Copy overrides from one client to another
   */
  async copyClientOverrides(sourceUserId, targetUserId, programId) {
    try {
      const sourceClientProgram = await this.getClientProgram(programId, sourceUserId);
      if (!sourceClientProgram) {
        throw new Error('Source client program not found');
      }

      // Extract overrides (everything except metadata)
      const overrides = {
        modules: sourceClientProgram.modules || {},
        title: sourceClientProgram.title,
        description: sourceClientProgram.description,
        image_url: sourceClientProgram.image_url
      };

      // Get or create target client program
      let targetClientProgram = await this.getClientProgram(programId, targetUserId);
      if (!targetClientProgram) {
        // Create new client program with same version snapshot
        await this.assignProgramToClient(programId, targetUserId, overrides);
      } else {
        // Update existing with copied overrides
        await updateDoc(doc(firestore, 'client_programs', `${targetUserId}_${programId}`), {
          ...overrides,
          updated_at: serverTimestamp()
        });
      }

      console.log('✅ Client overrides copied');
    } catch (error) {
      console.error('❌ Error copying client overrides:', error);
      throw error;
    }
  }

  /**
   * Assign a plan to a specific week for a client in a program
   * @param {string} programId - Program ID (the container/bin)
   * @param {string} userId - User ID
   * @param {string} planId - Plan ID (the content to assign)
   * @param {string} weekKey - Week key in format "YYYY-WXX"
   * @param {number} moduleIndex - Index of the module to assign (0-based, each module = 1 week)
   * @returns {Promise<void>}
   */
  async assignPlanToWeek(programId, userId, planId, weekKey, moduleIndex = 0) {
    try {
      const clientProgramId = `${userId}_${programId}`;
      const clientProgramRef = doc(firestore, 'client_programs', clientProgramId);
      
      // Get existing client program or create if it doesn't exist
      const clientProgram = await this.getClientProgram(programId, userId);
      
      if (!clientProgram) {
        // Create new client program first (this also adds to user.courses)
        await this.assignProgramToClient(programId, userId);
      } else {
      // Ensure program is in user.courses even if client_programs exists
      // (handles edge case where client_programs exists but not in user.courses)
      const program = await programService.getProgramById(programId);
      if (program) {
        const creatorId = program.creator_id || program.creatorId || null;
        await this.addOneOnOneProgramToUserCourses(userId, programId, program, creatorId);
      }
      }

      // Get or initialize planAssignments
      // Structure: planAssignments[weekKey] = { planId, moduleIndex, assignedAt }
      const clientProgramDoc = await getDoc(clientProgramRef);
      const currentData = clientProgramDoc.data() || {};
      const planAssignments = currentData.planAssignments || {};

      // Assign the plan to the week (overwrites existing assignment for this week if any)
      planAssignments[weekKey] = {
        planId,
        moduleIndex,
        assignedAt: serverTimestamp()
      };

      // Update the document
      await updateDoc(clientProgramRef, {
        planAssignments,
        updated_at: serverTimestamp()
      });

      // Create client_sessions for each day of the week so the PWA can show today's session
      const { start: weekStart, end: weekEnd } = getWeekDates(weekKey);
      const modules = await plansService.getModulesByPlan(planId);
      const mod = modules?.[moduleIndex];
      if (mod) {
        const sessions = await plansService.getSessionsByModule(planId, mod.id);
        // Monday = 0, Tuesday = 1, ... Sunday = 6 (match CalendarView getWeekdayIndex)
        const getWeekdayIndex = (d) => (d.getDay() + 6) % 7;
        for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
          const date = new Date(d);
          const weekdayIndex = getWeekdayIndex(date);
          const sessionForDay = sessions.find((s) => (s.dayIndex != null ? s.dayIndex : 0) === weekdayIndex);
          if (sessionForDay) {
            await clientSessionService.assignSessionToDate(userId, programId, planId, sessionForDay.id, date, mod.id, {
              day_index: sessionForDay.dayIndex != null ? sessionForDay.dayIndex : 0
            });
          }
        }
      }

      console.log('✅ Plan assigned to week:', { programId, userId, planId, weekKey, moduleIndex });
    } catch (error) {
      console.error('❌ Error assigning program to week:', error);
      throw error;
    }
  }

  /**
   * Remove a plan assignment from a week
   * Also deletes client_plan_content (custom week copy) and client_session_content (per-session copies)
   * so re-assignment shows fresh content from the plan/library.
   * @param {string} programId - Program ID
   * @param {string} userId - User ID
   * @param {string} weekKey - Week key in format "YYYY-WXX"
   * @returns {Promise<void>}
   */
  async removePlanFromWeek(programId, userId, weekKey) {
    try {
      const clientProgramId = `${userId}_${programId}`;
      const clientProgramRef = doc(firestore, 'client_programs', clientProgramId);
      
      const clientProgramDoc = await getDoc(clientProgramRef);
      if (!clientProgramDoc.exists()) {
        return; // Nothing to remove
      }

      const currentData = clientProgramDoc.data();
      const planAssignments = currentData.planAssignments || {};

      // Remove the week assignment
      delete planAssignments[weekKey];

      // Update the document
      await updateDoc(clientProgramRef, {
        planAssignments,
        updated_at: serverTimestamp()
      });

      // Remove client_plan_content (custom week copy) so re-assignment shows fresh plan content
      try {
        await clientPlanContentService.deleteClientPlanContent(userId, programId, weekKey);
      } catch (err) {
        console.warn('[clientProgramService] removePlanFromWeek: could not delete client_plan_content:', err?.message);
      }

      // Remove client_sessions for this week (also deletes client_session_content for each)
      // Preserve completed sessions so they stay visible on the calendar
      const completedIds = await this.getClientCompletedSessionIds(programId, userId);
      await clientSessionService.deleteClientSessionsForWeek(userId, programId, weekKey, completedIds);

      console.log('✅ Plan removed from week:', { programId, userId, weekKey });
    } catch (error) {
      console.error('❌ Error removing plan from week:', error);
      throw error;
    }
  }

  /**
   * Get set of completed session IDs for a client in a program (from users.courseProgress)
   * Used to show completion indicator on calendar session cards
   * @param {string} programId - Program ID (courseId in courseProgress)
   * @param {string} userId - Client user ID
   * @returns {Promise<Set<string>>} Set of session IDs the client has completed
   */
  async getClientCompletedSessionIds(programId, userId) {
    try {
      const userRef = doc(firestore, 'users', userId);
      const userDoc = await getDoc(userRef);
      const userExists = userDoc.exists();
      console.log('[clientProgramService] getClientCompletedSessionIds:', {
        programId,
        userId,
        userExists,
        userDocError: !userExists ? 'user doc missing or permission denied' : null
      });
      if (!userExists) return new Set();
      const userData = userDoc.data();
      const courseProgressKeys = userData.courseProgress ? Object.keys(userData.courseProgress) : [];
      const courseProgress = userData.courseProgress?.[programId];
      const hasProgressForProgram = !!courseProgress;
      const arr = courseProgress?.allSessionsCompleted || [];
      const arrLength = Array.isArray(arr) ? arr.length : 0;
      const ids = new Set(Array.isArray(arr) ? arr : []);

      // Also merge sessionHistory for this program (doc id = sessionId; each doc has courseId)
      try {
        const sessionHistoryRef = collection(firestore, 'users', userId, 'sessionHistory');
        const snapshot = await getDocs(sessionHistoryRef);
        let fromHistory = 0;
        snapshot.docs.forEach((d) => {
          const data = d.data();
          if (data.courseId === programId) {
            const sid = data.sessionId || d.id;
            if (sid) {
              ids.add(sid);
              fromHistory += 1;
            }
          }
        });
        if (fromHistory > 0) {
          console.log('[clientProgramService] getClientCompletedSessionIds: merged from sessionHistory', {
            programId,
            fromHistory,
            totalSetSize: ids.size
          });
        }
      } catch (historyErr) {
        console.warn('[clientProgramService] getClientCompletedSessionIds: sessionHistory read failed (may need rule)', historyErr?.message || historyErr);
      }

      if (!hasProgressForProgram && courseProgressKeys.length > 0) {
        console.warn('[clientProgramService] getClientCompletedSessionIds: programId not in user courseProgress', {
          programId,
          courseProgressKeys,
          hint: 'PWA may use a different course/program id than dashboard selectedProgramId'
        });
      }
      if (userData.courseProgress && courseProgressKeys.length === 0) {
        console.warn('[clientProgramService] getClientCompletedSessionIds: user has courseProgress but keys empty');
      }
      console.log('[clientProgramService] getClientCompletedSessionIds result:', {
        programId,
        courseProgressKeys,
        hasProgressForProgram,
        allSessionsCompletedLength: arrLength,
        allSessionsCompletedSample: arrLength ? (Array.isArray(arr) ? arr.slice(0, 10) : []) : [],
        returnedSetSize: ids.size
      });
      return ids;
    } catch (error) {
      console.error('❌ Error getting client completed sessions:', error?.message || error, { programId, userId });
      return new Set();
    }
  }

  /**
   * Get all session history for a client in a program (from users.sessionHistory).
   * Independent of plans/client_sessions - shows completions even after plan deletion.
   * @param {string} programId - Program ID (courseId in sessionHistory)
   * @param {string} userId - Client user ID
   * @returns {Promise<Array>} Array of { sessionId, sessionName, completedAt, duration, exercises, ... } sorted by completedAt desc
   */
  async getClientSessionHistory(programId, userId) {
    try {
      const sessionHistoryRef = collection(firestore, 'users', userId, 'sessionHistory');
      const snapshot = await getDocs(sessionHistoryRef);
      const items = [];
      snapshot.docs.forEach((d) => {
        const data = d.data();
        if (data.courseId === programId) {
          items.push({
            sessionId: d.id,
            sessionName: data.sessionName || data.courseName || 'Sesión',
            completedAt: data.completedAt,
            duration: data.duration,
            exercises: data.exercises || {},
            ...data
          });
        }
      });
      items.sort((a, b) => {
        const ta = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const tb = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return tb - ta;
      });
      return items;
    } catch (error) {
      console.error('getClientSessionHistory failed:', error?.message);
      return [];
    }
  }

  /**
   * Get a single session history document for a user (PWA completion data).
   * Path: users/{userId}/sessionHistory/{sessionId}
   * @param {string} userId - Client user ID
   * @param {string} sessionId - Session ID (e.g. library session id used when completing)
   * @returns {Promise<Object|null>} Doc data or null if not found
   */
  async getSessionHistoryDoc(userId, sessionId) {
    if (!userId || !sessionId) return null;
    try {
      const ref = doc(firestore, 'users', userId, 'sessionHistory', sessionId);
      const snap = await getDoc(ref);
      return snap.exists() ? snap.data() : null;
    } catch (error) {
      console.warn('getSessionHistoryDoc failed:', error?.message);
      return null;
    }
  }

  /**
   * Get all plan assignments for a client program
   * @param {string} programId - Program ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Object mapping week keys to plan assignment data
   */
  async getPlanAssignments(programId, userId) {
    try {
      const clientProgram = await this.getClientProgram(programId, userId);
      if (!clientProgram) {
        return {};
      }
      return clientProgram.planAssignments || {};
    } catch (error) {
      console.error('❌ Error getting plan assignments:', error);
      return {};
    }
  }
}

export default new ClientProgramService();


