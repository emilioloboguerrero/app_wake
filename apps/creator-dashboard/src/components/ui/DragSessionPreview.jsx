import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './DragSessionPreview.css';

/**
 * Floating drag preview that follows the cursor during native HTML drag.
 * Renders a small card with the session image (if any) and title.
 *
 * Usage: pass `session` (object with title/image_url) while dragging,
 * set to `null` on dragEnd.
 */
const DragSessionPreview = ({ session }) => {
  const elRef = useRef(null);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!session) return;

    const onDrag = (e) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        if (e.clientX === 0 && e.clientY === 0) return; // browser fires (0,0) at drag end
        if (elRef.current) {
          elRef.current.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`;
        }
      });
    };

    document.addEventListener('dragover', onDrag);
    return () => {
      document.removeEventListener('dragover', onDrag);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [session]);

  if (!session) return null;

  const title = session.title || session.session_name || session.name || 'Sesion';
  const imageUrl = session.image_url ?? null;

  return createPortal(
    <div
      ref={elRef}
      className="drag-session-preview"
      style={{
        transform: 'translate(-9999px, -9999px)',
        ...(imageUrl ? {
          backgroundImage: `linear-gradient(to bottom, rgba(26,26,26,0.4), rgba(26,26,26,0.85)), url(${imageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } : {}),
      }}
    >
      <span className="drag-session-preview-title">{title}</span>
    </div>,
    document.body
  );
};

export default DragSessionPreview;
