import React, { useState, useEffect, useRef } from 'react';
import { motion, useScroll, useTransform, useMotionValueEvent } from 'motion/react';
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
   Scroll-driven sticky showcase. Phone arrives rotated 90° with the
   Wake logo already on screen, rotates upright, then swipes through
   the three app phases before sliding up off-screen to reveal the
   athletes gallery pinned behind it.
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
  <>Somos la <strong>plataforma</strong> detrás del <strong>rendimiento</strong> para los <strong>mejores atletas</strong></>
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
          <Tag key={`w-${ti}`} className="ps-phrase-word">
            {token.text.split('').map((char, li) => {
              const myIdx = charIdx++;
              return (
                <motion.span
                  key={li}
                  className="ps-phrase-letter"
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

// Static CSS-based aurora glow. Replaces the per-frame canvas version so the
// compositor owns the animation — no main-thread work during scroll.
function Aurora({ className }) {
  return <div className={className} aria-hidden="true" />;
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

  // Phone entry — waits off-screen for most of pre-pin, then slides in
  // horizontal over the final stretch. Rotation kicks in the instant the
  // phone arrives and takes its time expanding into place.
  const phoneX = useTransform(enterProgress, [0, 0.75, 1], ['110vw', '110vw', '0vw']);
  const phoneRotateZ = useTransform(scrollYProgress, [0, 0.12], [-90, 0]);
  const desktopPhoneScale = useTransform(scrollYProgress, [0, 0.12], [0.70, 1]);
  const mobilePhoneScale = useTransform(scrollYProgress, [0, 0.12], [0.60, 1]);
  const phoneScale = isMobile ? mobilePhoneScale : desktopPhoneScale;

  // Phone Y — slides up off the top of the viewport at the end, letting the
  // athletes gallery behind (via margin-top: -100vh) be revealed.
  // Mobile: bottom-cut during phrases → rises to center → continues off screen.
  const mobilePhoneY = useTransform(
    scrollYProgress,
    [0, 0.08, 0.16, 0.60, 0.66, 1.0],
    ['0vh', '0vh', '36vh', '36vh', '0vh', '-120vh']
  );
  // Desktop: stays centered until the exit, then slides up off screen.
  const desktopPhoneY = useTransform(
    scrollYProgress,
    [0, 0.66, 1.0],
    ['0vh', '0vh', '-120vh']
  );
  const phoneY = isMobile ? mobilePhoneY : desktopPhoneY;

  // Sticky background stays opaque throughout. At progress 1.0, ps-sticky
  // un-pins and slides up as a curtain, revealing tl-ag-sticky (which starts
  // pinning at the exact same scrollY thanks to tl-ag's margin-top: -100vh).

  // Opener — fully visible as the section enters, fades/slides out during
  // early pin. Mobile hides via visibility when the phone covers it.
  const desktopOpenerOpacity = useTransform(scrollYProgress, [0, 0.11, 0.13], [1, 1, 0]);
  const mobileOpenerOpacity = useTransform(scrollYProgress, [0, 0.11, 0.13, 1], [1, 1, 0, 0]);
  const mobileOpenerVisibility = useTransform(scrollYProgress, (v) => (v >= 0.13 ? 'hidden' : 'visible'));
  const openerOpacity = isMobile ? mobileOpenerOpacity : desktopOpenerOpacity;
  const openerY = useTransform(scrollYProgress, [0, 0.11, 0.13], [0, 0, -40]);


  // Phone-screen stack — starts on the Wake logo (visible as the phone
  // rotates in), then sweeps up through the app phases.
  const stackY = useTransform(
    scrollYProgress,
    [0, 0.12, 0.16, 0.28, 0.32, 0.44, 0.48],
    ['0%', '0%', '-100%', '-100%', '-200%', '-200%', '-300%']
  );
  // Aurora background — fully visible during opener, snaps off when phone covers it
  const auroraOpacity = useTransform(scrollYProgress, (v) => (v < 0.13 ? 1 : 0));

  // Active phrase index — driven by scroll. Phrase 1 appears as the phone
  // settles into its bottom-cut position (~0.20), in sync with the screen
  // transition starting from logo to workout.
  const [activePhrase, setActivePhrase] = useState(-1);
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    let next = -1;
    if (v >= 0.44) next = 2;
    else if (v >= 0.28) next = 1;
    else if (v >= 0.12) next = 0;
    setActivePhrase((prev) => (prev === next ? prev : next));
  });

  // Phrase 3 starts sliding up slightly AFTER the phone begins moving, so the
  // phone "catches up" and covers the text before they swipe up together.
  const phrase3Y = useTransform(scrollYProgress, [0, 0.70, 1.0], ['0vh', '0vh', '-100vh']);

  return (
    <section className="ps-section" ref={sectionRef}>
      <div className="ps-sticky">
        <div className="ps-sticky-bg" aria-hidden="true" />
        <motion.div className="ps-aurora-wrap" style={{ opacity: auroraOpacity }}>
          <Aurora className="ps-aurora" />
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
                y: phoneY,
                x: phoneX,
              }}
            >
              <div className="ps-phone-frame">
                <div className="ps-phone-screen">
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
                </div>
                <img
                  src="/fallback/phone/iPhone 17 - Black - Portrait.svg"
                  alt=""
                  className="ps-phone-overlay"
                  aria-hidden="true"
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
          {PHRASES.map((chunks, i) => (
            <motion.p
              key={i}
              className="ps-phrase-slide"
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
    <section className="tl-reveal" ref={ref}>
      <Aurora className={`tl-reveal-aurora ${triggered ? 'tl-reveal-aurora-bright' : ''}`} />

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
  // layer 0 — massive (near-viewport, very slow; barely visible at 0.35 opacity)
  { src: hp(0), layer: 0, top: '-5%', left: '2vw' },
  { src: hp(2), layer: 0, top: '-8%', left: '250vw' },
  { src: hp(4), layer: 0, top: '-3%', left: '510vw' },
  { src: hp(5), layer: 0, top: '8%', left: '680vw' },
  // layer 1 — large
  { src: hp(6), layer: 1, top: '5%', left: '40vw' },
  { src: hp(7), layer: 1, top: '42%', left: '170vw' },
  { src: hp(9), layer: 1, top: '50%', left: '320vw' },
  { src: hp(10), layer: 1, top: '15%', left: '450vw' },
  { src: hp(12), layer: 1, top: '6%', left: '600vw' },
  { src: hp(13), layer: 1, top: '52%', left: '720vw' },
  // layer 2 — medium
  { src: hp(14), layer: 2, top: '55%', left: '10vw' },
  { src: hp(16), layer: 2, top: '48%', left: '180vw' },
  { src: hp(18), layer: 2, top: '58%', left: '370vw' },
  { src: hp(19), layer: 2, top: '20%', left: '480vw' },
  { src: hp(21), layer: 2, top: '5%', left: '620vw' },
  // layer 3 — small, fast
  { src: hp(23), layer: 3, top: '65%', left: '25vw' },
  { src: hp(25), layer: 3, top: '70%', left: '200vw' },
  { src: hp(1), layer: 3, top: '60%', left: '420vw' },
  { src: hp(3), layer: 3, top: '72%', left: '580vw' },
  { src: hp(4), layer: 3, top: '12%', left: '700vw' },
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
    let sectionTop = 0;
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
      sectionTop = section.getBoundingClientRect().top + window.scrollY;
      totalTravel = track.scrollWidth - vh;
      imageEntries = Array.from(track.querySelectorAll('.tl-ag-img')).map((el) => ({
        el,
        speed: parseFloat(el.dataset.speed),
      }));
    };

    const update = () => {
      const track = trackRef.current;
      if (!track) return;

      // Cheap: a scrollY read plus arithmetic. No layout-triggering rect read.
      const scrolled = window.scrollY - sectionTop;

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

  // Preload the next slide into HTTP cache so the swap is instant.
  useEffect(() => {
    if (images.length <= 1) return;
    const next = (current + 1) % images.length;
    const img = new Image();
    img.src = images[next];
  }, [current, images]);

  // Hero fade — driven by a CSS variable on <html>. No React re-render per scroll tick.
  useEffect(() => {
    const root = document.documentElement;
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
        root.style.setProperty('--hero-opacity', String(1 - p));
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      root.style.removeProperty('--hero-opacity');
    };
  }, []);

  return (
    <div className="test-landing">
      <Nav />
      <section className="tl-hero">
        <div className="tl-slideshow">
          <div key={images[current]} className="tl-slide tl-slide-active">
            <img
              src={images[current]}
              alt=""
              loading="eager"
              decoding="async"
              fetchpriority="high"
            />
          </div>
          <div className="tl-slideshow-overlay" />
        </div>
        <img
          src={wakeIcon}
          alt=""
          className="tl-hero-icon"
          aria-hidden="true"
        />
        <h1 className="tl-hero-statement">Sé lo que admiras.</h1>
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
