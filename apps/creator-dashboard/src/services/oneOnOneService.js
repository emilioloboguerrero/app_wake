import apiClient from '../utils/apiClient';

class OneOnOneService {
  async lookupUserByEmailOrUsername(emailOrUsername) {
    const res = await apiClient.post('/creator/clients/lookup', {
      emailOrUsername: emailOrUsername.trim(),
    });
    return res.data;
  }

  async getClientsByCreator() {
    const res = await apiClient.get('/creator/clients');
    return res.data;
  }

  async addClient(_creatorId, clientUserId) {
    const res = await apiClient.post('/creator/clients', {
      userId: clientUserId,
    });
    return res.data;
  }

  async addClientByEmail(email) {
    const res = await apiClient.post('/creator/clients/invite', { email });
    return res.data;
  }

  async addClientToProgram(_creatorId, clientUserId, programId) {
    const client = await this.addClient(_creatorId, clientUserId);
    const clientProgramService = (await import('./clientProgramService')).default;
    await clientProgramService.assignProgramToClient(programId, clientUserId);
    return client;
  }

  async getClientById(clientId, { userId } = {}) {
    const params = userId ? { userId } : undefined;
    const res = await apiClient.get(`/creator/clients/${clientId}`, { params });
    return res.data;
  }

  async deleteClient(clientId) {
    await apiClient.delete(`/creator/clients/${clientId}`);
  }

  async addCourseToClient(_creatorId, clientUserId, programId) {
    const clientProgramService = (await import('./clientProgramService')).default;
    await clientProgramService.assignProgramToClient(programId, clientUserId);
  }

  async removeCourseFromClient(_creatorId, clientUserId, programId) {
    const clientProgramService = (await import('./clientProgramService')).default;
    await clientProgramService.deleteClientProgram(programId, clientUserId);
  }

  async getClientUserData(clientId) {
    const res = await apiClient.get(`/creator/clients/${clientId}`);
    const d = res.data;
    return {
      name: d.displayName || '',
      username: d.username || '',
      email: d.email || '',
      age: d.age ?? null,
      gender: d.gender || '',
      country: d.country || '',
      city: d.city || '',
      height: d.height ?? null,
      initialWeight: d.weight ?? null,
    };
  }
}

export default new OneOnOneService();
