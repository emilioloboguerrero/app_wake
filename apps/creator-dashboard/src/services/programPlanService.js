import apiClient from '../utils/apiClient';

class ProgramPlanService {
  async getCalendar(programId, month) {
    const res = await apiClient.get(
      `/creator/programs/${programId}/calendar`,
      { params: { month } }
    );
    return res.data;
  }

  async assignPlan(programId, planId, startWeekKey) {
    const res = await apiClient.post(
      `/creator/programs/${programId}/assign-plan`,
      { planId, startWeekKey }
    );
    return res.data;
  }

  async removePlan(programId, planId) {
    const res = await apiClient.delete(
      `/creator/programs/${programId}/remove-plan/${planId}`
    );
    return res.data;
  }
}

export default new ProgramPlanService();
