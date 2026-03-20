import React, { useState } from 'react';
import './LegalDocumentsScreen.css';

// Public Firebase Storage URL builder — no token needed, storage rules allow public read on /legal-documents/*
const STORAGE_BUCKET = 'wolf-20b8b.firebasestorage.app';
const buildStorageUrl = (path) =>
  `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(path)}?alt=media`;

const LEGAL_DOCUMENTS = {
  terms: {
    title: 'Términos y Condiciones',
    description: 'Nuestros términos y condiciones para el uso de la aplicación de fitness Wake.',
    url: buildStorageUrl('legal/1 - TE\u0301RMINOS Y CONDICIONES DE USO WAKE.pdf'),
    icon: '📄',
    lastUpdated: 'Octubre 2025'
  },
  privacy: {
    title: 'Política de Tratamiento de Datos Personales',
    description: 'Cómo recopilamos, usamos y protegemos tu información personal.',
    url: buildStorageUrl('legal/2 - POLI\u0301TICA DE TRATAMIENTO DE DATOS PERSONALES WAKE.pdf'),
    icon: '🔒',
    lastUpdated: 'Octubre 2025'
  },
  refund: {
    title: 'Política de Reembolsos, Retracto y Reversión de Pago',
    description: 'Nuestra política respecto a reembolsos y cancelaciones.',
    url: buildStorageUrl('legal/3- POLI\u0301TICA DE REEMBOLSOS, RETRACTO Y REVERSIO\u0301N DE PAGO WAKE.pdf'),
    icon: '💰',
    lastUpdated: 'Octubre 2025'
  }
};

const LegalDocumentsScreen = () => {
  const [selectedDocument, setSelectedDocument] = useState(null);

  const handleDocumentClick = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleViewInPage = (key, url) => {
    setSelectedDocument({ key, url });
  };

  const handleCloseViewer = () => {
    setSelectedDocument(null);
  };

  return (
    <div className="legal-documents-screen">
      <div className="legal-documents-container">
        <div className="legal-documents-header">
          <h1 className="legal-documents-title">Documentos Legales</h1>
          <p className="legal-documents-subtitle">
            Bienvenido al centro de documentación legal de Wake. Aquí puedes encontrar todas nuestras políticas importantes y términos de uso.
          </p>
        </div>

        <div className="legal-documents-grid">
          {Object.entries(LEGAL_DOCUMENTS).map(([key, document]) => (
            <div key={key} className="legal-document-card">
              <div className="legal-document-icon">{document.icon}</div>
              <h2 className="legal-document-title">{document.title}</h2>
              <p className="legal-document-description">{document.description}</p>
              <div className="legal-document-date">
                <span className="legal-document-date-label">Última actualización:</span>
                <span className="legal-document-date-value">{document.lastUpdated}</span>
              </div>
              <div className="legal-document-actions">
                <button
                  className="legal-document-button legal-document-button-primary"
                  onClick={() => handleDocumentClick(document.url)}
                >
                  Ver PDF
                </button>
                <button
                  className="legal-document-button legal-document-button-secondary"
                  onClick={() => handleViewInPage(key, document.url)}
                >
                  Ver en página
                </button>
              </div>
            </div>
          ))}
        </div>

        {selectedDocument && (
          <div className="legal-document-viewer-overlay" onClick={handleCloseViewer}>
            <div className="legal-document-viewer" onClick={(e) => e.stopPropagation()}>
              <div className="legal-document-viewer-header">
                <div className="legal-document-viewer-title-container">
                  <h2 className="legal-document-viewer-title">
                    {LEGAL_DOCUMENTS[selectedDocument.key].title}
                  </h2>
                  <span className="legal-document-viewer-date">
                    Última actualización: {LEGAL_DOCUMENTS[selectedDocument.key].lastUpdated}
                  </span>
                </div>
                <button
                  className="legal-document-viewer-close"
                  onClick={handleCloseViewer}
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              </div>
              <div className="legal-document-viewer-content">
                <iframe
                  src={selectedDocument.url}
                  title={LEGAL_DOCUMENTS[selectedDocument.key].title}
                  className="legal-document-pdf-iframe"
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
          </div>
        )}

        <div className="legal-documents-footer">
          <p className="legal-documents-contact">
            Para preguntas sobre estos documentos, contáctanos en:
          </p>
          <p className="legal-documents-email">
            <strong>📩 emilioloboguerrero@gmail.com</strong>
          </p>
          <p className="legal-documents-update">
            <em>Última actualización: Octubre 2025</em>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LegalDocumentsScreen;
