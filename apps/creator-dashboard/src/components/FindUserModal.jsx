import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import Input from './Input';
import './PropagateChangesModal.css';
import './FindUserModal.css';

/**
 * Modal for finding a user by email or username (step 1 of add client flow).
 * Uses same styling as PropagateChangesModal / PropagateNavigateModal.
 * If the found user is already a client, shows "already exists" and does not allow continuing.
 */
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
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [lookedUpUser, setLookedUpUser] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setEmailOrUsername('');
      setLookedUpUser(null);
    }
  }, [isOpen]);

  const handleClose = () => {
    setEmailOrUsername('');
    setLookedUpUser(null);
    onClose();
  };

  const handleLookup = async () => {
    if (!emailOrUsername.trim()) return;
    const result = await onLookup(emailOrUsername.trim());
    if (result) {
      setLookedUpUser(result);
    }
  };

  const handleSearchAnother = () => {
    setEmailOrUsername('');
    setLookedUpUser(null);
  };

  const handleContinue = () => {
    if (lookedUpUser) {
      onUserFound(lookedUpUser);
      handleClose();
    }
  };

  const existingClient = lookedUpUser
    ? clients.find((c) => c.clientUserId === lookedUpUser.userId)
    : null;
  const isAlreadyClient = !!existingClient;

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (lookedUpUser) {
        handleContinue();
      } else {
        handleLookup();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Buscar cliente"
      containerClassName="propagate-modal-container"
      contentClassName="propagate-modal-content-wrapper"
    >
      <div className="propagate-modal-content">
        <div className="find-user-modal-body">
          <div className="propagate-modal-card find-user-modal-card">
            {!lookedUpUser ? (
              <>
                <label className="find-user-modal-label">
                  Email o nombre de usuario <span className="find-user-modal-required">*</span>
                </label>
                <div className="find-user-modal-row">
                  <Input
                    placeholder="Ej: juan@ejemplo.com o @juanperez"
                    value={emailOrUsername}
                    onChange={(e) => setEmailOrUsername(e.target.value)}
                    onKeyDown={handleKeyDown}
                    type="text"
                    light={true}
                  />
                  <button
                    type="button"
                    className="propagate-modal-btn propagate-modal-btn-propagate find-user-modal-btn"
                    onClick={handleLookup}
                    disabled={!emailOrUsername.trim() || isLookingUp}
                  >
                    {isLookingUp ? 'Buscando…' : 'Buscar'}
                  </button>
                </div>
                <p className="find-user-modal-hint">
                  Ingresa el email o el nombre de usuario del cliente en la app. El usuario debe estar registrado.
                </p>
              </>
            ) : isAlreadyClient ? (
              <div className="find-user-modal-already-exists">
                <p className="find-user-modal-already-exists-label">Usuario encontrado</p>
                <p className="find-user-modal-already-exists-name">
                  {lookedUpUser.displayName || lookedUpUser.username || 'Sin nombre'}
                  {lookedUpUser.email && (
                    <span className="find-user-modal-already-exists-email"> ({lookedUpUser.email})</span>
                  )}
                </p>
                <p className="find-user-modal-already-exists-message">
                  Este usuario ya es tu cliente. Puedes asignarle otro programa desde su perfil.
                </p>
              </div>
            ) : (
              <div className="find-user-modal-success">
                <p className="find-user-modal-success-label">Usuario encontrado</p>
                <p className="find-user-modal-success-name">
                  {lookedUpUser.displayName || lookedUpUser.username || 'Sin nombre'}
                  {lookedUpUser.email && (
                    <span className="find-user-modal-success-email"> ({lookedUpUser.email})</span>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="find-user-modal-error">
            <p>{error}</p>
          </div>
        )}

        <div className="propagate-modal-footer">
          {lookedUpUser ? (
            <>
              <button
                type="button"
                className="propagate-modal-btn propagate-modal-btn-dont"
                onClick={handleSearchAnother}
              >
                Buscar otro
              </button>
              {isAlreadyClient ? (
                onViewClient && existingClient && (
                  <button
                    type="button"
                    className="propagate-modal-btn propagate-modal-btn-propagate"
                    onClick={() => {
                      handleClose();
                      onViewClient(existingClient.id);
                    }}
                  >
                    Ver cliente
                  </button>
                )
              ) : (
                <button
                  type="button"
                  className="propagate-modal-btn propagate-modal-btn-propagate"
                  onClick={handleContinue}
                >
                  Continuar
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              className="propagate-modal-btn propagate-modal-btn-dont"
              onClick={handleClose}
              disabled={isLookingUp}
            >
              Cancelar
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default FindUserModal;
