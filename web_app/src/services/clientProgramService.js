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

class ClientProgramService {
  /**
   * Assign a program to a client user
   * Creates a client program document with version snapshot
   * 
   * @param {string} programId - Program ID
   * @param {string} userId - User ID to assign program to
   * @param {Object} initialOverrides - Optional initial overrides
   * @returns {Promise<string>} Client program document ID
   */
  async assignProgramToClient(programId, userId, initialOverrides = {}) {
    try {
      console.log('📝 Assigning program to client:', { programId, userId });
      
      // Get program to extract version info
      const program = await programService.getProgramById(programId);
      if (!program) {
        throw new Error('Program not found');
      }

      // Extract library versions from program
      const libraryVersions = await this.extractLibraryVersionsFromProgram(programId, program.creator_id);
      
      // Create client program document
      const clientProgramId = `${userId}_${programId}`;
      const clientProgramData = {
        program_id: programId,
        user_id: userId,
        version_snapshot: {
          program_version: program.version || '1.0',
          library_versions: libraryVersions
        },
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        ...initialOverrides
      };

      await setDoc(doc(firestore, 'client_programs', clientProgramId), clientProgramData);
      
      console.log('✅ Client program created:', clientProgramId);
      return clientProgramId;
    } catch (error) {
      console.error('❌ Error assigning program to client:', error);
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
   * Delete client program (unassign program from user)
   */
  async deleteClientProgram(programId, userId) {
    try {
      const clientProgramId = `${userId}_${programId}`;
      await deleteDoc(doc(firestore, 'client_programs', clientProgramId));
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
}

export default new ClientProgramService();


