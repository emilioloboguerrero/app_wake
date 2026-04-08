import React, { createContext, useContext, useReducer, useCallback, useRef } from 'react';
import { useToast } from './ToastContext';
import { compressImage, compressVideo, isImage, isVideo, createThumbnail, createVideoThumbnail } from '../utils/mediaCompressor';
import apiClient from '../utils/apiClient';
import { auth } from '../config/firebase';

const MediaUploadContext = createContext(null);

const MAX_CONCURRENT = 2;
const MAX_FILE_SIZE = 300 * 1024 * 1024;

const STATUS = {
  QUEUED: 'queued',
  COMPRESSING: 'compressing',
  UPLOADING: 'uploading',
  DONE: 'done',
  ERROR: 'error',
  CANCELLED: 'cancelled',
};

function reducer(state, action) {
  switch (action.type) {
    case 'ADD_ITEMS':
      return {
        ...state,
        items: [...action.payload, ...state.items],
      };
    case 'UPDATE_ITEM':
      return {
        ...state,
        items: state.items.map((it) =>
          it.queueId === action.payload.queueId ? { ...it, ...action.payload.updates } : it
        ),
      };
    case 'REMOVE_ITEM':
      return {
        ...state,
        items: state.items.filter((it) => it.queueId !== action.payload),
      };
    case 'CLEAR_DONE':
      return {
        ...state,
        items: state.items.filter((it) => it.status !== STATUS.DONE && it.status !== STATUS.CANCELLED),
      };
    default:
      return state;
  }
}

export function useMediaUpload() {
  const ctx = useContext(MediaUploadContext);
  if (!ctx) throw new Error('useMediaUpload must be used within MediaUploadProvider');
  return ctx;
}

export function MediaUploadProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, { items: [] });
  const { showToast } = useToast();
  const activeCount = useRef(0);
  const processingIds = useRef(new Set());
  const listenersRef = useRef(new Map());
  const xhrRefs = useRef(new Map());
  const cancelledIds = useRef(new Set());

  const processNext = useCallback(() => {
    if (activeCount.current >= MAX_CONCURRENT) return;
    const next = state.items.find((it) => it.status === STATUS.QUEUED);
    if (!next) return;
    processItem(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.items]);

  const processItem = useCallback(async (item) => {
    activeCount.current++;
    processingIds.current.add(item.queueId);

    const update = (updates) =>
      dispatch({ type: 'UPDATE_ITEM', payload: { queueId: item.queueId, updates } });

    try {
      if (cancelledIds.current.has(item.queueId)) throw new Error('cancelled');

      let fileToUpload = item.file;

      // 1. Compress
      if (isImage(item.file)) {
        update({ status: STATUS.COMPRESSING });
        try {
          fileToUpload = await compressImage(item.file);
          update({ compressedSize: fileToUpload.size });
        } catch {
          // compression failed - upload original
        }
      } else if (isVideo(item.file)) {
        update({ status: STATUS.COMPRESSING });
        try {
          fileToUpload = await compressVideo(item.file);
          update({ compressedSize: fileToUpload.size });
        } catch {
          // compression failed - upload original
        }
      }

      if (cancelledIds.current.has(item.queueId)) throw new Error('cancelled');

      update({ status: STATUS.UPLOADING, progress: 0 });

      // 2. Get upload URL from API
      const { data: uploadData } = await apiClient.post('/creator/media/upload-url', {
        filename: fileToUpload.name,
        contentType: fileToUpload.type,
      });

      // 3. Upload directly to Firebase Storage REST API with auth token
      const token = await auth.currentUser.getIdToken();
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRefs.current.set(item.queueId, xhr);

        xhr.open('POST', uploadData.uploadUrl);
        xhr.setRequestHeader('Content-Type', uploadData.contentType);
        xhr.setRequestHeader('Authorization', `Firebase ${token}`);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 90);
            update({ progress });
          }
        };

        xhr.onload = () => {
          xhrRefs.current.delete(item.queueId);
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed: ${xhr.status}`));
        };
        xhr.onerror = () => {
          xhrRefs.current.delete(item.queueId);
          reject(new Error('Error de red al subir archivo'));
        };
        xhr.ontimeout = () => {
          xhrRefs.current.delete(item.queueId);
          reject(new Error('Tiempo de espera agotado'));
        };
        xhr.onabort = () => {
          xhrRefs.current.delete(item.queueId);
          reject(new Error('cancelled'));
        };
        xhr.timeout = 5 * 60 * 1000;

        xhr.send(fileToUpload);
      });

      update({ progress: 95 });

      // 4. Confirm upload with API
      const { data: confirmData } = await apiClient.post('/creator/media/upload-url/confirm', {
        storagePath: uploadData.storagePath,
        filename: fileToUpload.name,
        contentType: fileToUpload.type,
        downloadToken: uploadData.downloadToken,
      });

      const completedItem = {
        id: confirmData.fileId,
        url: confirmData.url,
        name: confirmData.name,
        contentType: confirmData.contentType,
        storagePath: confirmData.storagePath,
        thumbnailUrl: item.thumbnailUrl,
      };

      update({ status: STATUS.DONE, progress: 100, result: completedItem });

      const cb = listenersRef.current.get(item.queueId);
      if (cb) {
        cb(completedItem);
        listenersRef.current.delete(item.queueId);
      }

      showToast(`"${item.file.name}" subido`, 'success');
    } catch (err) {
      if (err.message === 'cancelled') {
        cancelledIds.current.delete(item.queueId);
        listenersRef.current.delete(item.queueId);
        update({ status: STATUS.CANCELLED });
      } else {
        update({ status: STATUS.ERROR, error: err.message });
        showToast(`Error: ${item.file.name}`, 'error');
      }
    } finally {
      activeCount.current--;
      processingIds.current.delete(item.queueId);
      setTimeout(() => processNextRef.current(), 50);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showToast]);

  const processNextRef = useRef(processNext);
  processNextRef.current = () => {
    if (activeCount.current >= MAX_CONCURRENT) return;
    const next = state.items.find((it) => it.status === STATUS.QUEUED && !processingIds.current.has(it.queueId));
    if (!next) return;
    processItem(next);
  };

  const enqueue = useCallback(async (files, onComplete) => {
    const validFiles = Array.from(files).filter((f) => {
      if (f.size > MAX_FILE_SIZE) {
        showToast(`"${f.name}" excede 300MB`, 'error');
        return false;
      }
      return true;
    });

    if (!validFiles.length) return [];

    const newItems = await Promise.all(
      validFiles.map(async (file) => {
        const queueId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        let thumbnailUrl = null;
        try {
          if (isImage(file)) {
            thumbnailUrl = await createThumbnail(file);
          } else if (file.type.startsWith('video/')) {
            thumbnailUrl = await createVideoThumbnail(file);
          }
        } catch {
          // thumbnail generation is non-critical
        }

        if (onComplete) {
          listenersRef.current.set(queueId, onComplete);
        }

        return {
          queueId,
          file,
          originalSize: file.size,
          compressedSize: null,
          status: STATUS.QUEUED,
          progress: 0,
          thumbnailUrl,
          result: null,
          error: null,
        };
      })
    );

    dispatch({ type: 'ADD_ITEMS', payload: newItems });

    // kick off processing
    setTimeout(() => {
      for (let i = 0; i < MAX_CONCURRENT; i++) {
        processNextRef.current();
      }
    }, 0);

    return newItems.map((it) => it.queueId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showToast]);

  const cancelItem = useCallback((queueId) => {
    // Abort active XHR if uploading
    const xhr = xhrRefs.current.get(queueId);
    if (xhr) {
      xhr.abort();
    } else {
      // Queued or compressing — mark for cancel
      cancelledIds.current.add(queueId);
      listenersRef.current.delete(queueId);
      dispatch({ type: 'UPDATE_ITEM', payload: { queueId, updates: { status: STATUS.CANCELLED } } });
    }
  }, []);

  const retryItem = useCallback((queueId) => {
    dispatch({ type: 'UPDATE_ITEM', payload: { queueId, updates: { status: STATUS.QUEUED, progress: 0, error: null } } });
    setTimeout(() => processNextRef.current(), 0);
  }, []);

  const removeItem = useCallback((queueId) => {
    listenersRef.current.delete(queueId);
    dispatch({ type: 'REMOVE_ITEM', payload: queueId });
  }, []);

  const clearDone = useCallback(() => {
    dispatch({ type: 'CLEAR_DONE' });
  }, []);

  const activeItems = state.items.filter((it) => it.status !== STATUS.DONE && it.status !== STATUS.ERROR && it.status !== STATUS.CANCELLED);
  const completedItems = state.items.filter((it) => it.status === STATUS.DONE);
  const errorItems = state.items.filter((it) => it.status === STATUS.ERROR);
  const hasActivity = state.items.length > 0;

  return (
    <MediaUploadContext.Provider
      value={{
        items: state.items,
        activeItems,
        completedItems,
        errorItems,
        hasActivity,
        enqueue,
        cancelItem,
        retryItem,
        removeItem,
        clearDone,
        STATUS,
      }}
    >
      {children}
    </MediaUploadContext.Provider>
  );
}
