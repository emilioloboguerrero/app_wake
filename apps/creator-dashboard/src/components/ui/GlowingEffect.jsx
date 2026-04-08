import { memo, useCallback, useEffect, useRef } from 'react';
import { animate } from 'motion';
import './GlowingEffect.css';

const GlowingEffect = memo(({
  spread = 40,
  proximity = 120,
  inactiveZone = 0,
  movementDuration = 1.5,
  borderWidth = 1,
  disabled = false,
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
      const distFromCenter = Math.hypot(mouseX - centerX, mouseY - centerY);
      const inactiveRadius = 0.5 * Math.min(width, height) * inactiveZone;

      if (distFromCenter < inactiveRadius) {
        el.style.setProperty('--active', '0');
        return;
      }

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
  }, [inactiveZone, proximity, movementDuration]);

  useEffect(() => {
    if (disabled) return;

    const onScroll = () => handleMove();
    const onPointerMove = (e) => handleMove(e);

    window.addEventListener('scroll', onScroll, { passive: true });
    document.body.addEventListener('pointermove', onPointerMove, { passive: true });

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      window.removeEventListener('scroll', onScroll);
      document.body.removeEventListener('pointermove', onPointerMove);
    };
  }, [handleMove, disabled]);

  if (disabled) return null;

  return (
    <div
      ref={containerRef}
      className="glowing-effect-wrapper"
      style={{
        '--spread': spread,
        '--border-width': `${borderWidth}px`,
      }}
    >
      <div className="glowing-effect-glow" />
    </div>
  );
});

GlowingEffect.displayName = 'GlowingEffect';
export default GlowingEffect;
