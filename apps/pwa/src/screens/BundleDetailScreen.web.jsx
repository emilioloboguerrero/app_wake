import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../utils/apiClient';
import { useAuth } from '../contexts/AuthContext';
import purchaseService from '../services/purchaseService';
import analyticsService from '../services/analyticsService';
import logger from '../utils/logger';
import LoadingScreen from './LoadingScreen';
import BundleCoverWeb from '../components/bundles/BundleCover.web';

const formatCOP = (n) => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  return `$${n.toLocaleString('es-CO')} COP`;
};

const resolveScalar = (raw, preferredKey) => {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  if (raw && typeof raw === 'object') {
    const pref = raw[preferredKey];
    if (typeof pref === 'number' && Number.isFinite(pref) && pref > 0) return pref;
    for (const v of Object.values(raw)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
    }
  }
  return null;
};

const BundleDetailScreen = () => {
  const { bundleId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [checkoutState, setCheckoutState] = useState({ kind: null, key: null, loading: false, error: null });
  // Proactive subscription email step: { email, useCustom, error, submitting } or null.
  const [emailStep, setEmailStep] = useState(null);

  const { data: bundle, isLoading, error } = useQuery({
    queryKey: ['bundle', bundleId],
    queryFn: async () => {
      const r = await apiClient.get(`/bundles/${bundleId}`);
      return r?.data;
    },
    enabled: !!bundleId,
    staleTime: 60 * 1000,
  });

  if (isLoading) return <LoadingScreen />;
  if (error || !bundle) {
    return (
      <div style={styles.errorContainer}>
        <p style={styles.errorText}>Bundle no encontrado</p>
        <button style={styles.primaryBtn} onClick={() => navigate(-1)}>Volver</button>
      </div>
    );
  }

  const otpPrice = resolveScalar(bundle.pricing?.otp, 'yearly');
  const subPrice = resolveScalar(bundle.pricing?.subscription, 'monthly');
  const hasOtp = otpPrice !== null;
  const hasSub = subPrice !== null;

  const handleBuy = async (kind) => {
    if (!user) {
      navigate('/login');
      return;
    }
    // Subscriptions: confirm the Mercado Pago email BEFORE creating the
    // preapproval (it binds to that email and can't be re-bound). One-time
    // payments skip this.
    if (kind === 'sub') {
      setEmailStep({ email: user?.email || '', useCustom: false, error: null, submitting: false });
      try {
        analyticsService.track('subscription.email_step.shown', { bundle_id: bundleId, surface: 'pwa_web' });
      } catch {}
      logger.info('[subscription] email step shown (bundle)', { bundleId });
      return;
    }
    setCheckoutState({ kind, loading: true, error: null });
    try {
      const result = await purchaseService.prepareBundlePurchase(bundleId);
      if (result.success && result.checkoutURL) {
        window.location.href = result.checkoutURL;
      } else {
        setCheckoutState({
          kind, loading: false,
          error: result.error || 'No pudimos iniciar el pago.',
        });
      }
    } catch (err) {
      setCheckoutState({ kind, loading: false, error: err.message || 'Error' });
    }
  };

  const confirmSubEmail = async () => {
    if (!emailStep) return;
    const chosen = (emailStep.email || '').trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(chosen)) {
      setEmailStep((s) => ({ ...s, error: 'Correo inválido.' }));
      return;
    }
    const accountEmail = (user?.email || '').trim();
    const emailsDiffer = chosen.toLowerCase() !== accountEmail.toLowerCase();
    try {
      analyticsService.track('subscription.email_step.choice', {
        bundle_id: bundleId,
        surface: 'pwa_web',
        choice: emailStep.useCustom ? 'custom' : 'account',
        emails_differ: emailsDiffer,
      });
    } catch {}
    logger.info('[subscription] email step choice (bundle)', {
      bundleId, choice: emailStep.useCustom ? 'custom' : 'account', emailsDiffer,
    });
    setEmailStep((s) => ({ ...s, submitting: true, error: null }));
    try {
      const result = await purchaseService.prepareBundleSubscription(bundleId, chosen, 'pwa_web');
      if (result.success && result.checkoutURL) {
        try {
          analyticsService.track('subscription.checkout.redirected', {
            bundle_id: bundleId, surface: 'pwa_web', subscription_id: result.subscriptionId || null,
          });
        } catch {}
        logger.info('[subscription] checkout redirected (bundle)', {
          bundleId, subscriptionId: result.subscriptionId || null,
        });
        window.location.href = result.checkoutURL;
        return;
      }
      if (result.requiresAlternateEmail) {
        setEmailStep((s) => ({ ...s, useCustom: true, submitting: false, error: result.error || 'Ingresa tu correo de Mercado Pago.' }));
      } else {
        setEmailStep((s) => ({ ...s, submitting: false, error: result.error || 'No pudimos iniciar el pago.' }));
      }
    } catch (err) {
      setEmailStep((s) => ({ ...s, submitting: false, error: err.message || 'Error' }));
    }
  };

  const coverImages = useMemo(() => {
    if (Array.isArray(bundle.coverImages) && bundle.coverImages.length > 0) return bundle.coverImages;
    return (bundle.courses || [])
      .map((c) => c.image_url)
      .filter(Boolean)
      .slice(0, 4);
  }, [bundle.coverImages, bundle.courses]);

  return (
    <div style={styles.container}>
      <div style={styles.hero}>
        <BundleCoverWeb imageUrls={coverImages} size="header" title={bundle.title} />
      </div>

      <div style={styles.content}>
        <button style={styles.backBtn} onClick={() => navigate(-1)}>← Volver</button>

        <h1 style={styles.title}>{bundle.title}</h1>
        {bundle.description && <p style={styles.description}>{bundle.description}</p>}

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Programas incluidos ({bundle.courses?.length ?? 0})</h2>
          <div style={styles.courseList}>
            {(bundle.courses ?? []).map((c) => (
              <div key={c.id} style={styles.courseRow}>
                {c.image_url ? (
                  <img src={c.image_url} alt={c.title} style={styles.courseImg} />
                ) : (
                  <div style={styles.courseImgPlaceholder} />
                )}
                <div style={styles.courseMeta}>
                  <p style={styles.courseTitle}>{c.title || 'Programa'}</p>
                  {c.discipline && <p style={styles.courseDiscipline}>{c.discipline}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>

        {(hasOtp || hasSub) && (
          <section style={styles.section}>
            <div style={styles.priceGrid}>
              {hasOtp && (
                <button
                  style={styles.priceBtn}
                  onClick={() => handleBuy('otp')}
                  disabled={checkoutState.loading}
                >
                  <span style={styles.priceLabel}>Pago único — 1 año</span>
                  <span style={styles.priceValue}>{formatCOP(otpPrice)}</span>
                </button>
              )}
              {hasSub && (
                <button
                  style={styles.priceBtnPrimary}
                  onClick={() => handleBuy('sub')}
                  disabled={checkoutState.loading}
                >
                  <span style={styles.priceLabel}>Suscripción mensual</span>
                  <span style={styles.priceValue}>{formatCOP(subPrice)} / mes</span>
                </button>
              )}
            </div>
          </section>
        )}

        {checkoutState.error && (
          <div style={styles.errorBanner}>{checkoutState.error}</div>
        )}
        {checkoutState.loading && (
          <div style={styles.loadingBanner}>Preparando el pago…</div>
        )}
      </div>

      {emailStep && (
        <div style={styles.modalOverlay} onClick={() => setEmailStep(null)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Confirma tu correo de Mercado Pago</h3>
            <p style={styles.modalDesc}>
              Usa este mismo correo al iniciar sesión en Mercado Pago para completar tu suscripción.
            </p>
            {emailStep.useCustom ? (
              <input
                style={styles.modalInput}
                type="email"
                placeholder="correo@mercadopago.com"
                value={emailStep.email}
                onChange={(e) => setEmailStep((s) => ({ ...s, email: e.target.value, error: null }))}
                autoFocus
              />
            ) : (
              <div style={styles.emailCard}>
                <span style={styles.emailCardLabel}>Tu correo</span>
                <span style={styles.emailCardValue}>{emailStep.email}</span>
              </div>
            )}
            {emailStep.error && <p style={styles.modalError}>{emailStep.error}</p>}
            <div style={styles.modalButtons}>
              <button style={styles.modalCancel} onClick={() => setEmailStep(null)} disabled={emailStep.submitting}>
                Cancelar
              </button>
              <button style={styles.modalConfirm} onClick={confirmSubEmail} disabled={emailStep.submitting}>
                {emailStep.submitting ? 'Procesando…' : (emailStep.useCustom ? 'Continuar' : 'Continuar con este correo')}
              </button>
            </div>
            {!emailStep.useCustom && (
              <button
                style={styles.modalSecondary}
                onClick={() => setEmailStep((s) => ({ ...s, useCustom: true, email: '', error: null }))}
              >
                Usar otro correo de Mercado Pago
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    backgroundColor: '#1a1a1a',
    color: '#fff',
    minHeight: '100vh',
  },
  hero: {
    width: '100%',
    padding: '48px 20px 24px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    background: 'radial-gradient(circle at 50% 0%, rgba(255,255,255,0.05) 0%, rgba(26,26,26,1) 70%)',
  },
  content: {
    padding: '24px 20px 60px',
    maxWidth: 720,
    margin: '0 auto',
  },
  backBtn: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    cursor: 'pointer',
    padding: '4px 0 16px',
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    margin: '0 0 8px',
  },
  description: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    lineHeight: 1.55,
    margin: '0 0 24px',
  },
  section: {
    marginTop: 32,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.75)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    margin: '0 0 12px',
  },
  courseList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  courseRow: {
    display: 'flex',
    gap: 12,
    padding: 10,
    background: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    alignItems: 'center',
  },
  courseImg: {
    width: 56,
    height: 56,
    objectFit: 'cover',
    borderRadius: 8,
  },
  courseImgPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 8,
    background: 'rgba(255,255,255,0.06)',
  },
  courseMeta: {
    flex: 1,
  },
  courseTitle: {
    fontSize: 14,
    fontWeight: 500,
    margin: 0,
    color: '#fff',
  },
  courseDiscipline: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    margin: '4px 0 0',
  },
  priceGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 10,
  },
  priceBtn: {
    padding: '14px 16px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
    transition: 'background 0.15s ease',
  },
  priceBtnPrimary: {
    padding: '14px 16px',
    background: 'rgba(255,255,255,0.92)',
    border: '1px solid rgba(255,255,255,0.92)',
    borderRadius: 10,
    color: '#111',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
    transition: 'background 0.15s ease',
    fontWeight: 600,
  },
  priceLabel: {
    fontSize: 12,
    color: 'inherit',
    opacity: 0.7,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  priceValue: {
    fontSize: 16,
    fontWeight: 600,
  },
  primaryBtn: {
    padding: '10px 20px',
    background: '#007AFF',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    cursor: 'pointer',
  },
  errorContainer: {
    background: '#1a1a1a',
    color: '#fff',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  errorText: {
    color: 'rgba(255,255,255,0.7)',
  },
  errorBanner: {
    marginTop: 16,
    padding: 12,
    background: 'rgba(255,80,80,0.1)',
    border: '1px solid rgba(255,80,80,0.3)',
    borderRadius: 10,
    color: 'rgba(255,180,180,0.95)',
    fontSize: 13,
  },
  loadingBanner: {
    marginTop: 16,
    padding: 12,
    background: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    textAlign: 'center',
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: 20,
  },
  modalCard: {
    background: '#222',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 380,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 700,
    margin: '0 0 8px',
  },
  modalDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    margin: '0 0 16px',
    lineHeight: 1.5,
  },
  modalInput: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px 14px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 10,
    color: '#fff',
    fontSize: 15,
  },
  emailCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '12px 14px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10,
  },
  emailCardLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'rgba(255,255,255,0.4)',
  },
  emailCardValue: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.95)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  modalError: {
    color: 'rgba(255,180,180,0.95)',
    fontSize: 13,
    margin: '12px 0 0',
  },
  modalButtons: {
    display: 'flex',
    gap: 10,
    marginTop: 20,
  },
  modalCancel: {
    flex: 1,
    padding: '12px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 100,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  modalConfirm: {
    flex: 2,
    padding: '12px',
    background: 'rgba(255,255,255,0.92)',
    border: 'none',
    borderRadius: 100,
    color: '#111',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  },
  modalSecondary: {
    display: 'block',
    width: '100%',
    marginTop: 14,
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
};

export default BundleDetailScreen;
