// Client-side image prep for event signup attachments.
//
// Mirrors apps/creator-dashboard/src/utils/mediaCompressor.js. The three apps
// build separately, so this is a deliberate copy rather than a shared import.
//
// Output is always one of the three types the API signs for (JPEG, PNG, WebP).
// iOS hands over HEIC from the camera roll; Safari decodes it natively into the
// canvas and it comes back out as JPEG, which is why the picker accepts it.

const TARGET_BYTES = 1024 * 1024;

// Progressively harder passes. Stops at the first one under target.
const PASSES = [
  { maxDim: 1920, quality: 0.82 },
  { maxDim: 1600, quality: 0.74 },
  { maxDim: 1280, quality: 0.66 },
  { maxDim: 1024, quality: 0.58 },
];

export const MAX_INPUT_BYTES = 15 * 1024 * 1024;
export const PICKER_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No pudimos leer la imagen. Prueba con otra o toma una foto.'));
    };
    img.src = url;
  });
}

function drawToCanvas(img, maxDim) {
  let { naturalWidth: width, naturalHeight: height } = img;
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
  return new Promise(resolve => canvas.toBlob(blob => resolve(blob), type, quality));
}

// PNG keeps its alpha; WebP stays WebP; everything else (HEIC included) lands
// as JPEG, which every browser can encode.
function outputType(originalType) {
  if (originalType === 'image/png') return 'image/png';
  if (originalType === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

export async function compressForUpload(file) {
  const img = await loadImage(file);
  const type = outputType(file.type);

  let best = null;
  for (const pass of PASSES) {
    const blob = await canvasToBlob(drawToCanvas(img, pass.maxDim), type, pass.quality);
    if (!blob) continue;
    best = blob;
    if (blob.size <= TARGET_BYTES) break;
  }

  URL.revokeObjectURL(img.src);

  if (!best) throw new Error('No pudimos procesar la imagen. Intenta con otra.');
  return best;
}

export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
