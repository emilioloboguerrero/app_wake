/**
 * ScrollFlowSection — Flora-style scroll-driven category showcase.
 *
 * Desktop: sticky left column with category names (opacity shifts on scroll),
 *          right column with flow card (node graph + title + description).
 * Mobile:  vertical stack of cards, each with category + flow + meta.
 *
 * Uses IntersectionObserver to detect which category panel is in the
 * viewport and highlights the corresponding label on the left.
 */
import { useRef, useState, useEffect, useCallback } from 'react';
import NodeFlowGraph from './NodeFlowGraph';

export default function ScrollFlowSection({
  eyebrow,
  headline,
  headlineEm,
  sub,
  cta,
  ctaHref = '/app',
  secondary,
  secondaryHref = '#allinone',
  categories,
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const panelRefs = useRef([]);
  const sectionRef = useRef(null);

  // Observe which panel is most visible
  useEffect(() => {
    const panels = panelRefs.current.filter(Boolean);
    if (panels.length === 0) return;

    const obs = new IntersectionObserver(
      (entries) => {
        let best = null;
        entries.forEach((e) => {
          if (e.isIntersecting && (!best || e.intersectionRatio > best.intersectionRatio)) {
            best = e;
          }
        });
        if (best) {
          const idx = panels.indexOf(best.target);
          if (idx !== -1) setActiveIndex(idx);
        }
      },
      { threshold: [0.3, 0.5, 0.7], rootMargin: '-20% 0px -20% 0px' }
    );

    panels.forEach((p) => obs.observe(p));
    return () => obs.disconnect();
  }, [categories.length]);

  return (
    <section className="lds-sf" id="workflows" ref={sectionRef}>
      {/* Header */}
      <div className="lds-sf-head lds-eu">
        <span className="lds-eyebrow">{eyebrow}</span>
        <h2 className="lds-h2">
          {headline} <em>{headlineEm}</em>
        </h2>
        <p className="lds-sub">{sub}</p>
        <div className="lds-sf-actions">
          <a href={ctaHref} className="lds-cta-primary">{cta}</a>
          {secondary && (
            <a href={secondaryHref} className="lds-cta-ghost">{secondary} →</a>
          )}
        </div>
      </div>

      {/* ── Desktop: sticky scroll layout ── */}
      <div className="lds-sf-desktop">
        {/* Left: sticky category list */}
        <div className="lds-sf-left">
          <div className="lds-sf-categories">
            {categories.map((cat, i) => (
              <button
                key={cat.id}
                type="button"
                className={`lds-sf-cat ${activeIndex === i ? 'is-active' : ''}`}
                onClick={() => {
                  panelRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
              >
                {cat.tab}
              </button>
            ))}
          </div>
        </div>

        {/* Right: scrolling flow panels */}
        <div className="lds-sf-right">
          {categories.map((cat, i) => (
            <div
              key={cat.id}
              ref={(el) => { panelRefs.current[i] = el; }}
              className="lds-sf-panel"
            >
              <FlowCard cat={cat} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Mobile: vertical cards ── */}
      <div className="lds-sf-mobile">
        {categories.map((cat, i) => (
          <div key={cat.id} className="lds-sf-mcard lds-eu" style={{ animationDelay: `${i * 0.06}s` }}>
            <h3 className="lds-sf-mcard-cat">{cat.tab}</h3>
            <FlowCard cat={cat} />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Individual flow card ── */
function FlowCard({ cat }) {
  return (
    <div className="lds-sf-card">
      <div className="lds-sf-card-graph">
        <div className="lds-sf-card-bg" />
        <NodeFlowGraph
          edges={cat.flow?.edges || []}
          positions={cat.flow?.positions || []}
          noodleColor="rgba(255,255,255,0.10)"
          noodleWidth={1.5}
          curvature={0.45}
          pulseEnabled
          pulseColor="rgba(255,255,255,0.35)"
          pulseSpeed={120}
          pulseSize={14}
        >
          {(cat.flow?.nodes || []).map((node, j) => (
            <div key={j} className="lds-sf-node">
              {node.image ? (
                <img src={node.image} alt={node.label || ''} className="lds-sf-node-img" />
              ) : (
                <div className="lds-sf-node-placeholder">{node.label || ''}</div>
              )}
              {node.label && <span className="lds-sf-node-label">{node.label}</span>}
            </div>
          ))}
        </NodeFlowGraph>
      </div>
      <div className="lds-sf-card-meta">
        <h3 className="lds-sf-card-title">{cat.title}</h3>
        <p className="lds-sf-card-body">{cat.body}</p>
        <a href="/app" className="lds-cta-ghost">Explorar este flujo →</a>
      </div>
    </div>
  );
}
