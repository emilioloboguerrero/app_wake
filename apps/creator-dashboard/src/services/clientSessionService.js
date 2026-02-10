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
   * @param {string} programId - Program ID (the container/bin)
   * @param {string} planId - Plan ID (where the session content comes from)
   * @param {string} sessionId - Session ID
   * @param {Date} date - Date to assign session to
   * @param {string} moduleId - Optional module ID
   * @param {Object} metadata - Optional metadata (e.g., notes, customizations)
   * @returns {Promise<string>} Client session document ID
   */
  /**
   * Remove all client_sessions for a (client, program, date). Ensures one session per day per program when assigning.
   */
  async removeSessionsForDateAndProgram(clientId, programId, date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    const sessions = await this.getClientSessions(clientId, startOfDay, endOfDay);
    const toDelete = sessions.filter((s) => s.program_id === programId);
    for (const s of toDelete) {
      await deleteDoc(doc(firestore, 'client_sessions', s.id));
    }
    if (toDelete.length > 0) {
      console.log('[clientSessionService] removeSessionsForDateAndProgram: removed', toDelete.length, 'for', clientId, programId, this.formatDateForStorage(date));
    }
  }

  /**
   * Delete all client_sessions for a (client, program) in a given week (e.g. when removing plan from week).
   */
  async deleteClientSessionsForWeek(clientId, programId, weekKey) {
    const { getWeekDates } = await import('../utils/weekCalculation');
    const { start, end } = getWeekDates(weekKey);
    const startDate = new Date(start);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);
    const sessions = await this.getClientSessions(clientId, startDate, endDate);
    const toDelete = sessions.filter((s) => s.program_id === programId);
    for (const s of toDelete) {
      await deleteDoc(doc(firestore, 'client_sessions', s.id));
    }
    if (toDelete.length > 0) {
      console.log('[clientSessionService] deleteClientSessionsForWeek: removed', toDelete.length, 'for', clientId, programId, weekKey);
    }
  }

  async assignSessionToDate(clientId, programId, planId, sessionId, date, moduleId = null, metadata = {}) {
    await this.removeSessionsForDateAndProgram(clientId, programId, date);

    const dateStr = this.formatDateForStorage(date);
    const sessionDate = new Date(date);
    sessionDate.setHours(0, 0, 0, 0);

    const clientSessionData = {
      client_id: clientId,
      program_id: programId,
      plan_id: planId ?? null,
      session_id: sessionId,
      module_id: moduleId ?? null,
      date: dateStr,
      date_timestamp: sessionDate,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      ...metadata
    };

    const clientSessionId = `${clientId}_${dateStr}_${sessionId}`;
    console.log('[clientSessionService] assignSessionToDate: writing', { docId: clientSessionId, client_id: clientId, date: dateStr, session_id: sessionId });
    await setDoc(doc(firestore, 'client_sessions', clientSessionId), clientSessionData);
    console.log('[clientSessionService] assignSessionToDate: done', clientSessionId);
    return clientSessionId;
  }

  /**
   * Get a single client_sessions doc by id.
   * @param {string} clientSessionId - client_sessions document id
   * @returns {Promise<Object|null>}
   */
  async getClientSessionById(clientSessionId) {
    try {
      const snap = await getDoc(doc(firestore, 'client_sessions', clientSessionId));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() };
    } catch (error) {
      console.error('[clientSessionService] getClientSessionById:', error);
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
    if (!startDate || !endDate) {
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    console.log('[clientSessionService] getClientSessions: query', { clientId, start: startDate.toISOString(), end: endDate.toISOString() });

    const runIndexedQuery = async () => {
      const q = query(
        collection(firestore, 'client_sessions'),
        where('client_id', '==', clientId),
        where('date_timestamp', '>=', startDate),
        where('date_timestamp', '<=', endDate),
        orderBy('date_timestamp', 'asc')
      );
      const snapshot = await getDocs(q);
      const out = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      console.log('[clientSessionService] getClientSessions: indexed query ok', { count: out.length, ids: out.slice(0, 5).map(s => s.id), dates: out.slice(0, 5).map(s => s.date) });
      return out;
    };

    const runFallbackQuery = async () => {
      const q = query(
        collection(firestore, 'client_sessions'),
        where('client_id', '==', clientId)
      );
      const snapshot = await getDocs(q);
      const all = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      console.log('[clientSessionService] getClientSessions: fallback query got', all.length, 'docs for client');
      const filtered = all.filter((s) => {
        const ts = s.date_timestamp;
        const t = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
        if (!t) return false;
        const tMs = t.getTime();
        return tMs >= startDate.getTime() && tMs <= endDate.getTime();
      }).sort((a, b) => {
        const ta = a.date_timestamp?.toDate?.() ?? new Date(a.date_timestamp);
        const tb = b.date_timestamp?.toDate?.() ?? new Date(b.date_timestamp);
        return ta.getTime() - tb.getTime();
      });
      console.log('[clientSessionService] getClientSessions: fallback after date filter', { count: filtered.length, dates: filtered.map(s => s.date) });
      return filtered;
    };

    try {
      return await runIndexedQuery();
    } catch (error) {
      const needsIndex = error?.code === 'failed-precondition' || (error?.message && error.message.includes('index'));
      console.log('[clientSessionService] getClientSessions: indexed failed', { needsIndex, code: error?.code, message: error?.message?.slice(0, 120) });
      if (needsIndex) {
        console.warn('[clientSessionService] getClientSessions: using fallback (deploy firestore indexes for better performance)');
        try {
          return await runFallbackQuery();
        } catch (fallbackError) {
          console.error('[clientSessionService] getClientSessions fallback error:', fallbackError);
          throw fallbackError;
        }
      }
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


