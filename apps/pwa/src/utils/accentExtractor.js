/**
 * Extract the most vivid accent color from an image URL.
 * Uses canvas getImageData — picks the pixel with the highest
 * saturation × brightness score (per STANDARDS.md §2).
 *
 * @param {string} imageUrl
 * @returns {Promise<string|null>} rgba color string or null
 */
export function extractAccentColor(imageUrl) {
  if (typeof window === 'undefined' || !window.document || !imageUrl) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const size = 64;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }

        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;

        let bestScore = -1;
        let bestR = 255, bestG = 255, bestB = 255;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a < 30) continue;

          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);

          // Skip near-black and near-white
          if (max < 40 || max > 245) continue;

          const sat = max === 0 ? 0 : (max - min) / max;
          const score = sat * (max / 255);

          if (score > bestScore) {
            bestScore = score;
            bestR = r;
            bestG = g;
            bestB = b;
          }
        }

        if (bestScore < 0) { resolve(null); return; }

        resolve(`rgb(${bestR}, ${bestG}, ${bestB})`);
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

/**
 * Apply accent color as CSS custom properties on a DOM element.
 * Sets --accent, --accent-r, --accent-g, --accent-b, --accent-text.
 *
 * @param {HTMLElement} el
 * @param {string} rgbString - e.g. "rgb(120, 80, 200)"
 */
export function applyAccentToElement(el, rgbString) {
  if (!el || !rgbString) return;
  const match = rgbString.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!match) return;

  const r = parseInt(match[1], 10);
  const g = parseInt(match[2], 10);
  const b = parseInt(match[3], 10);

  // WCAG relative luminance
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

  el.style.setProperty('--accent', `rgb(${r}, ${g}, ${b})`);
  el.style.setProperty('--accent-r', String(r));
  el.style.setProperty('--accent-g', String(g));
  el.style.setProperty('--accent-b', String(b));
  el.style.setProperty('--accent-text', lum > 0.35 ? '#111111' : '#ffffff');
}
