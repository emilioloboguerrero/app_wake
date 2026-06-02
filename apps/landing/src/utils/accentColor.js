import { useEffect, useState } from 'react';

// Extracts an accent color from an image URL using canvas.
//
// Two-pass strategy:
//   1. Find the most vivid pixel (highest saturation × brightness).
//   2. If everything is desaturated (typical of moody/dim photos),
//      fall back to the brightest non-black pixel.
//
// Returns null only if the image fails to load, is tainted (CORS), or is
// entirely transparent / pure black. The result is then saturation-boosted
// before use so it reads as a real accent on a button instead of near-white.

const cache = new Map();

// Lift desaturated colors so they look like an actual accent on a dark UI.
// Pulls each channel away from its mean toward its extreme until saturation
// reaches `minSat`. No-op if the color is already saturated enough.
function boostSaturation({ r, g, b }, minSat) {
  const max = Math.max(r, g, b);
  if (max === 0) return { r, g, b };
  const min = Math.min(r, g, b);
  const sat = (max - min) / max;
  if (sat >= minSat) return { r, g, b };

  // Target: the same hue, but with saturation = minSat. We compute the
  // desired min channel value and interpolate the other channels toward it.
  const targetMin = max * (1 - minSat);
  const range = max - min;
  if (range === 0) {
    // Pure gray — no hue to boost. Return as-is; caller decides fallback.
    return { r, g, b };
  }
  const ratio = (max - targetMin) / range;
  return {
    r: Math.round(max - (max - r) * ratio),
    g: Math.round(max - (max - g) * ratio),
    b: Math.round(max - (max - b) * ratio),
  };
}

function extractAccentColor(imageUrl) {
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

        let bestVividScore = -1;
        let bestVivid = null;
        let brightestNonBlack = null;
        let brightestVal = -1;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a < 30) continue;

          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          if (max < 20) continue; // truly black — useless as accent

          if (max > brightestVal && max < 250) {
            brightestVal = max;
            brightestNonBlack = { r, g, b };
          }

          if (max > 245) continue; // skip near-white for vivid pass
          const sat = (max - min) / max;
          const score = sat * (max / 255);

          if (score > bestVividScore) {
            bestVividScore = score;
            bestVivid = { r, g, b };
          }
        }

        const picked = bestVivid || brightestNonBlack;
        if (!picked) { resolve(null); return; }

        // Ensure the accent reads as a hue, not as off-white.
        resolve(boostSaturation(picked, 0.45));
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

export function useAccentFromImage(imageUrl) {
  const [accent, setAccent] = useState(null);

  useEffect(() => {
    if (!imageUrl) { setAccent(null); return; }
    if (cache.has(imageUrl)) { setAccent(cache.get(imageUrl)); return; }
    let cancelled = false;
    extractAccentColor(imageUrl).then((rgb) => {
      if (cancelled) return;
      if (!rgb) { setAccent(null); return; }
      const { r, g, b } = rgb;
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const out = {
        accent: `rgb(${r}, ${g}, ${b})`,
        accentSoft: `rgba(${r}, ${g}, ${b}, 0.18)`,
        accentLine: `rgba(${r}, ${g}, ${b}, 0.4)`,
        accentText: luminance > 0.55 ? '#111111' : '#ffffff',
      };
      cache.set(imageUrl, out);
      setAccent(out);
    });
    return () => { cancelled = true; };
  }, [imageUrl]);

  return accent;
}
