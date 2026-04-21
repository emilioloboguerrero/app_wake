import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../utils/apiClient';
import { useAuth } from '../contexts/AuthContext';
import purchaseService from '../services/purchaseService';
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
    setCheckoutState({ kind, loading: true, error: null });
    try {
      let result;
      if (kind === 'otp') {
        result = await purchaseService.prepareBundlePurchase(bundleId);
      } else {
        const payerEmail = user?.email || null;
        result = await purchaseService.prepareBundleSubscription(bundleId, payerEmail);
      }
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
};

export default BundleDetailScreen;
