import './ShimmerSkeleton.css';

export default function ShimmerSkeleton({
  width = '100%',
  height = '16px',
  borderRadius = '6px',
  className = '',
}) {
  return (
    <div
      className={`shimmer-skeleton ${className}`}
      style={{ width, height, borderRadius }}
      aria-hidden="true"
    />
  );
}

export function SkeletonBlock({ lines = 3, gap = 8, className = '' }) {
  return (
    <div className={`skeleton-block ${className}`} style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <ShimmerSkeleton
          key={i}
          height="14px"
          width={i === lines - 1 ? '68%' : '100%'}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = '' }) {
  return (
    <div
      className={`skeleton-card ${className}`}
      style={{
        background: 'var(--surface-1, #222)',
        border: '1px solid var(--border-default, rgba(255,255,255,0.10))',
        borderRadius: 'var(--radius-lg, 16px)',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
      aria-hidden="true"
    >
      <ShimmerSkeleton height="18px" width="55%" borderRadius="6px" />
      <ShimmerSkeleton height="13px" width="100%" borderRadius="4px" />
      <ShimmerSkeleton height="13px" width="80%" borderRadius="4px" />
    </div>
  );
}
