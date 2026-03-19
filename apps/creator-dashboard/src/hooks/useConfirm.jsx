import { useState } from 'react';
import './useConfirm.css';

export default function useConfirm() {
  const [state, setState] = useState(null);

  const confirm = (message) => new Promise((resolve) => {
    setState({ message, resolve });
  });

  const handleConfirm = () => {
    state?.resolve(true);
    setState(null);
  };

  const handleCancel = () => {
    state?.resolve(false);
    setState(null);
  };

  const ConfirmModal = state ? (
    <div className="confirm-overlay" onClick={handleCancel}>
      <div className="confirm-modal" onClick={e => e.stopPropagation()}>
        <p className="confirm-message">{state.message}</p>
        <div className="confirm-actions">
          <button className="confirm-btn confirm-btn--cancel" onClick={handleCancel}>Cancelar</button>
          <button className="confirm-btn confirm-btn--danger" onClick={handleConfirm}>Confirmar</button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, ConfirmModal };
}
