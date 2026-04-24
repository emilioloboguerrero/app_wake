import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import videoExchangeService from '../services/videoExchangeService';
import { generateThumbnail } from '../utils/videoExchangeCompressor';
import { queryKeys } from '../config/queryClient';

const VideoUploadContext = createContext(null);

export const useVideoUpload = () => {
  const ctx = useContext(VideoUploadContext);
  if (!ctx) throw new Error('useVideoUpload must be used within VideoUploadProvider');
  return ctx;
};

let nextId = 1;

export const VideoUploadProvider = ({ children }) => {
  const queryClient = useQueryClient();
  const [uploads, setUploads] = useState([]);
  const processingRef = useRef(false);
  const uploadsRef = useRef(uploads);
  uploadsRef.current = uploads;

  const updateUpload = useCallback((id, patch) => {
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }, []);

  const removeUpload = useCallback((id) => {
    setUploads((prev) => prev.filter((u) => u.id !== id));
  }, []);

  const processNext = useCallback(async () => {
    if (processingRef.current) return;
    const next = uploadsRef.current.find((u) => u.status === 'pending');
    if (!next) return;

    processingRef.current = true;
    const { id, payload } = next;
    const { videoBlob, note, exerciseKey, exerciseName, userId, oneOnOneClientId } = payload;

    try {
      updateUpload(id, { status: 'uploading', progress: 0 });

      const videoContentType = videoBlob.type?.startsWith('video/mp4') ? 'video/mp4' : 'video/webm';

      const thread = await videoExchangeService.createThread({
        clientId: userId,
        oneOnOneClientId,
        exerciseKey: exerciseKey || undefined,
        exerciseName: exerciseName?.trim() || undefined,
      });
      const exchangeId = thread.exchangeId || thread.id;
      if (!exchangeId) throw new Error('No se pudo crear la conversación');

      const thumbnail = await generateThumbnail(videoBlob).catch(() => null);

      const videoData = await videoExchangeService.getUploadUrl(exchangeId, {
        contentType: videoContentType,
        fileType: 'video',
      });
      const thumbData = thumbnail
        ? await videoExchangeService.getUploadUrl(exchangeId, {
            contentType: 'image/jpeg',
            fileType: 'thumbnail',
          })
        : null;

      await uploadWithProgress(videoData.uploadUrl, videoBlob, videoContentType, (p) => {
        updateUpload(id, { progress: p * 0.9 });
      });

      if (thumbData && thumbnail) {
        await uploadSimple(thumbData.uploadUrl, thumbnail, 'image/jpeg');
      }

      await videoExchangeService.confirmUpload(exchangeId, {
        storagePath: videoData.storagePath,
        messageId: videoData.messageId,
      });
      if (thumbData) {
        await videoExchangeService.confirmUpload(exchangeId, {
          storagePath: thumbData.storagePath,
          messageId: thumbData.messageId,
        });
      }

      const videoDurationSec = await getVideoDuration(videoBlob).catch(() => 0);
      await videoExchangeService.sendMessage(exchangeId, {
        note: note?.trim() || undefined,
        videoPath: videoData.storagePath,
        videoDurationSec,
        thumbnailPath: thumbData?.storagePath,
      });

      queryClient.invalidateQueries({ queryKey: queryKeys.videoExchanges.byClient(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.videoExchanges.detail(exchangeId) });

      updateUpload(id, { status: 'success', progress: 1, exchangeId });

      setTimeout(() => removeUpload(id), 3500);
    } catch (err) {
      updateUpload(id, {
        status: 'error',
        error: err?.message || 'No se pudo enviar el video',
      });
    } finally {
      processingRef.current = false;
      setTimeout(() => processNext(), 0);
    }
  }, [queryClient, updateUpload, removeUpload]);

  useEffect(() => {
    if (uploads.some((u) => u.status === 'pending')) {
      processNext();
    }
  }, [uploads, processNext]);

  const enqueueUpload = useCallback((payload) => {
    const id = `upload-${nextId++}`;
    setUploads((prev) => [
      ...prev,
      {
        id,
        status: 'pending',
        progress: 0,
        error: null,
        metadata: {
          exerciseName: payload.exerciseName || null,
        },
        payload,
      },
    ]);
    return id;
  }, []);

  const retryUpload = useCallback((id) => {
    setUploads((prev) =>
      prev.map((u) => (u.id === id ? { ...u, status: 'pending', error: null, progress: 0 } : u))
    );
  }, []);

  const dismissUpload = useCallback((id) => {
    removeUpload(id);
  }, [removeUpload]);

  const value = useMemo(
    () => ({ uploads, enqueueUpload, retryUpload, dismissUpload }),
    [uploads, enqueueUpload, retryUpload, dismissUpload]
  );

  return <VideoUploadContext.Provider value={value}>{children}</VideoUploadContext.Provider>;
};

function uploadWithProgress(url, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Error de red al subir el video'));
    xhr.send(file);
  });
}

function uploadSimple(url, file, contentType) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error('Upload failed')));
    xhr.onerror = () => reject(new Error('Upload error'));
    xhr.send(file);
  });
}

function getVideoDuration(file) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      resolve(Math.round(video.duration));
      URL.revokeObjectURL(video.src);
    };
    video.onerror = () => resolve(0);
    video.src = URL.createObjectURL(file);
  });
}
