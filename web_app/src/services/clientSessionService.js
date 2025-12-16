// Client Session Service for Web App
// Handles planned sessions assigned to specific dates for clients
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
  serverTimestamp,
  orderBy
} from 'firebase/firestore';

class ClientSessionService {
  /**
   * Assign a session to a specific date for a client
   * 
   * @param {string} clientId - Client user ID
   * @param {string} programId - Program ID
   * @param {string} sessionId - Session ID
   * @param {Date} date - Date to assign session to
   * @param {string} moduleId - Optional module ID
   * @param {Object} metadata - Optional metadata (e.g., notes, customizations)
   * @returns {Promise<string>} Client session document ID
   */
  async assignSessionToDate(clientId, programId, sessionId, date, moduleId = null, metadata = {}) {
    try {
      console.log('📅 Assigning session to date:', { clientId, programId, sessionId, date });
      
      // Normalize date to YYYY-MM-DD format for consistent storage
      const dateStr = this.formatDateForStorage(date);
      const sessionDate = new Date(date);
      sessionDate.setHours(0, 0, 0, 0);
      
      // Create client session document
      // ID format: {clientId}_{dateStr}_{sessionId} (or use auto-generated ID)
      const clientSessionData = {
        client_id: clientId,
        program_id: programId,
        session_id: sessionId,
        module_id: moduleId,
        date: dateStr,
        date_timestamp: sessionDate,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        ...metadata
      };

      // Use a more readable ID format
      const clientSessionId = `${clientId}_${dateStr}_${sessionId}`;
      await setDoc(doc(firestore, 'client_sessions', clientSessionId), clientSessionData);
      
      console.log('✅ Client session assigned:', clientSessionId);
      return clientSessionId;
    } catch (error) {
      console.error('❌ Error assigning session to date:', error);
      throw error;
    }
  }

  /**
   * Get all planned sessions for a client within a date range
   * 
   * @param {string} clientId - Client user ID
   * @param {Date} startDate - Start date (optional, defaults to beginning of current month)
   * @param {Date} endDate - End date (optional, defaults to end of current month)
   * @returns {Promise<Array>} Array of client session objects
   */
  async getClientSessions(clientId, startDate = null, endDate = null) {
    try {
      // Default to current month if no dates provided
      if (!startDate || !endDate) {
        const now = new Date();
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      }

      // Normalize dates
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);

      const clientSessionsQuery = query(
        collection(firestore, 'client_sessions'),
        where('client_id', '==', clientId),
        where('date_timestamp', '>=', startDate),
        where('date_timestamp', '<=', endDate),
        orderBy('date_timestamp', 'asc')
      );
      
      const snapshot = await getDocs(clientSessionsQuery);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('❌ Error getting client sessions:', error);
      throw error;
    }
  }

  /**
   * Get planned session for a specific date
   * 
   * @param {string} clientId - Client user ID
   * @param {Date} date - Date to check
   * @returns {Promise<Object|null>} Client session object or null
   */
  async getSessionForDate(clientId, date) {
    try {
      const dateStr = this.formatDateForStorage(date);
      const sessions = await this.getClientSessions(clientId, date, date);
      return sessions.length > 0 ? sessions[0] : null;
    } catch (error) {
      console.error('❌ Error getting session for date:', error);
      throw error;
    }
  }

  /**
   * Remove a planned session from a date
   * 
   * @param {string} clientId - Client user ID
   * @param {Date} date - Date to remove session from
   * @param {string} sessionId - Optional session ID (if multiple sessions per date)
   * @returns {Promise<void>}
   */
  async removeSessionFromDate(clientId, date, sessionId = null) {
    try {
      const dateStr = this.formatDateForStorage(date);
      
      if (sessionId) {
        // Delete specific session
        const clientSessionId = `${clientId}_${dateStr}_${sessionId}`;
        await deleteDoc(doc(firestore, 'client_sessions', clientSessionId));
      } else {
        // Delete all sessions for this date
        const sessions = await this.getSessionForDate(clientId, date);
        if (sessions) {
          // If getSessionForDate returns a single object, handle it
          if (sessions.id) {
            await deleteDoc(doc(firestore, 'client_sessions', sessions.id));
          } else if (Array.isArray(sessions) && sessions.length > 0) {
            // Delete all sessions for this date
            await Promise.all(
              sessions.map(s => deleteDoc(doc(firestore, 'client_sessions', s.id)))
            );
          }
        }
      }
      
      console.log('✅ Session removed from date');
    } catch (error) {
      console.error('❌ Error removing session from date:', error);
      throw error;
    }
  }

  /**
   * Update metadata for a planned session
   * 
   * @param {string} sessionId - Client session document ID
   * @param {Object} metadata - Metadata to update
   * @returns {Promise<void>}
   */
  async updateSessionMetadata(sessionId, metadata) {
    try {
      await updateDoc(doc(firestore, 'client_sessions', sessionId), {
        ...metadata,
        updated_at: serverTimestamp()
      });
      console.log('✅ Session metadata updated');
    } catch (error) {
      console.error('❌ Error updating session metadata:', error);
      throw error;
    }
  }

  /**
   * Get all sessions for a specific program assigned to a client
   * 
   * @param {string} clientId - Client user ID
   * @param {string} programId - Program ID
   * @returns {Promise<Array>} Array of client session objects
   */
  async getSessionsForProgram(clientId, programId) {
    try {
      const clientSessionsQuery = query(
        collection(firestore, 'client_sessions'),
        where('client_id', '==', clientId),
        where('program_id', '==', programId),
        orderBy('date_timestamp', 'asc')
      );
      
      const snapshot = await getDocs(clientSessionsQuery);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('❌ Error getting sessions for program:', error);
      throw error;
    }
  }

  /**
   * Format date as YYYY-MM-DD string for storage
   * 
   * @param {Date} date - Date object
   * @returns {string} Formatted date string
   */
  formatDateForStorage(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Parse date string from storage to Date object
   * 
   * @param {string} dateStr - Date string in YYYY-MM-DD format
   * @returns {Date} Date object
   */
  parseDateFromStorage(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
}

export default new ClientSessionService();

