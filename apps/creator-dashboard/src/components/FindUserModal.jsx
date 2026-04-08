import { useState, useEffect } from 'react';
import Modal from './Modal';
import './FindUserModal.css';

const FindUserModal = ({
  isOpen,
  onClose,
  onUserFound,
  onLookup,
  onViewClient,
  clients = [],
  isLookingUp = false,
  error = null,
}) => {
  const [email, setEmail] = useState('');
  const [foundUser, setFoundUser] = useState(null);

  useEffect(() => {
    if (!isOpen) { setEmail(''); setFoundUser(null); }
  }, [isOpen]);

  const handleClose = () => { setEmail(''); setFoundUser(null); onClose(); };

  const handleLookup = async () => {
    if (!email.trim()) return;
    const result = await onLookup(email.trim());
    if (result) setFoundUser(result);
  };

  const handleReset = () => { setEmail(''); setFoundUser(null); };

  const handleContinue = () => {
    if (foundUser) { onUserFound(foundUser); handleClose(); }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      foundUser ? handleContinue() : handleLookup();
    }
  };

  const existingClient = foundUser
    ? clients.find((c) => c.clientUserId === foundUser.userId)
    : null;
  const isAlready = !!existingClient;

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Agregar cliente">
      <div className="fum">
        {!foundUser ? (
          <>
            <p className="fum__hint">
              Busca por email o nombre de usuario. El usuario debe estar registrado en Wake.
            </p>
            <div className="fum__input-row">
              <input
                className="fum__input"
                type="text"
                placeholder="juan@ejemplo.com o @juanperez"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
              />
            </div>
            {error && <p className="fum__error">{error}</p>}
            <div className="fum__actions">
              <button type="button" className="fum__btn fum__btn--ghost" onClick={handleClose} disabled={isLookingUp}>
                Cancelar
              </button>
              <button
                type="button"
                className="fum__btn fum__btn--primary"
                onClick={handleLookup}
                disabled={!email.trim() || isLookingUp}
              >
                {isLookingUp ? (
                  <span className="fum__spinner" />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
                    <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
                {isLookingUp ? 'Buscando…' : 'Buscar'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="fum__result">
              <div className="fum__avatar">
                {foundUser.photoURL ? (
                  <img src={foundUser.photoURL} alt="" className="fum__avatar-img" />
                ) : (
                  <span className="fum__avatar-initial">
                    {(foundUser.displayName || foundUser.email || '?').charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="fum__result-info">
                <p className="fum__result-name">
                  {foundUser.displayName || foundUser.username || 'Sin nombre'}
                </p>
                {foundUser.email && (
                  <p className="fum__result-email">{foundUser.email}</p>
                )}
              </div>
              {isAlready && (
                <span className="fum__badge fum__badge--existing">Ya es tu cliente</span>
              )}
            </div>

            {isAlready && (
              <p className="fum__info-box">
                Este usuario ya es tu cliente. Puedes asignarle otro programa desde su perfil.
              </p>
            )}

            {error && <p className="fum__error">{error}</p>}

            <div className="fum__actions">
              <button type="button" className="fum__btn fum__btn--ghost" onClick={handleReset}>
                Buscar otro
              </button>
              {isAlready ? (
                onViewClient && existingClient && (
                  <button
                    type="button"
                    className="fum__btn fum__btn--primary"
                    onClick={() => { handleClose(); onViewClient(existingClient.id); }}
                  >
                    Ver cliente
                  </button>
                )
              ) : (
                <button type="button" className="fum__btn fum__btn--primary" onClick={handleContinue}>
                  Continuar
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default FindUserModal;
