import React, { useEffect, useState } from 'react';
import { requestMagicLink } from '../services/magicLinkService';
import './AccessRecoveryScreen.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AccessRecoveryScreen() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | sent | error
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Acceder a tu cuenta — Wake';
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setError('Ingresa un correo válido');
      setState('error');
      return;
    }
    setState('sending');
    setError('');
    const result = await requestMagicLink(trimmed);
    if (result.success) {
      setState('sent');
    } else {
      setError(result.error || 'No pudimos enviar el enlace. Intentalo de nuevo.');
      setState('error');
    }
  };

  return (
    <>
      <div className="access-recovery-screen">
        <article className="ar-card">
          {state === 'sent' ? (
            <>
              <div className="ar-icon" aria-hidden="true">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <h1 className="ar-title">Revisá tu correo</h1>
              <p className="ar-message">
                Si tu correo está registrado, te enviamos un enlace para entrar a tu cuenta.
                El enlace funciona en cualquier dispositivo.
              </p>
              <p className="ar-spam-note">
                ¿No lo ves? Revisá tu carpeta de <strong>spam</strong> o <strong>promociones</strong>.
                Si pasaron más de 5 minutos, podés{' '}
                <button
                  type="button"
                  className="ar-link-button"
                  onClick={() => { setState('idle'); }}
                >
                  pedir otro
                </button>.
              </p>
            </>
          ) : (
            <>
              <h1 className="ar-title">Acceder a tu cuenta</h1>
              <p className="ar-message">
                Te enviamos un enlace para entrar sin contraseña. Tu correo es tu llave —
                guardálo y siempre podés volver a este lugar para recibir uno nuevo.
              </p>
              <form className="ar-form" onSubmit={handleSubmit} noValidate>
                <label htmlFor="ar-email" className="ar-label">Correo electrónico</label>
                <input
                  id="ar-email"
                  type="email"
                  className="ar-input"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setState('idle'); setError(''); }}
                  placeholder="tu@correo.com"
                  autoComplete="email"
                  inputMode="email"
                  required
                  disabled={state === 'sending'}
                />
                {state === 'error' && error ? (
                  <p className="ar-error">{error}</p>
                ) : null}
                <button
                  type="submit"
                  className="ar-submit"
                  disabled={state === 'sending' || !email}
                >
                  {state === 'sending' ? 'Enviando…' : 'Enviarme el enlace'}
                </button>
              </form>
            </>
          )}

          <p className="ar-help">
            ¿Necesitás ayuda? <a href="mailto:soporte@wakelab.co">soporte@wakelab.co</a>
          </p>
        </article>
      </div>
    </>
  );
}
