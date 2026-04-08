import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import './DrawingLayer.css';

let strokeIdCounter = 0;

const DrawingLayer = forwardRef(function DrawingLayer(
  { width, height, activeTool, strokeColor, strokeWidth, drawingMode },
  ref
) {
  const canvasRef = useRef(null);
  const strokesRef = useRef([]);
  const activeStrokeRef = useRef(null);
  const isDrawingRef = useRef(false);
  const rafRef = useRef(null);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    getCanvas: () => canvasRef.current,
    clearAll: () => {
      strokesRef.current = [];
      renderStrokes();
    },
  }));

  const getCanvasPoint = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return [
      (e.clientX - rect.left) / rect.width,
      (e.clientY - rect.top) / rect.height,
    ];
  }, []);

  const renderStrokes = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const now = Date.now();
    const w = canvas.width;
    const h = canvas.height;

    // Filter out fully faded pointer strokes
    strokesRef.current = strokesRef.current.filter((s) => {
      if (s.mode === 'pointer') {
        const age = now - s.createdAt;
        return age < 1500;
      }
      return true;
    });

    for (const stroke of strokesRef.current) {
      if (stroke.points.length < 2) continue;

      let alpha = 1;
      if (stroke.mode === 'pointer') {
        const age = now - stroke.createdAt;
        alpha = Math.max(0, 1 - age / 1500);
      }

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(stroke.points[0][0] * w, stroke.points[0][1] * h);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i][0] * w, stroke.points[i][1] * h);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Also draw active stroke
    if (activeStrokeRef.current && activeStrokeRef.current.points.length >= 2) {
      const s = activeStrokeRef.current;
      ctx.save();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(s.points[0][0] * w, s.points[0][1] * h);
      for (let i = 1; i < s.points.length; i++) {
        ctx.lineTo(s.points[i][0] * w, s.points[i][1] * h);
      }
      ctx.stroke();
      ctx.restore();
    }
  }, []);

  // Animation loop for pointer stroke fading
  useEffect(() => {
    const hasPointerStrokes = () =>
      strokesRef.current.some((s) => s.mode === 'pointer');

    const animate = () => {
      renderStrokes();
      if (hasPointerStrokes() || isDrawingRef.current) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [renderStrokes]);

  // Restart animation loop when strokes change
  const ensureAnimating = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const animate = () => {
      renderStrokes();
      const hasPointer = strokesRef.current.some((s) => s.mode === 'pointer');
      if (hasPointer || isDrawingRef.current) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
  }, [renderStrokes]);

  const handlePointerDown = useCallback(
    (e) => {
      if (!activeTool) return;

      if (activeTool === 'eraser') {
        // Remove nearest permanent stroke
        const pt = getCanvasPoint(e);
        if (!pt) return;
        const threshold = 15 / width; // ~15px in normalized coords
        let closestIdx = -1;
        let closestDist = Infinity;

        for (let i = strokesRef.current.length - 1; i >= 0; i--) {
          const s = strokesRef.current[i];
          if (s.mode !== 'permanent') continue;
          for (const p of s.points) {
            const dx = p[0] - pt[0];
            const dy = p[1] - pt[1];
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < threshold && dist < closestDist) {
              closestDist = dist;
              closestIdx = i;
            }
          }
        }

        if (closestIdx >= 0) {
          strokesRef.current.splice(closestIdx, 1);
          renderStrokes();
        }
        return;
      }

      // Pen tool
      const pt = getCanvasPoint(e);
      if (!pt) return;

      isDrawingRef.current = true;
      activeStrokeRef.current = {
        id: ++strokeIdCounter,
        points: [pt],
        color: strokeColor,
        width: strokeWidth,
        mode: drawingMode,
        createdAt: Date.now(),
      };
      ensureAnimating();
    },
    [activeTool, strokeColor, strokeWidth, drawingMode, getCanvasPoint, width, renderStrokes, ensureAnimating]
  );

  const handlePointerMove = useCallback(
    (e) => {
      if (!isDrawingRef.current || !activeStrokeRef.current) return;
      const pt = getCanvasPoint(e);
      if (!pt) return;
      activeStrokeRef.current.points.push(pt);
    },
    [getCanvasPoint]
  );

  const handlePointerUp = useCallback(() => {
    if (!isDrawingRef.current || !activeStrokeRef.current) return;
    isDrawingRef.current = false;

    const stroke = activeStrokeRef.current;
    stroke.createdAt = Date.now(); // Reset for pointer fade timing
    strokesRef.current.push(stroke);
    activeStrokeRef.current = null;
    ensureAnimating();
  }, [ensureAnimating]);

  return (
    <canvas
      ref={canvasRef}
      className="dl-canvas"
      width={width}
      height={height}
      style={{ width, height }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    />
  );
});

export default DrawingLayer;
