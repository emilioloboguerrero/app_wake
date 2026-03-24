import { useState, useRef } from 'react';

export default function ExerciseVideoPanel({ videoUrl, onUpload, onDelete, isUploading, uploadProgress }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      return;
    }

    onUpload(file);
    e.target.value = '';
  };

  return (
    <div className="lex-video-panel">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {videoUrl ? (
        <div className="lex-video-container">
          <video
            className="lex-video-player"
            src={videoUrl}
            controls={!isUploading}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
          />
          {!isPlaying && !isUploading && (
            <div className="lex-video-actions">
              <button
                className="lex-video-action-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                Cambiar
              </button>
              <button
                className="lex-video-action-btn lex-video-action-btn--danger"
                onClick={onDelete}
              >
                Eliminar
              </button>
            </div>
          )}
        </div>
      ) : (
        <div
          className="lex-video-upload-zone"
          onClick={() => !isUploading && fileInputRef.current?.click()}
        >
          {isUploading ? (
            <div className="lex-video-uploading">
              <div className="lex-video-progress-bar">
                <div className="lex-video-progress-fill" style={{ width: `${uploadProgress}%` }} />
              </div>
              <span className="lex-video-progress-text">Subiendo {Math.round(uploadProgress)}%</span>
            </div>
          ) : (
            <>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <path d="M12 16V8m0 0l-3 3m3-3l3 3" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 16v1a4 4 0 004 4h10a4 4 0 004-4v-1" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span className="lex-video-upload-text">Subir video</span>
              <span className="lex-video-upload-hint">Máx 100MB</span>
            </>
          )}
        </div>
      )}

      {isUploading && videoUrl && (
        <div className="lex-video-uploading-overlay">
          <div className="lex-video-progress-bar">
            <div className="lex-video-progress-fill" style={{ width: `${uploadProgress}%` }} />
          </div>
          <span className="lex-video-progress-text">Subiendo {Math.round(uploadProgress)}%</span>
        </div>
      )}
    </div>
  );
}
