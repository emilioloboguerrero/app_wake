import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { auth } from '../config/firebase';
import eventService from '../services/eventService';
import { useAuth } from '../contexts/AuthContext';
import { FixedWakeHeader, WakeHeaderSpacer } from '../components/WakeHeader';
import WakeLoader from '../components/WakeLoader';

// result states: null | { type: 'success'|'already'|'invalid'|'error', reg? }

export default function EventCheckinScreen() {
  const { eventId } = useParams();
  const { user: contextUser } = useAuth();
  const user = contextUser || auth.currentUser;
  const navigate = useNavigate();

  const [event, setEvent] = useState(null);
  const [accessStatus, setAccessStatus] = useState('loading'); // loading | ready | denied
  const [scannerState, setScannerState] = useState('idle'); // idle | scanning | processing
  const [result, setResult] = useState(null);
  const [accentRgb, setAccentRgb] = useState([255, 255, 255]);
  const [supportsBarcodeDetector, setSupportsBarcodeDetector] = useState(false);
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const canvasRef = useRef(null);
  const processingRef = useRef(false);
  const resetTimerRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    eventService.getEvent(eventId).then(event => {
      if (!event || event.creator_id !== user.uid) {
        setAccessStatus('denied');
        return;
      }
      setEvent(event);
      setAccessStatus('ready');
    }).catch(() => setAccessStatus('denied'));
  }, [eventId, user]);

  useEffect(() => {
    if (!event?.image_url) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let bestR = 255, bestG = 255, bestB = 255, bestScore = -1;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 128) continue;
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          if (max < 40 || max > 245) continue;
          const sat = max === 0 ? 0 : (max - min) / max;
          const score = sat * (max / 255);
          if (score > bestScore) { bestScore = score; bestR = r; bestG = g; bestB = b; }
        }
        setAccentRgb([bestR, bestG, bestB]);
      } catch {}
    };
    img.src = event.image_url;
  }, [event?.image_url]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ('BarcodeDetector' in window) {
      try {
        // eslint-disable-next-line no-new
        new window.BarcodeDetector({ formats: ['qr_code'] });
        setSupportsBarcodeDetector(true);
      } catch {
        setSupportsBarcodeDetector(false);
      }
    }
  }, []);

  useEffect(() => {
    if (scannerState !== 'scanning') return;

    processingRef.current = false;
    let isMounted = true;
    const reader = new BrowserMultiFormatReader();

    reader.decodeFromVideoDevice(undefined, videoRef.current, (res) => {
      if (!isMounted || processingRef.current) return;
      if (res) {
        const text = typeof res.getText === 'function' ? res.getText() : res.text;
        if (text) {
          processingRef.current = true;
          onQrSuccess(text);
        }
      }
    }).then(controls => {
      if (!isMounted) { try { controls.stop(); } catch {} return; }
      controlsRef.current = controls;
    }).catch(() => {
      if (isMounted) setScannerState('idle');
    });

    return () => {
      isMounted = false;
      if (controlsRef.current) {
        try { controlsRef.current.stop(); } catch {}
        controlsRef.current = null;
      }
    };
  }, [scannerState]);

  function startScanner() {
    setScannerState('scanning');
    setResult(null);
  }

  function stopScanner() {
    if (controlsRef.current) {
      try { controlsRef.current.stop(); } catch {}
      controlsRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      stopScanner();
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  async function processQrToken(raw) {
    let token = raw.trim();
    try {
      const parsed = JSON.parse(raw);
      if (parsed.token) token = parsed.token;
    } catch {}

    try {
      const { status, reg } = await eventService.checkInByToken(eventId, token);
      if (status === 'invalid') {
        setResult({ type: 'invalid' });
      } else if (status === 'already') {
        setResult({ type: 'already', reg });
      } else {
        setResult({ type: 'success', reg });
      }
    } catch {
      setResult({ type: 'error' });
    }
  }

  async function onQrSuccess(raw) {
    setScannerState('processing');
    stopScanner();

    await processQrToken(raw);

    setScannerState('idle');
    resetTimerRef.current = setTimeout(() => setResult(null), 3500);
  }

  async function handleSnapAndScan() {
    if (!videoRef.current) return;
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);

    setResult(null);
    setScannerState('processing');
    stopScanner();

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current || document.createElement('canvas');
      if (!canvasRef.current) {
        canvasRef.current = canvas;
      }
      const ctx = canvas.getContext('2d');
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 480;
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(video, 0, 0, width, height);

      let decodedText = null;

      if (supportsBarcodeDetector && typeof window !== 'undefined' && window.BarcodeDetector) {
        try {
          const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
          const barcodes = await detector.detect(canvas);
          if (barcodes.length > 0 && barcodes[0].rawValue) {
            decodedText = barcodes[0].rawValue;
          }
        } catch {
          // fall through to ZXing fallback
        }
      }

      if (!decodedText) {
        try {
          const reader = new BrowserMultiFormatReader();
          const dataUrl = canvas.toDataURL('image/png');
          const res = await reader.decodeFromImageUrl(dataUrl);
          if (res) {
            decodedText = typeof res.getText === 'function' ? res.getText() : res.text;
          }
        } catch {
          // ignore, handled below
        }
      }

      if (decodedText) {
        await processQrToken(decodedText);
      } else {
        setResult({ type: 'unreadable' });
      }
    } catch {
      setResult({ type: 'unreadable' });
    }

    setScannerState('idle');
    resetTimerRef.current = setTimeout(() => setResult(null), 3500);
  }

  function handleReset() {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    setResult(null);
    setScannerState('idle');
  }

  function getRegName(reg) {
    if (!reg) return '';
    if (reg.nombre) return reg.nombre;
    if (reg.responses) {
      const vals = Object.values(reg.responses);
      const name = vals.find(v => typeof v === 'string' && v.includes(' ') && !v.includes('@'));
      if (name) return name;
    }
    return 'Registrado';
  }

  function formatCheckinTime(ts) {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date();
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  const accent = `rgb(${accentRgb[0]},${accentRgb[1]},${accentRgb[2]})`;
  const accentFaint = `rgba(${accentRgb[0]},${accentRgb[1]},${accentRgb[2]},0.1)`;

  if (accessStatus === 'loading') {
    return (
      <div style={s.screen}>
        <FixedWakeHeader showBackButton onBackPress={() => navigate('/creator/events')} />
        <div style={s.loaderWrap}>
          <WakeLoader />
        </div>
      </div>
    );
  }

  if (accessStatus === 'denied') {
    return (
      <div style={s.screen}>
        <FixedWakeHeader showBackButton onBackPress={() => navigate('/creator/events')} />
        <WakeHeaderSpacer />
        <p style={s.loadingText}>Acceso no autorizado.</p>
      </div>
    );
  }

  return (
    <div style={{ ...s.screen, '--ec-accent': accent, '--ec-accent-faint': accentFaint }}>
      {/* Decorative orbs */}
      <div style={s.orb1} />
      <div style={s.orb2} />

      <FixedWakeHeader showBackButton onBackPress={() => navigate('/creator/events')} />

      <div style={s.content}>
        <WakeHeaderSpacer />
        <div style={s.contentTopSpacer} />
        {/* Event header */}
        <div style={s.eventHeader}>
          {event?.image_url && (
            <img src={event.image_url} alt={event.title} style={s.thumb} />
          )}
          <div>
            <p style={s.eventName}>{event?.title}</p>
            <p style={s.eventSub}>Escanea los QR de los registrados</p>
          </div>
        </div>

        {/* Scanner card */}
        <div style={s.scannerCard}>
          <video
            ref={videoRef}
            muted
            playsInline
            style={scannerState === 'scanning' ? s.videoActive : s.videoHidden}
          />

          {/* Snap & scan overlay on top of live video */}
          {scannerState === 'scanning' && (
            <div style={s.snapOverlay}>
              <div style={s.snapOverlayInner}>
                <p style={s.snapHint}>
                  Alinea el código en el recuadro y toca para tomar una foto nítida.
                </p>
                <button
                  style={{ ...s.snapBtn, background: accent }}
                  onClick={handleSnapAndScan}
                >
                  Tomar foto y escanear
                </button>
              </div>
            </div>
          )}

          {/* Overlay when not scanning */}
          {scannerState !== 'scanning' && (
            <div style={s.overlay}>
              {result ? (
                <div style={s.result}>
                  {result.type === 'success' && (
                    <>
                      <svg viewBox="0 0 52 52" width="56" height="56">
                        <circle cx="26" cy="26" r="23" fill="none" stroke="#4ade80" strokeWidth="2.5"
                          strokeDasharray="146" strokeDashoffset="0" />
                        <polyline points="14,26 22,34 38,18" fill="none" stroke="#4ade80" strokeWidth="3"
                          strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <h2 style={s.resultTitle}>¡Check-in confirmado!</h2>
                      <p style={s.resultName}>{getRegName(result.reg)}</p>
                    </>
                  )}
                  {result.type === 'already' && (
                    <>
                      <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <h2 style={s.resultTitle}>Ya hizo check-in</h2>
                      <p style={s.resultName}>{getRegName(result.reg)}</p>
                      {result.reg.checked_in_at && (
                        <p style={s.resultSub}>Entró a las {formatCheckinTime(result.reg.checked_in_at)}</p>
                      )}
                      {result.type === 'unreadable' && (
                        <>
                          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="rgba(248,113,113,0.9)" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="15" y1="9" x2="9" y2="15" />
                            <line x1="9" y1="9" x2="15" y2="15" />
                          </svg>
                          <h2 style={s.resultTitle}>No pudimos leer el QR</h2>
                          <p style={s.resultSub}>
                            Asegúrate de que esté bien enfocado y ocupa la mayor parte del cuadro.
                          </p>
                        </>
                      )}
                    </>
                  )}
                  {(result.type === 'invalid' || result.type === 'error') && (
                    <>
                      <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="rgba(248,113,113,0.9)" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                      <h2 style={s.resultTitle}>
                        {result.type === 'invalid' ? 'QR no válido' : 'Error de conexión'}
                      </h2>
                      <p style={s.resultSub}>
                        {result.type === 'invalid' ? 'No se encontró este registro' : 'Intenta de nuevo'}
                      </p>
                    </>
                  )}
                  <button style={s.resetBtn} onClick={handleReset}>Escanear otro</button>
                </div>
              ) : (
                <div style={s.idle}>
                  <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="3" height="3" rx="0.5" />
                    <rect x="18" y="14" width="3" height="3" rx="0.5" />
                    <rect x="14" y="18" width="3" height="3" rx="0.5" />
                    <rect x="18" y="18" width="3" height="3" rx="0.5" />
                  </svg>
                  <p style={s.idleText}>Listo para escanear</p>
                  <button
                    style={{ ...s.startBtn, background: accent }}
                    onClick={startScanner}
                  >
                    Activar cámara
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Processing overlay */}
          {scannerState === 'processing' && (
            <div style={s.processing}>
              <div style={{ ...s.spinner, borderTopColor: accent }} />
              <p style={s.processingText}>Verificando…</p>
            </div>
          )}
        </div>

        <p style={s.instructions}>
          Muestra el QR de la confirmación de registro para hacer check-in.
          Cada QR solo puede usarse una vez.
        </p>
      </div>

      <style>{`@keyframes pwaEcSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const s = {
  screen: {
    minHeight: '100%',
    backgroundColor: '#1a1a1a',
    position: 'relative',
    overflow: 'hidden',
    paddingBottom: 96,
  },
  loaderWrap: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orb1: {
    position: 'fixed',
    width: 320,
    height: 320,
    borderRadius: '50%',
    filter: 'blur(80px)',
    background: 'rgba(255,255,255,0.06)',
    top: -80,
    right: -60,
    pointerEvents: 'none',
    zIndex: 0,
  },
  orb2: {
    position: 'fixed',
    width: 240,
    height: 240,
    borderRadius: '50%',
    filter: 'blur(80px)',
    background: 'rgba(255,255,255,0.04)',
    bottom: '10%',
    left: -50,
    pointerEvents: 'none',
    zIndex: 0,
  },
  loadingText: {
    padding: 'max(16px, 2vh) 20px',
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    margin: 0,
  },
  content: {
    maxWidth: 480,
    margin: '0 auto',
    padding: '0 20px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    position: 'relative',
    zIndex: 2,
  },
  contentTopSpacer: {
    paddingTop: 'max(16px, 2vh)',
  },
  eventHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    paddingLeft: 20,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    objectFit: 'cover',
    flexShrink: 0,
  },
  eventName: {
    color: '#fff',
    fontSize: 'clamp(26px, 8vw, 32px)',
    fontWeight: '600',
    margin: '0 0 4px',
  },
  eventSub: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    margin: 0,
  },
  scannerCard: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
    minHeight: 360,
  },
  snapOverlay: {
    position: 'absolute',
    inset: 'auto 0 0 0',
    padding: '14px 16px 16px',
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',
    background: 'linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0))',
  },
  snapOverlayInner: {
    maxWidth: 420,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    pointerEvents: 'auto',
  },
  snapHint: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    textAlign: 'center',
    margin: 0,
  },
  snapBtn: {
    border: 'none',
    borderRadius: 999,
    color: '#111',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 14,
    fontWeight: 700,
    padding: '11px 26px',
    boxShadow: '0 12px 30px rgba(0,0,0,0.55)',
    transform: 'translateY(0)',
    transition: 'transform 160ms ease, box-shadow 160ms ease, opacity 160ms ease',
  },
  videoHidden: {
    display: 'none',
  },
  videoActive: {
    width: '100%',
    height: 360,
    objectFit: 'cover',
    display: 'block',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  idle: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    padding: '48px 24px',
    textAlign: 'center',
  },
  idleText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 14,
    margin: 0,
  },
  startBtn: {
    border: 'none',
    borderRadius: 12,
    color: '#111',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 15,
    fontWeight: 700,
    padding: '14px 32px',
  },
  result: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    padding: '40px 24px',
    textAlign: 'center',
    width: '100%',
  },
  resultTitle: {
    fontSize: 22,
    fontWeight: 800,
    color: '#fff',
    margin: 0,
  },
  resultName: {
    fontSize: 16,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.8)',
    margin: 0,
  },
  resultSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    margin: 0,
  },
  resetBtn: {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 10,
    color: 'rgba(255,255,255,0.6)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 600,
    marginTop: 6,
    padding: '11px 24px',
  },
  processing: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    zIndex: 10,
  },
  processingText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    margin: 0,
  },
  spinner: {
    width: 36,
    height: 36,
    border: '2.5px solid rgba(255,255,255,0.1)',
    borderRadius: '50%',
    animation: 'pwaEcSpin 0.7s linear infinite',
  },
  instructions: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 12,
    lineHeight: 1.6,
    textAlign: 'center',
    margin: 0,
  },
};
