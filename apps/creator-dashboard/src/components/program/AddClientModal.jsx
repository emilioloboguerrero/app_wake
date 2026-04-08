import { useState, useEffect, useCallback } from 'react';
import Modal from '../Modal';
import oneOnOneService from '../../services/oneOnOneService';
import './AddClientModal.css';

const STEP_SEARCH = 'search';
const STEP_FOUND = 'found';
const STEP_ASSIGNING = 'assigning';
const STEP_DONE = 'done';

export default function AddClientModal({
  isOpen,
  onClose,
  programId,
  programTitle,
  clients = [],
  onAssigned,
}) {
  const [step, setStep] = useState(STEP_SEARCH);
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [foundUser, setFoundUser] = useState(null);
  const [assignError, setAssignError] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setStep(STEP_SEARCH);
      setQuery('');
      setIsSearching(false);
      setSearchError(null);
      setFoundUser(null);
      setAssignError(null);
    }
  }, [isOpen]);

  const existingClient = foundUser
    ? clients.find((c) => c.clientUserId === foundUser.userId || c.userId === foundUser.userId)
    : null;

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    setSearchError(null);
    try {
      const result = await oneOnOneService.lookupUserByEmailOrUsername(query.trim());
      if (!result) {
        setSearchError('No encontramos un usuario con ese email o nombre de usuario.');
      } else {
        setFoundUser(result);
        setStep(STEP_FOUND);
      }
    } catch {
      setSearchError('No encontramos un usuario con ese email o nombre de usuario.');
    } finally {
      setIsSearching(false);
    }
  }, [query]);

  const handleAssign = useCallback(async () => {
    if (!foundUser?.userId || !programId) return;
    setStep(STEP_ASSIGNING);
    setAssignError(null);
    try {
      await oneOnOneService.addClientToProgram(null, foundUser.userId, programId);
      setStep(STEP_DONE);
      if (onAssigned) onAssigned();
    } catch (err) {
      setAssignError(err.message || 'Error al agregar el cliente.');
      setStep(STEP_FOUND);
    }
  }, [foundUser, programId, onAssigned]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (step === STEP_SEARCH && query.trim()) handleSearch();
    }
  };

  const handleBack = () => {
    setStep(STEP_SEARCH);
    setFoundUser(null);
    setAssignError(null);
  };

  if (!isOpen) return null;

  const name = foundUser?.displayName || foundUser?.username || foundUser?.email || 'Usuario';
  const initial = name.charAt(0).toUpperCase();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={step === STEP_DONE ? '' : 'Agregar cliente'}>
      <div className="acm">

        {/* ── Step: Search ──────────────────────────────────── */}
        {step === STEP_SEARCH && (
          <div className="acm__step acm__step--enter">
            <p className="acm__hint">
              Busca por email o nombre de usuario. El usuario debe tener cuenta en Wake.
            </p>

            <div className="acm__search-row">
              <div className="acm__search-input-wrap">
                <svg className="acm__search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
                  <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <input
                  className="acm__search-input"
                  type="text"
                  placeholder="juan@ejemplo.com o @juanperez"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setSearchError(null); }}
                  onKeyDown={handleKeyDown}
                  autoFocus
                  disabled={isSearching}
                />
              </div>
              <button
                type="button"
                className="acm__search-btn"
                onClick={handleSearch}
                disabled={!query.trim() || isSearching}
              >
                {isSearching ? <span className="acm__spinner" /> : 'Buscar'}
              </button>
            </div>

            {isSearching && (
              <div className="acm__searching">
                <div className="acm__searching-bar" />
                <p>Buscando usuario...</p>
              </div>
            )}

            {searchError && (
              <div className="acm__error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                  <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span>{searchError}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Step: Found ───────────────────────────────────── */}
        {step === STEP_FOUND && foundUser && (
          <div className="acm__step acm__step--enter">
            <div className="acm__profile">
              <div className="acm__profile-avatar">
                {foundUser.photoURL ? (
                  <img src={foundUser.photoURL} alt="" />
                ) : (
                  <span>{initial}</span>
                )}
              </div>
              <div className="acm__profile-info">
                <h3 className="acm__profile-name">{name}</h3>
                {foundUser.email && (
                  <p className="acm__profile-email">{foundUser.email}</p>
                )}
                {foundUser.username && foundUser.displayName && (
                  <p className="acm__profile-username">@{foundUser.username}</p>
                )}
              </div>
            </div>

            {/* User details */}
            <div className="acm__details">
              {foundUser.country && (
                <div className="acm__detail">
                  <span className="acm__detail-label">Pais</span>
                  <span className="acm__detail-value">{foundUser.country}</span>
                </div>
              )}
              {foundUser.city && (
                <div className="acm__detail">
                  <span className="acm__detail-label">Ciudad</span>
                  <span className="acm__detail-value">{foundUser.city}</span>
                </div>
              )}
              {foundUser.age && (
                <div className="acm__detail">
                  <span className="acm__detail-label">Edad</span>
                  <span className="acm__detail-value">{foundUser.age} anos</span>
                </div>
              )}
              {foundUser.gender && (
                <div className="acm__detail">
                  <span className="acm__detail-label">Genero</span>
                  <span className="acm__detail-value">{foundUser.gender}</span>
                </div>
              )}
            </div>

            {existingClient && (
              <div className="acm__already-badge">
                Ya es cliente en este programa
              </div>
            )}

            {/* Program assignment preview */}
            {!existingClient && (
              <div className="acm__assign-preview">
                <p className="acm__assign-label">Se asignara a</p>
                <div className="acm__assign-program">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M4 19.5A2.5 2.5 0 016.5 17H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>{programTitle || 'Este programa'}</span>
                </div>
              </div>
            )}

            {assignError && (
              <div className="acm__error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                  <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span>{assignError}</span>
              </div>
            )}

            <div className="acm__actions">
              <button type="button" className="acm__btn acm__btn--ghost" onClick={handleBack}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Buscar otro
              </button>
              {!existingClient && (
                <button type="button" className="acm__btn acm__btn--confirm" onClick={handleAssign}>
                  Agregar a {name.split(' ')[0]}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Step: Assigning ───────────────────────────────── */}
        {step === STEP_ASSIGNING && (
          <div className="acm__step acm__step--enter acm__loading-step">
            <div className="acm__loading-ring">
              <span className="acm__spinner acm__spinner--lg" />
            </div>
            <p className="acm__loading-text">Agregando a {name.split(' ')[0]}...</p>
          </div>
        )}

        {/* ── Step: Done ────────────────────────────────────── */}
        {step === STEP_DONE && (
          <div className="acm__step acm__step--enter acm__done-step">
            <div className="acm__done-check">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="acm__done-title">Cliente agregado</h3>
            <p className="acm__done-subtitle">
              {name} ahora es parte de <strong>{programTitle || 'este programa'}</strong>
            </p>
            <button type="button" className="acm__btn acm__btn--confirm" onClick={onClose}>
              Listo
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
