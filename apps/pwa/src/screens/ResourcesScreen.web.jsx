// Recursos adicionales — full list of a program's attached resources (PDFs,
// videos, links). Reached from the resources card in the Hoy carousel.
//
// Tapping a resource:
//   pdf     → in-screen full-screen iframe overlay
//   youtube → in-screen full-screen embed overlay (parsed video id)
//   link    → opens in a new tab
//
// No image on this screen → white-tone palette only, per docs/STANDARDS.md.
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCourseResources } from '../hooks/hoy/useCourseResources';
import WakeLoader from '../components/WakeLoader.web.jsx';
import logger from '../utils/logger';

const SPRING = 'cubic-bezier(0.22, 1, 0.36, 1)';

const TYPE_LABEL = {
  pdf: 'PDF',
  youtube: 'Video',
  link: 'Enlace',
};

// Pull a YouTube video id from the common URL shapes. Returns null if none match.
const parseYouTubeId = (url) => {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0];
      return id || null;
    }
    if (host.endsWith('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return v;
      const parts = u.pathname.split('/').filter(Boolean);
      const embedIdx = parts.indexOf('embed');
      if (embedIdx !== -1 && parts[embedIdx + 1]) return parts[embedIdx + 1];
      const shortsIdx = parts.indexOf('shorts');
      if (shortsIdx !== -1 && parts[shortsIdx + 1]) return parts[shortsIdx + 1];
    }
    return null;
  } catch {
    return null;
  }
};

const styles = {
  page: {
    minHeight: '100vh',
    background: '#1a1a1a',
    color: '#fff',
    padding: '60px 24px 100px',
    boxSizing: 'border-box',
  },
  inner: {
    maxWidth: 540,
    margin: '0 auto',
  },
  backButton: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    padding: '8px 0',
    marginBottom: 24,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  heading: {
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: -0.3,
    lineHeight: 1.15,
    margin: '0 0 24px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    width: '100%',
    textAlign: 'left',
    padding: '18px 20px',
    borderRadius: 16,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#fff',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: `background-color 180ms ${SPRING}, border-color 180ms ${SPRING}, transform 120ms ${SPRING}`,
  },
  itemTypeLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: 600,
    letterSpacing: -0.2,
    lineHeight: 1.3,
    color: '#fff',
  },
  loadingWrap: {
    minHeight: '60vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    minHeight: '50vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
  },
  emptyHeadline: {
    fontSize: 20,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: -0.2,
  },
  errorText: {
    fontSize: 15,
    color: 'rgba(224,84,84,0.9)',
    fontWeight: 500,
    margin: '24px 0 0',
  },
  // Full-screen overlay (pdf / youtube viewer)
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    background: '#1a1a1a',
    display: 'flex',
    flexDirection: 'column',
  },
  overlayBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '14px 18px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  overlayTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.85)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
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
  overlayBody: {
    flex: 1,
    minHeight: 0,
    background: '#000',
  },
  iframe: {
    width: '100%',
    height: '100%',
    border: 0,
  },
};

export default function ResourcesScreen() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { data: resources = [], isLoading, isError } = useCourseResources(courseId);
  const [openResource, setOpenResource] = useState(null);

  useEffect(() => {
    document.title = 'Recursos — Wake';
  }, []);

  const sorted = useMemo(
    () => [...resources].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [resources]
  );

  const handleTap = (resource) => {
    if (!resource?.url) return;
    if (resource.type === 'pdf') {
      setOpenResource({ ...resource, embedUrl: resource.url });
      return;
    }
    if (resource.type === 'youtube') {
      const id = parseYouTubeId(resource.url);
      if (id) {
        setOpenResource({ ...resource, embedUrl: `https://www.youtube.com/embed/${id}` });
      } else {
        logger.warn('No se pudo extraer el id de YouTube, abriendo en pestaña nueva:', resource.url);
        window.open(resource.url, '_blank', 'noopener');
      }
      return;
    }
    // link
    window.open(resource.url, '_blank', 'noopener');
  };

  return (
    <div className="wake-screen-enter" style={styles.page}>
      <div style={styles.inner}>
        <button style={styles.backButton} onClick={() => navigate(-1)}>
          ← Volver
        </button>

        {isLoading ? (
          <div style={styles.loadingWrap}>
            <WakeLoader size={64} />
          </div>
        ) : isError ? (
          <>
            <h1 style={styles.heading}>Recursos</h1>
            <p style={styles.errorText}>No pudimos cargar los recursos. Inténtalo de nuevo.</p>
          </>
        ) : sorted.length === 0 ? (
          <div style={styles.empty}>
            <span style={styles.emptyHeadline}>Aún no hay recursos</span>
          </div>
        ) : (
          <>
            <h1 style={styles.heading}>Recursos</h1>
            <div style={styles.list}>
              {sorted.map((resource) => (
                <button
                  key={resource.id}
                  type="button"
                  style={styles.item}
                  onClick={() => handleTap(resource)}
                >
                  <span style={styles.itemTypeLabel}>{TYPE_LABEL[resource.type] || 'Recurso'}</span>
                  <span style={styles.itemTitle}>{resource.title}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {openResource ? (
        <div style={styles.overlay}>
          <div style={styles.overlayBar}>
            <span style={styles.overlayTitle}>{openResource.title}</span>
            <button
              type="button"
              style={styles.closeButton}
              onClick={() => setOpenResource(null)}
            >
              Cerrar
            </button>
          </div>
          <div style={styles.overlayBody}>
            <iframe
              src={openResource.embedUrl}
              style={styles.iframe}
              title={openResource.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
