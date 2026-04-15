import React, { useState, useEffect, useRef } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { getMainHeroLandingImages } from '../services/heroImagesService';
import wakeIcon from '../assets/hero-logo.svg';
import wakeLogo from '../assets/Logotipo-WAKE-positivo.svg';
import wakeLogotype from '../assets/wake-logotype.svg';
import './ShowcaseLandingScreen.css';

const SLIDE_INTERVAL = 4000;
// Keep the hero slideshow small — every image is mounted and composited.
const FALLBACK_IMAGES = [
  '/fallback/hero/IMG_3247.webp',
  '/fallback/hero/IMG_3250.webp',
  '/fallback/hero/IMG_3257.webp',
  '/fallback/hero/IMG_9394.webp',
  '/fallback/hero/IMG_9401.webp',
  '/fallback/hero/IMG_9402.webp',
];


/* ═══════════════════════════════════════════
   PHONE SHOWCASE SECTION
   Scroll-driven sticky showcase.
   Timeline:
     0.00 – 0.05  phone + opener fade in (phone rotated 90°)
     0.05 – 0.15  opener held
     0.15 – 0.20  opener fades out
     0.20 – 0.30  phone rotates 90° → 0°
     0.30 – 0.38  phase 1 fades in
     0.38 – 0.48  phase 1 held
     0.48 – 0.52  swipe to phase 2 (TikTok-style vertical)
     0.52 – 0.62  phase 2 held
     0.62 – 0.66  swipe to phase 3
     0.66 – 0.76  phase 3 held
     0.76 – 0.82  phrase fades out
     0.78 – 0.92  card explosion
     0.92 – 1.00  phone + cards fade out
   Layout:
     Desktop ≥900px : 2-col grid, phone LEFT, copy RIGHT
     Mobile  <900px : single col, copy TOP, phone BOTTOM (cut off)
   ═══════════════════════════════════════════ */

const PHONE_SCREENS = [
  '/fallback/flow/workout.webp',
  '/fallback/flow/nutrition.webp',
  '/fallback/flow/events.webp',
];

const OPENER = (
  <>Somos la <strong>plataforma</strong> detrás del rendimiento de los <strong>mejores atletas</strong></>
);

const PHRASES = [
  <><strong>Entrenas</strong> con los programas que ellos diseñan semana a semana</>,
  <>Comes con los <strong>planes de nutrición</strong> que ellos te arman</>,
  <>Vas a los parches y <strong>eventos</strong> que ellos organizan en persona</>,
];

function AuroraCanvas({ className, intensity = 1 }) {
  const canvasRef = useRef(null);
  const intensityRef = useRef(intensity);
  useEffect(() => { intensityRef.current = intensity; }, [intensity]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let frame = null;
    let time = 0;
    let visible = false;
    let docVisible = !document.hidden;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (w === 0 || h === 0) return;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    };

    const draw = () => {
      const k = intensityRef.current;
      time += 1;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const blobs = [
        { x: 0.5, y: 0.5, r: 0.45, speed: 0.0002, phase: 0 },
        { x: 0.35, y: 0.45, r: 0.3, speed: 0.0003, phase: 1.5 },
        { x: 0.65, y: 0.55, r: 0.3, speed: 0.00035, phase: 3 },
      ];
      for (const blob of blobs) {
        const x = w * (blob.x + Math.sin(time * blob.speed + blob.phase) * 0.08);
        const y = h * (blob.y + Math.cos(time * blob.speed * 0.7 + blob.phase) * 0.06);
        const r = Math.min(w, h) * blob.r;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, `rgba(255, 87, 168, ${0.07 * k})`);
        grad.addColorStop(0.4, `rgba(255, 87, 168, ${0.03 * k})`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }
      frame = requestAnimationFrame(draw);
    };

    const start = () => {
      if (frame == null && visible && docVisible) {
        frame = requestAnimationFrame(draw);
      }
    };
    const stop = () => {
      if (frame != null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) start();
        else stop();
      },
      { rootMargin: '100px' }
    );
    io.observe(canvas);

    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);
    resize();

    const onVisibility = () => {
      docVisible = !document.hidden;
      if (docVisible) start();
      else stop();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  return <canvas ref={canvasRef} className={className} />;
}

function PhoneShowcaseSection() {
  const sectionRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Phone — rotation, scale, opacity (Z axis only, no 3D)
  const phoneRotateZ = useTransform(scrollYProgress, [0, 0.20, 0.30], [90, 90, 0]);
  // After phrase 3 (at 0.78): phone first moves up to center, THEN scales up (camera enters screen)
  const desktopPhoneScale = useTransform(
    scrollYProgress,
    [0, 0.05, 0.30, 0.76, 0.88],
    [0.85, 0.92, 1, 1, 10]
  );
  const mobilePhoneScale = useTransform(
    scrollYProgress,
    [0, 0.20, 0.30, 0.76, 0.88],
    [0.55, 0.55, 1, 1, 10]
  );
  const phoneScale = isMobile ? mobilePhoneScale : desktopPhoneScale;

  // Mobile: phone slides in horizontally from left (-110vw → 0) over 0.05–0.15
  const mobilePhoneXNum = useTransform(scrollYProgress, [0, 0.05, 0.15], [-110, -110, 0]);
  const mobilePhoneX = useTransform(mobilePhoneXNum, (v) => `${v}vw`);

  // Mobile: bottom-cut during phrases; rises to viewport center first (0.78–0.85), then scale takes over
  const mobilePhoneYNum = useTransform(
    scrollYProgress,
    [0, 0.20, 0.30, 0.72, 0.78],
    [0, 0, 36, 36, 0]
  );
  const mobilePhoneY = useTransform(mobilePhoneYNum, (v) => `${v}vh`);

  // Fade synced with the zoom: image + black phone screen background fade as the camera
  // enters. Starts during phrase 3, fully gone by the time the zoom completes.
  const screenOpacity = useTransform(scrollYProgress, [0.66, 0.88], [1, 0]);
  const stickyBgOpacity = useTransform(scrollYProgress, [0.66, 0.88], [1, 0]);
  const screenBg = useTransform(screenOpacity, (v) => `rgba(10,10,10,${v})`);

  // Phone frame (iPhone SVG bezel) fades out during zoom so we're looking at just screen content
  const overlayOpacity = useTransform(scrollYProgress, [0.76, 0.84], [1, 0]);

  // Opener — desktop: enters from below, holds, exits upward.
  // Mobile: fully opaque until phone covers it, then cuts out while covered (before phone moves away)
  const desktopOpenerOpacity = useTransform(scrollYProgress, [0, 0.04, 0.15, 0.20], [0, 1, 1, 0]);
  const mobileOpenerOpacity = useTransform(scrollYProgress, [0, 0.16, 0.19, 1], [1, 1, 0, 0]);
  const mobileOpenerVisibility = useTransform(scrollYProgress, (v) => (v >= 0.19 ? 'hidden' : 'visible'));
  const openerOpacity = isMobile ? mobileOpenerOpacity : desktopOpenerOpacity;
  const openerY = useTransform(scrollYProgress, [0, 0.05, 0.15, 0.20], [40, 0, 0, -40]);


  // Shared vertical-swipe translate for phone screens + copy phrases.
  // Percent strings — motion translates by % of each element's own height.
  const stackY = useTransform(
    scrollYProgress,
    [0, 0.30, 0.34, 0.44, 0.48, 0.58, 0.62],
    ['0%', '0%', '-100%', '-100%', '-200%', '-200%', '-300%']
  );
  // Aurora background — fully visible during opener, snaps off when phone covers it at scroll 0.15
  const auroraOpacity = useTransform(scrollYProgress, (v) => (v < 0.15 ? 1 : 0));

  // Each phrase shows only during its window — phrase 3 stays visible until zoom covers it
  const phrase1Op = useTransform(scrollYProgress, (v) => (v >= 0.34 && v < 0.48 ? 1 : 0));
  const phrase2Op = useTransform(scrollYProgress, (v) => (v >= 0.48 && v < 0.62 ? 1 : 0));
  const phrase3Op = useTransform(scrollYProgress, (v) => (v >= 0.62 && v < 0.80 ? 1 : 0));
  const phraseOps = [phrase1Op, phrase2Op, phrase3Op];

  return (
    <section className="ps-section" ref={sectionRef}>
      <div className="ps-sticky">
        <motion.div className="ps-sticky-bg" style={{ opacity: stickyBgOpacity }} aria-hidden="true" />
        <motion.div className="ps-aurora-wrap" style={{ opacity: auroraOpacity }}>
          <AuroraCanvas className="ps-aurora" intensity={1.8} />
        </motion.div>
        <div className="ps-grid">
          {/* ── Phone column ── */}
          <div className="ps-phone-col">
            <div className="ps-phone-wrap">
            <motion.div
              className="ps-phone"
              style={{
                rotateZ: phoneRotateZ,
                scale: phoneScale,
                ...(isMobile ? { x: mobilePhoneX, y: mobilePhoneY } : {}),
              }}
            >
              <div className="ps-phone-frame">
                <motion.div className="ps-phone-screen" style={{ opacity: screenOpacity, background: screenBg }}>
                  <motion.div className="ps-screen-stack" style={{ y: stackY }}>
                    <div className="ps-screen-slide ps-screen-slide-boot" style={{ top: '0%' }}>
                      <img src={wakeLogo} alt="Wake" className="ps-screen-boot-logo" />
                    </div>
                    {PHONE_SCREENS.map((src, i) => (
                      <div
                        key={src}
                        className="ps-screen-slide"
                        data-idx={i}
                        style={{ top: `${(i + 1) * 100}%` }}
                      >
                        <img
                          src={src}
                          alt=""
                          className="ps-screen-img"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                    ))}
                  </motion.div>
                </motion.div>
                <motion.img
                  src="/fallback/phone/iPhone 17 - Black - Portrait.svg"
                  alt=""
                  className="ps-phone-overlay"
                  aria-hidden="true"
                  style={{ opacity: overlayOpacity }}
                />
              </div>
            </motion.div>
            </div>
          </div>

          {/* ── Copy column ── */}
          <div className="ps-copy-col">
            <motion.h2
              className="ps-opener"
              style={isMobile ? { opacity: openerOpacity, visibility: mobileOpenerVisibility } : { opacity: openerOpacity, y: openerY }}
            >
              {OPENER}
            </motion.h2>
          </div>
        </div>

        <div className="ps-phrase-window">
          {PHRASES.map((text, i) => (
            <motion.p
              key={i}
              className="ps-phrase-slide"
              style={{ opacity: phraseOps[i] }}
            >
              {text}
            </motion.p>
          ))}
        </div>

      </div>
    </section>
  );
}


/* ═══════════════════════════════════════════
   REVEAL SECTION — "Eso es Wake."
   ═══════════════════════════════════════════ */
function RevealSection() {
  const ref = useRef(null);
  const [triggered, setTriggered] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setTriggered(true); },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="tl-reveal" ref={ref}>
      <AuroraCanvas className="tl-reveal-aurora" intensity={triggered ? 1.8 : 0.5} />

      {/* Pulse ring on reveal */}
      <div className={`tl-reveal-pulse ${triggered ? 'tl-reveal-pulse-go' : ''}`} />
      <div className={`tl-reveal-pulse tl-reveal-pulse-2 ${triggered ? 'tl-reveal-pulse-go' : ''}`} />

      <div className={`tl-reveal-content ${triggered ? 'tl-reveal-triggered' : ''}`}>
        <span className="tl-reveal-eso">Solo en</span>
        <img src={wakeLogo} alt="Wake" className="tl-reveal-logo" />
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   ATHLETES PARALLAX GALLERY
   Vertical scroll → horizontal parallax drift
   ═══════════════════════════════════════════ */

const HERO_PATHS = [
  '/fallback/hero/IMG_2321.webp',
  '/fallback/hero/IMG_3247.webp',
  '/fallback/hero/IMG_3248.webp',
  '/fallback/hero/IMG_3249.webp',
  '/fallback/hero/IMG_3250.webp',
  '/fallback/hero/IMG_3251.webp',
  '/fallback/hero/IMG_3252.webp',
  '/fallback/hero/IMG_3253.webp',
  '/fallback/hero/IMG_3255.webp',
  '/fallback/hero/IMG_3256.webp',
  '/fallback/hero/IMG_3257.webp',
  '/fallback/hero/IMG_3258.webp',
  '/fallback/hero/IMG_3259.webp',
  '/fallback/hero/IMG_3260.webp',
  '/fallback/hero/IMG_3261.webp',
  '/fallback/hero/IMG_9387.webp',
  '/fallback/hero/IMG_9388.webp',
  '/fallback/hero/IMG_9390.webp',
  '/fallback/hero/IMG_9391.webp',
  '/fallback/hero/IMG_9392.webp',
  '/fallback/hero/IMG_9393.webp',
  '/fallback/hero/IMG_9394.webp',
  '/fallback/hero/IMG_9396.webp',
  '/fallback/hero/IMG_9401.webp',
  '/fallback/hero/IMG_9402.webp',
  '/fallback/hero/img.webp',
];
const hp = (i) => HERO_PATHS[i % HERO_PATHS.length];

const ATHLETE_IMAGES = [
  // layer 0 — massive (near-viewport, very slow)
  { src: hp(0), layer: 0, top: '-5%', left: '2vw' },
  { src: hp(1), layer: 0, top: '10%', left: '120vw' },
  { src: hp(2), layer: 0, top: '-8%', left: '250vw' },
  { src: hp(3), layer: 0, top: '5%', left: '380vw' },
  { src: hp(4), layer: 0, top: '-3%', left: '510vw' },
  { src: hp(5), layer: 0, top: '8%', left: '650vw' },
  // layer 1 — large
  { src: hp(6), layer: 1, top: '5%', left: '40vw' },
  { src: hp(7), layer: 1, top: '42%', left: '150vw' },
  { src: hp(8), layer: 1, top: '8%', left: '230vw' },
  { src: hp(9), layer: 1, top: '50%', left: '320vw' },
  { src: hp(10), layer: 1, top: '15%', left: '420vw' },
  { src: hp(11), layer: 1, top: '45%', left: '530vw' },
  { src: hp(12), layer: 1, top: '6%', left: '620vw' },
  { src: hp(13), layer: 1, top: '52%', left: '710vw' },
  // layer 2 — medium
  { src: hp(14), layer: 2, top: '55%', left: '10vw' },
  { src: hp(15), layer: 2, top: '3%', left: '90vw' },
  { src: hp(16), layer: 2, top: '48%', left: '180vw' },
  { src: hp(17), layer: 2, top: '10%', left: '280vw' },
  { src: hp(18), layer: 2, top: '58%', left: '370vw' },
  { src: hp(19), layer: 2, top: '20%', left: '460vw' },
  { src: hp(20), layer: 2, top: '52%', left: '550vw' },
  { src: hp(21), layer: 2, top: '5%', left: '640vw' },
  { src: hp(22), layer: 2, top: '60%', left: '720vw' },
  // layer 3 — small, fast
  { src: hp(23), layer: 3, top: '65%', left: '25vw' },
  { src: hp(24), layer: 3, top: '8%', left: '115vw' },
  { src: hp(25), layer: 3, top: '70%', left: '200vw' },
  { src: hp(0), layer: 3, top: '15%', left: '340vw' },
  { src: hp(1), layer: 3, top: '60%', left: '440vw' },
  { src: hp(2), layer: 3, top: '30%', left: '500vw' },
  { src: hp(3), layer: 3, top: '72%', left: '580vw' },
  { src: hp(4), layer: 3, top: '12%', left: '660vw' },
  { src: hp(5), layer: 3, top: '55%', left: '730vw' },
];

// Speed multiplier per layer: back=slowest, front=fastest
const LAYER_SPEED = [0.2, 0.4, 0.65, 1.0];
const LAYER_CLASS = ['tl-ag-img-xl', 'tl-ag-img-lg', 'tl-ag-img-md', 'tl-ag-img-sm'];

function AthletesGallery() {
  const sectionRef = useRef(null);
  const trackRef = useRef(null);
  const hintRef = useRef(null);

  useEffect(() => {
    let ticking = false;
    let sectionH = 0;
    let totalTravel = 0;
    let vh = window.innerHeight;
    let imageEntries = [];
    let near = false;

    const measure = () => {
      const section = sectionRef.current;
      const track = trackRef.current;
      if (!section || !track) return;
      vh = window.innerHeight;
      sectionH = section.offsetHeight;
      totalTravel = track.scrollWidth - vh;
      imageEntries = Array.from(track.querySelectorAll('.tl-ag-img')).map((el) => ({
        el,
        speed: parseFloat(el.dataset.speed),
      }));
    };

    const update = () => {
      const section = sectionRef.current;
      const track = trackRef.current;
      if (!section || !track) return;

      const rect = section.getBoundingClientRect();
      const scrolled = -rect.top;

      const fadeStart = vh * -0.9;
      const fadeEnd = vh * -0.2;

      const rawFade = scrolled <= fadeStart ? 0
        : scrolled >= fadeEnd ? 1
        : (scrolled - fadeStart) / (fadeEnd - fadeStart);
      const fadeOpacity = 0.06 + rawFade * 0.94;

      track.style.opacity = fadeOpacity;

      if (hintRef.current) {
        hintRef.current.style.opacity = Math.max(0, 1 - rawFade * 3);
      }

      const denom = Math.max(1, sectionH - vh);
      const moveProgress = scrolled <= 0 ? 0 : Math.min(scrolled / denom, 1);

      for (let i = 0; i < imageEntries.length; i++) {
        const { el, speed } = imageEntries[i];
        const x = -moveProgress * totalTravel * speed;
        el.style.transform = `translate3d(${x}px, 0, 0)`;
      }
    };

    const onScroll = () => {
      if (!near || ticking) return;
      ticking = true;
      requestAnimationFrame(() => { update(); ticking = false; });
    };

    measure();
    const onResize = () => { measure(); update(); };

    const io = new IntersectionObserver(
      ([entry]) => { near = entry.isIntersecting; if (near) update(); },
      { rootMargin: '200px 0px' }
    );
    if (sectionRef.current) io.observe(sectionRef.current);

    const track = trackRef.current;
    const imgEls = track ? track.querySelectorAll('img') : [];
    const onImgLoad = () => { measure(); update(); };
    imgEls.forEach((img) => {
      if (!img.complete) img.addEventListener('load', onImgLoad, { once: true });
    });

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      io.disconnect();
      imgEls.forEach((img) => img.removeEventListener('load', onImgLoad));
    };
  }, []);

  return (
    <section className="tl-ag" ref={sectionRef}>
      <div className="tl-ag-sticky">
        <div className="tl-ag-track" ref={trackRef}>
          {ATHLETE_IMAGES.map((img, i) => (
            <div
              key={i}
              className={`tl-ag-img ${LAYER_CLASS[img.layer]}`}
              data-speed={LAYER_SPEED[img.layer]}
              style={{ top: img.top, left: img.left }}
            >
              <img src={img.src} alt="" loading="lazy" decoding="async" />
            </div>
          ))}
        </div>
        <div className="tl-ag-overlay" />
        <p className="tl-ag-quote">
          En busca de la grandeza<br />
          que admiro en otros.
        </p>
        <div className="tl-ag-scroll-hint" ref={hintRef}>
          <div className="tl-ag-scroll-line" />
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   NAV
   ═══════════════════════════════════════════ */
const NAV_LINKS = [
  { label: 'Creadores', href: '/creators' },
  { label: 'Devs', href: '/developers' },
];

function Nav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <nav className="tl-nav">
      <a href="/" className="tl-nav-logo">
        <img src={wakeLogotype} alt="Wake" />
      </a>

      {/* Desktop links */}
      <div className="tl-nav-links">
        {NAV_LINKS.map((link) => (
          <a key={link.href} href={link.href} className="tl-nav-link">{link.label}</a>
        ))}
        <a href="/app" className="tl-nav-cta">Ir a la app</a>
      </div>

      {/* Mobile: CTA + hamburger */}
      <div className="tl-nav-mobile-right">
        <a href="/app" className="tl-nav-mobile-cta">Ir a la app</a>
        <button
          type="button"
          className="tl-nav-burger"
          onClick={() => setOpen(true)}
          aria-label="Menu"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <>
          <div className="tl-nav-overlay" onClick={() => setOpen(false)} />
          <div className="tl-nav-drawer">
            <button
              type="button"
              className="tl-nav-close"
              onClick={() => setOpen(false)}
              aria-label="Cerrar"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <div className="tl-nav-drawer-links">
              {NAV_LINKS.map((link) => (
                <a key={link.href} href={link.href} className="tl-nav-drawer-link">{link.label}</a>
              ))}
              <a href="/app" className="tl-nav-drawer-cta">Ir a la app</a>
            </div>
          </div>
        </>
      )}
    </nav>
  );
}

/* ═══════════════════════════════════════════
   CTA SECTION
   ═══════════════════════════════════════════ */
function CtaSection() {
  return (
    <section className="tl-cta">
      <a href="/app" className="tl-cta-button">Empieza a entrenar</a>
    </section>
  );
}

/* ═══════════════════════════════════════════
   FOOTER
   ═══════════════════════════════════════════ */
function LandingFooter() {
  return (
    <footer className="tl-footer">
      <div className="tl-footer-top">
        <div className="tl-footer-brand">
          <img src={wakeLogo} alt="Wake" className="tl-footer-logo" />
        </div>
        <div className="tl-footer-links">
          <a href="/app" className="tl-footer-link">App</a>
          <a href="/creators" className="tl-footer-link">Creadores</a>
          <a href="/support" className="tl-footer-link">Soporte</a>
          <a href="/legal" className="tl-footer-link">Legal</a>
        </div>
      </div>
      <div className="tl-footer-bottom">
        <span className="tl-footer-copy">&copy; {new Date().getFullYear()} Wake. Todos los derechos reservados.</span>
        <a href="mailto:emilioloboguerrero@gmail.com" className="tl-footer-email">emilioloboguerrero@gmail.com</a>
      </div>
    </footer>
  );
}

/* ═══════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════ */
export default function ShowcaseLandingScreen() {
  const [images, setImages] = useState(FALLBACK_IMAGES);
  const [current, setCurrent] = useState(0);
  const [heroOpacity, setHeroOpacity] = useState(1);

  useEffect(() => {
    getMainHeroLandingImages().then((imgs) => {
      if (imgs.length > 0) setImages(imgs);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (images.length <= 1) return;
    const id = setInterval(() => {
      setCurrent((i) => (i + 1) % images.length);
    }, SLIDE_INTERVAL);
    return () => clearInterval(id);
  }, [images.length]);

  // Fade hero on scroll
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const vh = window.innerHeight;
        const y = window.scrollY || window.pageYOffset;
        const fadeStart = vh * 0.3;
        const fadeEnd = vh * 0.85;
        const p = Math.min(Math.max((y - fadeStart) / (fadeEnd - fadeStart), 0), 1);
        setHeroOpacity(1 - p);
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="test-landing">
      <Nav />
      <section className="tl-hero">
        <div
          className="tl-slideshow"
          style={{ opacity: heroOpacity }}
        >
          {images.map((url, i) => (
            <div
              key={url}
              className={`tl-slide ${i === current ? 'tl-slide-active' : ''}`}
            >
              <img
                src={url}
                alt=""
                loading={i === 0 ? 'eager' : 'lazy'}
                decoding="async"
                fetchpriority={i === 0 ? 'high' : 'low'}
              />
            </div>
          ))}
          <div className="tl-slideshow-overlay" />
        </div>
        <img
          src={wakeIcon}
          alt=""
          className="tl-hero-icon"
          aria-hidden="true"
          style={{ opacity: 0.22 * heroOpacity }}
        />
        <h1
          className="tl-hero-statement"
          style={{ opacity: heroOpacity }}
        >
          Sé lo que admiras.
        </h1>
      </section>

      <div className="tl-transition" />
      <PhoneShowcaseSection />
      <AthletesGallery />
      <RevealSection />
      <CtaSection />
      <LandingFooter />
    </div>
  );
}
