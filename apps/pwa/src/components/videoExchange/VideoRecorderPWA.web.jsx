import React, { useState, useRef, useCallback, useEffect } from 'react';

const MAX_DURATION_CLIENT = 120; // 2 minutes

export default function VideoRecorderPWA({ onComplete, onCancel, maxDuration = MAX_DURATION_CLIENT }) {
  const [state, setState] = useState('idle'); // idle | recording | preview
  const [elapsed, setElapsed] = useState(0);
  const [facingMode, setFacingMode] = useState('environment');
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
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4;codecs=h264,aac',
      'video/mp4',
    ];
    const mimeType = candidates.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    const outputType = mimeType.startsWith('video/mp4') ? 'video/mp4' : 'video/webm';

    const recorder = new MediaRecorder(streamRef.current, {
      mimeType: mimeType || undefined,
      videoBitsPerSecond: 1_500_000,
      audioBitsPerSecond: 128_000,
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: outputType });
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
    <div style={styles.container}>
      {state !== 'preview' ? (
        <video
          ref={videoRef}
          style={styles.video}
          autoPlay
          muted
          playsInline
        />
      ) : (
        <video
          style={styles.video}
          src={previewUrl}
          controls
          playsInline
        />
      )}

      <div style={styles.controls}>
        {state === 'idle' && (
          <>
            <button style={styles.btnSecondary} onClick={onCancel}>Cancelar</button>
            <button style={styles.btnRecord} onClick={startRecording}>Grabar</button>
            <button style={styles.btnIcon} onClick={flipCamera}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m10 0h3a2 2 0 0 0 2-2v-3"/></svg>
            </button>
          </>
        )}

        {state === 'recording' && (
          <>
            <span style={styles.timer}>
              {formatTime(elapsed)} / {formatTime(maxDuration)}
            </span>
            <button style={styles.btnStop} onClick={stopRecording}>Detener</button>
          </>
        )}

        {state === 'preview' && (
          <>
            <button style={styles.btnSecondary} onClick={retake}>Repetir</button>
            <button style={styles.btnPrimary} onClick={confirm}>Usar</button>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: 'relative',
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  video: {
    width: '100%',
    aspectRatio: '16 / 9',
    objectFit: 'cover',
    display: 'block',
    backgroundColor: '#000',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(8px)',
  },
  btnRecord: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 20px',
    borderRadius: 8,
    border: 'none',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    backgroundColor: '#ef4444',
    color: '#fff',
  },
  btnStop: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 20px',
    borderRadius: 8,
    border: 'none',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    backgroundColor: '#ef4444',
    color: '#fff',
  },
  btnPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 20px',
    borderRadius: 8,
    border: 'none',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    color: '#1a1a1a',
  },
  btnSecondary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 20px',
    borderRadius: 8,
    border: 'none',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  btnIcon: {
    width: 36,
    height: 36,
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  timer: {
    fontSize: 14,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: '#ef4444',
  },
};
