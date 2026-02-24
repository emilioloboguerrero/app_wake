import React, { useState, useRef, useEffect } from 'react';
import { View, Image } from 'react-native';

let logoUri = null;
try {
  const asset = require('../../assets/Isotipo WAKE (negativo).png');
  if (typeof asset === 'string') logoUri = asset;
  else if (typeof asset === 'object' && asset?.uri) logoUri = asset.uri;
  else if (Image?.resolveAssetSource) {
    const resolved = Image.resolveAssetSource(asset);
    if (resolved?.uri) logoUri = resolved.uri;
  }
} catch (_) {}

const DURATION_MS = 2700;
const KEY_TIME = 0.72;

let _uid = 0;

export default function WakeLoader({ size = 80, style }) {
  const [uid] = useState(() => ++_uid);
  const maskId = `wl-m-${uid}`;
  const gradId = `wl-g-${uid}`;
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const grad = container.querySelector(`[id="${gradId}"]`);
    if (!grad) return;

    let rafId = null;
    const start = performance.now();

    const tick = () => {
      const elapsed = (performance.now() - start) % DURATION_MS;
      const t = elapsed / DURATION_MS;
      const x = t <= KEY_TIME ? -30 + (140 * t) / KEY_TIME : -30;
      grad.setAttribute('gradientTransform', `translate(${x}, 0)`);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [uid]);

  const gradientEl = (
    <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1="-20" y1="0" x2="20" y2="0" gradientTransform="translate(-30, 0)">
      <stop offset="0%" stopColor="white" stopOpacity="0" />
      <stop offset="50%" stopColor="white" stopOpacity="1" />
      <stop offset="100%" stopColor="white" stopOpacity="0" />
    </linearGradient>
  );

  const shimmerSvg = logoUri ? (
    <svg width={size} height={size} viewBox="0 0 80 80">
      <defs>
        <mask id={maskId}>
          <image href={logoUri} x="0" y="0" width="80" height="80" />
        </mask>
        {gradientEl}
      </defs>
      <image href={logoUri} x="0" y="0" width="80" height="80" opacity="0.2" />
      <rect x="0" y="0" width="80" height="80" fill={`url(#${gradId})`} mask={`url(#${maskId})`} />
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 80 80">
      <defs>{gradientEl}</defs>
      <rect x="0" y="0" width="80" height="80" fill={`url(#${gradId})`} opacity="0.9" />
    </svg>
  );

  return (
    <View ref={containerRef} style={[{ alignItems: 'center', justifyContent: 'center' }, style]}>
      {shimmerSvg}
    </View>
  );
}
