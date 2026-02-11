/**
 * Service for creator measure/objective presets.
 * Presets store: name, measures, objectives, customMeasureLabels, customObjectiveLabels.
 * Stored at: creator_libraries/{creatorId}/measure_objective_presets
 */
import { firestore } from '../config/firebase';
import {
  collection,
  getDocs,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';

const PRESETS_COLLECTION = 'measure_objective_presets';

/**
 * @param {string} creatorId
 * @returns {Promise<Array<{ id: string, name: string, measures: string[], objectives: string[], customMeasureLabels: Object, customObjectiveLabels: Object, created_at?, updated_at? }>>}
 */
async function list(creatorId) {
  if (!creatorId) return [];
  const ref = collection(firestore, 'creator_libraries', creatorId, PRESETS_COLLECTION);
  const snapshot = await getDocs(ref);
  const list = snapshot.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    measures: Array.isArray(d.data().measures) ? d.data().measures : [],
    objectives: Array.isArray(d.data().objectives) ? d.data().objectives : [],
    customMeasureLabels: typeof d.data().customMeasureLabels === 'object' && d.data().customMeasureLabels
      ? d.data().customMeasureLabels
      : {},
    customObjectiveLabels: typeof d.data().customObjectiveLabels === 'object' && d.data().customObjectiveLabels
      ? d.data().customObjectiveLabels
      : {},
  }));
  list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
  return list;
}

/**
 * @param {string} creatorId
 * @param {string} presetId
 * @returns {Promise<{ id: string, name: string, measures: string[], objectives: string[], customMeasureLabels: Object, customObjectiveLabels: Object } | null>}
 */
async function get(creatorId, presetId) {
  if (!creatorId || !presetId) return null;
  const ref = doc(firestore, 'creator_libraries', creatorId, PRESETS_COLLECTION, presetId);
  const snap = await ref.get();
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    id: snap.id,
    name: data.name || '',
    measures: Array.isArray(data.measures) ? data.measures : [],
    objectives: Array.isArray(data.objectives) ? data.objectives : [],
    customMeasureLabels: typeof data.customMeasureLabels === 'object' && data.customMeasureLabels ? data.customMeasureLabels : {},
    customObjectiveLabels: typeof data.customObjectiveLabels === 'object' && data.customObjectiveLabels ? data.customObjectiveLabels : {},
  };
}

/**
 * @param {string} creatorId
 * @param {{ name: string, measures: string[], objectives: string[], customMeasureLabels?: Object, customObjectiveLabels?: Object }} data
 * @returns {Promise<{ id: string }>}
 */
async function create(creatorId, data) {
  if (!creatorId || !data || !data.name?.trim()) {
    throw new Error('Creator ID and preset name are required');
  }
  const ref = collection(firestore, 'creator_libraries', creatorId, PRESETS_COLLECTION);
  const docRef = await addDoc(ref, {
    name: (data.name || '').trim(),
    measures: Array.isArray(data.measures) ? data.measures : [],
    objectives: Array.isArray(data.objectives) ? data.objectives : [],
    customMeasureLabels: data.customMeasureLabels && typeof data.customMeasureLabels === 'object' ? data.customMeasureLabels : {},
    customObjectiveLabels: data.customObjectiveLabels && typeof data.customObjectiveLabels === 'object' ? data.customObjectiveLabels : {},
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });
  return { id: docRef.id };
}

/**
 * @param {string} creatorId
 * @param {string} presetId
 * @param {{ name?: string, measures?: string[], objectives?: string[], customMeasureLabels?: Object, customObjectiveLabels?: Object }} data
 */
async function update(creatorId, presetId, data) {
  if (!creatorId || !presetId) throw new Error('Creator ID and preset ID are required');
  const ref = doc(firestore, 'creator_libraries', creatorId, PRESETS_COLLECTION, presetId);
  const updateData = { updated_at: serverTimestamp() };
  if (data.name !== undefined) updateData.name = (data.name || '').trim();
  if (data.measures !== undefined) updateData.measures = Array.isArray(data.measures) ? data.measures : [];
  if (data.objectives !== undefined) updateData.objectives = Array.isArray(data.objectives) ? data.objectives : [];
  if (data.customMeasureLabels !== undefined) updateData.customMeasureLabels = data.customMeasureLabels && typeof data.customMeasureLabels === 'object' ? data.customMeasureLabels : {};
  if (data.customObjectiveLabels !== undefined) updateData.customObjectiveLabels = data.customObjectiveLabels && typeof data.customObjectiveLabels === 'object' ? data.customObjectiveLabels : {};
  await updateDoc(ref, updateData);
}

/**
 * @param {string} creatorId
 * @param {string} presetId
 */
async function remove(creatorId, presetId) {
  if (!creatorId || !presetId) throw new Error('Creator ID and preset ID are required');
  const ref = doc(firestore, 'creator_libraries', creatorId, PRESETS_COLLECTION, presetId);
  await deleteDoc(ref);
}

const measureObjectivePresetsService = {
  list,
  get,
  create,
  update,
  remove,
};

export default measureObjectivePresetsService;
