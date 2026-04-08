const MAX_DIMENSION = 1920;
const IMAGE_QUALITY = 0.82;
const THUMB_SIZE = 320;
const THUMB_QUALITY = 0.7;

const VIDEO_MAX_HEIGHT = 720;
const VIDEO_BITRATE = 2_500_000; // 2.5 Mbps — good quality at 720p
const VIDEO_SKIP_THRESHOLD = 5 * 1024 * 1024; // skip compression for files under 5MB

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo leer la imagen'));
    img.src = URL.createObjectURL(file);
  });
}

function resizeCanvas(img, maxDim) {
  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    const ratio = Math.min(maxDim / width, maxDim / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function bestOutputType(originalType) {
  if (typeof OffscreenCanvas !== 'undefined') {
    const test = document.createElement('canvas');
    if (test.toDataURL('image/webp').startsWith('data:image/webp')) {
      return 'image/webp';
    }
  }
  if (originalType === 'image/png') return 'image/png';
  return 'image/jpeg';
}

function extForType(type) {
  if (type === 'image/webp') return 'webp';
  if (type === 'image/png') return 'png';
  return 'jpg';
}

export async function compressImage(file) {
  const img = await loadImage(file);
  const outputType = bestOutputType(file.type);
  const canvas = resizeCanvas(img, MAX_DIMENSION);
  const blob = await canvasToBlob(canvas, outputType, IMAGE_QUALITY);
  URL.revokeObjectURL(img.src);

  const baseName = file.name.replace(/\.[^.]+$/, '');
  const ext = extForType(outputType);
  return new File([blob], `${baseName}.${ext}`, { type: outputType });
}

export async function createThumbnail(file) {
  const img = await loadImage(file);
  const canvas = resizeCanvas(img, THUMB_SIZE);
  const blob = await canvasToBlob(canvas, 'image/jpeg', THUMB_QUALITY);
  URL.revokeObjectURL(img.src);
  return URL.createObjectURL(blob);
}

export function isImage(file) {
  return file.type.startsWith('image/');
}

export function isVideo(file) {
  return file.type.startsWith('video/');
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Compress a video to 720p max using MediaRecorder + canvas.
 * Returns the original file if: under 5MB, already ≤720p, or browser lacks support.
 */
export async function compressVideo(file, onProgress = null) {
  if (file.size < VIDEO_SKIP_THRESHOLD) return file;

  if (!MediaRecorder.isTypeSupported('video/webm;codecs=vp9') &&
      !MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
    return file; // browser can't re-encode
  }

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm;codecs=vp8';

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;

  const objectUrl = URL.createObjectURL(file);

  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error('No se pudo leer el video'));
      video.src = objectUrl;
    });

    const srcH = video.videoHeight;
    const srcW = video.videoWidth;

    // Already small enough — skip
    if (srcH <= VIDEO_MAX_HEIGHT) return file;

    const scale = VIDEO_MAX_HEIGHT / srcH;
    // Ensure even dimensions (required by many codecs)
    const outW = Math.round(srcW * scale) & ~1;
    const outH = Math.round(srcH * scale) & ~1;

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');

    const stream = canvas.captureStream();

    // Transfer audio if present
    try {
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaElementSource(video);
      const dest = audioCtx.createMediaStreamDestination();
      source.connect(dest);
      source.connect(audioCtx.destination); // keep playback going
      for (const track of dest.stream.getAudioTracks()) {
        stream.addTrack(track);
      }
    } catch {
      // no audio track or AudioContext not available — continue without audio
    }

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: VIDEO_BITRATE,
    });

    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const done = new Promise((resolve) => {
      recorder.onstop = resolve;
    });

    recorder.start(100); // collect data every 100ms
    video.currentTime = 0;
    await video.play();

    const duration = video.duration;
    const drawFrame = () => {
      if (video.ended || video.paused) return;
      ctx.drawImage(video, 0, 0, outW, outH);
      if (onProgress && duration > 0) {
        onProgress(Math.round((video.currentTime / duration) * 100));
      }
      requestAnimationFrame(drawFrame);
    };
    requestAnimationFrame(drawFrame);

    await new Promise((resolve) => {
      video.onended = resolve;
    });

    recorder.stop();
    await done;

    const blob = new Blob(chunks, { type: mimeType });

    // Only use compressed version if it's actually smaller
    if (blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${baseName}.webm`, { type: 'video/webm' });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function createVideoThumbnail(file) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    video.onloadeddata = () => {
      video.currentTime = Math.min(1, video.duration / 4);
    };

    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(video.videoWidth, THUMB_SIZE);
      canvas.height = Math.round(canvas.width * (video.videoHeight / video.videoWidth));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const thumbUrl = canvas.toDataURL('image/jpeg', THUMB_QUALITY);
      URL.revokeObjectURL(video.src);
      resolve(thumbUrl);
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      resolve(null);
    };

    video.src = URL.createObjectURL(file);
  });
}
