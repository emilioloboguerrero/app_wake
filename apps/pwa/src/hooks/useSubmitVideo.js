import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import videoExchangeService from '../services/videoExchangeService';
import { generateThumbnail } from '../utils/videoExchangeCompressor';
import { queryKeys } from '../config/queryClient';

/**
 * One-shot video submission flow.
 * Creates a thread, uploads the video + thumbnail, and posts the first message
 * in a single user action. Surfaces compression/upload progress for UI.
 */
export default function useSubmitVideo({ userId, oneOnOneClientId }) {
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const reset = useCallback(() => {
    setIsUploading(false);
    setProgress(0);
    setError(null);
  }, []);

  const submit = useCallback(async ({ videoBlob, exerciseKey, exerciseName, note }) => {
    setError(null);
    try {
      const videoContentType = videoBlob.type?.startsWith('video/mp4') ? 'video/mp4' : 'video/webm';

      const thread = await videoExchangeService.createThread({
        clientId: userId,
        oneOnOneClientId,
        exerciseKey: exerciseKey || undefined,
        exerciseName: exerciseName?.trim() || undefined,
      });
      const exchangeId = thread.exchangeId || thread.id;
      if (!exchangeId) throw new Error('No se pudo crear la conversacion');

      setIsUploading(true);
      setProgress(0);

      const thumbnail = await generateThumbnail(videoBlob);

      const videoData = await videoExchangeService.getUploadUrl(exchangeId, {
        contentType: videoContentType,
        fileType: 'video',
      });
      const thumbData = await videoExchangeService.getUploadUrl(exchangeId, {
        contentType: 'image/jpeg',
        fileType: 'thumbnail',
      });

      await uploadWithProgress(videoData.uploadUrl, videoBlob, videoContentType, setProgress);
      setProgress(0.9);
      await uploadSimple(thumbData.uploadUrl, thumbnail, 'image/jpeg');

      await videoExchangeService.confirmUpload(exchangeId, {
        storagePath: videoData.storagePath,
        messageId: videoData.messageId,
      });
      await videoExchangeService.confirmUpload(exchangeId, {
        storagePath: thumbData.storagePath,
        messageId: thumbData.messageId,
      });

      const videoDurationSec = await getVideoDuration(videoBlob);
      await videoExchangeService.sendMessage(exchangeId, {
        note: note?.trim() || undefined,
        videoPath: videoData.storagePath,
        videoDurationSec,
        thumbnailPath: thumbData.storagePath,
      });

      setProgress(1);
      setIsUploading(false);

      queryClient.invalidateQueries({ queryKey: queryKeys.videoExchanges.byClient(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.videoExchanges.detail(exchangeId) });

      return { exchangeId };
    } catch (err) {
      setIsUploading(false);
      setError(err?.message || 'No se pudo enviar el video');
      return null;
    }
  }, [userId, oneOnOneClientId, queryClient]);

  return { submit, isUploading, progress, error, reset };
}

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
    xhr.onerror = () => reject(new Error('Upload network error'));
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
