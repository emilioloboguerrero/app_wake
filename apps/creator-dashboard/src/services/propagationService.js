import apiClient from '../utils/apiClient';

class PropagationService {
  async findAffectedByLibrarySession(_creatorId, librarySessionId) {
    const result = await apiClient.get(
      `/creator/library/sessions/${librarySessionId}/affected`
    );
    const data = result?.data ?? {};
    return {
      affectedUserIds: data.affectedUserIds ?? [],
      programCount: data.programCount ?? 0,
    };
  }

  async getAffectedDetailsForLibrarySession(_creatorId, librarySessionId) {
    const result = await apiClient.get(
      `/creator/library/sessions/${librarySessionId}/affected?details=true`
    );
    const data = result?.data ?? {};
    return {
      users: data.users ?? [],
      programs: data.programs ?? [],
      programCount: data.programCount ?? 0,
    };
  }

  async propagateLibrarySession(_creatorId, librarySessionId) {
    const result = await apiClient.post(
      `/creator/library/sessions/${librarySessionId}/propagate`,
      {}
    );
    const data = result?.data ?? {};
    return {
      propagated: data.updatedCount ?? 0,
      errors: [],
    };
  }

  async findAffectedByPlan(planId) {
    const result = await apiClient.get(`/creator/plans/${planId}/affected`);
    const data = result?.data ?? {};
    return {
      affectedUserIds: data.affectedUserIds ?? [],
      programCount: data.programCount ?? 0,
    };
  }

  async getAffectedUsersWithDetailsByPlan(planId) {
    const result = await apiClient.get(`/creator/plans/${planId}/affected?details=true`);
    return result?.data?.users ?? [];
  }

  async findAffectedByNutritionPlan(planId) {
    const result = await apiClient.get(`/creator/nutrition/plans/${planId}/affected`);
    const data = result?.data ?? {};
    return {
      affectedUserIds: data.affectedUserIds ?? [],
      clientCount: data.clientCount ?? 0,
    };
  }

  async getAffectedUsersWithDetailsByNutritionPlan(planId) {
    const result = await apiClient.get(`/creator/nutrition/plans/${planId}/affected?details=true`);
    return result?.data?.users ?? [];
  }

  async propagatePlan(planId) {
    const result = await apiClient.post(`/creator/plans/${planId}/propagate`, {});
    const data = result?.data ?? {};
    return {
      propagated: data.updatedCount ?? 0,
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
