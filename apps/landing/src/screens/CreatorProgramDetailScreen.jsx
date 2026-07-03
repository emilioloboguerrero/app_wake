import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LandingFooter } from './ShowcaseLandingScreen';
import apiClient, { WakeApiError } from '../utils/apiClient';
import { getCreatorProgram, getCreatorStorefront } from '../services/creatorStorefrontService';
import {
  startStorefrontCheckout,
  startPolarCheckout,
  StorefrontCheckoutError,
} from '../services/storefrontCheckoutService';
import { getCurrentUser } from '../services/storefrontAuthService';
import analyticsService from '../services/analyticsService';
import { useAccentFromImage } from '../utils/accentColor';
import AuthModal from '../components/AuthModal';
import { whatsappUrl } from '../config/support';
import './CreatorProgramDetailScreen.css';

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function formatUsd(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return USD.format(value);
}

// Best-effort default payment method for the public page, which has no stored
// buyer country. Colombia-looking browsers default to MercadoPago (COP);
// everyone else to Polar (international cards, USD). Always overridable.
function detectDefaultProvider() {
  try {
    if (Intl.DateTimeFormat().resolvedOptions().timeZone === 'America/Bogota') return 'mercadopago';
    const langs = [navigator.language, ...(navigator.languages || [])].filter(Boolean);
    if (langs.some((l) => /^es-CO$/i.test(l))) return 'mercadopago';
  } catch { /* non-browser / blocked — fall through */ }
  return 'polar';
}

function formatPrice(value, currency) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  if (!currency || currency.toUpperCase() === 'COP') return COP.format(value);
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value}`;
  }
}

function IncludesTags({ program, className }) {
  if (program.deliveryType === 'one_on_one') {
    return (
      <div className={`cpd-includes ${className || ''}`} aria-label="Formato del programa">
        <span className="cpd-include-pill">Asesoría</span>
      </div>
    );
  }
  const showTraining = program.hasTraining !== false;
  const showNutrition = program.hasNutrition === true;
  if (!showTraining && !showNutrition) return null;
  return (
    <div className={`cpd-includes ${className || ''}`} aria-label="Lo que incluye">
      {showTraining ? <span className="cpd-include-pill">Entrenamiento</span> : null}
      {showNutrition ? <span className="cpd-include-pill">Nutrición</span> : null}
    </div>
  );
}

function RelatedCard({ username, program }) {
  const isOneOnOne = program.deliveryType === 'one_on_one';
  const otp = formatPrice(program.price, program.currency);
  const sub = formatPrice(program.subscriptionPrice, program.currency);
  const priceText = isOneOnOne ? 'Asesoría' : (sub ? `${sub}/mes` : otp);
  return (
    <Link to={`/${username}/${program.id}`} className="cpd-related-card">
      <div className="cpd-related-card-media">
        {program.imageUrl ? (
          <img src={program.imageUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          <div className="cpd-related-card-placeholder" aria-hidden="true" />
        )}
      </div>
      <div className="cpd-related-card-body">
        <h3 className="cpd-related-card-title">{program.title}</h3>
        {priceText ? <p className="cpd-related-card-price">{priceText}</p> : null}
      </div>
    </Link>
  );
}

// Pulls the 11-char video id out of any common YouTube URL shape:
// youtube.com/watch?v=ID, youtu.be/ID, /embed/ID, /shorts/ID.
function youtubeId(url) {
  if (typeof url !== 'string') return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// Renders a cta label, emphasizing **bold** segments (odd split indices).
function renderCtaLabel(label) {
  return String(label).split('**').map((part, i) =>
    (i % 2 === 1 ? <strong key={i}>{part}</strong> : part)
  );
}

function SectionBlock({ block, program, onCtaClick }) {
  if (block.type === 'text') {
    return <p className="cpd-section-text">{block.value}</p>;
  }
  if (block.type === 'image') {
    return (
      <img
        className="cpd-section-img"
        src={block.url}
        alt=""
        loading="lazy"
        decoding="async"
      />
    );
  }
  if (block.type === 'youtube') {
    const id = youtubeId(block.url);
    if (!id) return null;
    return (
      <div className="cpd-section-embed">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`}
          title="Video"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  if (block.type === 'video') {
    return (
      <video
        className="cpd-section-video"
        src={block.url}
        controls
        playsInline
        preload="metadata"
      />
    );
  }
  if (block.type === 'faq') {
    if (!Array.isArray(block.items) || block.items.length === 0) return null;
    return (
      <div className="cpd-faq">
        {block.items.map((item, i) => (
          <details className="cpd-faq-item" key={i}>
            <summary className="cpd-faq-q">
              <span className="cpd-faq-q-text">{item.q}</span>
              <span className="cpd-faq-indicator" aria-hidden="true" />
            </summary>
            <p className="cpd-faq-a">{item.a}</p>
          </details>
        ))}
      </div>
    );
  }
  if (block.type === 'compare') {
    if (!Array.isArray(block.rows) || block.rows.length === 0) return null;
    return (
      <div className="cpd-compare" role="table" aria-label="Comparación">
        <div className="cpd-compare-head" role="row">
          <div className="cpd-compare-cell cpd-compare-cell--label" role="columnheader" />
          <div className="cpd-compare-cell cpd-compare-cell--mine" role="columnheader">
            {block.mineLabel}
          </div>
          <div className="cpd-compare-cell cpd-compare-cell--others" role="columnheader">
            {block.othersLabel}
          </div>
        </div>
        {block.rows.map((row, i) => (
          <div className="cpd-compare-row" role="row" key={i}>
            <div className="cpd-compare-cell cpd-compare-cell--label" role="cell">
              {row.label}
            </div>
            <div className="cpd-compare-cell cpd-compare-cell--mine" role="cell">
              {row.mine ? <CompareCheck /> : <CompareCross />}
            </div>
            <div className="cpd-compare-cell cpd-compare-cell--others" role="cell">
              {row.others ? <CompareCheck /> : <CompareCross />}
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (block.type === 'cta') {
    if (!block.label) return null;
    // Mirror the hero CTA: subscription price wins when present, else one-time.
    const sub = formatPrice(program?.subscriptionPrice, program?.currency);
    const otp = formatPrice(program?.price, program?.currency);
    const isSub = typeof program?.subscriptionPrice === 'number' && program.subscriptionPrice > 0;
    return (
      <button type="button" className="cpd-cta cpd-cta-primary cpd-section-cta" onClick={onCtaClick}>
        <span className="cpd-cta-label">{renderCtaLabel(block.label)}</span>
        {isSub ? (
          sub ? (
            <span className="cpd-cta-price">
              {typeof program.compareAtPrice === 'number' && program.compareAtPrice > program.subscriptionPrice ? (
                <span className="cpd-cta-compare">{formatPrice(program.compareAtPrice, program.currency)}</span>
              ) : null}
              {sub}<span className="cpd-cta-suffix">/mes</span>
            </span>
          ) : null
        ) : (
          otp ? (
            <span className="cpd-cta-price">
              {typeof program.compareAtPrice === 'number' && program.compareAtPrice > program.price ? (
                <span className="cpd-cta-compare">{formatPrice(program.compareAtPrice, program.currency)}</span>
              ) : null}
              {otp}
            </span>
          ) : null
        )}
      </button>
    );
  }
  return null;
}

function CompareCheck() {
  return (
    <svg className="cpd-compare-icon cpd-compare-icon--yes" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-label="Sí">
      <path d="m5 12.5 4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CompareCross() {
  return (
    <svg className="cpd-compare-icon cpd-compare-icon--no" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-label="No">
      <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Optional creator-authored "landing sections" (e.g. "Qué incluye",
// "Novedades") rendered below the hero/CTA. Server-sanitized; each section is
// guaranteed a non-empty heading and at least one valid block.
function ProgramSections({ sections, program, onCtaClick }) {
  if (!Array.isArray(sections) || sections.length === 0) return null;
  return (
    <section className="cpd-sections" aria-label="Sobre el programa">
      {sections.map((section, i) => {
        // faq/compare/cta blocks want the full section width, not a 50% column.
        // Render the whole section as a single stacked column: heading on top,
        // then every block in order (text as paragraphs, the special block full
        // width). This bypasses the side-by-side editorial grid entirely.
        const isFull = section.blocks.some((b) => b.type === 'faq' || b.type === 'compare' || b.type === 'cta');
        if (isFull) {
          return (
            <div className="cpd-section cpd-section--full" key={i}>
              <h2 className="cpd-section-heading">{section.heading}</h2>
              {section.blocks.map((block, j) => (
                <SectionBlock block={block} program={program} onCtaClick={onCtaClick} key={j} />
              ))}
            </div>
          );
        }
        // Image is the protagonist; the copy (heading + text) sits beside it.
        // Split blocks into a media column and a text column, then alternate
        // the image side every other section for the editorial rhythm.
        const media = section.blocks.filter((b) => b.type !== 'text');
        const texts = section.blocks.filter((b) => b.type === 'text');
        const className = `cpd-section${media.length === 0 ? ' cpd-section--text-only' : ''}${i % 2 === 1 ? ' cpd-section--reverse' : ''}`;
        return (
          <div className={className} key={i}>
            {media.length > 0 ? (
              <div className="cpd-section-media">
                {media.length >= 2 && media.every((b) => b.type === 'image') ? (
                  // Multiple images fan out like the bundle cover stack.
                  <div className={`cpd-section-fan cpd-section-fan--${Math.min(media.length, 3)}`}>
                    {media.slice(0, 3).map((block, j) => (
                      <div className={`cpd-section-fan-tile cpd-section-fan-tile--${j}`} key={j}>
                        <img src={block.url} alt="" loading="lazy" decoding="async" />
                      </div>
                    ))}
                  </div>
                ) : (
                  media.map((block, j) => <SectionBlock block={block} program={program} onCtaClick={onCtaClick} key={j} />)
                )}
              </div>
            ) : null}
            <div className="cpd-section-copy">
              <h2 className="cpd-section-heading">{section.heading}</h2>
              {texts.map((block, j) => (
                <SectionBlock block={block} program={program} onCtaClick={onCtaClick} key={j} />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function BackArrow() {
  // Same chevron-left as the PWA's FixedWakeHeader.
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m15 19-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Icons ported from the PWA's CourseDetailScreen video player
// (apps/pwa/src/components/icons/{SvgPlay, SvgVolumeMax, SvgVolumeOff, SvgArrowReload}).
function PlayIcon({ size = 48 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 17.3336V6.66698C5 5.78742 5 5.34715 5.18509 5.08691C5.34664 4.85977 5.59564 4.71064 5.87207 4.67499C6.18868 4.63415 6.57701 4.84126 7.35254 5.25487L17.3525 10.5882L17.3562 10.5898C18.2132 11.0469 18.642 11.2756 18.7826 11.5803C18.9053 11.8462 18.9053 12.1531 18.7826 12.4189C18.6418 12.7241 18.212 12.9537 17.3525 13.4121L7.35254 18.7454C6.57645 19.1593 6.1888 19.3657 5.87207 19.3248C5.59564 19.2891 5.34664 19.1401 5.18509 18.9129C5 18.6527 5 18.2132 5 17.3336Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function VolumeMaxIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M18.82 4.68652C19.8191 5.61821 20.6167 6.74472 21.1636 7.99657C21.7105 9.24842 21.9952 10.5991 21.9999 11.9652C22.0047 13.3313 21.7295 14.6838 21.1914 15.9395C20.6532 17.1951 19.8635 18.3272 18.8709 19.2658M16.092 7.61194C16.6915 8.17095 17.17 8.84686 17.4982 9.59797C17.8263 10.3491 17.9971 11.1595 18 11.9791C18.0028 12.7988 17.8377 13.6103 17.5148 14.3637C17.1919 15.1171 16.7181 15.7963 16.1225 16.3595M7.4803 15.4069L9.15553 17.48C10.0288 18.5607 10.4655 19.1011 10.848 19.1599C11.1792 19.2108 11.5138 19.0925 11.7394 18.8448C12 18.5586 12 17.8638 12 16.4744V7.52572C12 6.13627 12 5.44155 11.7394 5.15536C11.5138 4.90761 11.1792 4.78929 10.848 4.84021C10.4655 4.89904 10.0288 5.43939 9.15553 6.52009L7.4803 8.59319C7.30388 8.81151 7.21567 8.92067 7.10652 8.99922C7.00982 9.06881 6.90147 9.12056 6.78656 9.15204C6.65687 9.18756 6.51652 9.18756 6.23583 9.18756H4.8125C4.0563 9.18756 3.6782 9.18756 3.37264 9.2885C2.77131 9.48716 2.2996 9.95887 2.10094 10.5602C2 10.8658 2 11.2439 2 12.0001C2 12.7563 2 13.1344 2.10094 13.4399C2.2996 14.0413 2.77131 14.513 3.37264 14.7116C3.6782 14.8126 4.0563 14.8126 4.8125 14.8126H6.23583C6.51652 14.8126 6.65687 14.8126 6.78656 14.8481C6.90147 14.8796 7.00982 14.9313 7.10652 15.0009C7.21567 15.0794 7.30388 15.1886 7.4803 15.4069Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function VolumeOffIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 9.18725H8.8125C8.0563 9.18725 7.6782 9.18725 7.37264 9.28819C6.77131 9.48684 6.2996 9.95855 6.10094 10.5599C6 10.8654 6 11.2435 6 11.9997C6 12.7559 6 13.134 6.10094 13.4396C6.2996 14.0409 6.77131 14.5127 7.37264 14.7113C7.6782 14.8122 8.0563 14.8122 8.8125 14.8122H10.2358C10.5165 14.8122 10.6569 14.8122 10.7866 14.8478C10.9015 14.8792 11.0098 14.931 11.1065 15.0006C11.2157 15.0791 11.3039 15.1883 11.4803 15.4066L13.1555 17.4797C14.0288 18.5604 14.4655 19.1008 14.848 19.1596C15.1792 19.2105 15.5138 19.0922 15.7394 18.8444C16 18.5583 16 17.8635 16 16.4741V14.9997M16 10.4997V6.97735C16 6.04105 16 5.57291 15.8776 5.3488C15.6329 4.90109 15.0905 4.70931 14.6188 4.90379C14.3827 5.00113 14.0885 5.36526 13.5 6.0935L12.875 6.86693M6 4.99975L20 18.9997" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ReloadIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 16H19V21M10 8H5V3M19.4176 9.0034C18.8569 7.61566 17.9181 6.41304 16.708 5.53223C15.4979 4.65141 14.0652 4.12752 12.5723 4.02051C11.0794 3.9135 9.58606 4.2274 8.2627 4.92661C6.93933 5.62582 5.83882 6.68254 5.08594 7.97612M4.58203 14.9971C5.14272 16.3848 6.08146 17.5874 7.29157 18.4682C8.50169 19.3491 9.93588 19.8723 11.4288 19.9793C12.9217 20.0863 14.4138 19.7725 15.7371 19.0732C17.0605 18.374 18.1603 17.3175 18.9131 16.0239" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function CreatorProgramDetailScreen() {
  const { username, programId } = useParams();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [authOpen, setAuthOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState(null);
  // Single source of truth for which CTA is in flight. Avoids the bug where
  // `checkoutBusy && pendingMode === 'one_time'` lit up the wrong button when
  // pendingMode lagged behind the actual click target.
  const [busyMode, setBusyMode] = useState(null);
  const [checkoutError, setCheckoutError] = useState(null);
  const [altEmail, setAltEmail] = useState('');
  const [needsAltEmail, setNeedsAltEmail] = useState(false);
  // Proactive subscription email confirm step: false = hidden; when true,
  // one-tap confirm of the account email or switch to a custom MP email.
  const [emailStep, setEmailStep] = useState(false);
  const [useCustomEmail, setUseCustomEmail] = useState(false);
  const [alreadyOwned, setAlreadyOwned] = useState(null);
  // Sold-out waitlist: 'hidden' (just the CTA) | 'form' | 'done'.
  const [waitlistPhase, setWaitlistPhase] = useState('hidden');
  const [waitlistName, setWaitlistName] = useState('');
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistError, setWaitlistError] = useState(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const videoRef = useRef(null);
  const [related, setRelated] = useState([]);
  // null = follow the heuristic default; 'mercadopago' | 'polar' = explicit toggle.
  const [providerOverride, setProviderOverride] = useState(null);

  const accent = useAccentFromImage(data?.program?.imageUrl);

  const toggleVideo = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused || v.ended) {
      if (v.ended) v.currentTime = 0;
      v.play();
    } else {
      v.pause();
    }
  };

  const restartVideo = () => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    v.play();
  };

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setData(null);
    setRelated([]);
    // Storefront fetch is best-effort; the cache is shared with the storefront
    // screen so this is usually a hit. Any failure is silent — the related
    // section just hides.
    Promise.all([
      getCreatorProgram(username, programId),
      getCreatorStorefront(username).catch(() => null),
    ])
      .then(([res, storefront]) => {
        if (cancelled) return;
        if (!res) {
          setStatus('not_found');
          return;
        }
        setData(res);
        setStatus('ready');
        if (storefront?.programs) {
          const all = [
            ...(storefront.programs.general || []),
            ...(storefront.programs.oneOnOne || []),
          ];
          setRelated(all.filter((p) => p.id !== programId).slice(0, 2));
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof WakeApiError && err.status === 404) {
          setStatus('not_found');
        } else {
          setStatus('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [username, programId]);

  useEffect(() => {
    if (status === 'ready' && data?.program?.title && data?.creator?.displayName) {
      document.title = `${data.program.title} — ${data.creator.displayName}`;
    }
    // Don't reset on unmount — the next screen sets its own title and the
    // brief "Wake" flash is jarring.
  }, [status, data]);

  if (status === 'loading') {
    return (
      <div className="cpd-root">
        <div className="cpd-loading"><div className="cpd-spinner" /></div>
      </div>
    );
  }

  if (status === 'not_found' || status === 'error') {
    return (
      <div className="cpd-root cpd-empty">
        <div className="cpd-empty-inner">
          <h1>Programa no disponible</h1>
          <p>Este programa ya no está publicado o no existe.</p>
          <Link to={`/${username}`} className="cpd-empty-cta">Ver perfil</Link>
        </div>
      </div>
    );
  }

  const { creator, program } = data;
  const isOneOnOne = program.deliveryType === 'one_on_one';
  // The intro video field accepts an uploaded file (played via <video>) or a
  // YouTube link (embedded). youtubeId() returns null for uploaded-file URLs.
  // A dedicated storefront video, when present, takes precedence over the intro.
  const heroVideoUrl = program.storefrontVideoUrl || program.videoIntroUrl;
  const introYtId = youtubeId(heroVideoUrl);
  const hasOneTime =
    typeof program.price === 'number' && program.price > 0;
  const hasSubscription =
    typeof program.subscriptionPrice === 'number' && program.subscriptionPrice > 0;
  const oneTimePrice = formatPrice(program.price, program.currency);
  const subPrice = formatPrice(program.subscriptionPrice, program.currency);

  const polarCfg = program.polar || null;
  const copAvailable = hasOneTime || hasSubscription;
  const polarAvailable = !!polarCfg && (polarCfg.hasSubscription || polarCfg.hasOnetime);
  // Clamp to what's actually available; only honor the toggle when both exist.
  const provider = isOneOnOne
    ? 'mercadopago'
    : (copAvailable && polarAvailable)
      ? (providerOverride || detectDefaultProvider())
      : (polarAvailable ? 'polar' : 'mercadopago');
  const polarSubPrice = polarCfg ? formatUsd(polarCfg.priceUsdMonthly) : null;
  const polarOtpPrice = polarCfg ? formatUsd(polarCfg.priceUsdOnetime) : null;
  const polarHasSub = !!polarCfg?.hasSubscription;
  const polarHasOtp = !!polarCfg?.hasOnetime;

  const accentStyle = accent
    ? {
      '--cpd-accent': accent.accent,
      '--cpd-accent-soft': accent.accentSoft,
      '--cpd-accent-line': accent.accentLine,
      '--cpd-accent-text': accent.accentText,
    }
    : undefined;

  const runCheckout = async (mode, payerEmailOverride) => {
    setBusyMode(mode);
    setCheckoutError(null);
    setAlreadyOwned(null);
    try {
      const result = await startStorefrontCheckout({
        username: creator.username,
        courseId: program.id,
        mode,
        payerEmail: payerEmailOverride,
      });
      if (result?.needsAlternateEmail) {
        setNeedsAltEmail(true);
        setBusyMode(null);
        return;
      }
      if (result?.alreadyPurchased) {
        setAlreadyOwned({ appUrl: result.appUrl || '/app/' });
        setBusyMode(null);
        return;
      }
      if (result?.initPoint) {
        // Stash the payer email so PostPaymentScreen can disclose it
        // separately from the Firebase account email when they differ.
        // The buyer often types a different MP email here — without this,
        // we'd lie about which inbox we sent the magic-link to.
        try {
          const payer = payerEmailOverride
            ? payerEmailOverride.trim().toLowerCase()
            : (getCurrentUser()?.email || '').toLowerCase();
          if (payer && program?.id) {
            window.sessionStorage.setItem(`wake_payer_${program.id}`, payer);
          }
        } catch { /* private mode — fall through */ }
        if (mode === 'subscription') {
          try {
            analyticsService.track('subscription.checkout.created', {
              course_id: program.id,
              surface: 'landing',
              kind: 'course',
              subscription_id: result.subscriptionId ?? null,
            });
          } catch { /* analytics is best-effort */ }
          try {
            analyticsService.track('subscription.checkout.redirected', {
              course_id: program.id,
              surface: 'landing',
              kind: 'course',
              subscription_id: result.subscriptionId || null,
            });
          } catch { /* analytics is best-effort */ }
        }
        window.location.href = result.initPoint;
        return;
      }
      throw new StorefrontCheckoutError('Respuesta inesperada del servidor', 'INTERNAL_ERROR', 500);
    } catch (err) {
      setBusyMode(null);
      // Filled up between page load and click — flip to the waitlist instead of
      // showing a dead-end error.
      if (err?.code === 'CAPACITY_FULL') {
        openWaitlist();
        return;
      }
      if (mode === 'subscription') {
        try {
          analyticsService.track('subscription.checkout.create_failed', {
            course_id: program?.id ?? null,
            surface: 'landing',
            kind: 'course',
            error_code: err?.code || err?.message || 'unknown',
          });
        } catch { /* analytics is best-effort */ }
      }
      setCheckoutError(err?.message || 'No se pudo iniciar el pago');
    }
  };

  const runPolarCheckout = async (mode) => {
    setBusyMode(mode);
    setCheckoutError(null);
    setAlreadyOwned(null);
    try {
      const result = await startPolarCheckout({ courseId: program.id, paymentType: mode });
      if (result?.alreadyPurchased) {
        setAlreadyOwned({ appUrl: result.appUrl || '/app/' });
        setBusyMode(null);
        return;
      }
      if (result?.checkoutUrl) {
        try {
          analyticsService.track('subscription.checkout.created', {
            course_id: program.id, surface: 'landing', kind: 'course', provider: 'polar',
          });
        } catch { /* analytics is best-effort */ }
        window.location.href = result.checkoutUrl;
        return;
      }
      throw new StorefrontCheckoutError('Respuesta inesperada del servidor', 'INTERNAL_ERROR', 500);
    } catch (err) {
      setBusyMode(null);
      if (err?.code === 'CAPACITY_FULL') { openWaitlist(); return; }
      setCheckoutError(err?.message || 'No se pudo iniciar el pago');
    }
  };

  const goToBooking = () => {
    // Deep-link into the PWA so the existing call-booking flow handles the
    // session selection. The query params let the PWA route to a coach-scoped
    // view once that surface exists.
    const url = `/app/?intent=book_call&coach=${encodeURIComponent(creator.username)}&course=${encodeURIComponent(program.id)}`;
    window.location.href = url;
  };

  // Subscriptions: confirm the Mercado Pago email BEFORE creating the
  // preapproval (it binds to that email and can't be re-bound). One-time
  // payments go straight to checkout.
  const startForMode = (mode) => {
    if (provider === 'polar') { runPolarCheckout(mode); return; }
    if (mode === 'subscription') {
      openEmailStep();
    } else {
      runCheckout(mode);
    }
  };

  const handleBuy = (mode) => {
    setCheckoutError(null);
    setNeedsAltEmail(false);
    setEmailStep(false);
    setAlreadyOwned(null);
    setAltEmail('');
    setPendingMode(mode);
    if (isOneOnOne) {
      const intentMode = mode === 'book_call' ? 'book_call' : 'book_call';
      setPendingMode(intentMode);
      if (getCurrentUser()) {
        goToBooking();
      } else {
        setAuthOpen(true);
      }
      return;
    }
    if (getCurrentUser()) {
      startForMode(mode);
    } else {
      setAuthOpen(true);
    }
  };

  // Landing-section CTA blocks fire the same primary purchase action as the
  // hero button, choosing the mode by the program's delivery/pricing shape.
  const handlePrimaryCta = () => {
    if (isOneOnOne) { handleBuy('book_call'); return; }
    if (hasSubscription) { handleBuy('subscription'); return; }
    if (hasOneTime) { handleBuy('one_time'); return; }
  };

  const handleAuthenticated = () => {
    setAuthOpen(false);
    if (pendingMode === 'book_call') {
      goToBooking();
      return;
    }
    if (pendingMode) {
      startForMode(pendingMode);
    }
  };

  const openEmailStep = () => {
    setEmailStep(true);
    setUseCustomEmail(false);
    setAltEmail('');
    setCheckoutError(null);
    try {
      analyticsService.track('subscription.email_step.shown', {
        course_id: program.id,
        surface: 'landing',
      });
    } catch { /* analytics is best-effort */ }
  };

  const confirmEmailStep = (e) => {
    if (e) e.preventDefault();
    const accountEmail = (getCurrentUser()?.email || '').trim().toLowerCase();
    const chosen = useCustomEmail ? altEmail.trim().toLowerCase() : accountEmail;
    if (!EMAIL_RE.test(chosen)) {
      setCheckoutError('Correo inválido.');
      return;
    }
    try {
      analyticsService.track('subscription.email_step.choice', {
        course_id: program.id,
        surface: 'landing',
        choice: useCustomEmail ? 'custom' : 'account',
        emails_differ: chosen !== accountEmail,
      });
    } catch { /* analytics is best-effort */ }
    setEmailStep(false);
    // Pass an override only for a custom email; undefined lets the backend
    // default to the account email (and tag emailType "account").
    runCheckout('subscription', useCustomEmail ? chosen : undefined);
  };

  const submitAltEmail = (e) => {
    e.preventDefault();
    if (!pendingMode) return;
    const trimmed = altEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setCheckoutError('Correo inválido.');
      return;
    }
    runCheckout(pendingMode, trimmed);
  };

  const openWaitlist = () => {
    const user = getCurrentUser();
    if (user) {
      setWaitlistName((prev) => prev || user.displayName || '');
      setWaitlistEmail((prev) => prev || user.email || '');
    }
    setWaitlistError(null);
    setWaitlistPhase('form');
  };

  const submitWaitlist = async (e) => {
    if (e) e.preventDefault();
    const name = waitlistName.trim();
    const email = waitlistEmail.trim().toLowerCase();
    if (!name) {
      setWaitlistError('Ingresa tu nombre.');
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setWaitlistError('Ingresa un correo válido.');
      return;
    }
    setWaitlistSubmitting(true);
    setWaitlistError(null);
    try {
      await apiClient.post(`/public/programs/${program.id}/waitlist`, { email, name });
      setWaitlistPhase('done');
    } catch {
      setWaitlistError('No pudimos guardarte. Intenta de nuevo.');
    } finally {
      setWaitlistSubmitting(false);
    }
  };

  // When both modes are available, subscription is the primary CTA and
  // one-time is the secondary. When only one is available, that one is primary.
  const oneTimeIsPrimary = hasOneTime && !hasSubscription;

  return (
    <div className="cpd-root" style={accentStyle}>
      <Link to={`/${username}`} className="cpd-back-fab" aria-label={`Volver a ${creator.displayName}`}>
        <BackArrow />
      </Link>

      <article className="cpd-content">
        <div className="cpd-media">
          {heroVideoUrl ? (
            introYtId ? (
              <div className="cpd-video-shell cpd-video-shell-embed">
                <iframe
                  className="cpd-video"
                  src={`https://www.youtube-nocookie.com/embed/${introYtId}?rel=0&modestbranding=1&playsinline=1`}
                  title="Video intro"
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
            <div
              className="cpd-video-shell"
              role="button"
              tabIndex={0}
              aria-label={videoPlaying ? 'Pausar video' : 'Reproducir video'}
              onClick={toggleVideo}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleVideo();
                }
              }}
            >
              <video
                ref={videoRef}
                className="cpd-video"
                src={heroVideoUrl}
                poster={program.imageUrl || undefined}
                playsInline
                preload="metadata"
                muted={videoMuted}
                onPlay={() => setVideoPlaying(true)}
                onPause={() => setVideoPlaying(false)}
                onEnded={() => setVideoPlaying(false)}
              />
              {!videoPlaying ? (
                <>
                  <div className="cpd-video-dim" aria-hidden="true" />
                  <div className="cpd-video-play-icon" aria-hidden="true">
                    <PlayIcon size={48} />
                  </div>
                  <button
                    type="button"
                    className="cpd-video-corner cpd-video-corner-volume"
                    onClick={(e) => { e.stopPropagation(); setVideoMuted((m) => !m); }}
                    aria-label={videoMuted ? 'Activar sonido' : 'Silenciar'}
                  >
                    {videoMuted ? <VolumeOffIcon /> : <VolumeMaxIcon />}
                  </button>
                  <button
                    type="button"
                    className="cpd-video-corner cpd-video-corner-restart"
                    onClick={(e) => { e.stopPropagation(); restartVideo(); }}
                    aria-label="Reiniciar video"
                  >
                    <ReloadIcon />
                  </button>
                </>
              ) : null}
            </div>
            )
          ) : program.imageUrl ? (
            <img
              src={program.imageUrl}
              alt={program.title}
              className="cpd-cover"
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
          ) : (
            <div className="cpd-cover cpd-cover-placeholder" aria-hidden="true" />
          )}
          <IncludesTags program={program} className="cpd-includes-overlay" />
        </div>

        <div className="cpd-info">
          <header className="cpd-header">
            <h1 className="cpd-title">{program.title}</h1>

            <div className="cpd-meta">
              {program.discipline ? <span>{program.discipline}</span> : null}
              {program.duration ? <span>{program.duration}</span> : null}
              {program.durationWeeks ? <span>{program.durationWeeks} semanas</span> : null}
            </div>
          </header>

          {isOneOnOne ? (
            <button
              type="button"
              className="cpd-cta cpd-cta-primary"
              onClick={() => handleBuy('book_call')}
              disabled={busyMode !== null}
            >
              <span className="cpd-cta-label">Reservar llamada</span>
            </button>
          ) : (program.isFull || waitlistPhase !== 'hidden') ? (
            <div className="cpd-soldout">
              {waitlistPhase === 'done' ? (
                <div className="cpd-waitlist-done" role="status">
                  <h2 className="cpd-waitlist-done-title">¡Estás en la lista!</h2>
                  <p className="cpd-waitlist-done-text">
                    Te avisaremos a <strong>{waitlistEmail}</strong> si se abre un cupo.
                  </p>
                </div>
              ) : (
                <>
                  <span className="cpd-soldout-badge">Cupos agotados</span>
                  {waitlistPhase === 'form' ? (
                    <form className="cpd-waitlist-form" onSubmit={submitWaitlist}>
                      <p className="cpd-waitlist-label">
                        Déjanos tus datos y te avisamos si se abre un cupo.
                      </p>
                      <input
                        type="text"
                        className="cpd-alt-email-input"
                        placeholder="Tu nombre"
                        value={waitlistName}
                        onChange={(e) => { setWaitlistName(e.target.value); setWaitlistError(null); }}
                        maxLength={120}
                        disabled={waitlistSubmitting}
                      />
                      <input
                        type="email"
                        className="cpd-alt-email-input"
                        placeholder="Tu correo"
                        value={waitlistEmail}
                        onChange={(e) => { setWaitlistEmail(e.target.value); setWaitlistError(null); }}
                        maxLength={200}
                        disabled={waitlistSubmitting}
                      />
                      {waitlistError ? <p className="cpd-error" role="alert">{waitlistError}</p> : null}
                      <button
                        type="submit"
                        className="cpd-cta cpd-cta-primary"
                        disabled={waitlistSubmitting}
                      >
                        <span className="cpd-cta-label">
                          {waitlistSubmitting ? 'Enviando…' : 'Unirme a la lista'}
                        </span>
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="cpd-cta cpd-cta-primary"
                      onClick={openWaitlist}
                    >
                      <span className="cpd-cta-label">Unirme a la lista de espera</span>
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (needsAltEmail || emailStep) ? null : (
            // Hide the primary CTAs while the alt-email form is showing. Both
            // buttons remained visible and clickable, so a user could re-fire
            // a subscription attempt with the wrong email and loop the same
            // MP rejection. The alt-email form below is the only valid next
            // step until it succeeds or the user resets the flow.
            <>
              {provider === 'polar' ? (
                <div className="cpd-ctas">
                  {polarHasSub ? (
                    <button
                      type="button"
                      className="cpd-cta cpd-cta-primary"
                      onClick={() => handleBuy('subscription')}
                      disabled={busyMode !== null}
                    >
                      <span className="cpd-cta-label">
                        {busyMode === 'subscription' ? 'Procesando…' : 'Suscríbete'}
                      </span>
                      {polarSubPrice ? (
                        <span className="cpd-cta-price">
                          {polarSubPrice}<span className="cpd-cta-suffix">/mes</span>
                        </span>
                      ) : null}
                    </button>
                  ) : null}
                  {polarHasOtp ? (
                    <button
                      type="button"
                      className={`cpd-cta ${polarHasSub ? 'cpd-cta-secondary' : 'cpd-cta-primary'}`}
                      onClick={() => handleBuy('one_time')}
                      disabled={busyMode !== null}
                    >
                      <span className="cpd-cta-label">
                        {busyMode === 'one_time' ? 'Procesando…' : 'Pago único'}
                      </span>
                      {polarOtpPrice ? (
                        <span className="cpd-cta-price">
                          {polarOtpPrice}
                        </span>
                      ) : null}
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="cpd-ctas">
                  {hasSubscription ? (
                    <button
                      type="button"
                      className="cpd-cta cpd-cta-primary"
                      onClick={() => handleBuy('subscription')}
                      disabled={busyMode !== null}
                    >
                      <span className="cpd-cta-label">
                        {busyMode === 'subscription' ? 'Procesando…' : 'Suscríbete'}
                      </span>
                      {subPrice ? (
                        <span className="cpd-cta-price">
                          {typeof program.compareAtPrice === 'number' && program.compareAtPrice > program.subscriptionPrice ? (
                            <span className="cpd-cta-compare">{formatPrice(program.compareAtPrice, program.currency)}</span>
                          ) : null}
                          {subPrice}<span className="cpd-cta-suffix">/mes</span>
                        </span>
                      ) : null}
                    </button>
                  ) : null}
                  {hasOneTime ? (
                    <button
                      type="button"
                      className={`cpd-cta ${oneTimeIsPrimary ? 'cpd-cta-primary' : 'cpd-cta-secondary'}`}
                      onClick={() => handleBuy('one_time')}
                      disabled={busyMode !== null}
                    >
                      <span className="cpd-cta-label">
                        {busyMode === 'one_time' ? 'Procesando…' : 'Pago único'}
                      </span>
                      {oneTimePrice ? (
                        <span className="cpd-cta-price">
                          {typeof program.compareAtPrice === 'number' && program.compareAtPrice > program.price ? (
                            <span className="cpd-cta-compare">{formatPrice(program.compareAtPrice, program.currency)}</span>
                          ) : null}
                          {oneTimePrice}
                        </span>
                      ) : null}
                    </button>
                  ) : null}
                  {!hasOneTime && !hasSubscription ? (
                    <p className="cpd-no-price">Este programa aún no tiene precio.</p>
                  ) : null}
                </div>
              )}
              {copAvailable && polarAvailable ? (
                <button
                  type="button"
                  className="cpd-provider-toggle"
                  onClick={() => {
                    setProviderOverride(provider === 'polar' ? 'mercadopago' : 'polar');
                    setCheckoutError(null);
                    setEmailStep(false);
                    setNeedsAltEmail(false);
                    setUseCustomEmail(false);
                    setAltEmail('');
                    setPendingMode(null);
                  }}
                >
                  {provider === 'mercadopago'
                    ? 'Pagar con tarjeta internacional (USD)'
                    : 'Pagar en Colombia (COP)'}
                </button>
              ) : null}
            </>
          )}

          {checkoutError ? <p className="cpd-error" role="alert">{checkoutError}</p> : null}

          {alreadyOwned ? (
            <div className="cpd-already-owned" role="status">
              <p>Ya tienes acceso a este programa.</p>
              <a href={alreadyOwned.appUrl} className="cpd-cta cpd-cta-primary">
                <span className="cpd-cta-label">Abrir en la app</span>
              </a>
            </div>
          ) : null}

          {emailStep ? (
            <form className="cpd-alt-email" onSubmit={confirmEmailStep}>
              <p className="cpd-alt-email-label">
                Usa este mismo correo al iniciar sesión en Mercado Pago para completar tu suscripción.
              </p>
              {useCustomEmail ? (
                <input
                  type="email"
                  className="cpd-alt-email-input"
                  placeholder="correo@mercadopago.com"
                  value={altEmail}
                  onChange={(e) => setAltEmail(e.target.value)}
                  maxLength={254}
                  required
                  autoFocus
                  disabled={busyMode !== null}
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'rgba(255,255,255,0.4)' }}>Tu correo</span>
                  <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.95)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {getCurrentUser()?.email || ''}
                  </span>
                </div>
              )}
              <button
                type="submit"
                className="cpd-cta cpd-cta-primary"
                disabled={busyMode !== null}
              >
                <span className="cpd-cta-label">
                  {busyMode !== null ? 'Procesando…' : (useCustomEmail ? 'Continuar' : 'Continuar con este correo')}
                </span>
              </button>
              {!useCustomEmail ? (
                <button
                  type="button"
                  className="cpd-alt-email-cancel"
                  onClick={() => { setUseCustomEmail(true); setAltEmail(''); setCheckoutError(null); }}
                  disabled={busyMode !== null}
                >
                  Usar otro correo de Mercado Pago
                </button>
              ) : null}
              <button
                type="button"
                className="cpd-alt-email-cancel"
                onClick={() => {
                  setEmailStep(false);
                  setUseCustomEmail(false);
                  setAltEmail('');
                  setCheckoutError(null);
                  setPendingMode(null);
                }}
                disabled={busyMode !== null}
              >
                Cancelar
              </button>
            </form>
          ) : null}

          {needsAltEmail ? (
            <form className="cpd-alt-email" onSubmit={submitAltEmail}>
              <p className="cpd-alt-email-label">
                Para suscripciones, Mercado Pago necesita tu correo registrado en su plataforma:
              </p>
              <input
                type="email"
                className="cpd-alt-email-input"
                placeholder="correo@mercadopago.com"
                value={altEmail}
                onChange={(e) => setAltEmail(e.target.value)}
                maxLength={254}
                required
                disabled={busyMode !== null}
              />
              <button
                type="submit"
                className="cpd-cta cpd-cta-primary"
                disabled={busyMode !== null || !altEmail}
              >
                <span className="cpd-cta-label">
                  {busyMode !== null ? 'Procesando…' : 'Continuar'}
                </span>
              </button>
              <button
                type="button"
                className="cpd-alt-email-cancel"
                onClick={() => {
                  setNeedsAltEmail(false);
                  setAltEmail('');
                  setCheckoutError(null);
                  setPendingMode(null);
                }}
                disabled={busyMode !== null}
              >
                Cancelar
              </button>
            </form>
          ) : null}

          <div className="cpd-creator-row">
            <Link to={`/${username}`} className="cpd-creator-link">
              {creator.profilePictureUrl ? (
                <img src={creator.profilePictureUrl} alt="" className="cpd-creator-avatar" />
              ) : (
                <div className="cpd-creator-avatar cpd-creator-avatar-placeholder">
                  {creator.displayName.charAt(0)}
                </div>
              )}
              <span className="cpd-creator-name">{creator.displayName}</span>
            </Link>
          </div>
        </div>
      </article>

      <ProgramSections sections={program.sections} program={program} onCtaClick={handlePrimaryCta} />

      {related.length > 0 ? (
        <section className="cpd-related" aria-label={`Más programas de ${creator.displayName}`}>
          <h2 className="cpd-related-title">Más de {creator.displayName}</h2>
          <div className="cpd-related-grid">
            {related.map((p) => (
              <RelatedCard key={p.id} username={creator.username} program={p} />
            ))}
          </div>
        </section>
      ) : null}

      <a
        className="cpd-support-fab"
        href={whatsappUrl(
          program?.title
            ? `Hola, tengo una pregunta sobre ${program.title}.`
            : 'Hola, necesito ayuda con Wake.'
        )}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Soporte por WhatsApp"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
        <span>Ayuda</span>
      </a>

      <LandingFooter />

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthenticated={handleAuthenticated}
        title={
          pendingMode === 'book_call' ?
            `Reserva una llamada con ${creator.displayName}` :
            pendingMode === 'subscription' ?
              `Suscríbete a ${program.title}` :
              `Compra ${program.title}`
        }
        subtitle={
          pendingMode === 'book_call' ?
            `Crea una cuenta o inicia sesión para coordinar tu primera sesión.` :
            `Crea una cuenta o inicia sesión para continuar con ${creator.displayName}.`
        }
      />
    </div>
  );
}
