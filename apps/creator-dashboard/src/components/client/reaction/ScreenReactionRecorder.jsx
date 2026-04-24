import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, Check, X } from 'lucide-react';
import ReactionPreRecordModal from './ReactionPreRecordModal';
import ReactionCanvas from './ReactionCanvas';
import ReactionToolbar from './ReactionToolbar';
import DrawingLayer from './DrawingLayer';
import './ScreenReactionRecorder.css';

const MAX_DURATION = 300; // 5 minutes

/**
 * Full-viewport reaction recorder. Portals to document.body so it escapes
 * any parent layout constraints. Phases: setup → countdown → recording →
 * preview. Preview phase includes a side panel for the optional note that
 * will be sent with the reaction video.
 *
 * onComplete receives { blob, note } — parent uploads directly from here,
 * no intermediate "pending" step.
 */
export default function ScreenReactionRecorder({ videoSrc, onComplete, onCancel }) {
  const [phase, setPhase] = useState('setup');
  const [cameraStream, setCameraStream] = useState(null);
  const [countdown, setCountdown] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [note, setNote] = useState('');

  const [activeTool, setActiveTool] = useState(null);
  const [strokeColor, setStrokeColor] = useState('#ef4444');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [drawingMode, setDrawingMode] = useState('pointer');

  const drawingLayerRef = useRef(null);
  const blobRef = useRef(null);
  const timerRef = useRef(null);
  const stageRef = useRef(null);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      if (cameraStream) {
        cameraStream.getTracks().forEach((t) => t.stop());
      }
      clearInterval(timerRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSetupStart = useCallback((stream) => {
    setCameraStream(stream);
    setPhase('countdown');
  }, []);

  useEffect(() => {
    if (phase !== 'countdown') return;
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setPhase('recording');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'recording') return;
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed((prev) => {
        if (prev + 1 >= MAX_DURATION) return MAX_DURATION;
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase]);

  useEffect(() => {
    if (elapsed >= MAX_DURATION && phase === 'recording') {
      handleStop();
    }
  }, [elapsed, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStop = useCallback(() => {
    clearInterval(timerRef.current);
    setPhase('stopping');
  }, []);

  const handleBlobReady = useCallback((blob) => {
    blobRef.current = blob;
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    setPhase('preview');
  }, []);

  const handleRetake = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    blobRef.current = null;
    setElapsed(0);
    setIsPaused(false);
    setActiveTool(null);
    setPhase('countdown');
  }, [previewUrl]);

  const handleConfirm = useCallback(() => {
    if (blobRef.current && onComplete) {
      onComplete(blobRef.current, note.trim());
    }
  }, [onComplete, note]);

  const handleCancel = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
    }
    onCancel();
  }, [cameraStream, onCancel]);

  const handleClearAll = useCallback(() => {
    drawingLayerRef.current?.clearAll();
  }, []);

  const [stageSize, setStageSize] = useState({ w: 1280, h: 720 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setStageSize({ w: Math.round(width), h: Math.round(height) });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && phase === 'setup') handleCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, handleCancel]);

  const content = (() => {
    if (phase === 'setup') {
      return (
        <div className="srr-viewport srr-viewport--setup">
          <ReactionPreRecordModal
            onStart={handleSetupStart}
            onCancel={handleCancel}
          />
        </div>
      );
    }

    if (phase === 'countdown') {
      return (
        <div className="srr-viewport">
          <Header title="Preparando…" onClose={handleCancel} />
          <div className="srr-body srr-body--centered">
            <div className="srr-countdown-stage">
              <video
                src={videoSrc}
                className="srr-bg-video"
                muted
                playsInline
                preload="auto"
              />
              <div className="srr-countdown">
                <span className="srr-countdown-number">{countdown}</span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (phase === 'preview') {
      return (
        <div className="srr-viewport">
          <Header title="Revisa tu reacción" onClose={handleCancel} />
          <div className="srr-body srr-body--split">
            <div className="srr-stage" ref={stageRef}>
              <video
                className="srr-preview-video"
                src={previewUrl}
                controls
                autoPlay
                playsInline
              />
            </div>
            <aside className="srr-sidebar">
              <div className="srr-sidebar-field">
                <label className="srr-sidebar-label">Nota para tu cliente</label>
                <textarea
                  className="srr-sidebar-textarea"
                  placeholder="Opcional — qué debería practicar, qué corregir…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={5}
                  maxLength={500}
                />
              </div>
              <div className="srr-sidebar-actions">
                <button className="srr-btn srr-btn--ghost" onClick={handleRetake}>
                  <RotateCcw size={15} />
                  Repetir
                </button>
                <button className="srr-btn srr-btn--primary" onClick={handleConfirm}>
                  <Check size={15} />
                  Enviar reacción
                </button>
              </div>
            </aside>
          </div>
        </div>
      );
    }

    // recording / stopping
    const isActiveRecording = phase === 'recording';
    return (
      <div className="srr-viewport">
        <Header title="Grabando reacción" onClose={handleCancel} recording />
        <div className="srr-body">
          <div className="srr-stage" ref={stageRef}>
            <ReactionCanvas
              videoSrc={videoSrc}
              cameraStream={cameraStream}
              drawingLayerRef={drawingLayerRef}
              isRecording={isActiveRecording}
              isPaused={isPaused}
              onBlobReady={handleBlobReady}
            />
            <DrawingLayer
              ref={drawingLayerRef}
              width={stageSize.w}
              height={stageSize.h}
              activeTool={activeTool}
              strokeColor={strokeColor}
              strokeWidth={strokeWidth}
              drawingMode={drawingMode}
            />
          </div>
        </div>
        <ReactionToolbar
          elapsed={elapsed}
          maxDuration={MAX_DURATION}
          isPaused={isPaused}
          activeTool={activeTool}
          strokeColor={strokeColor}
          strokeWidth={strokeWidth}
          drawingMode={drawingMode}
          onStop={handleStop}
          onTogglePause={() => setIsPaused((p) => !p)}
          onToolChange={setActiveTool}
          onColorChange={setStrokeColor}
          onWidthChange={setStrokeWidth}
          onModeChange={setDrawingMode}
          onClearAll={handleClearAll}
        />
      </div>
    );
  })();

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}

function Header({ title, onClose, recording }) {
  return (
    <header className="srr-header">
      <button className="srr-close" onClick={onClose} aria-label="Cerrar">
        <X size={18} />
      </button>
      <span className="srr-title">
        {recording && <span className="srr-rec-dot" aria-hidden />}
        {title}
      </span>
      <span className="srr-header-spacer" />
    </header>
  );
}
