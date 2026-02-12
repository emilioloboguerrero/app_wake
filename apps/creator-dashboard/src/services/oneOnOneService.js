// One-on-One Client Service for Wake Web Dashboard
import { firestore, functions, httpsCallable } from '../config/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs,
  doc,
  getDoc,
  addDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
  orderBy
} from 'firebase/firestore';
import { getUser } from './firestoreService';
import clientProgramService from './clientProgramService';

const lookupUserForCreatorInvite = httpsCallable(functions, 'lookupUserForCreatorInvite');

class OneOnOneService {
  /**
   * Look up a user by email or username for creator invite (Option 4 flow).
   * Returns { userId, displayName, email, username } for confirmation.
   * @param {string} emailOrUsername - Email or username to search for
   * @returns {Promise<Object>} User info for confirmation
   */
  async lookupUserByEmailOrUsername(emailOrUsername) {
    const result = await lookupUserForCreatorInvite({ emailOrUsername: emailOrUsername.trim() });
    const data = result?.data;
    if (!data || !data.userId) {
      throw new Error('No se encontró ningún usuario');
    }
    const out = {
      userId: data.userId,
      displayName: data.displayName ?? '',
      email: data.email ?? '',
      username: data.username ?? '',
      age: data.age != null ? data.age : null,
      gender: data.gender ?? '',
      country: data.country ?? '',
      city: data.city ?? '',
      height: data.height != null ? data.height : null,
      weight: data.weight != null ? data.weight : null
    };
    return out;
  }

  /**
   * Get all clients for a creator
   * @param {string} creatorId - Creator user ID
   * @returns {Promise<Array>} Array of client documents
   */
  async getClientsByCreator(creatorId) {
    try {
      const clientsRef = collection(firestore, 'one_on_one_clients');
      
      // Try with orderBy first, fallback to without if index doesn't exist
      let querySnapshot;
      try {
        const q = query(
          clientsRef, 
          where('creatorId', '==', creatorId),
          orderBy('createdAt', 'desc')
        );
        querySnapshot = await getDocs(q);
      } catch (error) {
        // Fallback if index doesn't exist yet - query without orderBy
        console.warn('OrderBy index not found, querying without orderBy:', error);
        const q = query(
          clientsRef, 
          where('creatorId', '==', creatorId)
        );
        querySnapshot = await getDocs(q);
      }
      
      const clients = [];
      querySnapshot.forEach((doc) => {
        clients.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return clients;
    } catch (error) {
      console.error('Error fetching clients:', error);
      throw error;
    }
  }

  /**
   * Add a new client to a creator
   * @param {string} creatorId - Creator user ID
   * @param {string} clientUserId - Client user ID
   * @returns {Promise<Object>} Created client document
   */
  async addClient(creatorId, clientUserId) {
    try {
      // Check if relationship already exists
      const existingQuery = query(
        collection(firestore, 'one_on_one_clients'),
        where('creatorId', '==', creatorId),
        where('clientUserId', '==', clientUserId)
      );
      const existingSnapshot = await getDocs(existingQuery);
      
      if (!existingSnapshot.empty) {
        throw new Error('This client is already added');
      }

      // Get client user data to cache basic info
      let clientName = '';
      let clientEmail = '';
      
      try {
        const clientUserDoc = await getUser(clientUserId);
        if (clientUserDoc) {
          clientName = clientUserDoc.displayName || clientUserDoc.name || '';
          clientEmail = clientUserDoc.email || '';
        }
      } catch (error) {
        console.warn('Could not fetch client user data:', error);
        // Continue anyway with empty values
      }

      // Create client document
      const clientsRef = collection(firestore, 'one_on_one_clients');
      const newClientRef = await addDoc(clientsRef, {
        creatorId: creatorId,
        clientUserId: clientUserId,
        clientName: clientName,
        clientEmail: clientEmail,
        courseId: [], // Array of course IDs
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Allow creator to read/update this user's document (for access end date etc.)
      const accessRef = doc(firestore, 'creator_client_access', `${creatorId}_${clientUserId}`);
      await setDoc(accessRef, { creatorId, userId: clientUserId, updated_at: serverTimestamp() }, { merge: true });

      // Get the created document to return
      const createdDoc = await getDoc(newClientRef);
      return {
        id: createdDoc.id,
        ...createdDoc.data()
      };
    } catch (error) {
      console.error('Error adding client:', error);
      throw error;
    }
  }

  /**
   * Add a client and assign them to an existing one-on-one program in one operation.
   * Creates: one_on_one_clients, client_programs, users.courses; updates one_on_one_clients.courseId.
   * @param {string} creatorId - Creator user ID
   * @param {string} clientUserId - Client user ID
   * @param {string} programId - Existing one-on-one program ID to assign
   * @returns {Promise<Object>} Created client document
   */
  async addClientToProgram(creatorId, clientUserId, programId) {
    try {
      // 1. Create client document (same as addClient)
      const client = await this.addClient(creatorId, clientUserId);

      // 2. Assign existing program to client (creates client_programs, adds to users.courses, updates one_on_one_clients.courseId)
      await clientProgramService.assignProgramToClient(programId, clientUserId);

      return client;
    } catch (error) {
      console.error('Error adding client to program:', error);
      throw error;
    }
  }

  /**
   * Add a program ID to a client's courseId array
   * @param {string} creatorId - Creator user ID
   * @param {string} clientUserId - Client user ID
   * @param {string} programId - Program ID to add
   */
  async addCourseToClient(creatorId, clientUserId, programId) {
    try {
      const q = query(
        collection(firestore, 'one_on_one_clients'),
        where('creatorId', '==', creatorId),
        where('clientUserId', '==', clientUserId)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const clientDocRef = doc(firestore, 'one_on_one_clients', snapshot.docs[0].id);
        await updateDoc(clientDocRef, {
          courseId: arrayUnion(programId),
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Error adding course to client:', error);
      throw error;
    }
  }

  /**
   * Remove a program ID from a client's courseId array
   * @param {string} creatorId - Creator user ID
   * @param {string} clientUserId - Client user ID
   * @param {string} programId - Program ID to remove
   */
  async removeCourseFromClient(creatorId, clientUserId, programId) {
    try {
      const q = query(
        collection(firestore, 'one_on_one_clients'),
        where('creatorId', '==', creatorId),
        where('clientUserId', '==', clientUserId)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const clientData = snapshot.docs[0].data();
        const courseIds = clientData.courseId || [];
        const newCourseIds = courseIds.filter(id => id !== programId);
        const clientDocRef = doc(firestore, 'one_on_one_clients', snapshot.docs[0].id);
        await updateDoc(clientDocRef, {
          courseId: newCourseIds,
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Error removing course from client:', error);
      throw error;
    }
  }

  /**
   * Get a single client by ID
   * @param {string} clientId - Client document ID
   * @returns {Promise<Object|null>} Client document or null
   */
  async getClientById(clientId) {
    try {
      const clientDocRef = doc(firestore, 'one_on_one_clients', clientId);
      const clientDoc = await getDoc(clientDocRef);
      
      if (clientDoc.exists()) {
        return {
          id: clientDoc.id,
          ...clientDoc.data()
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error getting client:', error);
      throw error;
    }
  }

  /**
   * Delete a client
   * @param {string} clientId - Client document ID
   */
  async deleteClient(clientId) {
    try {
      const clientDocRef = doc(firestore, 'one_on_one_clients', clientId);
      await deleteDoc(clientDocRef);
    } catch (error) {
      console.error('Error deleting client:', error);
      throw error;
    }
  }

  /**
   * Update a client document
   * @param {string} clientId - Client document ID
   * @param {Object} updates - Fields to update
   */
  async updateClient(clientId, updates) {
    try {
      const clientDocRef = doc(firestore, 'one_on_one_clients', clientId);
      await updateDoc(clientDocRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating client:', error);
      throw error;
    }
  }

  /**
   * Get full user data for a client
   * @param {string} clientUserId - Client user ID
   * @returns {Promise<Object|null>} User document data or null
   */
  async getClientUserData(clientUserId) {
    try {
      const userData = await getUser(clientUserId);
      if (!userData) {
        return null;
      }

      // Calculate age from birthDate if available and age is not set
      let age = userData.age;
      if (!age && userData.birthDate) {
        const birthDate = userData.birthDate.toDate ? userData.birthDate.toDate() : new Date(userData.birthDate);
        if (!isNaN(birthDate.getTime())) {
          age = new Date().getFullYear() - birthDate.getFullYear();
          const monthDiff = new Date().getMonth() - birthDate.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && new Date().getDate() < birthDate.getDate())) {
            age--;
          }
        }
      }

      return {
        name: userData.name || userData.displayName || '',
        username: userData.username || '',
        email: userData.email || '',
        age: age || null,
        gender: userData.gender || '',
        country: userData.country || '',
        city: userData.city || userData.location || '',
        height: userData.height || null,
        initialWeight: userData.bodyweight || userData.weight || null
      };
    } catch (error) {
      console.error('Error fetching client user data:', error);
      throw error;
    }
  }
}

export default new OneOnOneService();

