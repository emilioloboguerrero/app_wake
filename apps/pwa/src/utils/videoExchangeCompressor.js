/**
 * Extract a thumbnail from a video blob using a <video> element + canvas.
 * @param {Blob} videoBlob
 * @returns {Promise<Blob>} JPEG thumbnail (320px wide)
 */
export function generateThumbnail(videoBlob) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    const url = URL.createObjectURL(videoBlob);
    video.src = url;

    const cleanup = () => URL.revokeObjectURL(url);

    video.onloadedmetadata = () => {
      const target = Math.min(1, Math.max(0, (video.duration || 0) * 0.1));
      video.currentTime = target;
    };

    video.onseeked = () => {
      try {
        const targetWidth = 320;
        const aspect = video.videoHeight / video.videoWidth || 9 / 16;
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = Math.round(targetWidth * aspect);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            cleanup();
            if (blob) resolve(blob);
            else reject(new Error('No se pudo generar la miniatura'));
          },
          'image/jpeg',
          0.8
        );
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('No se pudo leer el video para la miniatura'));
    };
  });
}
