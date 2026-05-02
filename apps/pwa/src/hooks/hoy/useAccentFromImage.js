// Extracts the most vivid accent color from an image URL (per STANDARDS.md §2)
// and exposes it as CSS custom-property values for inline styling.
import { useEffect, useState } from 'react';
import { extractAccentColor } from '../../utils/accentExtractor';

const cache = new Map();

export function useAccentFromImage(imageUrl) {
  const [accent, setAccent] = useState(null);

  useEffect(() => {
    if (!imageUrl) { setAccent(null); return; }
    if (cache.has(imageUrl)) { setAccent(cache.get(imageUrl)); return; }
    let cancelled = false;
    extractAccentColor(imageUrl).then((rgb) => {
      if (cancelled) return;
      if (!rgb) { setAccent(null); return; }
      const m = rgb.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (!m) { setAccent(null); return; }
      const r = Number(m[1]); const g = Number(m[2]); const b = Number(m[3]);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const out = {
        accent: `rgb(${r}, ${g}, ${b})`,
        accentR: r,
        accentG: g,
        accentB: b,
        accentText: luminance > 0.55 ? '#111111' : '#ffffff',
      };
      cache.set(imageUrl, out);
      setAccent(out);
    });
    return () => { cancelled = true; };
  }, [imageUrl]);

  return accent;
}
