/**
 * Extract average RGB color from an image URL.
 * Web: uses Canvas API. Native: returns null (no canvas).
 * @param {string} imageUrl - URL of the image
 * @returns {Promise<string|null>} - Hex color e.g. '#3a5f2a' or null
 */
export const getAverageColorFromImageUrl = (imageUrl) => {
  if (typeof window === 'undefined' || !window.document || !imageUrl) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const size = 20;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a > 30) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            count++;
          }
        }
        if (count === 0) {
          resolve(null);
          return;
        }
        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);
        const hex = '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
        resolve(hex);
      } catch (err) {
        resolve(null);
      }
    };

    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
};
