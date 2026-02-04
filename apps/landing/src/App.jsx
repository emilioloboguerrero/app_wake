import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate, useParams } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import SupportScreen from './screens/SupportScreen';
import LegalDocumentsScreen from './screens/LegalDocumentsScreen';
import CreatorsPage from './screens/CreatorsPage';
import { getMainHeroLandingImages, getLandingCards, getDosFormasImage } from './services/heroImagesService';
import heroLogo from './assets/hero-logo.svg';
import './Home.css';

const HEADER_HEIGHT = 80;
const HEADER_HEIGHT_MOBILE = 88;

const HERO_PLACEHOLDER = `${import.meta.env.BASE_URL}Screenshot%202026-02-01%20at%203.00.05%20PM.png`;

function Home() {
  const [heroImages, setHeroImages] = useState([]);
  const [cards, setCards] = useState([]);
  const [dosFormasImage, setDosFormasImage] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [heroOpacity, setHeroOpacity] = useState(1);
  const [heroReady, setHeroReady] = useState(true);
  const [heroImagesLoaded, setHeroImagesLoaded] = useState(() => new Set());
  const [cardImagesLoaded, setCardImagesLoaded] = useState(() => new Set());
  const [dosFormasLoaded, setDosFormasLoaded] = useState(false);
  const [cardsVisible, setCardsVisible] = useState(false);
  const [dosFormasVisible, setDosFormasVisible] = useState(false);
  const cardsRef = useRef(null);
  const dosFormasRef = useRef(null);

  useEffect(() => {
    getMainHeroLandingImages().then(setHeroImages);
  }, []);

  const [dbImagesReady, setDbImagesReady] = useState(false);

  useEffect(() => {
    setHeroImagesLoaded(new Set());
    if (heroImages.length === 0) {
      setHeroReady(true);
      setDbImagesReady(false);
      setCurrentIndex(0);
      return;
    }
    setDbImagesReady(false);
    const img = new Image();
    img.onload = () => {
      setHeroReady(true);
      setDbImagesReady(true);
      setCurrentIndex(0);
    };
    img.onerror = () => {
      setHeroReady(true);
      setDbImagesReady(true);
      setCurrentIndex(0);
    };
    img.src = heroImages[0];
  }, [heroImages]);

  useEffect(() => {
    getLandingCards().then(setCards);
  }, []);

  useEffect(() => {
    getDosFormasImage().then(setDosFormasImage);
  }, []);

  const allHeroImages = heroImages.length > 0 && dbImagesReady ? heroImages : [HERO_PLACEHOLDER];

  useEffect(() => {
    if (allHeroImages.length <= 1) return;
    const id = setInterval(() => {
      setCurrentIndex((i) => (i + 1) % allHeroImages.length);
    }, 5000);
    return () => clearInterval(id);
  }, [allHeroImages.length]);

  useEffect(() => {
    const cardsEl = cardsRef.current;
    const dosFormasEl = dosFormasRef.current;
    if (!cardsEl && !dosFormasEl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target === cardsEl && entry.isIntersecting) setCardsVisible(true);
          if (entry.target === dosFormasEl && entry.isIntersecting) setDosFormasVisible(true);
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );

    if (cardsEl) observer.observe(cardsEl);
    if (dosFormasEl) observer.observe(dosFormasEl);
    return () => observer.disconnect();
  }, [dosFormasImage]);

  const heroHeightRef = useRef(null);
  useEffect(() => {
    let ticking = false;
    const update = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const h = window.innerWidth <= 768 ? HEADER_HEIGHT_MOBILE : HEADER_HEIGHT;
          const currentHeight = (document.documentElement.clientHeight || window.innerHeight) - h;
          const prev = heroHeightRef.current;
          const widthChanged = prev && prev._width !== window.innerWidth;
          if (!prev || widthChanged || currentHeight < prev.height) {
            heroHeightRef.current = { height: currentHeight, _width: window.innerWidth };
          }
          const heroHeight = heroHeightRef.current.height;
          const y = window.scrollY || window.pageYOffset;
          const progress = heroHeight > 0 ? Math.min(Math.max(y / heroHeight, 0), 1) : 1;
          setHeroOpacity(1 - progress);
          ticking = false;
        });
        ticking = true;
      }
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  return (
    <div className="home">
      <div
        className={`hero-background ${heroReady ? 'hero-ready' : ''}`}
        style={{ opacity: heroOpacity, visibility: heroOpacity < 0.01 ? 'hidden' : 'visible' }}
      >
        <div className="hero-background-overlay" aria-hidden="true" />
        <div
          className={`hero-images-wrap ${heroReady ? 'hero-images-ready' : ''}`}
          aria-hidden="true"
        >
          {allHeroImages.map((url, i) => {
            const loadedKey = heroImages.length > 0 ? i : 'placeholder';
            return (
              <img
                key={loadedKey}
                src={url}
                alt=""
                width={16}
                height={9}
                onLoad={() => setHeroImagesLoaded((prev) => new Set([...prev, loadedKey]))}
                className={`hero-background-img ${i === currentIndex ? 'hero-background-img-active' : ''} ${heroImagesLoaded.has(loadedKey) ? 'hero-background-img-loaded' : ''}`}
              />
            );
          })}
        </div>
        <img src={heroLogo} alt="" className="hero-logo" />
        <div className="hero-content">
          <h1 className="hero-title">
            Entrena con
            <br />
            <span className="hero-title-bold">quienes te inspiran</span>
          </h1>
          <p className="hero-subtitle">
            Sigue sus planes y mide tu
            <br />
            <span className="hero-subtitle-bold">progreso</span> en un solo lugar
          </p>
        </div>
      </div>
      <div className="hero-scroll-content">
        <div className="hero-spacer" aria-hidden="true" />
        <div className="hero-buffer" aria-hidden="true" />
      <section className="section-white">
        <div className="section-white-inner">
          <h2 className="section-white-title">
            Todo lo que necesitas para <span className="section-white-title-bold">progresar</span>
          </h2>
          <p className="section-white-subtitle">
            Una plataforma con programas estructurados de quienes admiras, adaptados a ti. Sigue las rutinas, registra tu evolución y usa insights personalizados para progresar.
          </p>
          <div ref={cardsRef} className={`section-cards ${cardsVisible ? 'section-cards-visible' : ''}`}>
            {cards[0] && (
              <div className="section-card">
                <div className="section-card-image-wrap">
                  <img src={cards[0]} alt="" width={3} height={4} onLoad={() => setCardImagesLoaded((p) => new Set([...p, 0]))} className={`section-card-image ${cardImagesLoaded.has(0) ? 'section-card-image-loaded' : ''}`} />
                  <h3 className="section-card-title">
                    <span className="section-card-title-bold">Insights</span> personalizados
                  </h3>
                </div>
              </div>
            )}
            {cards[1] && (
              <div className="section-card">
                <div className="section-card-image-wrap">
                  <img src={cards[1]} alt="" width={3} height={4} onLoad={() => setCardImagesLoaded((p) => new Set([...p, 1]))} className={`section-card-image ${cardImagesLoaded.has(1) ? 'section-card-image-loaded' : ''}`} />
                  <h3 className="section-card-title">
                    Tus <span className="section-card-title-bold">datos</span> en un solo lugar
                  </h3>
                </div>
              </div>
            )}
            {cards[2] && (
              <div className="section-card">
                <div className="section-card-image-wrap">
                  <img src={cards[2]} alt="" width={3} height={4} onLoad={() => setCardImagesLoaded((p) => new Set([...p, 2]))} className={`section-card-image ${cardImagesLoaded.has(2) ? 'section-card-image-loaded' : ''}`} />
                  <h3 className="section-card-title">
                    Programas de quienes <span className="section-card-title-bold">admiras</span>
                  </h3>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
      <section className="section-dark">
        {dosFormasImage ? (
          <div ref={dosFormasRef} className="dos-formas-hero">
            <div className="dos-formas-hero-overlay" aria-hidden="true" />
            <img src={dosFormasImage} alt="" width={16} height={9} onLoad={() => setDosFormasLoaded(true)} className={`dos-formas-hero-img ${dosFormasLoaded ? 'dos-formas-hero-img-loaded' : ''}`} />
            <div className={`dos-formas-hero-content ${dosFormasVisible ? 'dos-formas-hero-content-visible' : ''}`}>
            <h2 className="dos-formas-hero-title">
              <span className="dos-formas-hero-title-bold">Dos formas</span> de
              <br />
              entrenar con ellos
            </h2>
            <div className="dos-formas-bubbles">
              <div className="dos-formas-bubble">
                <span className="dos-formas-bubble-label">Sus programas</span>
                <span className="dos-formas-bubble-desc">Sigue sus rutinas a tu ritmo</span>
              </div>
              <div className="dos-formas-bubble">
                <span className="dos-formas-bubble-label">Uno a uno</span>
                <span className="dos-formas-bubble-desc">Sesiones a tu medida</span>
              </div>
            </div>
            </div>
          </div>
        ) : (
          <div className="section-dark-inner">
            <h2 className="section-dark-title">
              <span className="section-dark-title-bold">Dos formas</span> de
              <br />
              entrenar con ellos
            </h2>
          </div>
        )}
      </section>
      </div>
    </div>
  );
}

function AppContent() {
  const [ctaOverWhite, setCtaOverWhite] = useState(false);
  const [ctaOverHero, setCtaOverHero] = useState(true);
  const location = useLocation();

  useEffect(() => {
    let ticking = false;
    const check = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const white = document.querySelector('.section-white');
          const headerH = window.innerWidth <= 768 ? 88 : 80;
          const heroH = window.innerHeight - headerH;
          const bufferH = window.innerWidth <= 768 ? 80 : 120;
          const viewportBottom = (window.scrollY || window.pageYOffset) + window.innerHeight;
          const whiteSectionTop = headerH + heroH + bufferH;
          const overHero = viewportBottom < whiteSectionTop;

          if (!white) {
            setCtaOverWhite(false);
            setCtaOverHero(overHero);
            updateThemeColor('#1a1a1a');
            ticking = false;
            return;
          }
          const rect = white.getBoundingClientRect();
          const buttonZoneBottom = window.innerHeight - 20;
          const buttonZoneTop = window.innerHeight - 100;
          const overWhite = rect.top < buttonZoneBottom && rect.bottom > buttonZoneTop;

          setCtaOverWhite(!!overWhite);
          setCtaOverHero(overHero && !overWhite);
          // Match Safari tab bar / overscroll background to content behind it
          updateThemeColor(overWhite ? '#ffffff' : '#1a1a1a');
          ticking = false;
        });
        ticking = true;
      }
    };
    function updateThemeColor(color) {
      const meta = document.getElementById('theme-color-meta');
      if (meta && meta.getAttribute('content') !== color) {
        meta.setAttribute('content', color);
      }
    }
    check();
    const t = setTimeout(check, 100);
    window.addEventListener('scroll', check, { passive: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener('scroll', check);
    };
  }, [location.pathname]);

  return (
    <div className="app-layout">
      <Header />
      <a href="/app" className={`app-cta-fixed ${ctaOverHero ? 'app-cta-fixed-hero' : ''} ${ctaOverWhite ? 'app-cta-fixed-invert' : ''}`} aria-label="Ir a la app">
        <span className="app-cta-fixed-text">Ir a la app</span>
        <img src={heroLogo} alt="" className="app-cta-fixed-logo" />
      </a>
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/creators" element={<CreatorsPage />} />
          <Route path="/support" element={<SupportScreen />} />
          <Route path="/legal" element={<LegalDocumentsScreen />} />
          <Route path="/landing" element={<Navigate to="/" replace />} />
          <Route path="/landing/*" element={<LandingPathRedirect />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

function LandingPathRedirect() {
  const { '*': splat } = useParams();
  return <Navigate to={splat ? `/${splat}` : '/'} replace />;
}

export default function App() {
  return (
    <BrowserRouter basename="/">
      <AppContent />
    </BrowserRouter>
  );
}

