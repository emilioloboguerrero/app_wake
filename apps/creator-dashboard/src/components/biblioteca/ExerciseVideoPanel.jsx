import { useState } from 'react';
import { detectVideoSource, getEmbedUrl } from '../../utils/videoUtils';
import MediaDropZone from '../ui/MediaDropZone';

export default function ExerciseVideoPanel({ videoUrl, videoSource, onPickVideo, onDelete, onDropSelect }) {
  const [isPlaying, setIsPlaying] = useState(false);

  const resolvedSource = detectVideoSource(videoUrl, videoSource);
  const isExternal = resolvedSource === 'youtube' || resolvedSource === 'vimeo';
  const embedUrl = isExternal ? getEmbedUrl(videoUrl, resolvedSource) : null;
  const hasVideo = !!videoUrl;

  const sourceLabel = isExternal
    ? (resolvedSource === 'youtube' ? 'YouTube' : 'Vimeo')
    : null;

  // ─── Preview state (video exists) ─────────────────────────────────────
  if (hasVideo) {
    return (
      <MediaDropZone onSelect={onDropSelect} accept="video/*">
        <div className="lex-video-panel">
          <div className="lex-video-container">
            {isExternal ? (
              <iframe
                className="lex-video-embed"
                src={embedUrl}
                allow="autoplay; encrypted-media"
                allowFullScreen
                title="Video"
              />
            ) : (
              <video
                className="lex-video-player"
                src={videoUrl}
                controls
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
              />
            )}

            {/* Source tag */}
            {sourceLabel && (
              <span className="lex-video-source-tag">{sourceLabel}</span>
            )}

            {!isPlaying && (
              <div className="lex-video-actions">
                <button className="lex-video-action-btn" onClick={onPickVideo}>
                  Cambiar
                </button>
                <button className="lex-video-action-btn lex-video-action-btn--danger" onClick={onDelete}>
                  Eliminar
                </button>
              </div>
            )}
          </div>
        </div>
      </MediaDropZone>
    );
  }

  // ─── No video state ───────────────────────────────────────────────────
  return (
    <MediaDropZone onSelect={onDropSelect} accept="video/*">
      <div className="lex-video-panel">
        <div className="lex-video-upload-zone" onClick={onPickVideo}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M12 16V8m0 0l-3 3m3-3l3 3" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3 16v1a4 4 0 004 4h10a4 4 0 004-4v-1" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span className="lex-video-upload-text">Elegir video</span>
          <span className="lex-video-upload-hint">Arrastra un archivo o haz clic</span>
        </div>
      </div>
    </MediaDropZone>
  );
}
