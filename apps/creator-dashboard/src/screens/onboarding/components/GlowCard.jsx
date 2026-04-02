import { memo, useCallback, useEffect, useRef } from 'react';
import { animate } from 'motion';
import './GlowCard.css';

const GlowingEffect = memo(({
  spread = 40,
  proximity = 140,
  movementDuration = 1.5,
  borderWidth = 1,
}) => {
  const containerRef = useRef(null);
  const lastPosition = useRef({ x: 0, y: 0 });
  const animationFrameRef = useRef(0);

  const handleMove = useCallback((e) => {
    if (!containerRef.current) return;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      const el = containerRef.current;
      if (!el) return;

      const { left, top, width, height } = el.getBoundingClientRect();
      const mouseX = e?.x ?? lastPosition.current.x;
      const mouseY = e?.y ?? lastPosition.current.y;

      if (e) lastPosition.current = { x: mouseX, y: mouseY };

      const centerX = left + width * 0.5;
      const centerY = top + height * 0.5;

      const isActive =
        mouseX > left - proximity &&
        mouseX < left + width + proximity &&
        mouseY > top - proximity &&
        mouseY < top + height + proximity;

      el.style.setProperty('--active', isActive ? '1' : '0');
      if (!isActive) return;

      const currentAngle = parseFloat(el.style.getPropertyValue('--start')) || 0;
      let targetAngle =
        (180 * Math.atan2(mouseY - centerY, mouseX - centerX)) / Math.PI + 90;

      const angleDiff = ((targetAngle - currentAngle + 180) % 360) - 180;
      const newAngle = currentAngle + angleDiff;

      animate(currentAngle, newAngle, {
        duration: movementDuration,
        ease: [0.16, 1, 0.3, 1],
        onUpdate: (value) => {
          el.style.setProperty('--start', String(value));
        },
      });
    });
  }, [proximity, movementDuration]);

  useEffect(() => {
    const onPointerMove = (e) => handleMove(e);
    document.body.addEventListener('pointermove', onPointerMove, { passive: true });

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      document.body.removeEventListener('pointermove', onPointerMove);
    };
  }, [handleMove]);

  return (
    <div
      ref={containerRef}
      className="ob-glow-wrapper"
      style={{
        '--spread': spread,
        '--border-width': `${borderWidth}px`,
      }}
    >
      <div className="ob-glow-inner" />
    </div>
  );
});

GlowingEffect.displayName = 'GlowingEffect';

export default function GlowCard({ children, style, borderWidth = 1, spread = 40, proximity = 140 }) {
  return (
    <div style={{ position: 'relative', ...style }}>
      <GlowingEffect borderWidth={borderWidth} spread={spread} proximity={proximity} />
      {children}
    </div>
  );
}
