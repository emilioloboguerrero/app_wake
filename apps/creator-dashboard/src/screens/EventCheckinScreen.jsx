import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import eventService from '../services/eventService';
import DashboardLayout from '../components/DashboardLayout';
import { GlowingEffect } from '../components/ui';
import { extractAccentFromImage } from '../components/events/eventFieldComponents';
import logger from '../utils/logger';
import { queryKeys, cacheConfig } from '../config/queryClient';
import './EventCheckinScreen.css';

// ─── Result states ─────────────────────────────────────────────────
// idle | scanning | success | already | invalid | error

export default function EventCheckinScreen() {
  const { eventId } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [scannerState, setScannerState] = useState('idle'); // idle | scanning | processing
  const [result, setResult] = useState(null); // { type, reg }
  const [accentRgb, setAccentRgb] = useState([255, 255, 255]);
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const processingRef = useRef(false);
  const resetTimerRef = useRef(null);

  // ─── Data fetching ───
  const { data: event, isLoading: eventLoading } = useQuery({
    queryKey: queryKeys.events.detail(eventId),
    queryFn: () => eventService.getEvent(eventId),
    enabled: !!user && !!eventId,
    ...cacheConfig.events,
  });
  const accessStatus = eventLoading ? 'loading' : (!event || event.creator_id !== user?.uid) ? 'denied' : 'ready';

  useEffect(() => {
    if (!event?.image_url) return;
    return extractAccentFromImage(event.image_url, setAccentRgb);
  }, [event?.image_url]);

  // ─── Event handlers ───
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

  const onQrSuccess = useCallback(async (raw) => {
    setScannerState('processing');
    if (controlsRef.current) {
      try { controlsRef.current.stop(); } catch {}
      controlsRef.current = null;
    }

    let token = raw.trim();
    try {
      const parsed = JSON.parse(raw);
      if (parsed.token) token = parsed.token;
    } catch {}

    try {
      const checkResult = await eventService.checkInByToken(eventId, token);
      if (checkResult.status === 'invalid') {
        setResult({ type: 'invalid' });
      } else if (checkResult.status === 'already') {
        setResult({ type: 'already', reg: checkResult.reg });
      } else {
        setResult({ type: 'success', reg: checkResult.reg });
      }
    } catch (err) {
      logger.error('[Checkin] lookup failed', err);
      setResult({ type: 'error' });
    }

    setScannerState('idle');

    // Auto-reset after 3.5s
    resetTimerRef.current = setTimeout(() => {
      setResult(null);
    }, 3500);
  }, [eventId]);

  // ─── Scanner lifecycle ───
  useEffect(() => {
    if (scannerState !== 'scanning') return;

    processingRef.current = false;
    let isMounted = true;
    const reader = new BrowserMultiFormatReader({ delayBetweenScanAttempts: 150 });

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
    }).catch(err => {
      logger.error('[Checkin] camera error', err);
      if (isMounted) {
        setScannerState('idle');
        showToast('No se pudo acceder a la cámara. Verifica los permisos.', 'error');
      }
    });

    return () => {
      isMounted = false;
      if (controlsRef.current) {
        try { controlsRef.current.stop(); } catch {}
        controlsRef.current = null;
      }
    };
  }, [scannerState, onQrSuccess, showToast]);

  useEffect(() => {
    return () => {
      stopScanner();
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  function handleReset() {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    setResult(null);
    setScannerState('idle');
  }

  const cssVars = {
    '--ec-accent-r': accentRgb[0],
    '--ec-accent-g': accentRgb[1],
    '--ec-accent-b': accentRgb[2],
  };

  if (accessStatus === 'loading') {
    return (
      <DashboardLayout screenName="Check-in" showBackButton backPath="/events">
        <div className="ec-loading">Cargando…</div>
      </DashboardLayout>
    );
  }

  if (accessStatus === 'denied') {
    return (
      <DashboardLayout screenName="Check-in" showBackButton backPath="/events">
        <div className="ec-loading">Acceso no autorizado.</div>
      </DashboardLayout>
    );
  }

  // ─── Render ───
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

  return (
    <DashboardLayout
      screenName={`Check-in · ${event?.title || ''}`}
      showBackButton
      backPath="/events"
    >
      <div className="ec-screen" style={cssVars}>
        <div className="ec-orbs" aria-hidden="true">
          <div className="ec-orb ec-orb-1" />
          <div className="ec-orb ec-orb-2" />
        </div>

        <div className="ec-content">
          <div className="ec-event-header ec-fade-in">
            {event?.image_url && (
              <img src={event.image_url} alt={event.title} className="ec-event-thumb" />
            )}
            <div>
              <p className="ec-event-name">{event?.title}</p>
              <p className="ec-event-sub">Escanea los QR de los registrados</p>
            </div>
          </div>

          <div className="ec-scanner-card ec-fade-in" style={{ position: 'relative' }}>
                    <GlowingEffect />
            <video
              ref={videoRef}
              muted
              playsInline
              className={`ec-qr-video${scannerState === 'scanning' ? ' ec-qr-video--active' : ''}`}
            />

            {scannerState !== 'scanning' && (
              <div className="ec-scanner-overlay">
                {result ? (
                  /* ── Result display ── */
                  <div className={`ec-result ec-result--${result.type} ec-fade-in`} style={{ position: 'relative' }}>
                    <GlowingEffect />
                    {result.type === 'success' && (
                      <>
                        <div className="ec-result-icon ec-result-icon--success">
                          <svg viewBox="0 0 52 52" width="56" height="56">
                            <circle className="ec-check-circle" cx="26" cy="26" r="23" />
                            <polyline className="ec-check-tick" points="14,26 22,34 38,18" />
                          </svg>
                        </div>
                        <h2 className="ec-result-title">¡Check-in confirmado!</h2>
                        <p className="ec-result-name">{getRegName(result.reg)}</p>
                      </>
                    )}
                    {result.type === 'already' && (
                      <>
                        <div className="ec-result-icon ec-result-icon--already">
                          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                        </div>
                        <h2 className="ec-result-title">Ya hizo check-in</h2>
                        <p className="ec-result-name">{getRegName(result.reg)}</p>
                        {result.reg.checked_in_at && (
                          <p className="ec-result-sub">
                            Entró a las {formatCheckinTime(result.reg.checked_in_at)}
                          </p>
                        )}
                      </>
                    )}
                    {result.type === 'invalid' && (
                      <>
                        <div className="ec-result-icon ec-result-icon--invalid">
                          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="15" y1="9" x2="9" y2="15" />
                            <line x1="9" y1="9" x2="15" y2="15" />
                          </svg>
                        </div>
                        <h2 className="ec-result-title">QR no válido</h2>
                        <p className="ec-result-sub">No se encontró este registro</p>
                      </>
                    )}
                    {result.type === 'error' && (
                      <>
                        <div className="ec-result-icon ec-result-icon--invalid">
                          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                        </div>
                        <h2 className="ec-result-title">Error de conexión</h2>
                        <p className="ec-result-sub">Intenta de nuevo</p>
                      </>
                    )}
                    <button className="ec-reset-btn" onClick={handleReset}>
                      Escanear otro
                    </button>
                  </div>
                ) : (
                  /* ── Idle: start button ── */
                  <div className="ec-idle ec-fade-in">
                    <div className="ec-scan-icon">
                      <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="3" width="7" height="7" rx="1" />
                        <rect x="14" y="3" width="7" height="7" rx="1" />
                        <rect x="3" y="14" width="7" height="7" rx="1" />
                        <rect x="14" y="14" width="3" height="3" rx="0.5" />
                        <rect x="18" y="14" width="3" height="3" rx="0.5" />
                        <rect x="14" y="18" width="3" height="3" rx="0.5" />
                        <rect x="18" y="18" width="3" height="3" rx="0.5" />
                      </svg>
                    </div>
                    <p className="ec-idle-text">Listo para escanear</p>
                    <button className="ec-start-btn" onClick={startScanner}>
                      Activar cámara
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Processing overlay */}
            {scannerState === 'processing' && (
              <div className="ec-processing ec-fade-in">
                <div className="ec-spinner" />
                <p>Verificando…</p>
              </div>
            )}
          </div>

          {/* Instructions */}
          <p className="ec-instructions ec-fade-in">
            Muestra el QR de la confirmación de registro para hacer check-in.
            Cada QR solo puede usarse una vez.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
