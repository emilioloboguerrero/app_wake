import { useEffect, useRef } from 'react';

export default function AuroraBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let animationId;
    let time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resize();
    window.addEventListener('resize', resize);

    const blobs = [
      { x: 0.3, y: 0.4, r: 0.35, speed: 0.0003, phase: 0, color: [255, 87, 168] },
      { x: 0.7, y: 0.6, r: 0.3, speed: 0.0004, phase: 2, color: [255, 87, 168] },
      { x: 0.5, y: 0.3, r: 0.25, speed: 0.0005, phase: 4, color: [255, 87, 168] },
    ];

    const draw = () => {
      time += 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      blobs.forEach((blob) => {
        const x = canvas.width * (blob.x + Math.sin(time * blob.speed + blob.phase) * 0.1);
        const y = canvas.height * (blob.y + Math.cos(time * blob.speed * 0.7 + blob.phase) * 0.08);
        const r = Math.min(canvas.width, canvas.height) * blob.r;

        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        const [cr, cg, cb] = blob.color;
        gradient.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.06)`);
        gradient.addColorStop(0.5, `rgba(${cr}, ${cg}, ${cb}, 0.02)`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      });

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}
