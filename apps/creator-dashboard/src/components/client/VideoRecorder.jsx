import { useState, useRef, useCallback, useEffect } from 'react';
import { Video, Square, RotateCcw, Check, FlipHorizontal2 } from 'lucide-react';
import './VideoRecorder.css';

const MAX_DURATION_CREATOR = 300; // 5 minutes

export default function VideoRecorder({ onComplete, onCancel, maxDuration = MAX_DURATION_CREATOR }) {
  const [state, setState] = useState('idle'); // idle | recording | preview
  const [elapsed, setElapsed] = useState(0);
  const [facingMode, setFacingMode] = useState('user');
  const [previewUrl, setPreviewUrl] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const blobRef = useRef(null);

  const startStream = useCallback(async (facing) => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
    });

    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, []);

  useEffect(() => {
    startStream(facingMode);
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      clearInterval(timerRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const flipCamera = useCallback(async () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    await startStream(next);
  }, [facingMode, startStream]);

  const startRecording = useCallback(() => {
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    const recorder = new MediaRecorder(streamRef.current, { mimeType });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      blobRef.current = blob;
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setState('preview');
    };

    recorder.start(1000);
    recorderRef.current = recorder;
    setState('recording');
    setElapsed(0);

    timerRef.current = setInterval(() => {
      setElapsed((prev) => {
        if (prev + 1 >= maxDuration) {
          recorder.stop();
          clearInterval(timerRef.current);
          return maxDuration;
        }
        return prev + 1;
      });
    }, 1000);
  }, [maxDuration]);

  const stopRecording = useCallback(() => {
    clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }, []);

  const retake = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    blobRef.current = null;
    setElapsed(0);
    setState('idle');
    startStream(facingMode);
  }, [previewUrl, facingMode, startStream]);

  const confirm = useCallback(() => {
    if (blobRef.current && onComplete) {
      onComplete(blobRef.current);
    }
  }, [onComplete]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="vr-container">
      {state !== 'preview' ? (
        <video
          ref={videoRef}
          className="vr-preview"
          autoPlay
          muted
          playsInline
        />
      ) : (
        <video
          className="vr-preview"
          src={previewUrl}
          controls
          playsInline
        />
      )}

      <div className="vr-controls">
        {state === 'idle' && (
          <>
            <button className="vr-btn vr-btn--secondary" onClick={onCancel}>Cancelar</button>
            <button className="vr-btn vr-btn--record" onClick={startRecording}>
              <Video size={20} />
              Grabar
            </button>
            <button className="vr-btn vr-btn--icon" onClick={flipCamera}>
              <FlipHorizontal2 size={18} />
            </button>
          </>
        )}

        {state === 'recording' && (
          <>
            <span className="vr-timer vr-timer--recording">
              {formatTime(elapsed)} / {formatTime(maxDuration)}
            </span>
            <button className="vr-btn vr-btn--stop" onClick={stopRecording}>
              <Square size={16} />
              Detener
            </button>
          </>
        )}

        {state === 'preview' && (
          <>
            <button className="vr-btn vr-btn--secondary" onClick={retake}>
              <RotateCcw size={16} />
              Repetir
            </button>
            <button className="vr-btn vr-btn--primary" onClick={confirm}>
              <Check size={16} />
              Usar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
