// Skeleton placeholder used while courses + sessions are loading.
// Same dimensions as the real cards so the carousel doesn't reflow when data lands.
import React from 'react';

const styles = {
  card: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#0f0f0f',
    border: '1px solid rgba(255,255,255,0.04)',
  },
  shimmer: {
    position: 'absolute',
    inset: 0,
    background:
      'linear-gradient(110deg, rgba(255,255,255,0) 30%, rgba(255,255,255,0.04) 50%, rgba(255,255,255,0) 70%)',
    backgroundSize: '200% 100%',
    animation: 'wakeSkeletonShimmer 1.6s linear infinite',
  },
};

const STYLE_TAG_ID = 'wake-skeleton-shimmer-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_TAG_ID)) {
  const tag = document.createElement('style');
  tag.id = STYLE_TAG_ID;
  tag.innerHTML = `
    @keyframes wakeSkeletonShimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `;
  document.head.appendChild(tag);
}

const SkeletonCard = () => (
  <div style={styles.card}>
    <div style={styles.shimmer} />
  </div>
);

export default SkeletonCard;
