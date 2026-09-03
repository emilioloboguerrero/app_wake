import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import apiClient from '../utils/apiClient';
import wakeLogotypeSrc from '../assets/Logotipo-WAKE-positivo.svg';
import WakeLoader from '../components/WakeLoader';
import { useAccentFromImage } from '../utils/accentColor';
import './PublicDocumentScreen.css';

// pdf.js 6 leans on Promise.withResolvers, missing on iOS Safari < 17.4 —
// a large slice of the audience this link gets shared with.
if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function withResolvers() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}

const THUMB_MAX_WIDTH = 720;
const DEFAULT_ACCENT = {
  accent: 'rgb(242, 242, 242)',
  accentSoft: 'rgba(242, 242, 242, 0.18)',
  accentLine: 'rgba(242, 242, 242, 0.4)',
  accentText: '#111111',
};

/** Pulls the channels back out of an `rgb(r, g, b)` string for the rgba() CSS vars. */
function rgbTriple(color) {
  const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(color);
  return m ? [m[1], m[2], m[3]] : [242, 242, 242];
}

function formatBytes(bytes) {
  if (!bytes) return null;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function extensionLabel(contentType, fileName) {
  const fromName = (fileName || '').split('.').pop();
  if (fromName && fromName.length <= 5 && fromName !== fileName) return fromName.toUpperCase();
  if (contentType === 'application/pdf') return 'PDF';
  return 'Archivo';
}

function AmbientOrbs() {
  return (
    <div className="pd-orbs" aria-hidden="true">
      <div className="pd-orb pd-orb-1" />
      <div className="pd-orb pd-orb-2" />
      <div className="pd-orb pd-orb-3" />
    </div>
  );
}

// Renders page 1 of the PDF into `canvasRef` and hands back a small JPEG data
// URL of it, which feeds the accent extractor. Non-PDF documents skip this
// entirely and fall back to the generic file card.
function useFirstPageThumbnail(fileUrl, contentType, canvasRef) {
  const [state, setState] = useState('idle'); // idle | rendering | done | failed
  const [snapshot, setSnapshot] = useState(null);
  const [aspect, setAspect] = useState(0.7727); // letter portrait until page 1 says otherwise

  useEffect(() => {
    if (!fileUrl || contentType !== 'application/pdf') { setState('idle'); return; }

    let cancelled = false;
    let task = null;
    setState('rendering');

    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

        task = pdfjs.getDocument({ url: fileUrl });
        const pdf = await task.promise;
        if (cancelled) return;

        const page = await pdf.getPage(1);
        if (cancelled) return;

        const base = page.getViewport({ scale: 1 });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const scale = (Math.min(THUMB_MAX_WIDTH, base.width * 2) / base.width) * dpr;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        setAspect(base.width / base.height);

        // pdf.js 6 wants the canvas itself; passing canvasContext alongside it is rejected.
        await page.render({ canvas, viewport }).promise;
        if (cancelled) return;

        setState('done');
        try { setSnapshot(canvas.toDataURL('image/jpeg', 0.5)); } catch { /* tainted canvas — accent stays neutral */ }
      } catch {
        if (!cancelled) setState('failed');
      }
    })();

    return () => {
      cancelled = true;
      if (task) task.destroy?.();
    };
  }, [fileUrl, contentType, canvasRef]);

  return { state, snapshot, aspect };
}

export default function PublicDocumentScreen() {
  const { docId } = useParams();
  const canvasRef = useRef(null);

  const [phase, setPhase] = useState('loading'); // loading | ready | downloaded | not_found | error
  const [doc, setDoc] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPhase('loading');
    apiClient.get(`/public/documents/${docId}`)
      .then(({ data }) => {
        if (cancelled) return;
        setDoc(data);
        document.title = `${data.title} — Wake`;
        setPhase('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setPhase(err?.status === 404 ? 'not_found' : 'error');
      });
    return () => { cancelled = true; };
  }, [docId]);

  const thumb = useFirstPageThumbnail(doc?.fileUrl, doc?.contentType, canvasRef);
  const accent = useAccentFromImage(thumb.snapshot) || DEFAULT_ACCENT;

  const handleDownload = useCallback(async () => {
    if (!doc || downloading) return;
    setDownloading(true);
    try {
      // The file is on a different origin, where the `download` attribute is
      // ignored — the browser would just open the PDF in a tab. Fetching it as
      // a blob first is what actually saves it under the intended name.
      const res = await fetch(doc.fileUrl);
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setPhase('downloaded');
    } catch {
      // The tab fallback still gets them the file, so it counts as done.
      window.open(doc.fileUrl, '_blank', 'noopener,noreferrer');
      setPhase('downloaded');
    } finally {
      setDownloading(false);
    }
  }, [doc, downloading]);

  const handleShare = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }, []);

  const [accentR, accentG, accentB] = rgbTriple(accent.accent);
  const cssVars = {
    '--accent': accent.accent,
    '--accent-soft': accent.accentSoft,
    '--accent-line': accent.accentLine,
    '--accent-text': accent.accentText,
    '--accent-r': accentR,
    '--accent-g': accentG,
    '--accent-b': accentB,
  };

  const meta = doc
    ? [extensionLabel(doc.contentType, doc.fileName), formatBytes(doc.sizeBytes), doc.pageCount ? `${doc.pageCount} páginas` : null]
      .filter(Boolean).join(' · ')
    : '';

  return (
    <div className="pd-page" style={cssVars}>
      <div className="pd-bg" />
      <AmbientOrbs />

      <a href="/" className="pd-logo-link" aria-label="Wake">
        <img src={wakeLogotypeSrc} alt="Wake" className="pd-logo" />
      </a>

      {phase === 'loading' && (
        <div className="pd-center">
          <WakeLoader size={64} />
        </div>
      )}

      {(phase === 'not_found' || phase === 'error') && (
        <div className="pd-center pd-fade-in">
          <h1 className="pd-title">
            {phase === 'not_found' ? 'No encontramos este documento' : 'Algo salió mal'}
          </h1>
          <p className="pd-message">
            {phase === 'not_found'
              ? 'El enlace puede haber expirado o el documento ya no está disponible.'
              : 'Vuelve a intentarlo en un momento.'}
          </p>
        </div>
      )}

      {phase === 'downloaded' && (
        <div className="pd-success pd-fade-in">
          <div className="pd-success-body">
            <div className="pd-rings-wrap">
              <div className="pd-ring pd-ring-1" />
              <div className="pd-ring pd-ring-2" />
              <div className="pd-ring pd-ring-3" />
              <svg className="pd-check" viewBox="0 0 52 52">
                <circle className="pd-check-circle" cx="26" cy="26" r="23" />
                <polyline className="pd-check-tick" points="14,26 22,34 38,18" />
              </svg>
            </div>
            <h1 className="pd-success-title">¡Listo, ya es tuyo!</h1>
            <p className="pd-success-sub">Busca el archivo en tus descargas.</p>
            <p className="pd-success-doc">{doc.title}</p>
            <button className="pd-again" onClick={handleDownload} disabled={downloading}>
              {downloading ? 'Descargando…' : 'Descargar de nuevo'}
            </button>
          </div>
          <div className="pd-success-footer">
            <button className={`pd-cta pd-cta--share${copied ? ' pd-cta--copied' : ''}`} onClick={handleShare}>
              {copied ? '✓ Link copiado' : 'Compartir este documento'}
            </button>
          </div>
        </div>
      )}

      {phase === 'ready' && (
        <div className="pd-hero pd-fade-in">
          <div className="pd-hero-head">
            <h1 className="pd-title">{doc.title}</h1>
            {doc.creatorName && <p className="pd-byline">por {doc.creatorName}</p>}
          </div>

          <div className="pd-hero-body">
            <button
              type="button"
              className="pd-doc-card"
              style={{ aspectRatio: thumb.aspect }}
              onClick={handleDownload}
              aria-label={doc.ctaLabel}
            >
              <canvas
                ref={canvasRef}
                className={`pd-doc-canvas ${thumb.state === 'done' ? 'pd-doc-canvas--ready' : ''}`}
              />

              {thumb.state === 'rendering' && (
                <div className="pd-doc-placeholder"><WakeLoader size={44} /></div>
              )}

              {(thumb.state === 'failed' || thumb.state === 'idle') && (
                <div className="pd-doc-placeholder">
                  <div className="pd-doc-ext">{extensionLabel(doc.contentType, doc.fileName)}</div>
                </div>
              )}
            </button>
          </div>

          <div className="pd-hero-footer">
            <button className="pd-cta pd-cta--pulse" onClick={handleDownload} disabled={downloading}>
              {downloading ? 'Descargando…' : doc.ctaLabel}
            </button>
            {meta && <span className="pd-meta">{meta}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
