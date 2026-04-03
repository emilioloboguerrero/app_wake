import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import videoExchangeService from '../services/videoExchangeService';
import { compressVideo, generateThumbnail } from '../utils/videoExchangeCompressor';
import { queryKeys } from '../config/queryClient';

export default function useVideoExchangeUpload(exchangeId) {
  const queryClient = useQueryClient();
  const [isCompressing, setIsCompressing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const reset = useCallback(() => {
    setIsCompressing(false);
    setIsUploading(false);
    setProgress(0);
    setError(null);
  }, []);

  const uploadFileWithProgress = useCallback(async (url, file, contentType) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', contentType);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setProgress(e.loaded / e.total);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed: ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error('Upload network error'));
      xhr.send(file);
    });
  }, []);

  const upload = useCallback(async (videoBlob, note = '') => {
    try {
      setError(null);

      // Step 1: Compress
      setIsCompressing(true);
      const compressedFile = await compressVideo(videoBlob, setProgress);
      const thumbnail = await generateThumbnail(compressedFile);
      setIsCompressing(false);

      // Step 2: Get signed URLs
      setIsUploading(true);
      setProgress(0);

      const videoData = await videoExchangeService.getUploadUrl(exchangeId, {
        contentType: 'video/mp4',
        fileType: 'video',
      });

      const thumbData = await videoExchangeService.getUploadUrl(exchangeId, {
        contentType: 'image/jpeg',
        fileType: 'thumbnail',
      });

      // Step 3: Upload files
      await uploadFileWithProgress(videoData.uploadUrl, compressedFile, 'video/mp4');
      setProgress(0.9);

      const thumbXhr = new XMLHttpRequest();
      thumbXhr.open('PUT', thumbData.uploadUrl);
      thumbXhr.setRequestHeader('Content-Type', 'image/jpeg');
      await new Promise((resolve, reject) => {
        thumbXhr.onload = () => thumbXhr.status < 300 ? resolve() : reject(new Error('Thumbnail upload failed'));
        thumbXhr.onerror = () => reject(new Error('Thumbnail upload error'));
        thumbXhr.send(thumbnail);
      });

      // Step 4: Confirm uploads
      await videoExchangeService.confirmUpload(exchangeId, {
        storagePath: videoData.storagePath,
        messageId: videoData.messageId,
      });
      await videoExchangeService.confirmUpload(exchangeId, {
        storagePath: thumbData.storagePath,
        messageId: thumbData.messageId,
      });

      // Step 5: Create message
      const videoDurationSec = await getVideoDuration(compressedFile);
      await videoExchangeService.sendMessage(exchangeId, {
        note: note || undefined,
        videoPath: videoData.storagePath,
        videoDurationSec,
        thumbnailPath: thumbData.storagePath,
      });

      setProgress(1);

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: queryKeys.videoExchanges.detail(exchangeId) });

      setIsUploading(false);
      return true;
    } catch (err) {
      setError(err.message || 'Error al subir el video');
      setIsCompressing(false);
      setIsUploading(false);
      return false;
    }
  }, [exchangeId, queryClient, uploadFileWithProgress]);

  return { upload, isCompressing, isUploading, progress, error, reset };
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
