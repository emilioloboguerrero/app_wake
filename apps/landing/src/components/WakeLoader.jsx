import React, { useEffect, useRef } from 'react';
import heroLogoSrc from '../assets/hero-logo.svg';

// Wake mark with a light sweep travelling across it. Shared by the public
// signup and document pages so both wait with the same face.
const LOADER_DURATION = 2700;
const LOADER_KEY_TIME = 0.72;
let _loaderUid = 0;

export default function WakeLoader({ size = 64 }) {
  const uid = useRef(++_loaderUid).current;
  const gradId = `wl-g-${uid}`;
  const maskId = `wl-m-${uid}`;
  const svgRef = useRef(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const grad = svg.querySelector(`#${gradId}`);
    if (!grad) return;
    let raf;
    const start = performance.now();
    const tick = () => {
      const t = ((performance.now() - start) % LOADER_DURATION) / LOADER_DURATION;
      const x = t <= LOADER_KEY_TIME ? -30 + (140 * t) / LOADER_KEY_TIME : -30;
      grad.setAttribute('gradientTransform', `translate(${x}, 0)`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [gradId]);

  return (
    <svg ref={svgRef} width={size} height={size} viewBox="0 0 80 80">
      <defs>
        <mask id={maskId}>
          <image href={heroLogoSrc} x="0" y="0" width="80" height="80" />
        </mask>
        <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1="-20" y1="0" x2="20" y2="0" gradientTransform="translate(-30, 0)">
          <stop offset="0%" stopColor="white" stopOpacity="0" />
          <stop offset="50%" stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
      <image href={heroLogoSrc} x="0" y="0" width="80" height="80" opacity="0.18" />
      <rect x="0" y="0" width="80" height="80" fill={`url(#${gradId})`} mask={`url(#${maskId})`} />
    </svg>
  );
}
