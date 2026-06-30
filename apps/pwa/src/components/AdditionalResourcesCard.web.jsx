// Additional-resources card — a carousel sibling to TodayWorkoutCard. Single
// front face: the program image as a full-bleed backdrop with a text overlay
// (kicker + "Recursos" heading + count), and a "Ver" CTA that opens the
// resources screen. Simpler than the flip cards by design — one face, one tap.
import React, { useState } from 'react';
import { useAccentFromImage } from '../hooks/hoy/useAccentFromImage';

const SPRING = 'cubic-bezier(0.22, 1, 0.36, 1)';

const styles = {
  outer: {
    width: '100%',
    height: '100%',
    perspective: 2400,
  },
  face: {
    position: 'absolute',
    inset: 0,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#0a0a0a',
    display: 'flex',
    flexDirection: 'column',
  },
  imageBackdrop: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
  },
  image: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    pointerEvents: 'none',
    opacity: 0,
    transition: `opacity 600ms ${SPRING}`,
  },
  imageLoaded: {
    opacity: 1,
  },
  imageOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(180deg, rgba(0,0,0,0.16) 0%, rgba(0,0,0,0.10) 40%, rgba(0,0,0,0.78) 100%)',
    pointerEvents: 'none',
  },
  imagePlaceholder: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(255,255,255,0.2)',
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  body: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    color: '#fff',
  },
  textBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  kicker: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.6)',
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: -0.3,
    lineHeight: 1.15,
    color: '#fff',
  },
  count: {
    fontSize: 13,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.55)',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: 0.2,
  },
  button: {
    width: '100%',
    height: 56,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    color: '#1a1a1a',
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: 0.3,
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: `transform 200ms ${SPRING}, background-color 200ms ${SPRING}`,
  },
};

const AdditionalResourcesCard = ({ course, count = 0, onOpen }) => {
  const programTitle = course?.title || '';
  const imageUrl = course?.image_url || null;
  const accent = useAccentFromImage(imageUrl);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageBroken, setImageBroken] = useState(false);

  const accentVarsStyle = accent
    ? {
        '--accent': accent.accent,
        '--accent-r': accent.accentR,
        '--accent-g': accent.accentG,
        '--accent-b': accent.accentB,
        '--accent-text': accent.accentText,
      }
    : {};

  const countLabel = `${count} ${count === 1 ? 'recurso' : 'recursos'}`;
  const buttonStyle = accent
    ? { ...styles.button, backgroundColor: accent.accent, color: accent.accentText }
    : styles.button;

  const handleOpen = (e) => {
    e?.stopPropagation?.();
    onOpen?.();
  };

  return (
    <div style={{ ...styles.outer, ...accentVarsStyle }}>
      <div style={styles.face}>
        <div style={styles.imageBackdrop} />
        {imageUrl && !imageBroken ? (
          <img
            src={imageUrl}
            alt={programTitle}
            style={imageLoaded ? { ...styles.image, ...styles.imageLoaded } : styles.image}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageBroken(true)}
          />
        ) : (
          <div style={styles.imagePlaceholder}>imagen del programa</div>
        )}
        <div style={styles.imageOverlay} />
        <div style={styles.body}>
          <div style={styles.textBlock}>
            {programTitle ? <span style={styles.kicker}>{programTitle}</span> : null}
            <span style={styles.title}>Recursos</span>
            <span style={styles.count}>{countLabel}</span>
          </div>
          <button type="button" style={buttonStyle} onClick={handleOpen}>
            Ver
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdditionalResourcesCard;
