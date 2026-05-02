// Tracks per-course download status by subscribing to courseDownloadService callbacks.
// Status values mirror MainScreen's downloadedCourses map: 'updating' | 'failed' | 'ready'.
// Defaults to null (no status) until the service notifies us.
import { useEffect, useRef, useState } from 'react';
import courseDownloadService from '../../data-management/courseDownloadService';

export function useCourseDownloadStatus() {
  const [statusByCourseId, setStatusByCourseId] = useState({});
  // Stuck-updating fallback — same 7s timeout used by MainScreen.
  const updatingTimerRef = useRef(null);

  useEffect(() => {
    const onSuccess = (courseId, _newVersion, status) => {
      setStatusByCourseId((prev) => ({ ...prev, [courseId]: status || 'ready' }));
    };
    const onError = (courseId, _err, status) => {
      setStatusByCourseId((prev) => ({ ...prev, [courseId]: status || 'failed' }));
    };
    courseDownloadService.setUIUpdateCallbacks(onSuccess, onError);
    return () => {
      // No removeListener API on the service; passing no-ops is the cleanest reset.
      courseDownloadService.setUIUpdateCallbacks(() => {}, () => {});
    };
  }, []);

  useEffect(() => {
    if (updatingTimerRef.current) clearTimeout(updatingTimerRef.current);
    const hasUpdating = Object.values(statusByCourseId).some((s) => s === 'updating');
    if (!hasUpdating) return undefined;
    updatingTimerRef.current = setTimeout(() => {
      setStatusByCourseId((prev) => {
        const next = { ...prev };
        let changed = false;
        Object.keys(next).forEach((id) => {
          if (next[id] === 'updating') {
            next[id] = 'ready';
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 7000);
    return () => {
      if (updatingTimerRef.current) clearTimeout(updatingTimerRef.current);
    };
  }, [statusByCourseId]);

  return statusByCourseId;
}
