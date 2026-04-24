import { useEffect, useState } from 'react';
import { ref, getDownloadURL } from 'firebase/storage';
import { storage } from '../../config/firebase';

/**
 * Video element that resolves a Firebase Storage path to a download URL
 * under the authenticated user. Storage rules gate reads to the exchange
 * participants, so a naked firebasestorage.googleapis.com URL is rejected
 * without a token — we must request one via the SDK per session.
 */
export default function AuthedVideo({ path, thumbnailPath, className, onError }) {
  const { url, status } = useResolvedStorageUrl(path);
  const { url: posterUrl } = useResolvedStorageUrl(thumbnailPath);

  if (status === 'error') {
    return (
      <div className={className} data-unavailable="true">
        <span>Este video ya no está disponible</span>
      </div>
    );
  }

  if (status === 'loading' || !url) {
    return <div className={className} data-loading="true" />;
  }

  return (
    <video
      className={className}
      src={url}
      controls
      playsInline
      preload="metadata"
      poster={posterUrl || undefined}
      onError={onError}
    />
  );
}

export function useResolvedStorageUrl(path) {
  const [url, setUrl] = useState(null);
  const [status, setStatus] = useState(path ? 'loading' : 'idle');

  useEffect(() => {
    if (!path) {
      setUrl(null);
      setStatus('idle');
      return;
    }
    if (path.startsWith('http')) {
      setUrl(path);
      setStatus('ready');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    getDownloadURL(ref(storage, path))
      .then((u) => {
        if (cancelled) return;
        setUrl(u);
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setUrl(null);
        setStatus('error');
      });
    return () => { cancelled = true; };
  }, [path]);

  return { url, status };
}
