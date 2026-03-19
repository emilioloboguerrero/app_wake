import React, { useState, useEffect } from 'react';
import './PaymentModal.css';

const PaymentModal = ({ visible, onClose, checkoutURL, onPaymentSuccess, onPaymentError }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (visible && checkoutURL) {
      setLoading(true);
      setError(null);
    }
  }, [visible, checkoutURL]);

  // Listen for postMessage from iframe (if Mercado Pago sends messages)
  useEffect(() => {
    const handleMessage = (event) => {
      // Only process messages from Mercado Pago domains
      if (event.origin.includes('mercadopago') || event.origin.includes('mercadolibre')) {
        
        if (event.data?.type === 'payment_success' || event.data?.status === 'approved') {
          onPaymentSuccess?.({ url: checkoutURL, message: event.data });
          onClose?.();
        } else if (event.data?.type === 'payment_error' || event.data?.status === 'rejected') {
          onPaymentError?.({ url: checkoutURL, message: event.data });
          onClose?.();
        }
      }
    };

    if (visible) {
      window.addEventListener('message', handleMessage);
      return () => {
        window.removeEventListener('message', handleMessage);
      };
    }
  }, [visible, checkoutURL, onPaymentSuccess, onPaymentError, onClose]);

  // Poll for URL changes in iframe (fallback method)
  useEffect(() => {
    if (!visible || !checkoutURL) return;

    const iframe = document.querySelector('.payment-modal-iframe');
    if (!iframe) return;

    const checkIframeURL = () => {
      try {
        // Note: We can't access iframe.contentWindow.location due to CORS
        // This is a limitation - we'll rely on postMessage or user closing modal after payment
        // For now, we'll just log that we're checking
      } catch (error) {
        // CORS error - expected
      }
    };

    const interval = setInterval(checkIframeURL, 1000);
    return () => clearInterval(interval);
  }, [visible, checkoutURL]);

  const handleLoad = () => {
    setLoading(false);
    setError(null);
  };

  const handleError = () => {
    console.error('❌ Payment modal error');
    setError('Error al cargar la página de pago');
    setLoading(false);
  };

  if (!visible || !checkoutURL) {
    return null;
  }

  return (
    <div className="payment-modal-overlay" onClick={onClose}>
      <div className="payment-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="payment-modal-header">
          <div className="payment-modal-header-spacer" />
          <div className="payment-modal-header-branding">
            <img 
              src="/mercado-pago-logo.png" 
              alt="Mercado Pago" 
              className="payment-modal-logo"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
          </div>
          <button
            className="payment-modal-close-button"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="payment-modal-content">
          {loading && (
            <div className="payment-modal-loading">
              <div className="payment-modal-loading-content">
                <div className="payment-modal-spinner"></div>
                <p className="payment-modal-loading-text">Procesando pago seguro...</p>
                <p className="payment-modal-loading-subtext">Espera mientras cargamos tu información</p>
              </div>
            </div>
          )}

          {error && (
            <div className="payment-modal-error">
              <p className="payment-modal-error-text">{error}</p>
              <button
                className="payment-modal-retry-button"
                onClick={() => {
                  setError(null);
                  setLoading(true);
                }}
              >
                Reintentar
              </button>
            </div>
          )}

          <iframe
            src={checkoutURL}
            className="payment-modal-iframe"
            onLoad={handleLoad}
            onError={handleError}
            title="Mercado Pago Checkout"
            allow="payment"
            sandbox="allow-forms allow-scripts allow-same-origin allow-top-navigation allow-popups allow-popups-to-escape-sandbox"
          />
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;

