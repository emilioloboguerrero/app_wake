let ffmpegInstance = null;
let loadPromise = null;

async function getFFmpeg() {
  if (ffmpegInstance && ffmpegInstance.loaded) return ffmpegInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    // Load @ffmpeg/ffmpeg and @ffmpeg/util from CDN at runtime to avoid
    // Metro bundling issues (worker.js contains dynamic import() syntax
    // that Metro cannot parse).
    const ffmpegModule = await import(/* webpackIgnore: true */ 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js');
    const utilModule = await import(/* webpackIgnore: true */ 'https://unpkg.com/@ffmpeg/util@0.12.2/dist/esm/index.js');
    const { FFmpeg } = ffmpegModule;
    const { toBlobURL } = utilModule;
    const ffmpeg = new FFmpeg();
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  return loadPromise;
}

/**
 * Compress a video blob to 720p H.264 ~1.5Mbps.
 * @param {Blob} blob - Input video blob (webm or mp4)
 * @param {(progress: number) => void} [onProgress] - 0-1 progress callback
 * @returns {Promise<File>} Compressed MP4 file
 */
export async function compressVideo(blob, onProgress) {
  const ffmpeg = await getFFmpeg();

  if (onProgress) {
    ffmpeg.on('progress', ({ progress }) => {
      onProgress(Math.min(progress, 1));
    });
  }

  const utilModule = await import(/* webpackIgnore: true */ 'https://unpkg.com/@ffmpeg/util@0.12.2/dist/esm/index.js');
  const { fetchFile } = utilModule;
  const inputName = 'input' + (blob.type.includes('webm') ? '.webm' : '.mp4');
  await ffmpeg.writeFile(inputName, await fetchFile(blob));

  await ffmpeg.exec([
    '-i', inputName,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-b:v', '1500k',
    '-maxrate', '1500k',
    '-bufsize', '3000k',
    '-vf', 'scale=-2:720',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    'output.mp4',
  ]);

  const data = await ffmpeg.readFile('output.mp4');
  const file = new File([data.buffer], 'video.mp4', { type: 'video/mp4' });

  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile('output.mp4');

  return file;
}

/**
 * Extract a thumbnail from a video blob.
 * @param {Blob} videoBlob - Video blob (mp4)
 * @returns {Promise<Blob>} JPEG thumbnail blob
 */
export async function generateThumbnail(videoBlob) {
  const ffmpeg = await getFFmpeg();

  const utilModule = await import(/* webpackIgnore: true */ 'https://unpkg.com/@ffmpeg/util@0.12.2/dist/esm/index.js');
  const { fetchFile } = utilModule;
  await ffmpeg.writeFile('thumb_input.mp4', await fetchFile(videoBlob));

  await ffmpeg.exec([
    '-i', 'thumb_input.mp4',
    '-ss', '1',
    '-frames:v', '1',
    '-vf', 'scale=320:-1',
    'thumbnail.jpg',
  ]);

  const data = await ffmpeg.readFile('thumbnail.jpg');
  const blob = new Blob([data.buffer], { type: 'image/jpeg' });

  await ffmpeg.deleteFile('thumb_input.mp4');
  await ffmpeg.deleteFile('thumbnail.jpg');

  return blob;
}
