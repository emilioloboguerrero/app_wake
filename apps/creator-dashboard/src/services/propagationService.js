import apiClient from '../utils/apiClient';

class PropagationService {
  async propagateLibrarySession(_creatorId, librarySessionId) {
    const result = await apiClient.post(
      `/creator/library/sessions/${librarySessionId}/propagate`,
      {}
    );
    const data = result?.data ?? {};
    return {
      propagated: data.copiesDeleted ?? 0,
      plansAffected: data.plansAffected ?? 0,
      errors: [],
    };
  }

  async propagatePlan(planId) {
    const result = await apiClient.post(`/creator/plans/${planId}/propagate`, {});
    const data = result?.data ?? {};
    return {
      propagated: data.copiesDeleted ?? 0,
      errors: [],
    };
  }

  async propagateNutritionPlan(planId) {
    const result = await apiClient.post(`/creator/nutrition/plans/${planId}/propagate`, {});
    const data = result?.data ?? {};
    return {
      propagated: data.clientsAffected ?? 0,
      errors: [],
    };
  }

}

export default new PropagationService();
