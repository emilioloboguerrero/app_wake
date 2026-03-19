import apiClient from '../utils/apiClient';

const BASE = (clientId, assignmentId) =>
  `/creator/clients/${clientId}/nutrition/assignments/${assignmentId}/content`;

// Cache assignment → clientId to avoid repeated lookups
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
  if (clientId) assignmentClientCache.set(assignmentId, clientId);
  return clientId;
}

class ClientNutritionPlanContentService {
  async getByAssignmentId(assignmentId, clientId = null) {
    if (!assignmentId) return null;
    try {
      const cid = clientId ?? await resolveClientId(assignmentId);
      if (!cid) return null;
      const res = await apiClient.get(BASE(cid, assignmentId));
      return res.data ?? null;
    } catch (err) {
      if (err?.status === 404) return null;
      console.error('[clientNutritionPlanContentService] getByAssignmentId:', err);
      return null;
    }
  }

  async setFromLibrary(assignmentId, sourcePlanId, planData, clientId = null) {
    if (!assignmentId || !sourcePlanId) throw new Error('assignmentId and sourcePlanId required');
    const cid = clientId ?? await resolveClientId(assignmentId);
    if (!cid) throw new Error('Could not resolve clientId for assignment');

    await apiClient.put(BASE(cid, assignmentId), {
      source_plan_id: sourcePlanId,
      name: planData.name ?? '',
      description: planData.description ?? '',
      daily_calories: planData.daily_calories ?? null,
      daily_protein_g: planData.daily_protein_g ?? null,
      daily_carbs_g: planData.daily_carbs_g ?? null,
      daily_fat_g: planData.daily_fat_g ?? null,
      categories: Array.isArray(planData.categories) ? planData.categories : [],
    });
  }

  async update(assignmentId, data, clientId = null) {
    if (!assignmentId) throw new Error('assignmentId required');
    const cid = clientId ?? await resolveClientId(assignmentId);
    if (!cid) throw new Error('Could not resolve clientId for assignment');

    const { source_plan_id: _spid, assignment_id: _aid, ...rest } = data;
    await apiClient.put(BASE(cid, assignmentId), rest);
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
