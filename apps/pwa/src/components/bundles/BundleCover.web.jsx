import { useMemo } from 'react';

const SIZES = {
  card: { outer: 200, tile: 128, offset: 26, rot: 6 },
  header: { outer: 320, tile: 204, offset: 40, rot: 7 },
  thumb: { outer: 88, tile: 56, offset: 12, rot: 5 },
};

const tileBase = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  borderRadius: 14,
  overflow: 'hidden',
  background: '#1a1a1a',
  boxShadow: '0 14px 28px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.05)',
  transition: 'transform 520ms cubic-bezier(0.22,1,0.36,1), opacity 420ms cubic-bezier(0.22,1,0.36,1)',
};

const imgStyle = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
};

const glowStyle = {
  position: 'absolute',
  inset: 0,
  background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.22) 100%)',
  pointerEvents: 'none',
};

const BundleCoverWeb = ({ imageUrls = [], size = 'card', title = '' }) => {
  const tiles = useMemo(() => (imageUrls || []).slice(0, 3), [imageUrls]);
  const dims = SIZES[size] || SIZES.card;

  if (tiles.length === 0) {
    return (
      <div
        style={{
          width: dims.outer,
          height: dims.outer,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(140deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 14,
          color: 'rgba(255,255,255,0.35)',
        }}
        aria-label={title ? `Portada de ${title}` : 'Portada de bundle'}
      />
    );
  }

  return (
    <div
      style={{ position: 'relative', width: dims.outer, height: dims.outer, display: 'inline-block' }}
      aria-label={title ? `Portada de ${title}` : 'Portada de bundle'}
    >
      {tiles.map((url, i) => {
        const depth = tiles.length - 1 - i;
        const translate = depth * dims.offset;
        const rotation = (i - (tiles.length - 1) / 2) * dims.rot;
        return (
          <div
            key={`${url}-${i}`}
            style={{
              ...tileBase,
              width: dims.tile,
              height: dims.tile,
              transform: `translate(-50%, -50%) translateX(${translate}px) translateY(${-translate * 0.25}px) rotate(${rotation}deg)`,
              zIndex: 10 + i,
              opacity: 1 - depth * 0.12,
            }}
          >
            <img src={url} alt="" style={imgStyle} loading="lazy" />
            <div style={glowStyle} />
          </div>
        );
      })}
    </div>
  );
};

export default BundleCoverWeb;
