import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Mic, MicOff, Camera, CameraOff, Pause, Play, Square,
  Pencil, Trash2, X, Check, RotateCcw, Circle, ChevronLeft, Settings2,
} from 'lucide-react';
import './LoomRecorder.css';

const CANVAS_W = 720;
const CANVAS_H = 1280;
const MAX_DURATION = 600;
const COUNTDOWN_FROM = 3;
const POINTER_FADE_MS = 1200;
const POINTER_FADE_TAIL_MS = 400;
const BUBBLE_D = 220;

const PEN_COLORS = ['#ef4444', '#ffffff', '#facc15', '#22d3ee'];
const PEN_WIDTHS = [4, 8, 14];

export default function LoomRecorder({ videoSrc, onComplete, onCancel }) {
  const [phase, setPhase] = useState('setup');

  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [userStream, setUserStream] = useState(null);
  const [setupError, setSetupError] = useState('');

  const [videoBlobUrl, setVideoBlobUrl] = useState(null);
  const [videoLoadError, setVideoLoadError] = useState('');
  const [sessionKey, setSessionKey] = useState(0);

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioCtxRef = useRef(null);
  const videoToRecordGainRef = useRef(null);
  const micGainRef = useRef(null);
  const blobRef = useRef(null);
  const mimeTypeRef = useRef('video/webm');
  const rafRef = useRef(null);

  const [countdown, setCountdown] = useState(COUNTDOWN_FROM);
  const [elapsed, setElapsed] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const [bubblePos, setBubblePos] = useState({ x: 32, y: CANVAS_H - BUBBLE_D - 32 });
  const [bubbleVisible, setBubbleVisible] = useState(true);
  const dragRef = useRef({ active: false, ox: 0, oy: 0 });

  const [drawTool, setDrawTool] = useState(null);
  const [drawPopover, setDrawPopover] = useState(false);
  const [drawColor, setDrawColor] = useState(PEN_COLORS[0]);
  const [drawWidth, setDrawWidth] = useState(PEN_WIDTHS[1]);
  const [drawMode, setDrawMode] = useState('pointer');
  const drawingRef = useRef(false);
  const strokesRef = useRef([]);

  const [previewUrl, setPreviewUrl] = useState(null);
  const [note, setNote] = useState('');

  const setupVideoRef = useRef(null);
  const bubbleVideoRef = useRef(null);
  const clientVideoRef = useRef(null);
  const drawCanvasRef = useRef(null);
  const compositeCanvasRef = useRef(null);
  const stageRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Pre-fetch video as blob to avoid canvas taint
  useEffect(() => {
    if (!videoSrc) return;
    let cancelled = false;
    let createdUrl = null;
    setVideoLoadError('');
    fetch(videoSrc)
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed');
        return r.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setVideoBlobUrl(createdUrl);
      })
      .catch(() => {
        if (cancelled) return;
        setVideoLoadError('No se pudo cargar el video.');
        setVideoBlobUrl(videoSrc);
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [videoSrc]);

  // Setup: camera + mic preview stream
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
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* noop */ }
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  }, [userStream]);

  useEffect(() => () => {
    cleanupAll();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (videoBlobUrl && videoBlobUrl.startsWith('blob:')) URL.revokeObjectURL(videoBlobUrl);
  }, []); // eslint-disable-line

  const handleStart = useCallback(() => {
    if (!videoBlobUrl) return;
    setSetupError('');
    setPhase('countdown');
  }, [videoBlobUrl]);

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

  // Composite render loop + MediaRecorder lifecycle
  useEffect(() => {
    if (phase !== 'recording') return;

    const canvas = compositeCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    const clientVid = clientVideoRef.current;
    const bubbleVid = bubbleVideoRef.current;
    const drawCanvas = drawCanvasRef.current;

    const renderFrame = () => {
      // Clear with black
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Client video — object-fit: cover into portrait
      if (clientVid && clientVid.readyState >= 2) {
        const vw = clientVid.videoWidth;
        const vh = clientVid.videoHeight;
        if (vw > 0 && vh > 0) {
          const scale = Math.max(CANVAS_W / vw, CANVAS_H / vh);
          const dw = vw * scale;
          const dh = vh * scale;
          const dx = (CANVAS_W - dw) / 2;
          const dy = (CANVAS_H - dh) / 2;
          try { ctx.drawImage(clientVid, dx, dy, dw, dh); } catch { /* taint */ }
        }
      }

      // Drawing layer (already in canvas coords)
      if (drawCanvas) {
        try { ctx.drawImage(drawCanvas, 0, 0, CANVAS_W, CANVAS_H); } catch { /* noop */ }
      }

      // Webcam bubble
      if (camOn && bubbleVisible && bubbleVid && bubbleVid.readyState >= 2) {
        const cx = bubblePos.x + BUBBLE_D / 2;
        const cy = bubblePos.y + BUBBLE_D / 2;
        const r = BUBBLE_D / 2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        const bw = bubbleVid.videoWidth || 1;
        const bh = bubbleVid.videoHeight || 1;
        const bScale = Math.max(BUBBLE_D / bw, BUBBLE_D / bh);
        const bdw = bw * bScale;
        const bdh = bh * bScale;
        // Mirror horizontally
        ctx.translate(bubblePos.x + BUBBLE_D, bubblePos.y);
        ctx.scale(-1, 1);
        const dx = (BUBBLE_D - bdw) / 2;
        const dy = (BUBBLE_D - bdh) / 2;
        try { ctx.drawImage(bubbleVid, dx, dy, bdw, bdh); } catch { /* noop */ }
        ctx.restore();

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.30)';
        ctx.lineWidth = 4;
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(renderFrame);
    };
    rafRef.current = requestAnimationFrame(renderFrame);

    // Audio graph
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const actx = new Ctx();
    audioCtxRef.current = actx;
    if (actx.state === 'suspended') actx.resume().catch(() => {});

    const recordDest = actx.createMediaStreamDestination();

    let videoToRecordGain = null;
    let micGain = null;

    // Client video → speaker + record (gated)
    if (clientVid) {
      try {
        const vSource = actx.createMediaElementSource(clientVid);
        const speakerGain = actx.createGain();
        speakerGain.gain.value = 1;
        vSource.connect(speakerGain).connect(actx.destination);

        videoToRecordGain = actx.createGain();
        videoToRecordGain.gain.value = micOn ? 0 : 1;
        vSource.connect(videoToRecordGain).connect(recordDest);
      } catch { /* element source already created */ }
    }

    // Mic → record (gated)
    if (userStream) {
      const micTracks = userStream.getAudioTracks();
      if (micTracks.length > 0) {
        try {
          const mSource = actx.createMediaStreamSource(new MediaStream([micTracks[0]]));
          micGain = actx.createGain();
          micGain.gain.value = micOn ? 1 : 0;
          mSource.connect(micGain).connect(recordDest);
        } catch { /* noop */ }
      }
    }

    videoToRecordGainRef.current = videoToRecordGain;
    micGainRef.current = micGain;

    // Build combined stream
    const canvasStream = canvas.captureStream(30);
    const combined = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...recordDest.stream.getAudioTracks(),
    ]);

    let mimeType = 'video/webm;codecs=vp9,opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm';
    }
    mimeTypeRef.current = mimeType;

    chunksRef.current = [];
    const recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 3_500_000 });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
      blobRef.current = blob;
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setPhase('preview');
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
    recorder.start(1000);
    recorderRef.current = recorder;

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase, sessionKey]); // eslint-disable-line

  // Live mic toggle reroute
  useEffect(() => {
    if (phase !== 'recording') return;
    if (videoToRecordGainRef.current) videoToRecordGainRef.current.gain.value = micOn ? 0 : 1;
    if (micGainRef.current) micGainRef.current.gain.value = micOn ? 1 : 0;
    if (userStream) {
      userStream.getAudioTracks().forEach((t) => { t.enabled = micOn; });
    }
  }, [micOn, phase, userStream]);

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

  // Coordinate mapping: pointer → canvas coords (CANVAS_W × CANVAS_H)
  const pointerToCanvas = useCallback((clientX, clientY) => {
    const stage = stageRef.current;
    if (!stage) return { x: 0, y: 0 };
    const rect = stage.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * CANVAS_W;
    const y = ((clientY - rect.top) / rect.height) * CANVAS_H;
    return { x, y };
  }, []);

  const onBubblePointerDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pointerToCanvas(e.clientX, e.clientY);
    dragRef.current = { active: true, ox: p.x - bubblePos.x, oy: p.y - bubblePos.y };
  }, [bubblePos, pointerToCanvas]);

  const onBubblePointerMove = useCallback((e) => {
    if (!dragRef.current.active) return;
    e.preventDefault();
    const p = pointerToCanvas(e.clientX, e.clientY);
    setBubblePos({
      x: clamp(p.x - dragRef.current.ox, 0, CANVAS_W - BUBBLE_D),
      y: clamp(p.y - dragRef.current.oy, 0, CANVAS_H - BUBBLE_D),
    });
  }, [pointerToCanvas]);

  const onBubblePointerUp = useCallback((e) => {
    if (dragRef.current.active) {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
      dragRef.current.active = false;
    }
  }, []);

  // Drawing canvas — fixed at CANVAS_W × CANVAS_H, scaled via CSS
  useEffect(() => {
    const cv = drawCanvasRef.current;
    if (!cv) return;
    cv.width = CANVAS_W;
    cv.height = CANVAS_H;
    redraw();
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

  // Continuous redraw for fading pointer strokes
  useEffect(() => {
    if (phase !== 'recording' && phase !== 'countdown') return;
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
    const p = pointerToCanvas(e.clientX, e.clientY);
    strokesRef.current.push({
      points: [p],
      color: drawColor,
      width: drawWidth,
      mode: drawMode,
      createdAt: Date.now(),
      endedAt: null,
    });
    redraw();
  }, [drawTool, drawColor, drawWidth, drawMode, redraw, pointerToCanvas]);

  const onDrawMove = useCallback((e) => {
    if (!drawingRef.current || !drawTool) return;
    e.preventDefault();
    const stroke = strokesRef.current[strokesRef.current.length - 1];
    if (stroke) {
      stroke.points.push(pointerToCanvas(e.clientX, e.clientY));
      redraw();
    }
  }, [drawTool, redraw, pointerToCanvas]);

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
    setSessionKey((k) => k + 1);
    setPhase('setup');
  }, [previewUrl]);

  const handleConfirm = useCallback(() => {
    if (blobRef.current && onComplete) {
      onComplete(blobRef.current, note.trim());
    }
  }, [onComplete, note]);

  const handleCancelAll = useCallback(() => {
    cleanupAll();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    onCancel();
  }, [cleanupAll, onCancel, previewUrl]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (phase === 'setup' || phase === 'preview') handleCancelAll();
        else if (drawPopover) setDrawPopover(false);
      }
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
            Se grabará un video vertical con el video del cliente y, opcionalmente,
            tu cámara y voz por encima.
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

          {(setupError || videoLoadError) && (
            <p className="lr-error">{setupError || videoLoadError}</p>
          )}

          <div className="lr-setup-actions">
            <button className="lr-btn lr-btn--ghost" onClick={handleCancelAll}>
              Cancelar
            </button>
            <button
              className="lr-btn lr-btn--primary"
              onClick={handleStart}
              disabled={!videoBlobUrl}
            >
              <Circle size={11} fill="currentColor" />
              {videoBlobUrl ? 'Empezar grabación' : 'Cargando video…'}
            </button>
          </div>

          <p className="lr-setup-hint">
            Cuando el micrófono está activado, el audio del video del cliente se silencia
            en la grabación para que se escuche tu voz.
          </p>
        </div>
      </div>
    );
  }

  function renderStage() {
    return (
      <div className="lr-root">
        <div className="lr-stage-wrap">
          <div className="lr-stage" ref={stageRef}>
            <video
              ref={clientVideoRef}
              key={sessionKey}
              src={videoBlobUrl || undefined}
              className="lr-client-video"
              controls={phase === 'recording' && !drawTool}
              playsInline
              preload="auto"
            />

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
                style={{
                  left: `${(bubblePos.x / CANVAS_W) * 100}%`,
                  top: `${(bubblePos.y / CANVAS_H) * 100}%`,
                  width: `${(BUBBLE_D / CANVAS_W) * 100}%`,
                }}
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
          </div>

          <canvas
            ref={compositeCanvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className="lr-composite"
            aria-hidden
          />
        </div>

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
        <button className="lr-fab lr-fab--close" onClick={handleCancelAll} aria-label="Cerrar">
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
            />
            <div className="lr-preview-actions">
              <button className="lr-btn lr-btn--ghost" onClick={handleRetake}>
                <RotateCcw size={14} />
                Repetir
              </button>
              <button className="lr-btn lr-btn--primary" onClick={handleConfirm}>
                <Check size={14} />
                Enviar reacción
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
            <Settings2 size={12} />
          </button>
        )}
        {penActive && drawPopover && (
          <div className="lr-pop">
            <button
              className="lr-pop-close"
              onClick={() => setDrawPopover(false)}
              aria-label="Cerrar"
            >
              <ChevronLeft size={12} />
            </button>
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
                  <span style={{ width: w * 1.4, height: w * 1.4, background: drawColor }} />
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
