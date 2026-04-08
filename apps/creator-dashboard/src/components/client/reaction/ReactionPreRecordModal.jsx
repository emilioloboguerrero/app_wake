import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Camera, CameraOff, Mic, MicOff } from 'lucide-react';
import './ReactionPreRecordModal.css';

export default function ReactionPreRecordModal({ onStart, onCancel }) {
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [error, setError] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const analyserRef = useRef(null);
  const audioCtxRef = useRef(null);
  const animFrameRef = useRef(null);

  const startStream = useCallback(async (camera, mic) => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const constraints = {};
      if (camera) constraints.video = { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } };
      if (mic) constraints.audio = true;

      if (!constraints.video && !constraints.audio) {
        streamRef.current = null;
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current && camera) {
        videoRef.current.srcObject = stream;
      }

      // Set up audio analyser
      if (mic) {
        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateVolume = () => {
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setVolumeLevel(avg / 255);
          animFrameRef.current = requestAnimationFrame(updateVolume);
        };
        updateVolume();
      }

      setError(null);
    } catch (err) {
      setError('No se pudo acceder a la camara o microfono');
    }
  }, []);

  useEffect(() => {
    startStream(cameraOn, micOn);
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCamera = useCallback(() => {
    const next = !cameraOn;
    setCameraOn(next);
    if (streamRef.current) {
      const videoTracks = streamRef.current.getVideoTracks();
      videoTracks.forEach((t) => (t.enabled = next));
    }
  }, [cameraOn]);

  const toggleMic = useCallback(() => {
    const next = !micOn;
    setMicOn(next);
    if (streamRef.current) {
      const audioTracks = streamRef.current.getAudioTracks();
      audioTracks.forEach((t) => (t.enabled = next));
    }
    if (!next) setVolumeLevel(0);
  }, [micOn]);

  const handleStart = useCallback(() => {
    // Pass the stream to parent (don't stop it)
    onStart(streamRef.current);
  }, [onStart]);

  const handleCancel = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    onCancel();
  }, [onCancel]);

  // Volume bars
  const bars = [0.3, 0.5, 0.7, 0.9];

  return (
    <div className="rpm-modal">
      <div className="rpm-header">
        <span className="rpm-title">Preparar grabacion</span>
        <button className="rpm-close" onClick={handleCancel}>
          <X size={16} />
        </button>
      </div>

      {/* Camera preview */}
      <div className="rpm-preview">
        {cameraOn ? (
          <video
            ref={videoRef}
            className="rpm-video"
            autoPlay
            muted
            playsInline
          />
        ) : (
          <div className="rpm-placeholder">
            <CameraOff size={24} />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="rpm-controls">
        <button
          className={`rpm-toggle ${cameraOn ? 'rpm-toggle--on' : ''}`}
          onClick={toggleCamera}
        >
          {cameraOn ? <Camera size={16} /> : <CameraOff size={16} />}
        </button>

        <div className="rpm-mic-group">
          <button
            className={`rpm-toggle ${micOn ? 'rpm-toggle--on' : ''}`}
            onClick={toggleMic}
          >
            {micOn ? <Mic size={16} /> : <MicOff size={16} />}
          </button>
          {micOn && (
            <div className="rpm-volume-bars">
              {bars.map((threshold, i) => (
                <div
                  key={i}
                  className={`rpm-bar ${volumeLevel >= threshold ? 'rpm-bar--active' : ''}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <p className="rpm-error">{error}</p>}

      <button className="rpm-start-btn" onClick={handleStart} disabled={!!error}>
        Empezar grabacion
      </button>
    </div>
  );
}
