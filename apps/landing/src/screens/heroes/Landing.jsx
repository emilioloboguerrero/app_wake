/**
 * Landing — Wake landing page
 *
 * Layout, styles, and components mirror LandingDesignScreen exactly.
 * To iterate, swap the IMAGES and COPY constants below — nothing else.
 *
 * Sections:
 *   01  Hero          WebGL ripple reveal between two images
 *   02  Scroll Text   Lines that brighten as they cross the viewport
 *   03A Marquee       Three rows of images, alternating directions
 *   03B Flash         Image-tras-imagen accelerated flash
 *   03C Combined      Marquee background + flash overlay
 *   04  Athlete       Full-bleed athlete portrait + copy
 *   05  Close         Final headline + CTA
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import '../LandingDesignScreen.css';

/* ── IMAGES — swap freely ─────────────────────────────────────────── */
const IMAGES = {
  // Section 01 — two layers revealed by cursor ripple
  heroFront: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=1920&q=80&fit=crop',
  heroBack:  'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=1920&q=80&fit=crop',

  // Section 03 — image bank used by marquees + flashes
  bank: [
    'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600&q=75&fit=crop',
    'https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=600&q=75&fit=crop',
    'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=600&q=75&fit=crop',
    'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=600&q=75&fit=crop',
    'https://images.unsplash.com/photo-1576678927484-cc907957088c?w=600&q=75&fit=crop',
    'https://images.unsplash.com/photo-1599058945522-28d584b6f0ff?w=600&q=75&fit=crop',
    'https://images.unsplash.com/photo-1550259979-ed79b48d2a30?w=600&q=75&fit=crop',
    'https://images.unsplash.com/photo-1484557985045-edf25e08da73?w=600&q=75&fit=crop',
    'https://images.unsplash.com/photo-1541534741688-6078c738800b?w=600&q=75&fit=crop',
    'https://images.unsplash.com/photo-1507398941214-572c25f4b1dc?w=600&q=75&fit=crop',
    'https://images.unsplash.com/photo-1549476464-37392f717541?w=600&q=75&fit=crop',
    'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=600&q=75&fit=crop',
  ],

  // Section 04 — athlete background
  athlete: 'https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=1920&q=80&fit=crop',
};

/* ── COPY — swap freely ───────────────────────────────────────────── */
const COPY = {
  hero: {
    eyebrow:  'Wake',
    headline: ['Hay gente que simplemente', 'entrena diferente.'],
  },
  scroll: [
    'Hay gente que simplemente entrena diferente.',
    'No un plan genérico.',
    'Una persona esperándote.',
    'Que sabe tu récord del martes.',
    'Que sabe por qué hoy toca diferente.',
    'Así se supone que debe sentirse.',
  ],
  flashLabel: 'Imagen tras imagen',
  athlete: {
    tag:    'Atleta — Ciudad',
    name:   ['Nombre del', 'Atleta'],
    sub:    ['Texto que describe quiénes son,', 'no sus credenciales.'],
    action: 'Entrenar con este atleta',
    href:   '#',
  },
  close: {
    headline: 'Ya sabes lo que buscas.',
    sub:      'Empieza hoy.',
    cta:      'Descargar Wake',
    href:     '/app',
  },
};

/* ── WebGL shaders for hero ripple reveal ─────────────────────────── */
const VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const FRAG = `
  precision highp float;
  uniform sampler2D uTex1;
  uniform sampler2D uTex2;
  uniform vec2  uMouse;
  uniform float uTime;
  uniform float uReady;
  uniform float uReveal;
  varying vec2  vUv;

  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1,311.7)), dot(p, vec2(269.5,183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
  }
  float gn(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f*f*(3.0-2.0*f);
    return mix(
      mix(dot(hash2(i),           f),           dot(hash2(i+vec2(1,0)), f-vec2(1,0)), u.x),
      mix(dot(hash2(i+vec2(0,1)), f-vec2(0,1)), dot(hash2(i+vec2(1,1)), f-vec2(1,1)), u.x),
      u.y);
  }

  void main() {
    vec2 uv = vUv;
    vec2 amb = vec2(
      gn(uv * 2.6 + vec2(uTime * 0.08,  uTime * 0.05)),
      gn(uv * 2.6 + vec2(uTime * 0.06, -uTime * 0.09))
    ) * 0.010;

    vec2  toM  = uMouse - uv;
    float dist = length(toM);
    float fade = smoothstep(0.55, 0.0, dist);
    float rip  = sin(dist * 22.0 - uTime * 4.0) * fade * 0.020;
    vec2  rDir = dist > 0.001 ? normalize(toM) : vec2(0.0);

    vec2 total = amb + rDir * rip;
    vec2 duv   = clamp(uv + total, 0.001, 0.999);

    float en     = gn(uv * 7.0 + uTime * 0.25) * 0.07;
    float radius = 0.21;
    float reveal = smoothstep(radius + en, radius * 0.3 + en, dist);

    if (uReady < 0.5) {
      float g = gn(duv * 3.0 + uTime * 0.08) * 0.12 + 0.08;
      gl_FragColor = vec4(g * 0.55, g * 0.52, g * 0.58, 1.0);
      return;
    }

    vec4 t1 = texture2D(uTex1, duv);
    vec4 t2 = texture2D(uTex2, duv);
    gl_FragColor = mix(t1, t2, reveal * uReady * uReveal);
  }
`;

function loadImageAsTexture(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const t = new THREE.Texture(img);
      t.needsUpdate = true;
      resolve(t);
    };
    img.onerror = () => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 2;
      cv.getContext('2d').fillStyle = '#1e1e1e';
      cv.getContext('2d').fillRect(0, 0, 2, 2);
      resolve(new THREE.CanvasTexture(cv));
    };
    img.src = src;
  });
}

function buildMarqueeRow(containerId, srcs) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  [...srcs, ...srcs].forEach((src) => {
    const img = document.createElement('img');
    img.className = 'lds-mimg';
    img.src = src;
    img.loading = 'lazy';
    el.appendChild(img);
  });
}

export default function Landing() {
  const heroCanvasRef  = useRef(null);
  const flashCanvasRef = useRef(null);
  const cursorRef      = useRef(null);
  const flashPlayRef   = useRef(null);
  const floodCPlayRef  = useRef(null);

  // ── 01 WebGL Hero ──────────────────────────────────────────
  useEffect(() => {
    const canvas = heroCanvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);

    const scene  = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTex1:   { value: null },
        uTex2:   { value: null },
        uMouse:  { value: new THREE.Vector2(0.5, 0.5) },
        uTime:   { value: 0 },
        uReady:  { value: 0 },
        uReveal: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    scene.add(mesh);

    Promise.all([
      loadImageAsTexture(IMAGES.heroFront),
      loadImageAsTexture(IMAGES.heroBack),
    ]).then(([t1, t2]) => {
      mat.uniforms.uTex1.value = t1;
      mat.uniforms.uTex2.value = t2;
      mat.uniforms.uReady.value = 1;
    });

    const mouse = { tx: 0.5, ty: 0.5, cx: 0.5, cy: 0.5 };
    let revealStrength = 0;
    let lastMoveTime = 0;

    const onMouseMove = (e) => {
      mouse.tx = e.clientX / innerWidth;
      mouse.ty = 1 - e.clientY / innerHeight;
      revealStrength = 1;
      lastMoveTime = performance.now();

      const cursor = cursorRef.current;
      if (!cursor) return;
      cursor.style.left = e.clientX + 'px';
      cursor.style.top  = e.clientY + 'px';

      const heroEl = canvas.parentElement;
      const rect   = heroEl?.getBoundingClientRect();
      const over   = rect && e.clientY >= rect.top && e.clientY <= rect.bottom;
      cursor.style.opacity = over ? '1' : '0';
    };

    const onResize = () => {
      renderer.setSize(innerWidth, innerHeight);
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    };

    document.addEventListener('mousemove', onMouseMove);
    window.addEventListener('resize', onResize);

    const t0 = performance.now();
    let animId;

    const loop = () => {
      animId = requestAnimationFrame(loop);
      mouse.cx += (mouse.tx - mouse.cx) * 0.045;
      mouse.cy += (mouse.ty - mouse.cy) * 0.045;

      if (performance.now() - lastMoveTime > 120) {
        revealStrength = Math.max(0, revealStrength - 0.025);
      }

      mat.uniforms.uMouse.value.set(mouse.cx, mouse.cy);
      mat.uniforms.uReveal.value = revealStrength;
      mat.uniforms.uTime.value = (performance.now() - t0) * 0.001;
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(animId);
      document.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      mat.dispose();
      mesh.geometry.dispose();
      renderer.dispose();
    };
  }, []);

  // ── 03A Marquee rows ───────────────────────────────────────
  useEffect(() => {
    const bank = IMAGES.bank;
    buildMarqueeRow('lds-mr1', bank);
    buildMarqueeRow('lds-mr2', [...bank].reverse());
    buildMarqueeRow('lds-mr3', [...bank.slice(5), ...bank.slice(0, 5)]);
    buildMarqueeRow('lds-mrc1', bank);
    buildMarqueeRow('lds-mrc2', [...bank].reverse());
    buildMarqueeRow('lds-mrc3', [...bank.slice(3), ...bank.slice(0, 3)]);
  }, []);

  // ── 03B Flash canvas ───────────────────────────────────────
  useEffect(() => {
    const canvas = flashCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const resize = () => {
      canvas.width  = innerWidth;
      canvas.height = innerHeight;
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    const imgs = IMAGES.bank.map((src) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = src;
      return img;
    });

    function drawFrame(img) {
      if (!img.complete || !img.naturalWidth) return;
      const { width: cw, height: ch } = canvas;
      const ar  = img.naturalWidth / img.naturalHeight;
      const car = cw / ch;
      let dw, dh;
      if (ar > car) { dh = ch; dw = dh * ar; } else { dw = cw; dh = dw / ar; }
      const dx = (cw - dw) / 2;
      const dy = (ch - dh) / 2;
      ctx.clearRect(0, 0, cw, ch);
      ctx.filter = 'saturate(0.6) brightness(0.8)';
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.filter = 'none';
    }

    let playing = false;

    flashPlayRef.current = () => {
      if (playing) return;
      playing = true;
      let i = 0;

      const duration = (idx) => {
        const t = idx / IMAGES.bank.length;
        if (t < 0.3)      return 160 - t * 260;
        else if (t < 0.7) return 75;
        else              return 75 + (t - 0.7) * 700;
      };

      const step = () => {
        drawFrame(imgs[i]);
        i++;
        if (i < imgs.length) setTimeout(step, duration(i));
      };
      step();
    };

    return () => window.removeEventListener('resize', resize);
  }, []);

  // ── 03C Flood-C flash overlay ──────────────────────────────
  useEffect(() => {
    const fg = document.getElementById('lds-fcfg');
    if (!fg) return;
    fg.innerHTML = '';

    const imgEls = IMAGES.bank.map((src) => {
      const img = document.createElement('img');
      img.crossOrigin = 'anonymous';
      img.src = src;
      fg.appendChild(img);
      return img;
    });

    let playing = false;

    floodCPlayRef.current = () => {
      if (playing) return;
      playing = true;
      let i = 0;

      const duration = (idx) => {
        const t = idx / IMAGES.bank.length;
        if (t < 0.3)      return 140 - t * 220;
        else if (t < 0.7) return 70;
        else              return 70 + (t - 0.7) * 650;
      };

      const step = () => {
        imgEls.forEach((img, j) => img.classList.toggle('lds-fca', j === i));
        i++;
        if (i < imgEls.length) setTimeout(step, duration(i));
      };
      step();
    };

    return () => { imgEls.forEach((img) => fg.contains(img) && fg.removeChild(img)); };
  }, []);

  // ── Intersection observers ─────────────────────────────────
  useEffect(() => {
    const obs = [];

    const stfObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const el = entry.target;
          if (entry.isIntersecting) {
            el.classList.add('lds-stf-active');
            el.classList.remove('lds-stf-past');
          } else {
            el.classList.remove('lds-stf-active');
            if (el.getBoundingClientRect().top < 0) el.classList.add('lds-stf-past');
            else el.classList.remove('lds-stf-past');
          }
        });
      },
      { rootMargin: '-28% 0px -28% 0px', threshold: 0 }
    );
    document.querySelectorAll('[data-lds-stf]').forEach((el) => stfObs.observe(el));
    obs.push(stfObs);

    const euObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('lds-vis');
            euObs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    document.querySelectorAll('.lds-eu').forEach((el) => euObs.observe(el));
    obs.push(euObs);

    const fbObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            flashPlayRef.current?.();
            fbObs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.25 }
    );
    const fbEl = document.getElementById('lds-flood-b');
    if (fbEl) fbObs.observe(fbEl);
    obs.push(fbObs);

    const fcObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            floodCPlayRef.current?.();
            fcObs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.25 }
    );
    const fcEl = document.getElementById('lds-flood-c');
    if (fcEl) fcObs.observe(fcEl);
    obs.push(fcObs);

    return () => obs.forEach((o) => o.disconnect());
  }, []);

  return (
    <div className="lds">
      <div className="lds-cursor" ref={cursorRef} />

      {/* ── 01 HERO ────────────────────────────────── */}
      <section id="lds-hero" className="lds-hero">
        <canvas className="lds-hero-canvas" ref={heroCanvasRef} />
        <div className="lds-hero-content">
          <p className="lds-hero-eyebrow">{COPY.hero.eyebrow}</p>
          <h1 className="lds-hero-headline">
            {COPY.hero.headline.map((line, i) => (
              <span key={i}>{line}{i < COPY.hero.headline.length - 1 && <br />}</span>
            ))}
          </h1>
        </div>
      </section>

      {/* ── 02 SCROLL TEXT ─────────────────────────── */}
      <section id="lds-scroll" className="lds-scroll-text">
        {COPY.scroll.map((line, i) => (
          <p key={i} className="lds-stf" data-lds-stf>{line}</p>
        ))}
      </section>

      {/* ── 03A FLOOD: MARQUEE ─────────────────────── */}
      <section id="lds-flood-a" className="lds-flood-a">
        <div className="lds-mrow" id="lds-mr1" />
        <div className="lds-mrow" id="lds-mr2" />
        <div className="lds-mrow" id="lds-mr3" />
      </section>

      {/* ── 03B FLOOD: FLASH ───────────────────────── */}
      <section id="lds-flood-b" className="lds-flood-b">
        <canvas className="lds-flash-canvas" ref={flashCanvasRef} />
        <div className="lds-flash-vignette" />
        <span className="lds-flash-label">{COPY.flashLabel}</span>
      </section>

      {/* ── 03C FLOOD: COMBINED ────────────────────── */}
      <section id="lds-flood-c" className="lds-flood-c">
        <div className="lds-fc-bg">
          <div className="lds-mrow" id="lds-mrc1" />
          <div className="lds-mrow" id="lds-mrc2" />
          <div className="lds-mrow" id="lds-mrc3" />
        </div>
        <div className="lds-fc-fg" id="lds-fcfg" />
        <div className="lds-fc-vignette" />
      </section>

      {/* ── 04 ATHLETE SCENE ───────────────────────── */}
      <section id="lds-athlete" className="lds-athlete">
        <img className="lds-ath-bg" src={IMAGES.athlete} crossOrigin="anonymous" alt="" />
        <div className="lds-ath-overlay" />
        <div className="lds-ath-content">
          <p className="lds-ath-tag lds-eu">{COPY.athlete.tag}</p>
          <h2 className="lds-ath-name lds-eu" style={{ animationDelay: '0.1s' }}>
            {COPY.athlete.name.map((line, i) => (
              <span key={i}>{line}{i < COPY.athlete.name.length - 1 && <br />}</span>
            ))}
          </h2>
          <p className="lds-ath-sub lds-eu" style={{ animationDelay: '0.18s' }}>
            {COPY.athlete.sub.map((line, i) => (
              <span key={i}>{line}{i < COPY.athlete.sub.length - 1 && <br />}</span>
            ))}
          </p>
          <a href={COPY.athlete.href} className="lds-ath-action lds-eu" style={{ animationDelay: '0.26s' }}>
            {COPY.athlete.action}
          </a>
        </div>
      </section>

      {/* ── 05 CLOSE ───────────────────────────────── */}
      <section id="lds-close" className="lds-close">
        <h2 className="lds-close-line lds-eu">{COPY.close.headline}</h2>
        <p className="lds-close-sub lds-eu" style={{ animationDelay: '0.12s' }}>
          {COPY.close.sub}
        </p>
        <a href={COPY.close.href} className="lds-close-cta lds-eu" style={{ animationDelay: '0.22s' }}>
          {COPY.close.cta}
        </a>
      </section>
    </div>
  );
}
