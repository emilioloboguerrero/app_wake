import React, { useState, useEffect } from 'react';
import { useMediaUpload } from '../../contexts/MediaUploadContext';
import { formatFileSize } from '../../utils/mediaCompressor';
import './UploadStatusCard.css';

export default function UploadStatusCard() {
  const { items, activeItems, completedItems, errorItems, hasActivity, cancelItem, removeItem, retryItem, clearDone, STATUS } = useMediaUpload();
  const [collapsed, setCollapsed] = useState(false);
  const [visible, setVisible] = useState(false);

  const relevantItems = items.filter((it) => it.status !== STATUS.CANCELLED);
  const showCard = relevantItems.length > 0;

  // Animate in/out
  useEffect(() => {
    if (showCard) {
      setVisible(true);
      setCollapsed(false);
    } else {
      setVisible(false);
    }
  }, [showCard]);

  // Auto-dismiss completed items after 4s if no active uploads remain
  useEffect(() => {
    if (activeItems.length === 0 && completedItems.length > 0 && errorItems.length === 0) {
      const timer = setTimeout(() => clearDone(), 4000);
      return () => clearTimeout(timer);
    }
  }, [activeItems.length, completedItems.length, errorItems.length, clearDone]);

  if (!visible) return null;

  const totalActive = activeItems.length;
  const totalDone = completedItems.length;
  const totalError = errorItems.length;

  const statusLabel = totalActive > 0
    ? `Subiendo ${totalActive} archivo${totalActive !== 1 ? 's' : ''}...`
    : totalError > 0
      ? `${totalError} error${totalError !== 1 ? 'es' : ''}`
      : `${totalDone} subido${totalDone !== 1 ? 's' : ''}`;

  return (
    <div className={`usc-card ${collapsed ? 'usc-card--collapsed' : ''}`}>
      {/* Header — always visible */}
      <div className="usc-header" onClick={() => setCollapsed(!collapsed)}>
        <div className="usc-header-left">
          {totalActive > 0 && (
            <div className="usc-spinner">
              <svg viewBox="0 0 20 20" width="16" height="16">
                <circle cx="10" cy="10" r="8" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
                <circle cx="10" cy="10" r="8" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2"
                  strokeLinecap="round" strokeDasharray="30 20" />
              </svg>
            </div>
          )}
          {totalActive === 0 && totalError === 0 && (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="rgba(74,222,128,0.8)" strokeWidth="1.5" />
              <path d="M5.5 8.2l1.8 1.8 3.2-3.5" stroke="rgba(74,222,128,0.8)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {totalActive === 0 && totalError > 0 && (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="rgba(239,68,68,0.8)" strokeWidth="1.5" />
              <path d="M6 6l4 4M10 6l-4 4" stroke="rgba(239,68,68,0.8)" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          )}
          <span className="usc-status-label">{statusLabel}</span>
        </div>
        <button className="usc-chevron" aria-label={collapsed ? 'Expandir' : 'Minimizar'}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d={collapsed ? 'M4 8.5l3-3 3 3' : 'M4 5.5l3 3 3-3'} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Items list */}
      {!collapsed && (
        <div className="usc-items">
          {relevantItems.map((item) => (
            <div key={item.queueId} className="usc-item">
              <div className="usc-item-thumb">
                {item.thumbnailUrl ? (
                  <img src={item.thumbnailUrl} alt="" />
                ) : (
                  <div className="usc-item-thumb-placeholder">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M8 5.14v13.72a1 1 0 001.5.86l11.35-6.86a1 1 0 000-1.72L9.5 4.28A1 1 0 008 5.14z" fill="currentColor"/>
                    </svg>
                  </div>
                )}
                {/* Progress ring overlay for active items */}
                {(item.status === STATUS.UPLOADING || item.status === STATUS.COMPRESSING) && (
                  <svg className="usc-item-ring" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
                    <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeDasharray={94.2}
                      strokeDashoffset={94.2 * (1 - (item.progress || 0) / 100)}
                      transform="rotate(-90 18 18)" />
                  </svg>
                )}
              </div>

              <div className="usc-item-info">
                <span className="usc-item-name">{item.file.name}</span>
                <span className="usc-item-detail">
                  {item.status === STATUS.QUEUED && 'En cola'}
                  {item.status === STATUS.COMPRESSING && 'Optimizando...'}
                  {item.status === STATUS.UPLOADING && `${item.progress}%`}
                  {item.status === STATUS.DONE && 'Listo'}
                  {item.status === STATUS.ERROR && (item.error || 'Error')}
                </span>
              </div>

              <div className="usc-item-actions">
                {item.status === STATUS.ERROR && (
                  <button className="usc-item-retry" onClick={() => retryItem(item.queueId)} aria-label="Reintentar">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                      <path d="M2 8a6 6 0 0110.5-4M14 2v4h-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M14 8a6 6 0 01-10.5 4M2 14v-4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                )}
                {(item.status === STATUS.QUEUED || item.status === STATUS.COMPRESSING || item.status === STATUS.UPLOADING) && (
                  <button className="usc-item-cancel" onClick={() => cancelItem(item.queueId)} aria-label="Cancelar">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    </svg>
                  </button>
                )}
                {(item.status === STATUS.DONE || item.status === STATUS.ERROR) && (
                  <button className="usc-item-dismiss" onClick={() => removeItem(item.queueId)} aria-label="Descartar">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
