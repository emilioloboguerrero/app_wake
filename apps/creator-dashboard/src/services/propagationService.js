// Propagation Service
// Handles propagating library/plan changes to assigned users
// - Propagate: replace all client copies with fresh content (removes personalizations)
// - Don't propagate: keep client copies; new assignments get updated content
import { firestore } from '../config/firebase';
import {
  collection,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { getUser } from './firestoreService';
import clientSessionContentService from './clientSessionContentService';
import clientPlanContentService from './clientPlanContentService';
import clientNutritionPlanContentService from './clientNutritionPlanContentService';
import * as nutritionDb from './nutritionFirestoreService';

class PropagationService {
  /**
   * Find users affected by a library session (have personalized copies).
   * @param {string} creatorId - Creator uid
   * @param {string} librarySessionId - Library session id
   * @returns {Promise<{ affectedUserIds: string[], clientSessionContentIds: string[], clientPlanContentDocIds: string[] }>}
   */
  async findAffectedByLibrarySession(creatorId, librarySessionId) {
    const affectedUserIds = new Set();
    const clientSessionContentIds = [];
    const clientPlanContentDocIds = [];

    try {
      // 1. client_session_content where source_session_id === librarySessionId
      try {
        const cscRef = collection(firestore, 'client_session_content');
        const cscQuery = query(cscRef, where('source_session_id', '==', librarySessionId));
        const cscSnap = await getDocs(cscQuery);
        cscSnap.docs.forEach((d) => {
          clientSessionContentIds.push(d.id);
          // clientSessionId format: {clientId}_{dateStr}_{sessionId}
          const parts = d.id.split('_');
          if (parts.length >= 3) {
            affectedUserIds.add(parts[0]);
          }
        });
      } catch (err) {
        if (err?.code === 'failed-precondition' || err?.message?.includes('index')) {
          console.warn('[propagationService] client_session_content query needs index on source_session_id');
        } else {
          throw err;
        }
      }

      // 2. client_plan_content: scan docs where sessions have librarySessionRef
      const cpcRef = collection(firestore, 'client_plan_content');
      const cpcSnap = await getDocs(cpcRef);
      for (const docSnap of cpcSnap.docs) {
        const data = docSnap.data();
        const docId = docSnap.id;
        // docId = clientId_programId_weekKey
        const parts = docId.split('_');
        if (parts.length < 3) continue;

        const sessionsRef = collection(firestore, 'client_plan_content', docId, 'sessions');
        const sessionsSnap = await getDocs(sessionsRef);
        let hasSession = false;
        for (const sDoc of sessionsSnap.docs) {
          const sData = sDoc.data();
          if (sData.librarySessionRef === librarySessionId) {
            hasSession = true;
            break;
          }
        }
        if (hasSession) {
          clientPlanContentDocIds.push(docId);
          affectedUserIds.add(parts[0]);
        }
      }
    } catch (error) {
      console.error('[propagationService] findAffectedByLibrarySession:', error);
      throw error;
    }

    return {
      affectedUserIds: Array.from(affectedUserIds),
      clientSessionContentIds,
      clientPlanContentDocIds
    };
  }

  /**
   * Get affected users with display names for a library session.
   * @param {string} creatorId - Creator uid
   * @param {string} librarySessionId - Library session id
   * @returns {Promise<{ userId: string, displayName: string }[]>}
   */
  async getAffectedUsersWithDetailsByLibrarySession(creatorId, librarySessionId) {
    const { affectedUserIds } = await this.findAffectedByLibrarySession(creatorId, librarySessionId);
    const users = await Promise.all(
      affectedUserIds.map(async (userId) => {
        const data = await getUser(userId);
        return {
          userId,
          displayName: data?.displayName || data?.name || data?.email || userId
        };
      })
    );
    return users;
  }

  /**
   * Get affected users with display names for a plan.
   * @param {string} planId - Plan id
   * @returns {Promise<{ userId: string, displayName: string }[]>}
   */
  async getAffectedUsersWithDetailsByPlan(planId) {
    const { affectedUserIds } = await this.findAffectedByPlan(planId);
    const users = await Promise.all(
      affectedUserIds.map(async (userId) => {
        const data = await getUser(userId);
        return {
          userId,
          displayName: data?.displayName || data?.name || data?.email || userId
        };
      })
    );
    return users;
  }

  /**
   * Propagate library session changes to all affected users.
   * Deletes client_session_content and client_plan_content copies so users resolve from plan/library.
   * @param {string} creatorId - Creator uid
   * @param {string} librarySessionId - Library session id
   * @returns {Promise<{ propagated: number, errors: string[] }>}
   */
  async propagateLibrarySession(creatorId, librarySessionId) {
    const { clientSessionContentIds, clientPlanContentDocIds } = await this.findAffectedByLibrarySession(
      creatorId,
      librarySessionId
    );
    const errors = [];
    let propagated = 0;

    // Delete client_session_content
    for (const id of clientSessionContentIds) {
      try {
        await clientSessionContentService.deleteClientSessionContent(id);
        propagated++;
      } catch (err) {
        errors.push(`client_session_content ${id}: ${err?.message || err}`);
      }
    }

    // Delete client_plan_content docs (full week revert)
    for (const docId of clientPlanContentDocIds) {
      try {
        const [clientId, programId, weekKey] = docId.split('_');
        if (clientId && programId && weekKey) {
          await clientPlanContentService.deleteClientPlanContent(clientId, programId, weekKey);
          propagated++;
        }
      } catch (err) {
        errors.push(`client_plan_content ${docId}: ${err?.message || err}`);
      }
    }

    return { propagated, errors };
  }

  /**
   * Find users affected by a plan (have client_plan_content with source_plan_id).
   * @param {string} planId - Plan id
   * @returns {Promise<{ affectedUserIds: string[], clientPlanContentDocIds: string[] }>}
   */
  async findAffectedByPlan(planId) {
    const affectedUserIds = new Set();
    const clientPlanContentDocIds = [];

    try {
      const cpcRef = collection(firestore, 'client_plan_content');
      let cpcQuery;
      try {
        cpcQuery = query(cpcRef, where('source_plan_id', '==', planId));
      } catch (err) {
        if (err?.code === 'failed-precondition' || err?.message?.includes('index')) {
          console.warn('[propagationService] client_plan_content query needs index on source_plan_id');
          const snap = await getDocs(cpcRef);
          snap.docs.forEach((d) => {
            if (d.data().source_plan_id === planId) {
              clientPlanContentDocIds.push(d.id);
              const parts = d.id.split('_');
              if (parts.length >= 3) affectedUserIds.add(parts[0]);
            }
          });
          return {
            affectedUserIds: Array.from(affectedUserIds),
            clientPlanContentDocIds
          };
        }
        throw err;
      }
      const cpcSnap = await getDocs(cpcQuery);
      cpcSnap.docs.forEach((d) => {
        clientPlanContentDocIds.push(d.id);
        const parts = d.id.split('_');
        if (parts.length >= 3) affectedUserIds.add(parts[0]);
      });
    } catch (error) {
      console.error('[propagationService] findAffectedByPlan:', error);
      throw error;
    }

    return {
      affectedUserIds: Array.from(affectedUserIds),
      clientPlanContentDocIds
    };
  }

  /**
   * Propagate plan changes to all affected users.
   * Deletes client_plan_content copies so users resolve from plan.
   * @param {string} planId - Plan id
   * @returns {Promise<{ propagated: number, errors: string[] }>}
   */
  async propagatePlan(planId) {
    const { clientPlanContentDocIds } = await this.findAffectedByPlan(planId);
    const errors = [];
    let propagated = 0;

    for (const docId of clientPlanContentDocIds) {
      try {
        const parts = docId.split('_');
        if (parts.length >= 3) {
          const [clientId, programId, weekKey] = parts;
          await clientPlanContentService.deleteClientPlanContent(clientId, programId, weekKey);
          propagated++;
        }
      } catch (err) {
        errors.push(`client_plan_content ${docId}: ${err?.message || err}`);
      }
    }

    return { propagated, errors };
  }

  /**
   * Find users/assignments affected by a nutrition plan (have client_nutrition_plan_content with source_plan_id).
   * @param {string} planId - Library nutrition plan id
   * @returns {Promise<{ affectedUserIds: string[], assignmentIds: string[] }>}
   */
  async findAffectedByNutritionPlan(planId) {
    const affectedUserIds = new Set();
    const assignmentIds = await clientNutritionPlanContentService.getAssignmentIdsBySourcePlanId(planId);
    for (const assignmentId of assignmentIds) {
      try {
        const assignment = await nutritionDb.getAssignmentById(assignmentId);
        if (assignment?.userId) affectedUserIds.add(assignment.userId);
      } catch (_) {
        /* skip */
      }
    }
    return {
      affectedUserIds: Array.from(affectedUserIds),
      assignmentIds
    };
  }

  /**
   * Get affected users with display names for a nutrition plan.
   * @param {string} planId - Library nutrition plan id
   * @returns {Promise<{ userId: string, displayName: string }[]>}
   */
  async getAffectedUsersWithDetailsByNutritionPlan(planId) {
    const { affectedUserIds } = await this.findAffectedByNutritionPlan(planId);
    const users = await Promise.all(
      affectedUserIds.map(async (userId) => {
        const data = await getUser(userId);
        return {
          userId,
          displayName: data?.displayName || data?.name || data?.email || userId
        };
      })
    );
    return users;
  }

  /**
   * Propagate nutrition plan changes to all affected users.
   * Deletes client_nutrition_plan_content copies and updates each assignment's plan snapshot
   * so the PWA can resolve the current library plan without reading creator_nutrition_library.
   * @param {string} planId - Library nutrition plan id
   * @param {string} creatorId - Creator uid (to fetch library plan)
   * @returns {Promise<{ propagated: number, errors: string[] }>}
   */
  async propagateNutritionPlan(planId, creatorId) {
    const { assignmentIds } = await this.findAffectedByNutritionPlan(planId);
    const errors = [];
    let propagated = 0;

    let planSnapshot = null;
    if (creatorId) {
      try {
        const lib = await nutritionDb.getPlanById(creatorId, planId);
        if (lib) {
          planSnapshot = {
            name: lib.name,
            description: lib.description,
            daily_calories: lib.daily_calories,
            daily_protein_g: lib.daily_protein_g,
            daily_carbs_g: lib.daily_carbs_g,
            daily_fat_g: lib.daily_fat_g,
            categories: lib.categories,
          };
        }
      } catch (e) {
        console.warn('[propagationService] could not load library plan for snapshot:', e?.message);
      }
    }

    for (const assignmentId of assignmentIds) {
      try {
        await clientNutritionPlanContentService.deleteByAssignmentId(assignmentId);
        if (planSnapshot) {
          await nutritionDb.updateAssignment(assignmentId, { plan: planSnapshot });
        }
        propagated++;
      } catch (err) {
        errors.push(`client_nutrition_plan_content/assignment ${assignmentId}: ${err?.message || err}`);
      }
    }
    return { propagated, errors };
  }
}

export default new PropagationService();
