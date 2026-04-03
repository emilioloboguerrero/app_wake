import { useState, useRef, useCallback, useEffect } from 'react';
import { RotateCcw, Check } from 'lucide-react';
import ReactionPreRecordModal from './ReactionPreRecordModal';
import ReactionCanvas from './ReactionCanvas';
import ReactionToolbar from './ReactionToolbar';
import DrawingLayer from './DrawingLayer';
import './ScreenReactionRecorder.css';

const MAX_DURATION = 300; // 5 minutes

export default function ScreenReactionRecorder({ videoSrc, onComplete, onCancel }) {
  const [phase, setPhase] = useState('setup'); // setup | countdown | recording | preview
  const [cameraStream, setCameraStream] = useState(null);
  const [countdown, setCountdown] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  // Drawing state
  const [activeTool, setActiveTool] = useState(null);
  const [strokeColor, setStrokeColor] = useState('#ef4444');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [drawingMode, setDrawingMode] = useState('pointer');

  const drawingLayerRef = useRef(null);
  const blobRef = useRef(null);
  const timerRef = useRef(null);
  const containerRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((t) => t.stop());
      }
      clearInterval(timerRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle setup complete
  const handleSetupStart = useCallback((stream) => {
    setCameraStream(stream);
    setPhase('countdown');
  }, []);

  // Countdown effect
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

  // Recording timer
  useEffect(() => {
    if (phase !== 'recording') return;

    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed((prev) => {
        if (prev + 1 >= MAX_DURATION) {
          // Auto-stop handled via handleStop
          return MAX_DURATION;
        }
        return prev + 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [phase]);

  // Auto-stop at max duration
  useEffect(() => {
    if (elapsed >= MAX_DURATION && phase === 'recording') {
      handleStop();
    }
  }, [elapsed, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStop = useCallback(() => {
    clearInterval(timerRef.current);
    setPhase('stopping'); // Transitional state while recorder finalizes
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
      onComplete(blobRef.current);
    }
  }, [onComplete]);

  const handleCancel = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
    }
    onCancel();
  }, [cameraStream, onCancel]);

  const handleToolChange = useCallback((tool) => {
    setActiveTool(tool);
  }, []);

  const handleClearAll = useCallback(() => {
    drawingLayerRef.current?.clearAll();
  }, []);

  // Get container dimensions for DrawingLayer
  const [containerSize, setContainerSize] = useState({ w: 1280, h: 720 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setContainerSize({ w: Math.round(width), h: Math.round(height) });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Setup phase ────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className="srr-container">
        <div className="srr-backdrop" onClick={handleCancel} />
        <ReactionPreRecordModal
          onStart={handleSetupStart}
          onCancel={handleCancel}
        />
      </div>
    );
  }

  // ── Countdown phase ────────────────────────────────────
  if (phase === 'countdown') {
    return (
      <div className="srr-fullscreen">
        <div className="srr-countdown">
          <span className="srr-countdown-number">{countdown}</span>
        </div>
        {/* Show video preview behind countdown */}
        <video
          src={videoSrc}
          className="srr-bg-video"
          muted
          playsInline
          preload="auto"
        />
      </div>
    );
  }

  // ── Preview phase ──────────────────────────────────────
  if (phase === 'preview') {
    return (
      <div className="srr-fullscreen">
        <video
          className="srr-preview-video"
          src={previewUrl}
          controls
          autoPlay
          playsInline
        />
        <div className="srr-preview-controls">
          <button className="srr-btn srr-btn--secondary" onClick={handleRetake}>
            <RotateCcw size={16} />
            Repetir
          </button>
          <button className="srr-btn srr-btn--primary" onClick={handleConfirm}>
            <Check size={16} />
            Usar
          </button>
        </div>
      </div>
    );
  }

  // ── Recording phase (and stopping) ─────────────────────
  const isActiveRecording = phase === 'recording';

  return (
    <div className="srr-fullscreen" ref={containerRef}>
      <ReactionCanvas
        videoSrc={videoSrc}
        cameraStream={cameraStream}
        drawingLayerRef={drawingLayerRef}
        isRecording={isActiveRecording}
        isPaused={isPaused}
        onBlobReady={handleBlobReady}
      />

      {/* Drawing layer overlaid on top */}
      <DrawingLayer
        ref={drawingLayerRef}
        width={containerSize.w}
        height={containerSize.h}
        activeTool={activeTool}
        strokeColor={strokeColor}
        strokeWidth={strokeWidth}
        drawingMode={drawingMode}
      />

      {/* Toolbar */}
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
        onToolChange={handleToolChange}
        onColorChange={setStrokeColor}
        onWidthChange={setStrokeWidth}
        onModeChange={setDrawingMode}
        onClearAll={handleClearAll}
      />
    </div>
  );
}
