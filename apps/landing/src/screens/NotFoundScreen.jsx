import React, { useEffect, useRef } from 'react';
import './NotFoundScreen.css';

const LINKS = [
  {
    label: 'Home',
    href: '/',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 11.5L12 4l9 7.5" />
        <path d="M5 10v10h14V10" />
      </svg>
    ),
  },
  {
    label: 'Creator',
    href: '/creators',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c1.2-3.8 4-5.5 7-5.5s5.8 1.7 7 5.5" />
      </svg>
    ),
  },
  {
    label: 'Dev',
    href: '/developers',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 7l-5 5 5 5" />
        <path d="M16 7l5 5-5 5" />
        <path d="M14 5l-4 14" />
      </svg>
    ),
  },
  {
    label: 'App',
    href: '/app',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
        <line x1="10.5" y1="18.5" x2="13.5" y2="18.5" />
      </svg>
    ),
  },
];

export default function NotFoundScreen() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let frame;
    let time = 0;

    const resize = () => {
      canvas.width = canvas.offsetWidth * 2;
      canvas.height = canvas.offsetHeight * 2;
    };
    resize();
    window.addEventListener('resize', resize);

    const blobs = [
      { x: 0.5,  y: 0.5,  r: 0.45, speed: 0.0002,  phase: 0 },
      { x: 0.35, y: 0.45, r: 0.3,  speed: 0.0003,  phase: 1.5 },
      { x: 0.65, y: 0.55, r: 0.3,  speed: 0.00035, phase: 3 },
    ];

    const draw = () => {
      time += 1;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const intensity = 1.4;

      blobs.forEach((blob) => {
        const x = w * (blob.x + Math.sin(time * blob.speed + blob.phase) * 0.08);
        const y = h * (blob.y + Math.cos(time * blob.speed * 0.7 + blob.phase) * 0.06);
        const r = Math.min(w, h) * blob.r;

        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, `rgba(255, 87, 168, ${0.07 * intensity})`);
        grad.addColorStop(0.4, `rgba(255, 87, 168, ${0.03 * intensity})`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      });

      frame = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <section className="nf-screen">
      <canvas ref={canvasRef} className="nf-aurora" aria-hidden="true" />

      <div className="nf-inner">
        <p className="nf-eyebrow">404</p>
        <h1 className="nf-title">por aquí no fue</h1>
      </div>

      <nav className="nf-pills" aria-label="Ir a">
        {LINKS.map((link) => (
          <a key={link.href} href={link.href} className="nf-pill">
            <span className="nf-pill-icon">{link.icon}</span>
            <span className="nf-pill-label">{link.label}</span>
          </a>
        ))}
      </nav>
    </section>
  );
}
