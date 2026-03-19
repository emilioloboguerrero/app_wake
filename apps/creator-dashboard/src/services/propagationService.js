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

  async getAffectedUsersWithDetailsByLibrarySession(_creatorId, librarySessionId) {
    throw new Error(
      `getAffectedUsersWithDetailsByLibrarySession: no API endpoint available yet for session ${librarySessionId}`
    );
  }

  async getAffectedUsersWithDetailsByPlan(planId) {
    throw new Error(
      `getAffectedUsersWithDetailsByPlan: no API endpoint available yet for plan ${planId}`
    );
  }

  async getAffectedUsersWithDetailsByNutritionPlan(planId) {
    throw new Error(
      `getAffectedUsersWithDetailsByNutritionPlan: no API endpoint available yet for plan ${planId}`
    );
  }
}

export default new PropagationService();
