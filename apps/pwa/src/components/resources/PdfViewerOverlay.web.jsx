// In-app PDF viewer. Renders a PDF to <canvas> with pdf.js so it displays
// inside the app on mobile — an <iframe>/<object> renders blank or downloads
// the file on iOS WebKit and Android Chrome, which is why opening PDFs "inside
// the app" never worked before.
//
// pdf.js ships as same-origin static assets (/app/pdf.min.js + worker), copied
// from node_modules by scripts/copy-pdf-assets.js. They load on demand here, so
// nothing pdf.js touches the main bundle.
//
// Pages render lazily as they scroll into view and unload when far off-screen,
// bounding memory for large docs. Top bar respects the notch via
// env(safe-area-inset-top).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import logger from '../../utils/logger';

const SPRING = 'cubic-bezier(0.22, 1, 0.36, 1)';

const WEB_BASE =
  typeof window !== 'undefined' &&
  (window.location.pathname === '/app' || window.location.pathname.startsWith('/app/'))
    ? '/app'
    : (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_BASE_PATH) || '';

const PDF_LIB_URL = `${WEB_BASE}/pdf.min.js`;
const PDF_WORKER_URL = `${WEB_BASE}/pdf.worker.min.js`;

// Load the pdf.js UMD lib once; cache the in-flight promise so concurrent opens
// share a single <script> injection.
let pdfLibPromise = null;
function loadPdfLib() {
  if (typeof window !== 'undefined' && window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
    return Promise.resolve(window.pdfjsLib);
  }
  if (pdfLibPromise) return pdfLibPromise;
  pdfLibPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PDF_LIB_URL;
    script.async = true;
    script.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
        resolve(window.pdfjsLib);
      } else {
        pdfLibPromise = null;
        reject(new Error('pdfjsLib no disponible tras cargar el script'));
      }
    };
    script.onerror = () => {
      pdfLibPromise = null;
      reject(new Error('No se pudo cargar el visor de PDF'));
    };
    document.head.appendChild(script);
  });
  return pdfLibPromise;
}

const MAX_DPR = 2;
// Render pages within ~1.5 viewports of the scroll position; unload the rest.
const RENDER_MARGIN = '150% 0px';

export default function PdfViewerOverlay({ url, title, onClose }) {
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [numPages, setNumPages] = useState(0);
  const [aspect, setAspect] = useState('1 / 1.414'); // page-1 ratio, placeholder for all

  const scrollRef = useRef(null);
  const wrapRefs = useRef({}); // pageNum -> wrapper div
  const renderedRef = useRef(new Set()); // pageNums with a live canvas
  const tasksRef = useRef(new Map()); // pageNum -> RenderTask (for cancellation)
  const pdfRef = useRef(null);
  const observerRef = useRef(null);

  const cancelTask = (pageNum) => {
    const task = tasksRef.current.get(pageNum);
    if (task) {
      try { task.cancel(); } catch (_) {}
      tasksRef.current.delete(pageNum);
    }
  };

  const renderPage = useCallback(async (pageNum) => {
    if (renderedRef.current.has(pageNum)) return;
    const pdf = pdfRef.current;
    const wrap = wrapRefs.current[pageNum];
    if (!pdf || !wrap) return;
    renderedRef.current.add(pageNum); // mark before await so we don't double-render

    let page;
    try {
      page = await pdf.getPage(pageNum);
    } catch (_) {
      renderedRef.current.delete(pageNum);
      return;
    }
    if (!wrapRefs.current[pageNum]) { renderedRef.current.delete(pageNum); return; }

    const containerWidth = wrap.clientWidth || 1;
    const unscaled = page.getViewport({ scale: 1 });
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const viewport = page.getViewport({ scale: (containerWidth / unscaled.width) * dpr });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    wrap.style.aspectRatio = `${unscaled.width} / ${unscaled.height}`;
    wrap.innerHTML = '';
    wrap.appendChild(canvas);

    const task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
    tasksRef.current.set(pageNum, task);
    try {
      await task.promise;
    } catch (_) {
      // render cancelled (page scrolled away or overlay closed)
    }
    tasksRef.current.delete(pageNum);
  }, []);

  const unloadPage = useCallback((pageNum) => {
    cancelTask(pageNum);
    if (!renderedRef.current.has(pageNum)) return;
    renderedRef.current.delete(pageNum);
    const wrap = wrapRefs.current[pageNum];
    if (wrap) wrap.innerHTML = '';
  }, []);

  // Load the document.
  useEffect(() => {
    let cancelled = false;
    let loadingTask = null;

    loadPdfLib()
      .then((pdfjsLib) => {
        if (cancelled) return null;
        loadingTask = pdfjsLib.getDocument({ url });
        return loadingTask.promise;
      })
      .then(async (pdf) => {
        if (cancelled || !pdf) return;
        pdfRef.current = pdf;
        try {
          const first = await pdf.getPage(1);
          const vp = first.getViewport({ scale: 1 });
          if (!cancelled) setAspect(`${vp.width} / ${vp.height}`);
        } catch (_) {}
        if (cancelled) return;
        setNumPages(pdf.numPages);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        logger.error('[PdfViewer] No se pudo abrir el PDF:', err);
        setStatus('error');
      });

    return () => {
      cancelled = true;
      tasksRef.current.forEach((task) => { try { task.cancel(); } catch (_) {} });
      tasksRef.current.clear();
      renderedRef.current.clear();
      if (loadingTask) { try { loadingTask.destroy(); } catch (_) {} }
      if (pdfRef.current) { try { pdfRef.current.destroy(); } catch (_) {} pdfRef.current = null; }
    };
  }, [url]);

  // Lazy render: observe page wrappers, render on approach, unload when far.
  useEffect(() => {
    if (status !== 'ready' || numPages === 0) return undefined;
    const root = scrollRef.current;
    if (!root) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const pageNum = Number(entry.target.getAttribute('data-page'));
          if (!pageNum) return;
          if (entry.isIntersecting) renderPage(pageNum);
          else unloadPage(pageNum);
        });
      },
      { root, rootMargin: RENDER_MARGIN, threshold: 0.01 }
    );
    observerRef.current = observer;
    Object.values(wrapRefs.current).forEach((el) => el && observer.observe(el));

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [status, numPages, renderPage, unloadPage]);

  const registerWrap = (pageNum) => (el) => {
    if (el) {
      wrapRefs.current[pageNum] = el;
      if (observerRef.current) observerRef.current.observe(el);
    } else {
      delete wrapRefs.current[pageNum];
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.bar}>
        <span style={styles.title}>{title}</span>
        {status === 'ready' && numPages > 0 ? (
          <span style={styles.count}>{numPages} {numPages === 1 ? 'página' : 'páginas'}</span>
        ) : null}
        <button type="button" style={styles.closeButton} onClick={onClose}>
          Cerrar
        </button>
      </div>

      <div ref={scrollRef} style={styles.scroll}>
        {status === 'loading' ? (
          <div style={styles.statusWrap}>
            <span style={styles.statusText}>Cargando documento…</span>
          </div>
        ) : status === 'error' ? (
          <div style={styles.statusWrap}>
            <span style={styles.statusText}>No pudimos abrir el documento.</span>
            <button
              type="button"
              style={styles.fallbackButton}
              onClick={() => window.open(url, '_blank', 'noopener')}
            >
              Abrir en el navegador
            </button>
          </div>
        ) : (
          <div style={styles.pages}>
            {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
              <div
                key={pageNum}
                ref={registerWrap(pageNum)}
                data-page={pageNum}
                style={{ ...styles.pageWrap, aspectRatio: aspect }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    background: '#1a1a1a',
    display: 'flex',
    flexDirection: 'column',
  },
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 18px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.85)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  count: {
    flexShrink: 0,
    fontSize: 12,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.4)',
  },
  closeButton: {
    flexShrink: 0,
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 999,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: 600,
    padding: '8px 16px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
    background: '#1a1a1a',
  },
  pages: {
    maxWidth: 820,
    margin: '0 auto',
    padding: '16px 12px calc(env(safe-area-inset-bottom, 0px) + 24px)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  pageWrap: {
    width: '100%',
    background: '#0e0e0e',
    borderRadius: 8,
    overflow: 'hidden',
  },
  statusWrap: {
    minHeight: '60vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    textAlign: 'center',
    padding: '0 24px',
  },
  statusText: {
    fontSize: 15,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.6)',
  },
  fallbackButton: {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 999,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: 600,
    padding: '10px 20px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};
