// Nutrition card — front: rings for kcal/macros over a faint image backdrop.
// Back: macro detail (P/C/F numbers + progress bars) + "Registrar comida" CTA.
//
// Phase 2 wires real values from the user's nutrition plan + today's diary entries.
import React, { useState } from 'react';

const TRACK = 'rgba(255,255,255,0.08)';
const FILL = 'rgba(255,255,255,0.85)';
const SPRING = 'cubic-bezier(0.22, 1, 0.36, 1)';

const styles = {
  outer: {
    width: '100%',
    height: '100%',
    perspective: 1200,
    cursor: 'pointer',
  },
  inner: {
    position: 'relative',
    width: '100%',
    height: '100%',
    transformStyle: 'preserve-3d',
    transition: `transform 700ms ${SPRING}`,
  },
  face: {
    position: 'absolute',
    inset: 0,
    borderRadius: 24,
    overflow: 'hidden',
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  back: {
    transform: 'rotateY(180deg)',
    border: '1px solid rgba(255,255,255,0.07)',
    display: 'flex',
    flexDirection: 'column',
  },
  image: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    opacity: 0,
    pointerEvents: 'none',
    transition: `opacity 600ms ${SPRING}`,
  },
  imageLoaded: {
    opacity: 0.3,
  },
  body: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    padding: 28,
    color: '#fff',
    pointerEvents: 'none',
  },
  kicker: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)',
  },
  ringWrap: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringContainer: {
    position: 'relative',
    width: 200,
    height: 200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  ringValue: {
    fontSize: 42,
    fontWeight: 600,
    letterSpacing: -1,
    lineHeight: 1,
  },
  ringUnit: {
    fontSize: 10,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)',
    marginTop: 6,
  },
  ringTarget: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  macroRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 12,
  },
  macroCell: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
  },
  macroValue: {
    fontSize: 14,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.9)',
  },
  macroLabel: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.4)',
  },
  expiredBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: '6px 12px',
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    border: '1px solid rgba(255,255,255,0.15)',
    zIndex: 2,
  },

  // Back face
  backBody: {
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    color: '#fff',
    gap: 24,
  },
  backHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  backTitle: {
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: -0.3,
    color: '#fff',
  },
  detailList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    flex: 1,
  },
  detailRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  detailHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.85)',
  },
  detailValue: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  detailValueStrong: {
    color: '#fff',
    fontWeight: 600,
  },
  bar: {
    height: 3,
    width: '100%',
    backgroundColor: TRACK,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: FILL,
    borderRadius: 2,
    transition: `width 600ms ${SPRING}`,
  },
  beginRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  beginButton: {
    height: 56,
    width: '100%',
    borderRadius: 14,
    backgroundColor: '#fff',
    color: '#1a1a1a',
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: 0.3,
    border: 'none',
    cursor: 'pointer',
  },
  flipHint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
};

const formatNumber = (n) => Math.round(Number(n || 0)).toLocaleString('es-CO');
const clampPct = (n, t) => (t > 0 ? Math.min(1, Math.max(0, n / t)) : 0);

const polarToCartesian = (cx, cy, r, angleDeg) => {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};

const arcPath = (cx, cy, r, startAngle, sweepAngle) => {
  const end = startAngle + sweepAngle;
  const start = polarToCartesian(cx, cy, r, startAngle);
  const endPt = polarToCartesian(cx, cy, r, end);
  const largeArc = sweepAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${endPt.x} ${endPt.y}`;
};

const FullRing = ({ size, stroke, value, target }) => {
  const center = size / 2;
  const r = center - stroke / 2;
  const c = 2 * Math.PI * r;
  const pct = clampPct(value, target);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={center} cy={center} r={r} stroke={TRACK} strokeWidth={stroke} fill="none" />
      <circle
        cx={center}
        cy={center}
        r={r}
        stroke={FILL}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`}
        style={{ transition: `stroke-dashoffset 700ms ${SPRING}` }}
      />
    </svg>
  );
};

const HalfRing = ({ size, stroke, value, target }) => {
  const center = size / 2;
  const r = center - stroke / 2;
  const pct = clampPct(value, target);
  const trackPath = arcPath(center, center, r, -90, 180);
  const halfCircumference = Math.PI * r;
  return (
    <svg width={size} height={size / 2 + stroke / 2} viewBox={`0 0 ${size} ${size / 2 + stroke / 2}`}>
      <path d={trackPath} stroke={TRACK} strokeWidth={stroke} fill="none" strokeLinecap="round" />
      <path
        d={trackPath}
        stroke={FILL}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={halfCircumference}
        strokeDashoffset={halfCircumference * (1 - pct)}
        style={{ transition: `stroke-dashoffset 700ms ${SPRING}` }}
      />
    </svg>
  );
};

const MacroCell = ({ label, value, target }) => (
  <div style={styles.macroCell}>
    <HalfRing size={64} stroke={3} value={value} target={target} />
    <span style={styles.macroValue}>{formatNumber(value)}g</span>
    <span style={styles.macroLabel}>{label}</span>
  </div>
);

const DetailRow = ({ label, value, target, unit = 'g' }) => {
  const pct = clampPct(value, target) * 100;
  return (
    <div style={styles.detailRow}>
      <div style={styles.detailHead}>
        <span style={styles.detailLabel}>{label}</span>
        <span style={styles.detailValue}>
          <span style={styles.detailValueStrong}>{formatNumber(value)}{unit}</span> de {formatNumber(target)}{unit}
        </span>
      </div>
      <div style={styles.bar}>
        <div style={{ ...styles.barFill, width: `${pct}%` }} />
      </div>
    </div>
  );
};

const TodayNutritionCard = ({
  imageUrl,
  nutritionPlanName,
  caloriesConsumed = 0,
  caloriesTarget = 2100,
  proteinConsumed = 0,
  proteinTarget = 150,
  carbsConsumed = 0,
  carbsTarget = 250,
  fatConsumed = 0,
  fatTarget = 70,
  isExpired = false,
  onLogMeal,
}) => {
  const [flipped, setFlipped] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const handleFlip = (e) => {
    e?.stopPropagation?.();
    setFlipped((f) => !f);
  };
  const handleLogMeal = (e) => {
    e?.stopPropagation?.();
    onLogMeal?.();
  };

  return (
    <div style={styles.outer} role="button" tabIndex={0}>
      <div style={{ ...styles.inner, transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
        {/* FRONT */}
        <div style={styles.face} onClick={handleFlip}>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              style={imageLoaded ? { ...styles.image, ...styles.imageLoaded } : styles.image}
              onLoad={() => setImageLoaded(true)}
            />
          ) : null}
          <div style={styles.body}>
            {nutritionPlanName ? <span style={styles.kicker}>{nutritionPlanName}</span> : null}
            <div style={styles.ringWrap}>
              <div style={styles.ringContainer}>
                <FullRing size={200} stroke={4} value={caloriesConsumed} target={caloriesTarget} />
                <div style={styles.ringCenter}>
                  <span style={styles.ringValue}>{formatNumber(caloriesConsumed)}</span>
                  <span style={styles.ringUnit}>kcal</span>
                  <span style={styles.ringTarget}>de {formatNumber(caloriesTarget)}</span>
                </div>
              </div>
            </div>
            <div style={styles.macroRow}>
              <MacroCell label="Proteína" value={proteinConsumed} target={proteinTarget} />
              <MacroCell label="Carbs" value={carbsConsumed} target={carbsTarget} />
              <MacroCell label="Grasas" value={fatConsumed} target={fatTarget} />
            </div>
          </div>
          {isExpired ? <div style={styles.expiredBadge}>Expirado</div> : null}
        </div>

        {/* BACK */}
        <div style={{ ...styles.face, ...styles.back }} onClick={handleFlip}>
          <div style={styles.backBody}>
            <div style={styles.backHeader}>
              {nutritionPlanName ? <span style={styles.kicker}>{nutritionPlanName}</span> : null}
              <span style={styles.backTitle}>Detalle de hoy</span>
            </div>

            <div style={styles.detailList}>
              <DetailRow label="Calorías" value={caloriesConsumed} target={caloriesTarget} unit=" kcal" />
              <DetailRow label="Proteína" value={proteinConsumed} target={proteinTarget} />
              <DetailRow label="Carbs" value={carbsConsumed} target={carbsTarget} />
              <DetailRow label="Grasas" value={fatConsumed} target={fatTarget} />
            </div>

            <div style={styles.beginRow}>
              <button style={styles.beginButton} onClick={handleLogMeal}>
                Registrar comida
              </button>
              <span style={styles.flipHint}>Toca la tarjeta para volver</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TodayNutritionCard;
