/**
 * Client Nutrition Plan Content Service
 * Copy-on-edit: stores a full copy of a nutrition plan per assignment.
 * Collection: client_nutrition_plan_content (doc id = assignmentId)
 * Single source of truth: creator_nutrition_library/{creatorId}/plans/{planId}
 * Copies store source_plan_id for propagation (delete copies when library plan is propagated).
 */
import { firestore } from '../config/firebase';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { serverTimestamp } from 'firebase/firestore';

const COLLECTION = 'client_nutrition_plan_content';

class ClientNutritionPlanContentService {
  /**
   * Get client nutrition plan content (copy) for an assignment if it exists.
   * @param {string} assignmentId - nutrition_assignments doc id
   * @returns {Promise<Object|null>} Plan-shaped object { name, description, daily_calories, categories, ... } or null
   */
  async getByAssignmentId(assignmentId) {
    if (!assignmentId) return null;
    try {
      const ref = doc(firestore, COLLECTION, assignmentId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() };
    } catch (err) {
      console.error('[clientNutritionPlanContentService] getByAssignmentId:', err);
      return null;
    }
  }

  /**
   * Create or overwrite copy from library plan (copy-on-first-edit).
   * @param {string} assignmentId - nutrition_assignments doc id
   * @param {string} sourcePlanId - library plan id (for propagation)
   * @param {Object} planData - Full plan from getPlanById (name, description, categories, daily_*, etc.)
   */
  async setFromLibrary(assignmentId, sourcePlanId, planData) {
    if (!assignmentId || !sourcePlanId) throw new Error('assignmentId and sourcePlanId required');
    const ref = doc(firestore, COLLECTION, assignmentId);
    const payload = {
      source_plan_id: sourcePlanId,
      assignment_id: assignmentId,
      name: planData.name ?? '',
      description: planData.description ?? '',
      daily_calories: planData.daily_calories ?? null,
      daily_protein_g: planData.daily_protein_g ?? null,
      daily_carbs_g: planData.daily_carbs_g ?? null,
      daily_fat_g: planData.daily_fat_g ?? null,
      categories: Array.isArray(planData.categories) ? planData.categories : [],
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    };
    await setDoc(ref, payload);
  }

  /**
   * Update client nutrition plan content (partial or full plan fields).
   * @param {string} assignmentId - nutrition_assignments doc id
   * @param {Object} data - Plan fields to merge (name, description, daily_*, categories, etc.)
   */
  async update(assignmentId, data) {
    if (!assignmentId) throw new Error('assignmentId required');
    const ref = doc(firestore, COLLECTION, assignmentId);
    const { source_plan_id, assignment_id, ...rest } = data;
    await updateDoc(ref, {
      ...rest,
      updated_at: serverTimestamp(),
    });
  }

  /**
   * Delete client nutrition plan content for an assignment (revert to library plan).
   * @param {string} assignmentId - nutrition_assignments doc id
   */
  async deleteByAssignmentId(assignmentId) {
    if (!assignmentId) return;
    try {
      const ref = doc(firestore, COLLECTION, assignmentId);
      await deleteDoc(ref);
    } catch (err) {
      console.error('[clientNutritionPlanContentService] deleteByAssignmentId:', err);
      throw err;
    }
  }

  /**
   * Get all assignment doc ids that have a copy for this library plan (for propagation).
   * @param {string} planId - library plan id
   * @returns {Promise<string[]>} assignmentIds
   */
  async getAssignmentIdsBySourcePlanId(planId) {
    if (!planId) return [];
    try {
      const ref = collection(firestore, COLLECTION);
      const q = query(ref, where('source_plan_id', '==', planId));
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.id);
    } catch (err) {
      if (err?.code === 'failed-precondition' || err?.message?.includes('index')) {
        console.warn('[clientNutritionPlanContentService] query needs index on source_plan_id');
        const snap = await getDocs(collection(firestore, COLLECTION));
        return snap.docs.filter((d) => d.data().source_plan_id === planId).map((d) => d.id);
      }
      throw err;
    }
  }
}

export default new ClientNutritionPlanContentService();
