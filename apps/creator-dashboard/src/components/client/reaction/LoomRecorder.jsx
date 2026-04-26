import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Mic, MicOff, Camera, CameraOff, Pause, Play, Square,
  Pencil, Trash2, X, Check, RotateCcw, Circle, Settings2,
} from 'lucide-react';
import './LoomRecorder.css';

const MAX_DURATION = 600;
const COUNTDOWN_FROM = 3;
const POINTER_FADE_MS = 1200;
const POINTER_FADE_TAIL_MS = 400;
const BUBBLE_SIZE = 224;

const PEN_COLORS = ['#ef4444', '#ffffff', '#facc15', '#22d3ee'];
const PEN_WIDTHS = [3, 6, 10];

export default function LoomRecorder({ videoSrc, onComplete, onCancel }) {
  const [phase, setPhase] = useState('setup');

  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [userStream, setUserStream] = useState(null);
  const [setupError, setSetupError] = useState('');

  const displayStreamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const blobRef = useRef(null);
  const mimeTypeRef = useRef('video/webm');
  const recordingMicLockedRef = useRef(true);

  const [countdown, setCountdown] = useState(COUNTDOWN_FROM);
  const [elapsed, setElapsed] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const [bubblePos, setBubblePos] = useState(() => {
    if (typeof window === 'undefined') return { x: 24, y: 24 };
    return { x: 24, y: Math.max(24, window.innerHeight - BUBBLE_SIZE - 24) };
  });
  const [bubbleVisible, setBubbleVisible] = useState(true);
  const dragRef = useRef({ active: false, ox: 0, oy: 0 });

  const [drawTool, setDrawTool] = useState(null);
  const [drawPopover, setDrawPopover] = useState(false);
  const [drawColor, setDrawColor] = useState(PEN_COLORS[0]);
  const [drawWidth, setDrawWidth] = useState(PEN_WIDTHS[1]);
  const [drawMode, setDrawMode] = useState('pointer');
  const drawCanvasRef = useRef(null);
  const drawingRef = useRef(false);
  const strokesRef = useRef([]);

  const [previewUrl, setPreviewUrl] = useState(null);
  const [note, setNote] = useState('');
  const [sendError, setSendError] = useState('');

  const setupVideoRef = useRef(null);
  const bubbleVideoRef = useRef(null);
  const clientVideoRef = useRef(null);
  const timerRef = useRef(null);
  const userStreamRef = useRef(null);

  // Mirror userStream into a ref so the unmount cleanup sees the latest value
  // (the cleanup effect runs once with [] deps, capturing initial closure).
  useEffect(() => { userStreamRef.current = userStream; }, [userStream]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Setup: webcam preview stream
  useEffect(() => {
    if (phase !== 'setup') return;
    if (!camOn && !micOn) {
      stopUserStream();
      return;
    }
    let cancelled = false;
    setSetupError('');
    navigator.mediaDevices.getUserMedia({
      video: camOn ? { width: { ideal: 720 }, height: { ideal: 540 } } : false,
      audio: micOn ? { echoCancellation: true, noiseSuppression: true } : false,
    })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        setUserStream((prev) => {
          if (prev) prev.getTracks().forEach((t) => t.stop());
          return stream;
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setSetupError(translateMediaError(err));
      });
    return () => { cancelled = true; };
  }, [camOn, micOn, phase]);

  useEffect(() => {
    if (setupVideoRef.current && userStream) {
      setupVideoRef.current.srcObject = userStream;
    }
  }, [userStream, phase]);

  useEffect(() => {
    if (bubbleVideoRef.current && userStream && bubbleVisible) {
      bubbleVideoRef.current.srcObject = userStream;
    }
  }, [userStream, bubbleVisible, phase]);

  const stopUserStream = useCallback(() => {
    setUserStream((prev) => {
      if (prev) prev.getTracks().forEach((t) => t.stop());
      return null;
    });
  }, []);

  const cleanupAll = useCallback(() => {
    if (userStream) userStream.getTracks().forEach((t) => t.stop());
    if (displayStreamRef.current) {
      displayStreamRef.current.getTracks().forEach((t) => t.stop());
      displayStreamRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* noop */ }
    }
    if (timerRef.current) clearInterval(timerRef.current);
  }, [userStream]);

  // Unmount-only cleanup — read from refs to avoid stale-closure bug.
  useEffect(() => () => {
    if (userStreamRef.current) {
      userStreamRef.current.getTracks().forEach((t) => t.stop());
      userStreamRef.current = null;
    }
    if (displayStreamRef.current) {
      displayStreamRef.current.getTracks().forEach((t) => t.stop());
      displayStreamRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* noop */ }
    }
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // Mute video element based on mic state — when creator's mic is on,
  // tab audio is silenced so it isn't captured in the recording.
  useEffect(() => {
    if (clientVideoRef.current) {
      clientVideoRef.current.muted = micOn;
    }
  }, [micOn, phase]);

  const handleStart = useCallback(async () => {
    setSetupError('');
    try {
      const wantTabAudio = !micOn;
      const constraints = {
        video: { displaySurface: 'browser', frameRate: { ideal: 30 } },
        audio: wantTabAudio,
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
        surfaceSwitching: 'exclude',
        systemAudio: 'include',
      };
      const display = await navigator.mediaDevices.getDisplayMedia(constraints);
      displayStreamRef.current = display;
      recordingMicLockedRef.current = micOn;

      display.getVideoTracks()[0].addEventListener('ended', () => {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
          recorderRef.current.stop();
        }
      });

      setPhase('countdown');
    } catch (err) {
      if (err && err.name === 'NotAllowedError') {
        setSetupError('Permiso denegado para compartir pantalla.');
      } else {
        setSetupError('Tu navegador no permite compartir esta pestaña. Usa Chrome o Edge.');
      }
    }
  }, [micOn]);

  // Countdown
  useEffect(() => {
    if (phase !== 'countdown') return;
    setCountdown(COUNTDOWN_FROM);
    const id = setInterval(() => {
      setCountdown((p) => {
        if (p <= 1) {
          clearInterval(id);
          setPhase('recording');
          return 0;
        }
        return p - 1;
      });
    }, 800);
    return () => clearInterval(id);
  }, [phase]);

  // Autoplay client video on entering recording
  useEffect(() => {
    if (phase === 'recording') {
      clientVideoRef.current?.play().catch(() => {});
    }
  }, [phase]);

  // Timer
  useEffect(() => {
    if (phase !== 'recording') return;
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed((p) => (p + 1 >= MAX_DURATION ? MAX_DURATION : p + 1));
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase]);

  useEffect(() => {
    if (elapsed >= MAX_DURATION && phase === 'recording') handleStop();
  }, [elapsed, phase]); // eslint-disable-line

  // Start MediaRecorder when entering recording
  useEffect(() => {
    if (phase !== 'recording') return;
    const display = displayStreamRef.current;
    if (!display) return;

    chunksRef.current = [];

    const audioTracks = recordingMicLockedRef.current
      ? (userStream ? userStream.getAudioTracks() : [])
      : display.getAudioTracks();

    const combined = new MediaStream([
      ...display.getVideoTracks(),
      ...audioTracks,
    ]);

    // Prefer MP4 (H.264 + AAC) when the browser supports recording it directly —
    // skips the slow FFmpeg.wasm transcode entirely on the upload side.
    const candidates = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4;codecs=h264,aac',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    let mimeType = candidates.find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm';
    mimeTypeRef.current = mimeType;

    const recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 3_000_000 });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
      blobRef.current = blob;
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setPhase('preview');
      const d = displayStreamRef.current;
      if (d) {
        d.getTracks().forEach((t) => t.stop());
        displayStreamRef.current = null;
      }
    };
    recorder.start(1000);
    recorderRef.current = recorder;
  }, [phase]); // eslint-disable-line

  const handleStop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }, []);

  const handleTogglePause = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec) return;
    if (rec.state === 'recording') {
      rec.pause();
      clientVideoRef.current?.pause();
      setIsPaused(true);
    } else if (rec.state === 'paused') {
      rec.resume();
      clientVideoRef.current?.play().catch(() => {});
      setIsPaused(false);
    }
  }, []);

  // Live mic mute via track.enabled (no recorder restart)
  useEffect(() => {
    if (userStream) {
      userStream.getAudioTracks().forEach((t) => { t.enabled = micOn; });
    }
  }, [micOn, userStream]);

  // Release camera + mic the moment recording finishes so the OS indicator clears.
  useEffect(() => {
    if (phase !== 'preview') return;
    if (userStream) {
      userStream.getTracks().forEach((t) => t.stop());
      setUserStream(null);
    }
  }, [phase]); // eslint-disable-line

  // Bubble drag
  const onBubblePointerDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = { active: true, ox: e.clientX - rect.left, oy: e.clientY - rect.top };
  }, []);

  const onBubblePointerMove = useCallback((e) => {
    if (!dragRef.current.active) return;
    e.preventDefault();
    const x = clamp(e.clientX - dragRef.current.ox, 0, window.innerWidth - BUBBLE_SIZE);
    const y = clamp(e.clientY - dragRef.current.oy, 0, window.innerHeight - BUBBLE_SIZE);
    setBubblePos({ x, y });
  }, []);

  const onBubblePointerUp = useCallback((e) => {
    if (dragRef.current.active) {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
      dragRef.current.active = false;
    }
  }, []);

  // Drawing layer
  useEffect(() => {
    if (phase === 'setup' || phase === 'preview') return;
    const cv = drawCanvasRef.current;
    if (!cv) return;
    const fit = () => {
      cv.width = window.innerWidth;
      cv.height = window.innerHeight;
      redraw();
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [phase]); // eslint-disable-line

  const redraw = useCallback(() => {
    const cv = drawCanvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    const now = Date.now();
    const live = [];
    for (const stroke of strokesRef.current) {
      let alpha = 1;
      if (stroke.mode === 'pointer' && stroke.endedAt) {
        const age = now - stroke.endedAt;
        if (age > POINTER_FADE_MS + POINTER_FADE_TAIL_MS) continue;
        if (age > POINTER_FADE_MS) {
          alpha = 1 - (age - POINTER_FADE_MS) / POINTER_FADE_TAIL_MS;
        }
      }
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const pts = stroke.points;
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, stroke.width / 2, 0, Math.PI * 2);
        ctx.fillStyle = stroke.color;
        ctx.fill();
      } else if (pts.length > 1) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
      live.push(stroke);
    }
    ctx.globalAlpha = 1;
    strokesRef.current = live;
  }, []);

  useEffect(() => {
    if (phase === 'setup' || phase === 'preview') return;
    let raf;
    const tick = () => {
      const hasFading = strokesRef.current.some((s) => s.mode === 'pointer' && s.endedAt);
      if (hasFading) redraw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, redraw]);

  const onDrawDown = useCallback((e) => {
    if (!drawTool) return;
    e.preventDefault();
    drawingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    strokesRef.current.push({
      points: [{ x: e.clientX, y: e.clientY }],
      color: drawColor,
      width: drawWidth,
      mode: drawMode,
      createdAt: Date.now(),
      endedAt: null,
    });
    redraw();
  }, [drawTool, drawColor, drawWidth, drawMode, redraw]);

  const onDrawMove = useCallback((e) => {
    if (!drawingRef.current || !drawTool) return;
    e.preventDefault();
    const stroke = strokesRef.current[strokesRef.current.length - 1];
    if (stroke) {
      stroke.points.push({ x: e.clientX, y: e.clientY });
      redraw();
    }
  }, [drawTool, redraw]);

  const onDrawUp = useCallback((e) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    const stroke = strokesRef.current[strokesRef.current.length - 1];
    if (stroke) stroke.endedAt = Date.now();
  }, []);

  const handleClearAll = useCallback(() => {
    strokesRef.current = [];
    redraw();
  }, [redraw]);

  const handleRetake = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    blobRef.current = null;
    setElapsed(0);
    setIsPaused(false);
    strokesRef.current = [];
    setDrawTool(null);
    setDrawPopover(false);
    setNote('');
    setPhase('setup');
  }, [previewUrl]);

  const handleConfirm = useCallback(() => {
    const blob = blobRef.current;
    if (!blob || blob.size === 0) {
      setSendError('La grabación está vacía. Intenta de nuevo.');
      return;
    }
    if (onComplete) onComplete(blob, note.trim());
  }, [onComplete, note]);

  const handleCancelAll = useCallback(() => {
    cleanupAll();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    onCancel();
  }, [cleanupAll, onCancel, previewUrl]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (phase === 'setup' || phase === 'preview') handleCancelAll();
      else if (drawPopover) setDrawPopover(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, handleCancelAll, drawPopover]);

  let content;
  if (phase === 'setup') content = renderSetup();
  else if (phase === 'preview') content = renderPreview();
  else content = renderStage();

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);

  function renderSetup() {
    return (
      <div className="lr-root lr-root--setup">
        <button className="lr-fab lr-fab--close" onClick={handleCancelAll} aria-label="Cerrar">
          <X size={18} />
        </button>
        <div className="lr-setup-card">
          <h2 className="lr-setup-title">Reaccionar al video</h2>
          <p className="lr-setup-sub">
            Graba tu pantalla mientras reproduces el video del cliente.
            Tu cámara y voz se incluyen si las activas.
          </p>

          <div className="lr-setup-preview">
            {camOn ? (
              <video ref={setupVideoRef} className="lr-setup-cam" autoPlay muted playsInline />
            ) : (
              <div className="lr-setup-cam lr-setup-cam--off">
                <CameraOff size={28} />
                <span>Cámara desactivada</span>
              </div>
            )}
          </div>

          <div className="lr-setup-toggles">
            <button
              className={`lr-toggle ${camOn ? 'lr-toggle--on' : ''}`}
              onClick={() => setCamOn((v) => !v)}
            >
              {camOn ? <Camera size={14} /> : <CameraOff size={14} />}
              <span>{camOn ? 'Cámara' : 'Sin cámara'}</span>
            </button>
            <button
              className={`lr-toggle ${micOn ? 'lr-toggle--on' : ''}`}
              onClick={() => setMicOn((v) => !v)}
            >
              {micOn ? <Mic size={14} /> : <MicOff size={14} />}
              <span>{micOn ? 'Micrófono' : 'Sin micrófono'}</span>
            </button>
          </div>

          {setupError && <p className="lr-error">{setupError}</p>}

          <div className="lr-setup-actions">
            <button className="lr-btn lr-btn--ghost" onClick={handleCancelAll}>
              Cancelar
            </button>
            <button className="lr-btn lr-btn--primary" onClick={handleStart}>
              <Circle size={11} fill="currentColor" />
              Empezar grabación
            </button>
          </div>

          <p className="lr-setup-hint">
            Selecciona <strong>"Esta pestaña"</strong> en el diálogo del navegador.
            Cuando el micrófono está activado, el audio del video del cliente se silencia
            para que solo se escuche tu voz.
          </p>
        </div>
      </div>
    );
  }

  function renderStage() {
    return (
      <div className="lr-root">
        <div className="lr-stage-wrap">
          <div className="lr-stage">
            <video
              ref={clientVideoRef}
              src={videoSrc}
              className="lr-client-video"
              controls={phase === 'recording' && !drawTool}
              playsInline
              preload="auto"
            />
          </div>
        </div>

        <canvas
          ref={drawCanvasRef}
          className={`lr-draw ${drawTool ? 'lr-draw--active' : ''}`}
          onPointerDown={onDrawDown}
          onPointerMove={onDrawMove}
          onPointerUp={onDrawUp}
          onPointerCancel={onDrawUp}
          style={{ pointerEvents: drawTool ? 'auto' : 'none' }}
        />

        {camOn && bubbleVisible && (
          <div
            className="lr-bubble"
            style={{ left: bubblePos.x, top: bubblePos.y }}
            onPointerDown={onBubblePointerDown}
            onPointerMove={onBubblePointerMove}
            onPointerUp={onBubblePointerUp}
            onPointerCancel={onBubblePointerUp}
          >
            <video ref={bubbleVideoRef} className="lr-bubble-video" autoPlay muted playsInline />
          </div>
        )}

        {phase === 'countdown' && (
          <div className="lr-countdown">
            <span className="lr-countdown-num">{countdown}</span>
          </div>
        )}

        {phase === 'recording' && (
          <RecordingBar
            elapsed={elapsed}
            isPaused={isPaused}
            onStop={handleStop}
            onTogglePause={handleTogglePause}
            drawTool={drawTool}
            setDrawTool={(v) => {
              setDrawTool(v);
              if (!v) setDrawPopover(false);
            }}
            drawPopover={drawPopover}
            setDrawPopover={setDrawPopover}
            drawColor={drawColor}
            setDrawColor={setDrawColor}
            drawWidth={drawWidth}
            setDrawWidth={setDrawWidth}
            drawMode={drawMode}
            setDrawMode={setDrawMode}
            onClearAll={handleClearAll}
            micOn={micOn}
            onToggleMic={() => setMicOn((v) => !v)}
            camOn={camOn}
            bubbleVisible={bubbleVisible}
            onToggleBubble={() => setBubbleVisible((v) => !v)}
          />
        )}
      </div>
    );
  }

  function renderPreview() {
    return (
      <div className="lr-root lr-root--preview">
        <button
          className="lr-fab lr-fab--close"
          onClick={handleCancelAll}
          aria-label="Cerrar"
          disabled={sending}
        >
          <X size={18} />
        </button>
        <div className="lr-preview">
          <div className="lr-preview-stage">
            <video
              className="lr-preview-video"
              src={previewUrl}
              controls
              autoPlay
              playsInline
            />
          </div>
          <aside className="lr-preview-side">
            <label className="lr-preview-label">Nota para el cliente</label>
            <textarea
              className="lr-preview-textarea"
              placeholder="Opcional — qué practicar, qué corregir…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={5}
              maxLength={500}
              disabled={sending}
            />
            {sendError && <p className="lr-error">{sendError}</p>}
            {sending && (
              <div className="lr-sending">
                <span className="lr-sending-spinner" aria-hidden />
                <span className="lr-sending-label">Comprimiendo y enviando…</span>
              </div>
            )}
            <div className="lr-preview-actions">
              <button
                className="lr-btn lr-btn--ghost"
                onClick={handleRetake}
                disabled={sending}
              >
                <RotateCcw size={14} />
                Repetir
              </button>
              <button
                className="lr-btn lr-btn--primary"
                onClick={handleConfirm}
                disabled={sending}
              >
                <Check size={14} />
                {sending ? 'Enviando…' : 'Enviar reacción'}
              </button>
            </div>
          </aside>
        </div>
      </div>
    );
  }
}

function RecordingBar({
  elapsed, isPaused, onStop, onTogglePause,
  drawTool, setDrawTool, drawPopover, setDrawPopover,
  drawColor, setDrawColor, drawWidth, setDrawWidth, drawMode, setDrawMode,
  onClearAll,
  micOn, onToggleMic,
  camOn, bubbleVisible, onToggleBubble,
}) {
  const penActive = drawTool === 'pen';
  return (
    <div className="lr-bar">
      <div className="lr-bar-rec">
        <span className={`lr-bar-dot ${isPaused ? 'lr-bar-dot--paused' : ''}`} />
        <span className="lr-bar-time">{formatTime(elapsed)}</span>
      </div>

      <span className="lr-bar-sep" />

      <button className="lr-bar-btn lr-bar-btn--stop" onClick={onStop} title="Detener">
        <Square size={13} fill="currentColor" />
      </button>

      <button
        className={`lr-bar-btn ${isPaused ? 'lr-bar-btn--active' : ''}`}
        onClick={onTogglePause}
        title={isPaused ? 'Reanudar' : 'Pausar'}
      >
        {isPaused ? <Play size={14} fill="currentColor" /> : <Pause size={14} fill="currentColor" />}
      </button>

      <span className="lr-bar-sep" />

      <div className="lr-bar-tool">
        <button
          className={`lr-bar-btn ${penActive ? 'lr-bar-btn--active' : ''}`}
          onClick={() => setDrawTool(penActive ? null : 'pen')}
          title="Dibujar"
        >
          <Pencil size={14} />
        </button>
        {penActive && (
          <button
            className={`lr-bar-btn lr-bar-btn--mini ${drawPopover ? 'lr-bar-btn--active' : ''}`}
            onClick={() => setDrawPopover((v) => !v)}
            title="Opciones"
          >
            <Settings2 size={11} />
          </button>
        )}
        {penActive && drawPopover && (
          <div className="lr-pop">
            <div className="lr-pop-row">
              {PEN_COLORS.map((c) => (
                <button
                  key={c}
                  className={`lr-pop-color ${drawColor === c ? 'lr-pop-color--active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setDrawColor(c)}
                  aria-label="Color"
                />
              ))}
            </div>
            <div className="lr-pop-row">
              {PEN_WIDTHS.map((w) => (
                <button
                  key={w}
                  className={`lr-pop-width ${drawWidth === w ? 'lr-pop-width--active' : ''}`}
                  onClick={() => setDrawWidth(w)}
                  aria-label="Grosor"
                >
                  <span style={{ width: w * 2, height: w * 2, background: drawColor }} />
                </button>
              ))}
            </div>
            <div className="lr-pop-row lr-pop-row--modes">
              <button
                className={`lr-pop-mode ${drawMode === 'pointer' ? 'lr-pop-mode--active' : ''}`}
                onClick={() => setDrawMode('pointer')}
              >
                Puntero
              </button>
              <button
                className={`lr-pop-mode ${drawMode === 'permanent' ? 'lr-pop-mode--active' : ''}`}
                onClick={() => setDrawMode('permanent')}
              >
                Permanente
              </button>
            </div>
          </div>
        )}
      </div>

      <button className="lr-bar-btn" onClick={onClearAll} title="Borrar todo">
        <Trash2 size={14} />
      </button>

      <span className="lr-bar-sep" />

      <button
        className={`lr-bar-btn ${!micOn ? 'lr-bar-btn--off' : ''}`}
        onClick={onToggleMic}
        title={micOn ? 'Silenciar' : 'Activar micrófono'}
      >
        {micOn ? <Mic size={14} /> : <MicOff size={14} />}
      </button>

      {camOn && (
        <button
          className={`lr-bar-btn ${!bubbleVisible ? 'lr-bar-btn--off' : ''}`}
          onClick={onToggleBubble}
          title={bubbleVisible ? 'Ocultar cámara' : 'Mostrar cámara'}
        >
          {bubbleVisible ? <Camera size={14} /> : <CameraOff size={14} />}
        </button>
      )}
    </div>
  );
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function translateMediaError(err) {
  if (err && err.name === 'NotAllowedError') return 'Permiso denegado. Acepta el acceso a cámara y micrófono.';
  if (err && err.name === 'NotFoundError') return 'No se encontró cámara o micrófono.';
  return 'No se pudo acceder al hardware.';
}
