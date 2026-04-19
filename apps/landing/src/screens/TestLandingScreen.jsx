import React, { useState, useEffect, useRef } from 'react';
import { motion, useScroll, useTransform, useMotionValueEvent } from 'motion/react';
import { getMainHeroLandingImages } from '../services/heroImagesService';
import wakeIcon from '../assets/hero-logo.svg';
import wakeLogo from '../assets/Logotipo-WAKE-positivo.svg';
import CascadeText from '../components/CascadeText';
import './TestLandingScreen.css';

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
     0.62 – 1.00  phase 3 held
     0.78 – 1.00  phone slides up off screen; phrase 3 follows at 0.82.
                  At progress 1.0 pst-sticky un-pins and slides up as a
                  curtain; tlt-ag-sticky pins in the same moment thanks
                  to tlt-ag's margin-top: -100vh — seamless handoff.
   Layout:
     Desktop ≥900px : 2-col grid, phone LEFT, copy RIGHT
     Mobile  <900px : single col, copy TOP, phone BOTTOM (cut off)
   ═══════════════════════════════════════════ */

const PHONE_SCREENS = [
  '/fallback/flow/workout.webp',
  '/fallback/flow/nutrition.webp',
  '/fallback/flow/events.webp',
];

// Continuous ticker shown while the phone is rotated 90° (pre-boot). The
// stack translates vertically, which reads as a horizontal swipe because the
// phone is rotated. Slides are sized so 2–3 words are always visible at once,
// creating a fluid scrolling-row feel. Final transition lands on the Wake logo.
const HORIZONTAL_WORDS = ['Los', 'mejores', 'atletas', 'están', 'en'];

const OPENER = (
  <>Somos la <strong>plataforma</strong> para el <strong>rendimiento</strong></>
);

// Each phrase is an array of { text, bold } chunks so we can split letters for
// the per-letter fade-in stagger while preserving bold emphasis runs.
const PHRASES = [
  [
    { text: 'Entrenas', bold: true },
    { text: ' con los programas que ellos diseñan semana a semana', bold: false },
  ],
  [
    { text: 'Comes con los ', bold: false },
    { text: 'planes de nutrición', bold: true },
    { text: ' que ellos te arman', bold: false },
  ],
  [
    { text: 'Vas a los parches y ', bold: false },
    { text: 'eventos', bold: true },
    { text: ' que ellos organizan en persona', bold: false },
  ],
];

function AnimatedPhrase({ chunks, visible }) {
  const tokens = [];
  chunks.forEach((chunk) => {
    const parts = chunk.text.split(/(\s+)/);
    parts.forEach((part) => {
      if (part.length === 0) return;
      if (/^\s+$/.test(part)) tokens.push({ type: 'space', text: part });
      else tokens.push({ type: 'word', text: part, bold: chunk.bold });
    });
  });

  let charIdx = 0;
  return (
    <>
      {tokens.map((token, ti) => {
        if (token.type === 'space') return <span key={`s-${ti}`}>{token.text}</span>;
        const Tag = token.bold ? 'strong' : 'span';
        return (
          <Tag key={`w-${ti}`} className="pst-phrase-word">
            {token.text.split('').map((char, li) => {
              const myIdx = charIdx++;
              return (
                <motion.span
                  key={li}
                  className="pst-phrase-letter"
                  initial={{ opacity: 0, y: -8 }}
                  animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
                  transition={{
                    duration: visible ? 0.45 : 0.2,
                    delay: visible ? myIdx * 0.022 : 0,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  {char}
                </motion.span>
              );
            })}
          </Tag>
        );
      })}
    </>
  );
}

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
  // Main tracker: runs while the section is sticky-pinned (0 → 1 during pin).
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });
  // Entry tracker: 0 when section first appears at the bottom of the viewport,
  // 1 when section top meets viewport top (pin begins). Drives the phone's
  // arrival so the entering animation plays while the page is still scrolling.
  const { scrollYProgress: enterProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'start start'],
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

  // Phone entry — waits off-screen through nearly the whole pre-pin scroll,
  // then slides in small and horizontal in the final stretch. Scale stays
  // small throughout the entry and only expands during the rotation.
  const phoneXNum = useTransform(enterProgress, [0, 0.85, 1], [110, 110, 0]);
  const phoneX = useTransform(phoneXNum, (v) => `${v}vw`);
  const phoneRotateZ = useTransform(scrollYProgress, [0.10, 0.15], [-90, 0]);
  const desktopPhoneScale = useTransform(scrollYProgress, [0.10, 0.15], [0.70, 1]);
  const mobilePhoneScale = useTransform(scrollYProgress, [0.10, 0.15], [0.60, 1]);
  const phoneScale = isMobile ? mobilePhoneScale : desktopPhoneScale;

  // Phone Y — slides up off the top of the viewport at the end, letting the
  // athletes gallery behind (via margin-top: -100vh) be revealed.
  // Mobile: bottom-cut during phrases → rises to center → continues off screen.
  const mobilePhoneYNum = useTransform(
    scrollYProgress,
    [0, 0.13, 0.20, 0.72, 0.78, 1.0],
    [0, 0, 36, 36, 0, -120]
  );
  const mobilePhoneY = useTransform(mobilePhoneYNum, (v) => `${v}vh`);
  // Desktop: stays centered until the exit, then slides up off screen.
  const desktopPhoneYNum = useTransform(
    scrollYProgress,
    [0, 0.78, 1.0],
    [0, 0, -120]
  );
  const desktopPhoneY = useTransform(desktopPhoneYNum, (v) => `${v}vh`);
  const phoneY = isMobile ? mobilePhoneY : desktopPhoneY;

  // Sticky background stays opaque throughout. At progress 1.0, pst-sticky
  // un-pins and slides up as a curtain, revealing tlt-ag-sticky (which starts
  // pinning at the exact same scrollY thanks to tlt-ag's margin-top: -100vh).

  // Opener — desktop: enters from below, holds, exits upward.
  // Mobile: fully opaque until phone covers it, then cuts out while covered (before phone moves away)
  const desktopOpenerOpacity = useTransform(scrollYProgress, [0, 0.04, 0.15, 0.20], [0, 1, 1, 0]);
  const mobileOpenerOpacity = useTransform(scrollYProgress, [0, 0.16, 0.19, 1], [1, 1, 0, 0]);
  const mobileOpenerVisibility = useTransform(scrollYProgress, (v) => (v >= 0.19 ? 'hidden' : 'visible'));
  const openerOpacity = isMobile ? mobileOpenerOpacity : desktopOpenerOpacity;
  const openerY = useTransform(scrollYProgress, [0, 0.05, 0.15, 0.20], [40, 0, 0, -40]);


  // Phone-screen stack — translates vertically (reads as horizontal from the
  // viewer because the phone is rotated). Word slides are 50% tall so two
  // fit on the phone at once, creating a continuous ticker. Sweeps linearly
  // from 200% (first pair of words in view) to 0% (Wake logo), then on
  // through the app phases.
  const stackY = useTransform(
    scrollYProgress,
    [0, 0.10, 0.20, 0.24, 0.34, 0.38, 0.48, 0.52],
    ['387.5%', '0%', '0%', '-100%', '-100%', '-200%', '-200%', '-300%']
  );
  // Aurora background — fully visible during opener, snaps off when phone covers it at scroll 0.15
  const auroraOpacity = useTransform(scrollYProgress, (v) => (v < 0.15 ? 1 : 0));

  // Active phrase index — driven by scroll. Phrase 1 appears as the phone
  // settles into its bottom-cut position (~0.20), in sync with the screen
  // transition starting from logo to workout.
  const [activePhrase, setActivePhrase] = useState(-1);
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    let next = -1;
    if (v >= 0.48) next = 2;
    else if (v >= 0.34) next = 1;
    else if (v >= 0.20) next = 0;
    setActivePhrase((prev) => (prev === next ? prev : next));
  });

  // Phrase 3 starts sliding up slightly AFTER the phone begins moving, so the
  // phone "catches up" and covers the text before they swipe up together.
  const phrase3YNum = useTransform(scrollYProgress, [0, 0.82, 1.0], [0, 0, -100]);
  const phrase3Y = useTransform(phrase3YNum, (v) => `${v}vh`);

  return (
    <section className="pst-section" ref={sectionRef}>
      <div className="pst-sticky">
        <div className="pst-sticky-bg" aria-hidden="true" />
        <motion.div className="pst-aurora-wrap" style={{ opacity: auroraOpacity }}>
          <AuroraCanvas className="pst-aurora" intensity={1.8} />
        </motion.div>
        <div className="pst-grid">
          {/* ── Phone column ── */}
          <div className="pst-phone-col">
            <div className="pst-phone-wrap">
            <motion.div
              className="pst-phone"
              style={{
                rotateZ: phoneRotateZ,
                scale: phoneScale,
                y: phoneY,
                x: phoneX,
              }}
            >
              <div className="pst-phone-frame">
                <div className="pst-phone-screen">
                  <motion.div className="pst-screen-stack" style={{ y: stackY }}>
                    {HORIZONTAL_WORDS.map((word, i) => (
                      <div
                        key={word}
                        className="pst-screen-slide pst-screen-slide-boot pst-screen-slide-word"
                        style={{ top: `${-75 * (HORIZONTAL_WORDS.length - i)}%` }}
                      >
                        <span className="pst-screen-phrase">{word}</span>
                      </div>
                    ))}
                    <div className="pst-screen-slide pst-screen-slide-boot" style={{ top: '0%' }}>
                      <img src={wakeLogo} alt="Wake" className="pst-screen-boot-logo" />
                    </div>
                    {PHONE_SCREENS.map((src, i) => (
                      <div
                        key={src}
                        className="pst-screen-slide"
                        data-idx={i}
                        style={{ top: `${(i + 1) * 100}%` }}
                      >
                        <img
                          src={src}
                          alt=""
                          className="pst-screen-img"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                    ))}
                  </motion.div>
                </div>
                <img
                  src="/fallback/phone/iPhone 17 - Black - Portrait.svg"
                  alt=""
                  className="pst-phone-overlay"
                  aria-hidden="true"
                />
              </div>
            </motion.div>
            </div>
          </div>

          {/* ── Copy column ── */}
          <div className="pst-copy-col">
            <motion.h2
              className="pst-opener"
              style={isMobile ? { opacity: openerOpacity, visibility: mobileOpenerVisibility } : { opacity: openerOpacity, y: openerY }}
            >
              {OPENER}
            </motion.h2>
          </div>
        </div>

        <div className="pst-phrase-window">
          {PHRASES.map((chunks, i) => (
            <motion.p
              key={i}
              className="pst-phrase-slide"
              style={i === 2 ? { y: phrase3Y } : undefined}
            >
              <AnimatedPhrase chunks={chunks} visible={activePhrase === i} />
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
    <section className="tlt-reveal" ref={ref}>
      <AuroraCanvas className="tlt-reveal-aurora" intensity={triggered ? 1.8 : 0.5} />

      {/* Pulse ring on reveal */}
      <div className={`tlt-reveal-pulse ${triggered ? 'tlt-reveal-pulse-go' : ''}`} />
      <div className={`tlt-reveal-pulse tlt-reveal-pulse-2 ${triggered ? 'tlt-reveal-pulse-go' : ''}`} />

      <div className={`tlt-reveal-content ${triggered ? 'tlt-reveal-triggered' : ''}`}>
        <span className="tlt-reveal-eso">Solo en</span>
        <img src={wakeLogo} alt="Wake" className="tlt-reveal-logo" />
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
const LAYER_CLASS = ['tlt-ag-img-xl', 'tlt-ag-img-lg', 'tlt-ag-img-md', 'tlt-ag-img-sm'];

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
      imageEntries = Array.from(track.querySelectorAll('.tlt-ag-img')).map((el) => ({
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

      // Lateral drift spans from section-enters-viewport to section-fully-exits.
      // startOffset (1vh) shifts the start earlier; exitOffset (1vh) extends past
      // the sticky un-pin so horizontal + vertical scroll overlap at the end.
      const startOffset = vh;
      const exitOffset = vh;
      const denom = Math.max(1, sectionH - vh + startOffset + exitOffset);
      const moveProgress = Math.max(0, Math.min((scrolled + startOffset) / denom, 1));

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
    <section className="tlt-ag" ref={sectionRef}>
      <div className="tlt-ag-sticky">
        <div className="tlt-ag-track" ref={trackRef}>
          {ATHLETE_IMAGES.map((img, i) => (
            <div
              key={i}
              className={`tlt-ag-img ${LAYER_CLASS[img.layer]}`}
              data-speed={LAYER_SPEED[img.layer]}
              style={{ top: img.top, left: img.left }}
            >
              <img src={img.src} alt="" loading="lazy" decoding="async" />
            </div>
          ))}
        </div>
        <div className="tlt-ag-overlay" />
        <p className="tlt-ag-quote">
          En busca de la grandeza<br />
          que admiro en otros.
        </p>
        <div className="tlt-ag-scroll-hint" ref={hintRef}>
          <div className="tlt-ag-scroll-line" />
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   CTA SECTION
   ═══════════════════════════════════════════ */
function CtaSection() {
  return (
    <section className="tlt-cta">
      <a href="/app" className="tlt-cta-button">Empieza a entrenar</a>
    </section>
  );
}

/* ═══════════════════════════════════════════
   FOOTER
   ═══════════════════════════════════════════ */
function LandingFooter() {
  return (
    <footer className="tlt-footer">
      <div className="tlt-footer-top">
        <div className="tlt-footer-brand">
          <img src={wakeLogo} alt="Wake" className="tlt-footer-logo" />
        </div>
        <div className="tlt-footer-links">
          <a href="/app" className="tlt-footer-link">App</a>
          <a href="/creadores" className="tlt-footer-link">Creadores</a>
          <a href="/support" className="tlt-footer-link">Soporte</a>
          <a href="/legal" className="tlt-footer-link">Legal</a>
        </div>
      </div>
      <div className="tlt-footer-bottom">
        <span className="tlt-footer-copy">&copy; {new Date().getFullYear()} Wake. Todos los derechos reservados.</span>
        <a href="mailto:emilioloboguerrero@gmail.com" className="tlt-footer-email">emilioloboguerrero@gmail.com</a>
      </div>
    </footer>
  );
}

/* ═══════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════ */
export default function TestLandingScreen() {
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
    <div className="test-landing-frozen">
      <section className="tlt-hero">
        <div
          className="tlt-slideshow"
          style={{ opacity: heroOpacity }}
        >
          {images.map((url, i) => (
            <div
              key={url}
              className={`tlt-slide ${i === current ? 'tlt-slide-active' : ''}`}
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
          <div className="tlt-slideshow-overlay" />
        </div>
        <img
          src={wakeIcon}
          alt=""
          className="tlt-hero-icon"
          aria-hidden="true"
          style={{ opacity: 0.22 * heroOpacity }}
        />
        <CascadeText
          as="h1"
          className="tlt-hero-statement"
          style={{ opacity: heroOpacity }}
        >
          Sé lo que admiras.
        </CascadeText>
      </section>

      <div className="tlt-transition" />
      <PhoneShowcaseSection />
      <AthletesGallery />
      <RevealSection />
      <CtaSection />
      <LandingFooter />
    </div>
  );
}
