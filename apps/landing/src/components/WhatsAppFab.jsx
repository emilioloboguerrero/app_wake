// Floating WhatsApp support pill — reused across the public storefront and
// program pages. Neutral white-tone glass, fixed bottom-right, kept off any
// page accent so it never competes with the primary CTA. Sits below AuthModal.
import React from 'react';
import { whatsappUrl } from '../config/support';
import './WhatsAppFab.css';

export default function WhatsAppFab({ prefill = 'Hola, necesito ayuda con Wake.' }) {
  return (
    <a
      className="wa-fab"
      href={whatsappUrl(prefill)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Soporte por WhatsApp"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
      <span>Ayuda</span>
    </a>
  );
}
