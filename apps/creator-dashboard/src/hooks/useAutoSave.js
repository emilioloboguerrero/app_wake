import { useRef, useCallback, useState } from 'react';
import { useToast } from '../contexts/ToastContext';

/**
 * Debounced auto-save hook.
 * Waits `delay` ms after the last trigger call before writing.
 * Shows a toast on success or error.
 *
 * Usage:
 *   const { trigger, flush, isSaving, isDirty } = useAutoSave(
 *     (data) => apiClient.patch('/v1/resource', data),
 *     { delay: 800, successMessage: 'Cambios guardados' }
 *   );
 *
 *   // Call trigger on every change:
 *   onChange={(e) => { setValue(e.target.value); trigger({ value: e.target.value }); }}
 *
 *   // Call flush to save immediately (e.g. on blur):
 *   onBlur={() => flush({ value })}
 */
const useAutoSave = (saveFn, options = {}) => {
  const {
    delay = 800,
    successMessage = 'Cambios guardados',
    errorMessage = 'No se pudo guardar',
  } = options;

  const { showToast } = useToast();
  const timerRef = useRef(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const save = useCallback(async (data) => {
    setIsSaving(true);
    setIsDirty(false);
    try {
      await saveFn(data);
      showToast(successMessage, 'success');
    } catch (err) {
      console.error('[useAutoSave]', err);
      showToast(errorMessage, 'error');
      setIsDirty(true);
    } finally {
      setIsSaving(false);
    }
  }, [saveFn, showToast, successMessage, errorMessage]);

  // Schedule a debounced save. Call this on every change.
  const trigger = useCallback((data) => {
    setIsDirty(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(data), delay);
  }, [save, delay]);

  // Save immediately, cancelling any pending debounced save.
  const flush = useCallback((data) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    return save(data);
  }, [save]);

  // Cancel any pending save without writing.
  const cancel = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsDirty(false);
  }, []);

  return { trigger, flush, cancel, isSaving, isDirty };
};

export default useAutoSave;
