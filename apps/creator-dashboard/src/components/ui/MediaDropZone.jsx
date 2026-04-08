import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMediaUpload } from '../../contexts/MediaUploadContext';
import './MediaDropZone.css';

/**
 * Wrap any media card/slot to enable drag-and-drop uploads.
 * Uses display:contents so it never breaks parent grid/flex layouts.
 * The drag overlay is portaled and positioned over the first child.
 */
export default function MediaDropZone({ onSelect, accept = '*', children, className = '', disabled = false }) {
  const [dragOver, setDragOver] = useState(false);
  const { enqueue } = useMediaUpload();
  const wrapRef = useRef(null);
  const childRef = useRef(null);
  const [overlayRect, setOverlayRect] = useState(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const acceptsFile = useCallback((file) => {
    if (accept === '*' || accept === 'image/*,video/*') return true;
    if (accept === 'image/*') return file.type.startsWith('image/');
    if (accept === 'video/*') return file.type.startsWith('video/');
    return true;
  }, [accept]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (disabled) return;

    const files = Array.from(e.dataTransfer.files).filter(acceptsFile);
    if (!files.length) return;

    enqueue([files[0]], (completedItem) => {
      if (onSelectRef.current) {
        onSelectRef.current({
          id: completedItem.id,
          url: completedItem.url,
          name: completedItem.name,
          contentType: completedItem.contentType,
        });
      }
    });
  }, [disabled, acceptsFile, enqueue]);

  const updateOverlayRect = useCallback(() => {
    if (childRef.current) {
      const rect = childRef.current.getBoundingClientRect();
      setOverlayRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setDragOver(true);
      updateOverlayRect();
    }
  }, [disabled, updateOverlayRect]);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    if (wrapRef.current && !wrapRef.current.contains(e.relatedTarget)) {
      setDragOver(false);
    }
  }, []);

  // Capture first child element ref
  useEffect(() => {
    if (wrapRef.current) {
      childRef.current = wrapRef.current.firstElementChild;
    }
  });

  return (
    <div
      ref={wrapRef}
      className={`mdz-wrap ${className}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {children}
      {dragOver && overlayRect && createPortal(
        <div
          className="mdz-overlay"
          style={{
            top: overlayRect.top,
            left: overlayRect.left,
            width: overlayRect.width,
            height: overlayRect.height,
            borderRadius: childRef.current ? getComputedStyle(childRef.current).borderRadius : '12px',
          }}
        >
          <div className="mdz-overlay-content">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M12 16V8m0 0l-3 3m3-3l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3 16v1a4 4 0 004 4h10a4 4 0 004-4v-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span>Soltar archivo</span>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
