import React, { useEffect, useState } from 'react';
import { ref, getDownloadURL } from 'firebase/storage';
import { storage } from '../../config/firebase';

/**
 * Resolves a Firebase Storage path to a download URL under the authenticated
 * user. Storage rules gate reads to the exchange participants, so naked
 * firebasestorage.googleapis.com URLs are rejected without a token — we must
 * request one through the SDK per session.
 */
export default function AuthedVideo({ path, thumbnailPath, style, compact }) {
  const { url, status } = useResolvedStorageUrl(path);
  const { url: posterUrl } = useResolvedStorageUrl(thumbnailPath);

  if (status === 'error') {
    return (
      <div style={{ ...unavailableStyle, ...(compact ? unavailableCompactStyle : null) }}>
        <span style={unavailableTextStyle}>Este video ya no está disponible</span>
      </div>
    );
  }

  if (status === 'loading' || !url) {
    return (
      <div style={{ ...loadingStyle, ...(compact ? unavailableCompactStyle : null) }} />
    );
  }

  return (
    <video
      style={style}
      src={url}
      controls
      playsInline
      preload="metadata"
      poster={posterUrl || undefined}
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

const unavailableStyle = {
  width: '100%',
  aspectRatio: '16 / 9',
  borderRadius: 10,
  background: 'rgba(255,255,255,0.03)',
  border: '1px dashed rgba(255,255,255,0.10)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 12,
};

const unavailableCompactStyle = {
  aspectRatio: '16 / 9',
  maxHeight: 180,
};

const unavailableTextStyle = {
  fontSize: 12,
  color: 'rgba(255,255,255,0.45)',
  textAlign: 'center',
};

const loadingStyle = {
  width: '100%',
  aspectRatio: '16 / 9',
  borderRadius: 10,
  background: 'rgba(255,255,255,0.04)',
};
