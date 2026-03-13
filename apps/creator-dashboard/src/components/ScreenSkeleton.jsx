import React from 'react';
import './ScreenSkeleton.css';

export function Skeleton({ width = '100%', height = '1rem', borderRadius = '6px', className = '' }) {
  return (
    <div
      className={`skeleton-block ${className}`}
      style={{ width, height, borderRadius }}
    />
  );
}

export function CardSkeleton({ count = 3 }) {
  return (
    <div className="skeleton-card-row">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-card">
          <Skeleton height="140px" borderRadius="8px" />
          <Skeleton width="60%" height="1rem" style={{ marginTop: '0.75rem' }} />
          <Skeleton width="40%" height="0.8rem" style={{ marginTop: '0.5rem' }} />
        </div>
      ))}
    </div>
  );
}

export default function ScreenSkeleton() {
  return (
    <div className="screen-skeleton">
      <div className="skeleton-header">
        <Skeleton width="180px" height="1.5rem" />
        <Skeleton width="100px" height="2rem" borderRadius="8px" />
      </div>
      <Skeleton height="3rem" borderRadius="8px" style={{ marginBottom: '1rem' }} />
      <div className="skeleton-list">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton-list-item">
            <Skeleton width="48px" height="48px" borderRadius="8px" />
            <div className="skeleton-list-item-lines">
              <Skeleton width="55%" height="1rem" />
              <Skeleton width="35%" height="0.8rem" style={{ marginTop: '0.4rem' }} />
            </div>
            <Skeleton width="80px" height="2rem" borderRadius="6px" />
          </div>
        ))}
      </div>
    </div>
  );
}
