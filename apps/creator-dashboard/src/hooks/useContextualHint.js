import { useState, useEffect, useCallback } from 'react';
import { HINTS, HINT_STORAGE_PREFIX } from '../config/hints';

export default function useContextualHint(screenKey) {
  const hint = HINTS[screenKey];
  const storageKey = `${HINT_STORAGE_PREFIX}${screenKey}`;
  const alreadySeen = !!localStorage.getItem(storageKey);

  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!hint || alreadySeen) return;
    // Show after a short delay to let the screen render
    const timer = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(timer);
  }, [hint, alreadySeen]);

  const dismiss = useCallback(() => {
    setVisible(false);
    localStorage.setItem(storageKey, '1');
  }, [storageKey]);

  // Auto-dismiss after 8 seconds
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(dismiss, 8000);
    return () => clearTimeout(timer);
  }, [visible, dismiss]);

  return {
    hint: hint || null,
    visible,
    dismiss,
  };
}
