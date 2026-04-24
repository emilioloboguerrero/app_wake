import { useState, useRef, useCallback, useEffect } from 'react';
import logger from '../utils/logger';

const DEBOUNCE_MS = 600;

const parseIntensityForDisplay = (value) => {
  if (!value || value === null || value === undefined || value === '') return '';
  const strValue = String(value);
  if (strValue.includes('/10')) return strValue.replace('/10', '').trim();
  return strValue;
};

const formatRepsValue = (value) => {
  if (typeof value !== 'string') return '';
  // Preserve AMRAP literal (as-many-reps-as-possible). Case-insensitive.
  if (value.trim().toUpperCase() === 'AMRAP') return 'AMRAP';
  let cleaned = value.replace(/[^0-9-]/g, '');
  cleaned = cleaned.replace(/-+/g, '-');
  cleaned = cleaned.replace(/^-+/, '');
  if (cleaned === '') return '';
  const parts = cleaned.split('-');
  if (parts.length === 1) return parts[0];
  if (cleaned.endsWith('-') && parts.length === 2 && parts[1] === '') return cleaned;
  if (parts.length > 2) return `${parts[0]}-${parts[1]}`;
  return cleaned;
};

// Parses "7/7/7" or "7, 7, 7" or "7-7-7" into [7, 7, 7]. Returns [] on no valid segments.
const parseRepSequence = (value) => {
  if (Array.isArray(value)) {
    return value.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
  }
  if (typeof value !== 'string') return [];
  return value
    .split(/[\/,\-\s]+/)
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
};

const processFieldValue = (field, value) => {
  if (field === 'intensity') {
    const num = String(value).replace(/[^0-9]/g, '');
    if (num === '') return '';
    const n = parseInt(num, 10);
    if (n < 1) return '1';
    if (n > 10) return '10';
    return String(n);
  }
  if (field === 'reps') return formatRepsValue(value);
  if (field === 'duration') {
    const num = String(value).replace(/[^0-9]/g, '');
    if (num === '') return '';
    const n = parseInt(num, 10);
    return Number.isFinite(n) && n >= 0 ? String(n) : '';
  }
  if (field === 'rep_sequence') {
    const arr = parseRepSequence(value);
    return arr.length > 0 ? arr : null;
  }
  return value;
};

const toStorageValue = (field, processed) => {
  if (processed === '' || processed === null || processed === undefined) return null;
  if (field === 'intensity') return `${processed}/10`;
  if (field === 'duration') return Number(processed);
  if (field === 'rep_sequence') return Array.isArray(processed) ? processed : null;
  return processed;
};

const getObjectiveFields = (objectives) => {
  const filtered = (objectives || []).filter(o => o !== 'previous');
  return filtered.length > 0 ? filtered : ['reps', 'intensity'];
};

const isPendingId = (id) => typeof id === 'string' && id.startsWith('pending-');

/**
 * Per-exercise sets management hook.
 * Each ExpandableExerciseCard creates its own instance.
 */
const useExerciseSets = ({
  userId,
  sessionId,
  exerciseId,
  contentApi,
  objectives,
  isExpanded,
  showToast,
  onSetsChanged,
  initialDefaults,
  initialSets,
  isLibraryMode = false,
  globalActivityRef,
}) => {
  const [sets, setSets] = useState([]);
  const [originalSets, setOriginalSets] = useState([]);
  const [unsavedChanges, setUnsavedChanges] = useState({});
  const [defaultSetValues, setDefaultSetValues] = useState({});
  const [showPerSetDetail, setShowPerSetDetail] = useState(false);
  const [isCreatingSet, setIsCreatingSet] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [optimisticCount, setOptimisticCount] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const pendingRef = useRef(new Set());
  const timerRef = useRef(null);
  const saveRef = useRef(null);
  const objectivesRef = useRef(objectives);
  objectivesRef.current = objectives;

  // Cache sets across collapse/expand to avoid stale flash
  const cachedSetsRef = useRef(null);
  const initialSetsRef = useRef(initialSets);
  const initialSetsConsumedRef = useRef(false);
  const onSetsChangedRef = useRef(onSetsChanged);
  onSetsChangedRef.current = onSetsChanged;
  const initialDefaultsRef = useRef(initialDefaults);
  initialDefaultsRef.current = initialDefaults;
  const defaultsSeededRef = useRef(false);

  const fields = getObjectiveFields(objectives);

  const DEFAULT_INITIAL_SETS = 3;

  // Notify parent when sets change (for volume calculation) — via effect to avoid setState-during-render
  // Only notify after data has loaded to avoid overwriting pre-seeded data with empty arrays
  useEffect(() => {
    if (!isLoaded) return;
    onSetsChangedRef.current?.(exerciseId, sets);
  }, [exerciseId, sets, isLoaded]);

  // Wrap setSets to also cache
  const updateSets = useCallback((updater) => {
    setSets(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      cachedSetsRef.current = next;
      return next;
    });
  }, []);

  // Seed defaultSetValues from exercise.defaultSetValues or first loaded set
  const seedDefaults = useCallback((loadedSets) => {
    if (defaultsSeededRef.current) return;
    defaultsSeededRef.current = true;
    const objFields = getObjectiveFields(objectivesRef.current);
    const stored = initialDefaultsRef.current;
    if (stored && typeof stored === 'object' && Object.keys(stored).length > 0) {
      const seeded = {};
      objFields.forEach(f => {
        const v = stored[f];
        seeded[f] = v != null && v !== '' ? v : '';
      });
      setDefaultSetValues(seeded);
      return;
    }
    // Fallback: extract from first set
    if (loadedSets && loadedSets.length > 0) {
      const first = loadedSets[0];
      const fallback = {};
      let hasAny = false;
      objFields.forEach(f => {
        const v = first[f];
        if (v != null && v !== '') { fallback[f] = v; hasAny = true; }
      });
      if (hasAny) setDefaultSetValues(fallback);
    }
  }, []);

  // Load sets when expanded — auto-create 3 if empty
  useEffect(() => {
    if (!isExpanded || !exerciseId || !userId || !sessionId || !contentApi) {
      return;
    }
    // Skip loading for placeholder exercise IDs — sets will load once real ID arrives
    if (isPendingId(exerciseId)) return;

    // 1. Use cached sets (from previous expand) — return early
    if (cachedSetsRef.current && cachedSetsRef.current.length > 0) {
      setSets(cachedSetsRef.current);
      setOriginalSets(JSON.parse(JSON.stringify(cachedSetsRef.current)));
      setUnsavedChanges({});
      setIsLoaded(true);
      seedDefaults(cachedSetsRef.current);
      return;
    }

    // 2. Use initial sets from parent (first expand only) — avoids full-session fetch
    if (!initialSetsConsumedRef.current && initialSetsRef.current && initialSetsRef.current.length > 0) {
      initialSetsConsumedRef.current = true;
      const data = initialSetsRef.current;
      updateSets(data);
      cachedSetsRef.current = data;
      setOriginalSets(JSON.parse(JSON.stringify(data)));
      setUnsavedChanges({});
      setIsLoaded(true);
      seedDefaults(data);
      return;
    }

    // 3. Fetch from API (no cache, no initial data, or empty exercise)
    let cancelled = false;
    (async () => {
      try {
        const data = await contentApi.getSetsByLibraryExercise(userId, sessionId, exerciseId);
        if (cancelled) return;

        if (!data || data.length === 0) {
          // Auto-create default sets
          setOptimisticCount(DEFAULT_INITIAL_SETS);
          const placeholders = Array.from({ length: DEFAULT_INITIAL_SETS }, (_, i) => ({
            id: `pending-add-${Date.now()}-${i}`,
            order: i,
            title: `Serie ${i + 1}`,
          }));
          updateSets(placeholders);
          setOriginalSets(placeholders.map(p => ({ ...p })));
          setIsLoaded(true);
          seedDefaults(placeholders);

          try {
            if (isLibraryMode) {
              await Promise.all(
                Array.from({ length: DEFAULT_INITIAL_SETS }, (_, i) =>
                  contentApi.createSetInLibraryExercise(userId, sessionId, exerciseId, i)
                )
              );
            } else {
              for (let i = 0; i < DEFAULT_INITIAL_SETS; i++) {
                if (cancelled) return;
                await contentApi.createSetInLibraryExercise(userId, sessionId, exerciseId, i);
              }
            }
            if (cancelled) return;
            const created = await contentApi.getSetsByLibraryExercise(userId, sessionId, exerciseId);
            if (cancelled) return;
            updateSets(created);
            setOriginalSets(JSON.parse(JSON.stringify(created)));
            setUnsavedChanges({});
          } catch (err) {
            if (!cancelled) logger.error('Error auto-creating sets:', err);
          } finally {
            setOptimisticCount(null);
          }
        } else {
          updateSets(data);
          setOriginalSets(JSON.parse(JSON.stringify(data)));
          setUnsavedChanges({});
          setIsLoaded(true);
          seedDefaults(data);
        }
      } catch (err) {
        if (!cancelled) logger.error('Error loading sets:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [isExpanded, exerciseId, userId, sessionId, contentApi, updateSets, seedDefaults]);

  // Flush and clear on collapse (keep cache)
  useEffect(() => {
    if (!isExpanded && isLoaded) {
      flushPendingSaves();
      // Don't clear cachedSetsRef or defaultsSeededRef — keep for next expand
      setSets([]);
      setOriginalSets([]);
      setUnsavedChanges({});
      setShowPerSetDetail(false);
      setOptimisticCount(null);
      setIsLoaded(false);
    }
  }, [isExpanded]);

  // Flush pending saves on unmount (don't lose edits when user navigates away)
  useEffect(() => {
    return () => {
      const ids = Array.from(pendingRef.current);
      pendingRef.current.clear();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      ids.forEach(id => saveRef.current?.(id));
    };
  }, []);

  const saveSetChanges = useCallback(async (setId) => {
    if (!userId || !sessionId || !exerciseId) return;
    if (setId?.startsWith('pending-add-') || setId?.startsWith('temp-')) return;

    const setIndex = sets.findIndex(s => s.id === setId);
    if (setIndex === -1) return;

    const set = sets[setIndex];
    const original = originalSets.find(s => s.id === setId);
    if (!set || !original) return;

    const updateData = {};
    let hasChanges = false;
    const fieldsToSave = getObjectiveFields(objectivesRef.current);

    for (const field of fieldsToSave) {
      const current = set[field];
      const orig = original[field];
      const currentN = current == null || current === '' ? null : String(current);
      const origN = orig == null || orig === '' ? null : String(orig);
      if (currentN !== origN) {
        updateData[field] = field === 'intensity' && current != null && current !== '' ? current : (current == null || current === '' ? null : current);
        hasChanges = true;
      }
    }

    if (!hasChanges) return;

    try {
      setIsSaving(true);
      await contentApi.updateSetInLibraryExercise(userId, sessionId, exerciseId, setId, updateData);
      setOriginalSets(prev => prev.map(s => s.id === setId ? { ...sets[setIndex] } : s));
      setUnsavedChanges(prev => { const next = { ...prev }; delete next[setId]; return next; });
    } catch (err) {
      logger.error('Error saving set changes:', err);
      setUnsavedChanges(prev => ({ ...prev, [setId]: true }));
      showToast?.('Los cambios no se pudieron guardar.', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [userId, sessionId, exerciseId, contentApi, sets, originalSets, showToast]);

  saveRef.current = saveSetChanges;

  const scheduleSave = useCallback((setId) => {
    if (!setId) return;
    pendingRef.current.add(setId);
    if (globalActivityRef) globalActivityRef.current = Date.now();
    if (timerRef.current) clearTimeout(timerRef.current);
    const tryFlush = () => {
      if (globalActivityRef) {
        const elapsed = Date.now() - globalActivityRef.current;
        if (elapsed < DEBOUNCE_MS) {
          timerRef.current = setTimeout(tryFlush, DEBOUNCE_MS - elapsed);
          return;
        }
      }
      const ids = Array.from(pendingRef.current);
      pendingRef.current.clear();
      timerRef.current = null;
      ids.forEach(id => saveRef.current?.(id));
    };
    timerRef.current = setTimeout(tryFlush, DEBOUNCE_MS);
  }, [globalActivityRef]);

  const flushPendingSaves = useCallback(() => {
    const ids = Array.from(pendingRef.current);
    pendingRef.current.clear();
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    ids.forEach(id => saveRef.current?.(id));
  }, []);

  const updateSetValue = useCallback((setIndex, field, value) => {
    if (!exerciseId || !userId || !sessionId) return;
    const set = sets[setIndex];
    if (!set?.id) return;

    const processed = processFieldValue(field, value);
    const stored = toStorageValue(field, processed);

    updateSets(prev => {
      const updated = [...prev];
      updated[setIndex] = { ...updated[setIndex], [field]: stored };
      return updated;
    });

    // Dirty check
    const original = originalSets.find(s => s.id === set.id);
    const fieldsToCheck = getObjectiveFields(objectivesRef.current);
    let dirty = false;
    if (original) {
      for (const f of fieldsToCheck) {
        const curr = f === field ? stored : sets[setIndex][f];
        const orig = original[f];
        if ((curr == null || curr === '' ? null : String(curr)) !== (orig == null || orig === '' ? null : String(orig))) {
          dirty = true;
          break;
        }
      }
    }

    setUnsavedChanges(prev => ({ ...prev, [set.id]: dirty }));
    if (dirty) scheduleSave(set.id);
  }, [exerciseId, userId, sessionId, sets, originalSets, scheduleSave, updateSets]);

  const updateAllSetsValue = useCallback((field, value) => {
    if (!exerciseId || !userId || !sessionId || sets.length === 0) return;
    const processed = processFieldValue(field, value);
    const stored = toStorageValue(field, processed);

    updateSets(prev => prev.map(s => ({ ...s, [field]: stored })));
    const newUnsaved = {};
    sets.forEach(s => { if (s.id) newUnsaved[s.id] = true; });
    setUnsavedChanges(prev => ({ ...prev, ...newUnsaved }));
    sets.forEach(s => { if (s.id) scheduleSave(s.id); });
  }, [exerciseId, userId, sessionId, sets, scheduleSave, updateSets]);

  const updateDefaultValue = useCallback((field, value) => {
    const processed = processFieldValue(field, value);
    const stored = toStorageValue(field, processed);
    setDefaultSetValues(prev => ({ ...prev, [field]: stored }));

    if (sets.length >= 1) {
      updateAllSetsValue(field, value);
    }
  }, [sets, updateAllSetsValue]);

  const createSet = useCallback(async () => {
    if (!userId || !sessionId || !exerciseId) return;
    try {
      setIsCreatingSet(true);
      const newSet = await contentApi.createSetInLibraryExercise(userId, sessionId, exerciseId, sets.length);
      const data = await contentApi.getSetsByLibraryExercise(userId, sessionId, exerciseId);
      updateSets(data);
      setOriginalSets(JSON.parse(JSON.stringify(data)));
      setUnsavedChanges({});
      return newSet;
    } catch (err) {
      logger.error('Error creating set:', err);
      showToast?.('No pudimos crear la serie. Intenta de nuevo.', 'error');
    } finally {
      setIsCreatingSet(false);
    }
  }, [userId, sessionId, exerciseId, contentApi, showToast, sets.length, updateSets]);

  const deleteSet = useCallback(async (set) => {
    if (!userId || !sessionId || !set?.id || !exerciseId) return;

    if (set.id.startsWith('pending-add-')) {
      updateSets(prev => prev.filter(s => s.id !== set.id));
      setOriginalSets(prev => prev.filter(s => s.id !== set.id));
      setUnsavedChanges(prev => { const next = { ...prev }; delete next[set.id]; return next; });
      return;
    }

    // Optimistic remove
    updateSets(prev => prev.filter(s => s.id !== set.id));
    setOriginalSets(prev => prev.filter(s => s.id !== set.id));
    setUnsavedChanges(prev => { const next = { ...prev }; delete next[set.id]; return next; });

    try {
      await contentApi.deleteSetFromLibraryExercise(userId, sessionId, exerciseId, set.id);
    } catch (err) {
      logger.error('Error deleting set:', err);
      const data = await contentApi.getSetsByLibraryExercise(userId, sessionId, exerciseId);
      updateSets(data);
      setOriginalSets(JSON.parse(JSON.stringify(data)));
      setUnsavedChanges({});
      showToast?.('No pudimos eliminar la serie. Intenta de nuevo.', 'error');
    }
  }, [userId, sessionId, exerciseId, contentApi, showToast, updateSets]);

  const duplicateSet = useCallback(async (setToDuplicate) => {
    if (!setToDuplicate || !exerciseId || !userId || !sessionId) return;
    try {
      const newSet = await createSet();
      if (!newSet?.id) return;

      const updateData = {};
      fields.forEach(f => {
        if (setToDuplicate[f] != null) updateData[f] = setToDuplicate[f];
      });

      await contentApi.updateSetInLibraryExercise(userId, sessionId, exerciseId, newSet.id, updateData);
      const data = await contentApi.getSetsByLibraryExercise(userId, sessionId, exerciseId);
      updateSets(data);
      setOriginalSets(JSON.parse(JSON.stringify(data)));
      setUnsavedChanges({});
    } catch (err) {
      logger.error('Error duplicating set:', err);
      showToast?.('No pudimos duplicar la serie. Intenta de nuevo.', 'error');
    }
  }, [exerciseId, userId, sessionId, contentApi, createSet, fields, showToast, updateSets]);

  const syncSetsCount = useCallback(async (count) => {
    const target = Math.max(1, Math.min(20, Math.floor(count) || 1));
    const current = sets.length;
    if (target === current) return;

    const objectiveFields = getObjectiveFields(objectivesRef.current);
    const defaults = {};
    objectiveFields.forEach(o => {
      const v = defaultSetValues[o];
      defaults[o] = v != null && v !== '' ? v : null;
    });

    if (target > current) {
      setOptimisticCount(target);
      const placeholders = Array.from({ length: target - current }, (_, i) => ({
        id: `pending-add-${Date.now()}-${i}`,
        order: current + i,
        title: `Serie ${current + i + 1}`,
        ...defaults,
      }));
      updateSets(prev => [...prev, ...placeholders]);
      setOriginalSets(prev => [...prev, ...placeholders.map(p => ({ ...p }))]);

      try {
        // Create sets (parallel in library mode, sequential otherwise)
        if (isLibraryMode) {
          await Promise.all(
            Array.from({ length: target - current }, (_, i) =>
              contentApi.createSetInLibraryExercise(userId, sessionId, exerciseId, current + i)
            )
          );
        } else {
          for (let i = 0; i < target - current; i++) {
            await contentApi.createSetInLibraryExercise(userId, sessionId, exerciseId, current + i);
          }
        }
        const data = await contentApi.getSetsByLibraryExercise(userId, sessionId, exerciseId);
        // Apply defaults to new sets (parallel in library mode)
        if (Object.values(defaults).some(v => v != null)) {
          const updateCalls = data.map(set => {
            const update = {};
            objectiveFields.forEach(o => { update[o] = defaults[o] ?? set[o] ?? null; });
            return () => contentApi.updateSetInLibraryExercise(userId, sessionId, exerciseId, set.id, update);
          });
          if (isLibraryMode) {
            await Promise.all(updateCalls.map(fn => fn()));
          } else {
            for (const fn of updateCalls) await fn();
          }
          // Optimistic: apply defaults locally instead of re-fetching
          const updatedData = data.map(set => {
            const updated = { ...set };
            objectiveFields.forEach(o => { updated[o] = defaults[o] ?? set[o] ?? null; });
            return updated;
          });
          updateSets(updatedData);
          setOriginalSets(JSON.parse(JSON.stringify(updatedData)));
        } else {
          updateSets(data);
          setOriginalSets(JSON.parse(JSON.stringify(data)));
        }
        setUnsavedChanges({});
      } catch (err) {
        logger.error('Error adding sets:', err);
        showToast?.('No pudimos añadir series. Intenta de nuevo.', 'error');
      } finally {
        setOptimisticCount(null);
      }
    } else {
      const toRemove = sets.slice(-(current - target));
      const toRemoveIds = new Set(toRemove.map(s => s.id));
      updateSets(prev => prev.filter(s => !toRemoveIds.has(s.id)));
      setOriginalSets(prev => prev.filter(s => !toRemoveIds.has(s.id)));
      setUnsavedChanges(prev => {
        const next = { ...prev };
        toRemove.forEach(s => { delete next[s.id]; });
        return next;
      });

      try {
        // Delete sets (parallel in library mode, sequential otherwise)
        if (isLibraryMode) {
          await Promise.all(toRemove.map(s =>
            contentApi.deleteSetFromLibraryExercise(userId, sessionId, exerciseId, s.id)
          ));
        } else {
          for (const s of toRemove) {
            await contentApi.deleteSetFromLibraryExercise(userId, sessionId, exerciseId, s.id);
          }
        }
      } catch (err) {
        logger.error('Error deleting sets:', err);
        const data = await contentApi.getSetsByLibraryExercise(userId, sessionId, exerciseId);
        updateSets(data);
        setOriginalSets(JSON.parse(JSON.stringify(data)));
        setUnsavedChanges({});
        showToast?.('No pudimos eliminar series. Intenta de nuevo.', 'error');
      }
    }
  }, [sets, defaultSetValues, userId, sessionId, exerciseId, contentApi, showToast, updateSets, isLibraryMode]);

  const setsCount = optimisticCount ?? sets.length;

  return {
    sets,
    setSets,
    setsCount,
    originalSets,
    unsavedChanges,
    defaultSetValues,
    showPerSetDetail,
    setShowPerSetDetail,
    isCreatingSet,
    isSaving,
    isLoaded,
    updateSetValue,
    updateAllSetsValue,
    updateDefaultValue,
    createSet,
    deleteSet,
    duplicateSet,
    syncSetsCount,
    flushPendingSaves,
    parseIntensityForDisplay,
    formatRepsValue,
    fields,
  };
};

export default useExerciseSets;
export { parseIntensityForDisplay, formatRepsValue, getObjectiveFields, parseRepSequence };
