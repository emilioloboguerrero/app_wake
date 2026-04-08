import { useRef, useEffect, useCallback, useState } from 'react';

const CANVAS_W = 1280;
const CANVAS_H = 720;
const BUBBLE_SIZE = 120;
const BUBBLE_MARGIN = 20;

export default function ReactionCanvas({
  videoSrc,
  cameraStream,
  drawingLayerRef,
  isRecording,
  isPaused,
  onBlobReady,
}) {
  const compositeCanvasRef = useRef(null);
  const clientVideoRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const rafRef = useRef(null);

  // Camera bubble position (draggable)
  const [bubblePos, setBubblePos] = useState({
    x: CANVAS_W - BUBBLE_SIZE - BUBBLE_MARGIN,
    y: CANVAS_H - BUBBLE_SIZE - BUBBLE_MARGIN,
  });
  const isDraggingBubble = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Set up camera stream on the hidden video element
  useEffect(() => {
    if (cameraStream && cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  // Control client video play/pause
  useEffect(() => {
    const video = clientVideoRef.current;
    if (!video) return;
    if (isPaused) {
      video.pause();
    } else if (isRecording) {
      video.play().catch(() => {});
    }
  }, [isPaused, isRecording]);

  // Compositing render loop
  const renderFrame = useCallback(() => {
    const canvas = compositeCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // 1. Draw client video
    const clientVideo = clientVideoRef.current;
    if (clientVideo && clientVideo.readyState >= 2) {
      ctx.drawImage(clientVideo, 0, 0, CANVAS_W, CANVAS_H);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    // 2. Draw drawing layer
    if (drawingLayerRef?.current) {
      const drawCanvas = drawingLayerRef.current.getCanvas();
      if (drawCanvas) {
        ctx.drawImage(drawCanvas, 0, 0, CANVAS_W, CANVAS_H);
      }
    }

    // 3. Draw camera bubble
    const cameraVideo = cameraVideoRef.current;
    if (cameraVideo && cameraVideo.readyState >= 2 && cameraStream) {
      const cx = bubblePos.x + BUBBLE_SIZE / 2;
      const cy = bubblePos.y + BUBBLE_SIZE / 2;
      const radius = BUBBLE_SIZE / 2;

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(cameraVideo, bubblePos.x, bubblePos.y, BUBBLE_SIZE, BUBBLE_SIZE);
      ctx.restore();

      // Border
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    rafRef.current = requestAnimationFrame(renderFrame);
  }, [bubblePos, cameraStream, drawingLayerRef]);

  // Start/stop render loop
  useEffect(() => {
    rafRef.current = requestAnimationFrame(renderFrame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [renderFrame]);

  // Start/stop MediaRecorder when isRecording changes
  useEffect(() => {
    if (isRecording) {
      startRecording();
    } else if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }

    function startRecording() {
      const canvas = compositeCanvasRef.current;
      if (!canvas) return;

      chunksRef.current = [];
      const videoStream = canvas.captureStream(30);

      // Get audio from camera stream (mic only)
      const audioTracks = cameraStream?.getAudioTracks() || [];
      const combinedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...audioTracks,
      ]);

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';

      const recorder = new MediaRecorder(combinedStream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        onBlobReady(blob);
      };

      recorder.start(1000);
      recorderRef.current = recorder;

      // Auto-play client video
      clientVideoRef.current?.play().catch(() => {});
    }
  }, [isRecording, cameraStream, onBlobReady]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
    };
  }, []);

  // Camera bubble drag handlers (on the visible container)
  const handleContainerPointerDown = useCallback((e) => {
    const canvas = compositeCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    const cx = bubblePos.x + BUBBLE_SIZE / 2;
    const cy = bubblePos.y + BUBBLE_SIZE / 2;
    const dist = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2);

    if (dist <= BUBBLE_SIZE / 2) {
      isDraggingBubble.current = true;
      dragOffset.current = { x: mx - bubblePos.x, y: my - bubblePos.y };
      e.stopPropagation();
    }
  }, [bubblePos]);

  const handleContainerPointerMove = useCallback((e) => {
    if (!isDraggingBubble.current) return;
    const canvas = compositeCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    const newX = Math.max(0, Math.min(CANVAS_W - BUBBLE_SIZE, mx - dragOffset.current.x));
    const newY = Math.max(0, Math.min(CANVAS_H - BUBBLE_SIZE, my - dragOffset.current.y));
    setBubblePos({ x: newX, y: newY });
    e.stopPropagation();
  }, []);

  const handleContainerPointerUp = useCallback(() => {
    isDraggingBubble.current = false;
  }, []);

  return (
    <div
      style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#000' }}
      onPointerDown={handleContainerPointerDown}
      onPointerMove={handleContainerPointerMove}
      onPointerUp={handleContainerPointerUp}
    >
      {/* Hidden client video */}
      <video
        ref={clientVideoRef}
        src={videoSrc}
        style={{ display: 'none' }}
        playsInline
        muted
        preload="auto"
        crossOrigin="anonymous"
      />

      {/* Hidden camera video */}
      <video
        ref={cameraVideoRef}
        style={{ display: 'none' }}
        autoPlay
        muted
        playsInline
      />

      {/* Composite canvas (visible) */}
      <canvas
        ref={compositeCanvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        style={{ width: '100%', height: '100%', display: 'block', borderRadius: 8 }}
      />
    </div>
  );
}
