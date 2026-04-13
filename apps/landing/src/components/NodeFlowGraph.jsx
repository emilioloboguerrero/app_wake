/**
 * NodeFlowGraph — SVG-based node graph with bezier connecting lines.
 *
 * Renders children as absolutely-positioned nodes and draws
 * cubic-bezier SVG paths between them based on the `edges` prop.
 * Optional animated pulse travels along each path.
 *
 * Props:
 *   children       — React nodes (each becomes a positioned slot)
 *   edges          — [{from, to}] connections (1-indexed)
 *   positions      — [{x, y}] per node (px, relative to container center)
 *   noodleColor    — stroke color (default rgba(255,255,255,0.12))
 *   noodleWidth    — stroke width (default 2)
 *   curvature      — 0–1 bezier control point offset (default 0.4)
 *   pulseEnabled   — animate a dot along each line
 *   pulseColor     — pulse stroke color
 *   pulseSpeed     — px/sec (default 140)
 *   pulseSize      — dasharray length (default 16)
 *   className      — extra className on wrapper
 *   style          — extra inline styles on wrapper
 */
import { useRef, useState, useEffect, useMemo, useCallback, Children } from 'react';

function buildPath(ax, ay, bx, by, curvature) {
  const dx = bx - ax;
  const dy = by - ay;
  const cx = Math.abs(dx) * curvature;
  return `M${ax},${ay} C${ax + cx},${ay} ${bx - cx},${by} ${bx},${by}`;
}

export default function NodeFlowGraph({
  children,
  edges = [],
  positions = [],
  noodleColor = 'rgba(255,255,255,0.12)',
  noodleWidth = 2,
  curvature = 0.4,
  pulseEnabled = false,
  pulseColor = 'rgba(255,255,255,0.5)',
  pulseSpeed = 140,
  pulseSize = 16,
  className = '',
  style,
}) {
  const containerRef = useRef(null);
  const pathRefs = useRef([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const nodes = useMemo(() => (Array.isArray(children) ? children : children ? [children] : []), [children]);

  // Measure container
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: width, h: height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Build SVG paths
  const paths = useMemo(() => {
    if (!size.w || !size.h || positions.length === 0) return [];
    const cx = size.w / 2;
    const cy = size.h / 2;
    return edges
      .filter((e) => e.from >= 1 && e.to >= 1 && e.from <= positions.length && e.to <= positions.length)
      .map((e) => {
        const a = positions[e.from - 1];
        const b = positions[e.to - 1];
        return buildPath(cx + a.x, cy + a.y, cx + b.x, cy + b.y, curvature);
      });
  }, [edges, positions, size, curvature]);

  // Pulse animation
  useEffect(() => {
    if (!pulseEnabled || paths.length === 0) return;
    let raf;
    let start;
    const animate = (ts) => {
      if (!start) start = ts;
      const elapsed = (ts - start) / 1000;
      pathRefs.current.forEach((el) => {
        if (!el) return;
        const len = el.getTotalLength();
        el.style.strokeDasharray = `${pulseSize} ${len}`;
        el.style.strokeDashoffset = len - (elapsed * pulseSpeed) % len;
      });
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [pulseEnabled, paths, pulseSpeed, pulseSize]);

  return (
    <div
      ref={containerRef}
      className={`nfg ${className}`}
      style={{ position: 'relative', width: '100%', height: '100%', ...style }}
    >
      {/* SVG layer */}
      {size.w > 0 && (
        <svg
          width={size.w}
          height={size.h}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          {paths.map((d, i) => (
            <g key={i}>
              <path
                d={d}
                stroke={noodleColor}
                strokeWidth={noodleWidth}
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
              {pulseEnabled && (
                <path
                  ref={(el) => { pathRefs.current[i] = el; }}
                  d={d}
                  stroke={pulseColor}
                  strokeWidth={noodleWidth}
                  strokeLinecap="round"
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
          ))}
        </svg>
      )}

      {/* Node slots */}
      {nodes.map((child, i) => {
        const pos = positions[i] || { x: 0, y: 0 };
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: size.w / 2 + pos.x,
              top: size.h / 2 + pos.y,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}
