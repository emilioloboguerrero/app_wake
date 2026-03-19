import apiClient from '../utils/apiClient';

// creatorId args are accepted for call-site compatibility but unused — the API infers identity from the auth token.

async function list(_creatorId) {
  const res = await apiClient.get('/creator/library/objective-presets');
  return res.data ?? [];
}

async function get(_creatorId, presetId) {
  if (!presetId) return null;
  try {
    const res = await apiClient.get('/creator/library/objective-presets');
    const all = res.data ?? [];
    return all.find((p) => p.id === presetId) ?? null;
  } catch (err) {
    console.error('[measureObjectivePresetsService] get:', err);
    return null;
  }
}

async function create(_creatorId, data) {
  if (!data?.name?.trim()) throw new Error('Preset name is required');
  const res = await apiClient.post('/creator/library/objective-presets', {
    name: data.name.trim(),
    measures: Array.isArray(data.measures) ? data.measures : [],
    objectives: Array.isArray(data.objectives) ? data.objectives : [],
    customMeasureLabels: (data.customMeasureLabels && typeof data.customMeasureLabels === 'object') ? data.customMeasureLabels : {},
    customObjectiveLabels: (data.customObjectiveLabels && typeof data.customObjectiveLabels === 'object') ? data.customObjectiveLabels : {},
  });
  return { id: res.data?.id };
}

async function update(_creatorId, presetId, data) {
  if (!presetId) throw new Error('Preset ID is required');
  const payload = {};
  if (data.name !== undefined) payload.name = data.name.trim();
  if (data.measures !== undefined) payload.measures = Array.isArray(data.measures) ? data.measures : [];
  if (data.objectives !== undefined) payload.objectives = Array.isArray(data.objectives) ? data.objectives : [];
  if (data.customMeasureLabels !== undefined) {
    payload.customMeasureLabels = (data.customMeasureLabels && typeof data.customMeasureLabels === 'object') ? data.customMeasureLabels : {};
  }
  if (data.customObjectiveLabels !== undefined) {
    payload.customObjectiveLabels = (data.customObjectiveLabels && typeof data.customObjectiveLabels === 'object') ? data.customObjectiveLabels : {};
  }
  await apiClient.patch(`/creator/library/objective-presets/${presetId}`, payload);
}

async function remove(_creatorId, presetId) {
  if (!presetId) throw new Error('Preset ID is required');
  await apiClient.delete(`/creator/library/objective-presets/${presetId}`);
}

const measureObjectivePresetsService = { list, get, create, update, remove };
export default measureObjectivePresetsService;
