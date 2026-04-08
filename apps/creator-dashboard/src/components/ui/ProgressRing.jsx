import { useEffect, useRef } from 'react';

export default function ProgressRing({
  percent = 0,
  size = 48,
  strokeWidth = 4,
  color = 'rgba(255,255,255,0.8)',
  label,
}) {
  const progressRef = useRef(null);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    const el = progressRef.current;
    if (!el) return;
    const target = circumference * (1 - percent / 100);
    el.style.transition = 'none';
    el.style.strokeDashoffset = circumference;

    const raf = requestAnimationFrame(() => {
      el.style.transition = 'stroke-dashoffset 800ms ease-out';
      el.style.strokeDashoffset = target;
    });

    return () => cancelAnimationFrame(raf);
  }, [percent, circumference]);

  const center = size / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: 'block', flexShrink: 0 }}
      aria-label={label ? `${label}: ${percent}%` : `${percent}%`}
      role="img"
    >
      {/* Track */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={strokeWidth}
      />
      {/* Progress */}
      <circle
        ref={progressRef}
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference}
        transform={`rotate(-90 ${center} ${center})`}
      />
      {/* Label */}
      {label !== undefined && (
        <text
          x={center}
          y={center}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={size * 0.22}
          fontWeight="600"
          fill="rgba(255,255,255,0.8)"
          fontFamily="var(--font-sans, 'Inter', sans-serif)"
        >
          {label}
        </text>
      )}
    </svg>
  );
}
