import apiClient from '../utils/apiClient';

const BASE = (clientId, assignmentId) =>
  `/creator/clients/${clientId}/nutrition/assignments/${assignmentId}/content`;

// Cache assignment → clientId to avoid repeated lookups (max 100 entries)
const CACHE_MAX_SIZE = 100;
const assignmentClientCache = new Map();

async function resolveClientId(assignmentId) {
  if (assignmentClientCache.has(assignmentId)) {
    return assignmentClientCache.get(assignmentId);
  }
  // Fetch the assignment doc directly from Firestore via the API
  // nutrition_assignments docs have a userId field = clientId
  // Use the creator's client list approach: query the assignment
  // The assignment has userId which is the clientId
  const res = await apiClient.get(`/creator/nutrition/assignments/${assignmentId}`);
  const clientId = res.data?.clientId ?? res.data?.userId ?? null;
  if (clientId) {
    if (assignmentClientCache.size >= CACHE_MAX_SIZE) {
      const firstKey = assignmentClientCache.keys().next().value;
      assignmentClientCache.delete(firstKey);
    }
    assignmentClientCache.set(assignmentId, clientId);
  }
  return clientId;
}

class ClientNutritionPlanContentService {
  async getByAssignmentId(assignmentId, clientId = null) {
    if (!assignmentId) return null;
    try {
      const cid = clientId ?? await resolveClientId(assignmentId);
      const url = cid
        ? BASE(cid, assignmentId)
        : `/creator/nutrition/assignments/${assignmentId}/content`;
      const res = await apiClient.get(url);
      return res.data ?? null;
    } catch (err) {
      if (err?.status === 404) return null;
      console.error('[clientNutritionPlanContentService] getByAssignmentId:', err);
      return null;
    }
  }

  async setFromLibrary(assignmentId, sourcePlanId, planData, clientId = null) {
    if (!assignmentId || !sourcePlanId) throw new Error('assignmentId and sourcePlanId required');
    const body = {
      source_plan_id: sourcePlanId,
      name: planData.name ?? '',
      description: planData.description ?? '',
      daily_calories: planData.daily_calories ?? null,
      daily_protein_g: planData.daily_protein_g ?? null,
      daily_carbs_g: planData.daily_carbs_g ?? null,
      daily_fat_g: planData.daily_fat_g ?? null,
      categories: Array.isArray(planData.categories) ? planData.categories : [],
    };

    const cid = clientId ?? await resolveClientId(assignmentId);
    if (cid) {
      await apiClient.put(BASE(cid, assignmentId), body);
    } else {
      await apiClient.put(`/creator/nutrition/assignments/${assignmentId}/content`, body);
    }
  }

  async update(assignmentId, data, clientId = null) {
    if (!assignmentId) throw new Error('assignmentId required');
    const { source_plan_id: _spid, assignment_id: _aid, ...rest } = data;

    const cid = clientId ?? await resolveClientId(assignmentId);
    if (cid) {
      await apiClient.put(BASE(cid, assignmentId), rest);
    } else {
      await apiClient.put(`/creator/nutrition/assignments/${assignmentId}/content`, rest);
    }
  }

  async deleteByAssignmentId(assignmentId, clientId = null) {
    if (!assignmentId) return;
    try {
      const cid = clientId ?? await resolveClientId(assignmentId);
      if (!cid) return;
      await apiClient.put(BASE(cid, assignmentId), { categories: [] });
    } catch (err) {
      if (err?.status === 404) return;
      console.error('[clientNutritionPlanContentService] deleteByAssignmentId:', err);
      throw err;
    }
  }

  async getAssignmentIdsBySourcePlanId(planId) {
    if (!planId) return [];
    try {
      const res = await apiClient.get('/creator/nutrition/assignments-by-plan', {
        params: { sourcePlanId: planId },
      });
      return (res.data ?? []).map((a) => a.id ?? a.assignmentId).filter(Boolean);
    } catch (err) {
      console.error('[clientNutritionPlanContentService] getAssignmentIdsBySourcePlanId:', err);
      return [];
    }
  }
}

export default new ClientNutritionPlanContentService();
