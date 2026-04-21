import { useMemo } from 'react';
import './BundleCover.css';

const SIZES = {
  card: { outer: 220, tile: 140, offset: 28, rot: 6 },
  header: { outer: 340, tile: 220, offset: 42, rot: 7 },
  thumb: { outer: 96, tile: 64, offset: 12, rot: 5 },
};

const BundleCover = ({ imageUrls = [], size = 'card', title = '' }) => {
  const tiles = useMemo(() => (imageUrls || []).slice(0, 3), [imageUrls]);
  const dims = SIZES[size] || SIZES.card;

  if (tiles.length === 0) {
    return (
      <div
        className={`bundle-cover bundle-cover--${size} bundle-cover--empty`}
        style={{ width: dims.outer, height: dims.outer }}
        aria-label={title ? `Portada de ${title}` : 'Portada de bundle'}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M3 7h18M3 12h18M3 17h18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  return (
    <div
      className={`bundle-cover bundle-cover--${size} bundle-cover--count-${tiles.length}`}
      style={{ width: dims.outer, height: dims.outer }}
      aria-label={title ? `Portada de ${title}` : 'Portada de bundle'}
    >
      {tiles.map((url, i) => {
        const depth = tiles.length - 1 - i;
        const translate = depth * dims.offset;
        const rotation = (i - (tiles.length - 1) / 2) * dims.rot;
        return (
          <div
            key={`${url}-${i}`}
            className="bundle-cover__tile"
            style={{
              width: dims.tile,
              height: dims.tile,
              transform: `translate(-50%, -50%) translateX(${translate}px) translateY(${-translate * 0.25}px) rotate(${rotation}deg)`,
              zIndex: 10 + i,
              opacity: 1 - depth * 0.12,
            }}
          >
            <img src={url} alt="" className="bundle-cover__img" loading="lazy" />
            <div className="bundle-cover__tile-glow" />
          </div>
        );
      })}
    </div>
  );
};

export default BundleCover;
