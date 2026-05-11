// Per-program subscription management screen. Reached from the program in
// library, from the trial-countdown link on Hoy, and from the magic-link
// email CTA. Read-only summary plus a cancel link at the bottom. Card-change
// is a placeholder for now — MP.js tokenization flow ships next.
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../utils/apiClient';

const STATUS_LABEL = {
  pending: 'Pendiente',
  authorized: 'Activa',
  active: 'Activa',
  paused: 'Pausada',
  cancelled: 'Cancelada',
};
const STATUS_COLOR = {
  pending: 'rgba(241, 196, 15, 0.85)',
  authorized: 'rgba(46, 204, 113, 0.85)',
  active: 'rgba(46, 204, 113, 0.85)',
  paused: 'rgba(230, 126, 34, 0.85)',
  cancelled: 'rgba(231, 76, 60, 0.85)',
};

const fmtDate = (iso) => {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('es-CO', {
      day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

const fmtMoney = (amount, currency = 'COP') => {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency, minimumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${n} ${currency}`;
  }
};

const daysUntil = (iso) => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const diff = Math.ceil((t - Date.now()) / (24 * 60 * 60 * 1000));
  return Math.max(0, diff);
};

export default function ProgramSubscriptionScreen() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [confirmStep, setConfirmStep] = useState('survey'); // survey | confirm | done
  const [survey, setSurvey] = useState({
    reason: null, satisfaction: null, resubscribeLikelihood: null, improvement: null,
  });
  const [cancelState, setCancelState] = useState('idle'); // idle | sending | done | error
  const [cancelError, setCancelError] = useState('');

  useEffect(() => { document.title = 'Gestionar suscripción — Wake'; }, []);

  const { data: profile } = useQuery({
    queryKey: ['user', user?.uid, 'profile'],
    queryFn: () => apiClient.get('/users/me').then((r) => r?.data ?? null),
    enabled: !!user?.uid,
    staleTime: 30_000,
  });

  const { data: subscriptions = [], refetch: refetchSubs } = useQuery({
    queryKey: ['user', user?.uid, 'subscriptions'],
    queryFn: () => apiClient.get('/users/me/subscriptions').then((r) => r?.data ?? []),
    enabled: !!user?.uid,
    staleTime: 30_000,
  });

  const course = profile?.courses?.[courseId] || null;
  const subscription = useMemo(() => {
    if (!courseId || !subscriptions.length) return null;
    const matches = subscriptions.filter((s) => s.course_id === courseId);
    if (!matches.length) return null;
    matches.sort((a, b) => {
      const ts = (s) => s.created_at?._seconds ?? 0;
      return ts(b) - ts(a);
    });
    return matches[0];
  }, [subscriptions, courseId]);

  const isTrial = course?.is_trial === true;
  const trialDaysLeft = isTrial ? daysUntil(course?.expires_at) : null;
  const statusKey = subscription?.status || (course ? 'active' : 'pending');
  const statusLabel = STATUS_LABEL[statusKey] || 'Activa';
  const statusColor = STATUS_COLOR[statusKey] || STATUS_COLOR.active;
  const isCancelled = statusKey === 'cancelled';
  const canCancel = subscription &&
    !isCancelled &&
    (subscription.status === 'authorized' ||
     subscription.status === 'pending' ||
     subscription.status === 'active');

  const handleSubmitCancel = async () => {
    if (!subscription?.subscription_id) return;
    setCancelState('sending');
    setCancelError('');
    try {
      await apiClient.post(`/payments/subscriptions/${subscription.subscription_id}/cancel`, {
        survey,
      });
      setCancelState('done');
      setConfirmStep('done');
      await refetchSubs();
    } catch (err) {
      setCancelState('error');
      setCancelError(err?.message || 'No pudimos cancelar la suscripción.');
    }
  };

  if (!user?.uid) {
    return <div style={styles.loading}>Iniciando sesión…</div>;
  }
  if (!course && !subscription) {
    return (
      <div style={styles.page}>
        <button style={styles.backButton} onClick={() => navigate('/library')}>
          ← Biblioteca
        </button>
        <div style={styles.emptyCard}>
          <p style={styles.emptyText}>No encontramos esta suscripción.</p>
        </div>
      </div>
    );
  }

  const programTitle = course?.title || subscription?.course_title || 'Programa';
  const imageUrl = course?.image_url || null;
  const nextBilling = subscription?.next_billing_date;
  const monthlyAmount = subscription?.transaction_amount;
  const currency = subscription?.currency_id || 'COP';

  return (
    <div style={styles.page}>
      <button style={styles.backButton} onClick={() => navigate('/library')}>
        ← Biblioteca
      </button>

      <article style={styles.card}>
        {imageUrl ? (
          <div style={{ ...styles.heroImage, backgroundImage: `url(${imageUrl})` }} />
        ) : null}

        <div style={styles.body}>
          <h1 style={styles.title}>{programTitle}</h1>

          <div style={styles.statusRow}>
            <span style={{ ...styles.statusDot, background: statusColor }} />
            <span style={styles.statusText}>
              {isTrial ? `Prueba gratuita · ${trialDaysLeft} ${trialDaysLeft === 1 ? 'día' : 'días'} restantes` : statusLabel}
            </span>
          </div>

          {isCancelled ? (
            <p style={styles.note}>
              Tu suscripción está cancelada. {course?.expires_at ? `Acceso hasta el ${fmtDate(course.expires_at)}.` : ''}
            </p>
          ) : isTrial ? (
            <p style={styles.note}>
              Después de la prueba, se cobrarán {fmtMoney(monthlyAmount, currency)} al mes.
              El primer cobro será el {fmtDate(nextBilling)}.
            </p>
          ) : nextBilling ? (
            <p style={styles.note}>
              Próximo cobro: <strong>{fmtDate(nextBilling)}</strong> por {fmtMoney(monthlyAmount, currency)}.
            </p>
          ) : null}

          <div style={styles.section}>
            <div style={styles.sectionLabel}>Método de pago</div>
            <div style={styles.paymentText}>
              Tarjeta guardada en Mercado Pago.
            </div>
            <div style={styles.paymentSub}>
              Para cambiar la tarjeta, cancelá esta suscripción y suscribite de nuevo
              con la tarjeta nueva. No vas a perder acceso durante el período pago.
            </div>
          </div>

          {canCancel ? (
            <div style={styles.cancelSection}>
              <button
                style={styles.cancelLink}
                onClick={() => { setCancelOpen(true); setConfirmStep('survey'); setCancelState('idle'); }}
              >
                Cancelar suscripción
              </button>
            </div>
          ) : null}
        </div>
      </article>

      {cancelOpen ? (
        <div style={styles.modalOverlay} onClick={() => cancelState !== 'sending' && setCancelOpen(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            {confirmStep === 'done' ? (
              <>
                <h2 style={styles.modalTitle}>Suscripción cancelada</h2>
                <p style={styles.modalText}>
                  No vas a recibir más cobros. Tendrás acceso al programa hasta el {fmtDate(course?.expires_at || nextBilling)}.
                </p>
                <button style={styles.primaryButton} onClick={() => setCancelOpen(false)}>
                  Cerrar
                </button>
              </>
            ) : confirmStep === 'survey' ? (
              <>
                <h2 style={styles.modalTitle}>Antes de cancelar</h2>
                <p style={styles.modalText}>
                  Si querés, contanos qué pasó. Nos ayuda a mejorar Wake.
                </p>
                <SurveyQuestion
                  label="¿Por qué cancelás?"
                  value={survey.reason}
                  onChange={(v) => setSurvey((s) => ({ ...s, reason: v }))}
                  options={[
                    { value: 'cost', label: 'El costo es muy alto' },
                    { value: 'no_time', label: 'No tengo tiempo' },
                    { value: 'content_not_fit', label: 'No se ajusta a mis objetivos' },
                    { value: 'goals_met', label: 'Ya cumplí mis metas' },
                    { value: 'other', label: 'Otro motivo' },
                  ]}
                />
                <SurveyQuestion
                  label="¿Qué tan satisfecho estás?"
                  value={survey.satisfaction}
                  onChange={(v) => setSurvey((s) => ({ ...s, satisfaction: v }))}
                  options={[
                    { value: 'very_satisfied', label: 'Muy satisfecho' },
                    { value: 'satisfied', label: 'Satisfecho' },
                    { value: 'neutral', label: 'Neutral' },
                    { value: 'unsatisfied', label: 'Insatisfecho' },
                    { value: 'very_unsatisfied', label: 'Muy insatisfecho' },
                  ]}
                />
                <div style={styles.modalActions}>
                  <button style={styles.secondaryButton} onClick={() => setCancelOpen(false)}>
                    Volver
                  </button>
                  <button style={styles.primaryButton} onClick={() => setConfirmStep('confirm')}>
                    Continuar
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 style={styles.modalTitle}>¿Cancelar definitivamente?</h2>
                <p style={styles.modalText}>
                  No habrá más cobros. Tu acceso seguirá hasta el {fmtDate(course?.expires_at || nextBilling)}.
                </p>
                {cancelError ? <p style={styles.errorText}>{cancelError}</p> : null}
                <div style={styles.modalActions}>
                  <button
                    style={styles.secondaryButton}
                    onClick={() => setConfirmStep('survey')}
                    disabled={cancelState === 'sending'}
                  >
                    Atrás
                  </button>
                  <button
                    style={styles.primaryButton}
                    onClick={handleSubmitCancel}
                    disabled={cancelState === 'sending'}
                  >
                    {cancelState === 'sending' ? 'Cancelando…' : 'Sí, cancelar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SurveyQuestion({ label, value, onChange, options }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={styles.surveyLabel}>{label}</div>
      <div style={styles.surveyOptions}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            style={{
              ...styles.surveyOption,
              ...(value === opt.value ? styles.surveyOptionActive : {}),
            }}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#1a1a1a',
    color: '#fff',
    padding: '60px 24px 80px',
    boxSizing: 'border-box',
  },
  loading: {
    minHeight: '100vh',
    background: '#1a1a1a',
    color: 'rgba(255,255,255,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    padding: '8px 0',
    marginBottom: 20,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  card: {
    maxWidth: 540,
    margin: '0 auto',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20,
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    aspectRatio: '16/9',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundColor: '#0f0f0f',
  },
  body: {
    padding: '28px 24px 24px',
  },
  title: {
    fontSize: 24,
    fontWeight: 600,
    letterSpacing: '-0.3px',
    margin: '0 0 16px',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    margin: '0 0 12px',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    display: 'inline-block',
  },
  statusText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: 500,
  },
  note: {
    fontSize: 14,
    lineHeight: 1.55,
    color: 'rgba(255,255,255,0.65)',
    margin: '0 0 20px',
  },
  section: {
    borderTop: '1px solid rgba(255,255,255,0.07)',
    paddingTop: 20,
    marginTop: 16,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 12,
    fontWeight: 600,
  },
  paymentText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: 500,
    marginBottom: 6,
  },
  paymentSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 1.5,
  },
  cancelSection: {
    borderTop: '1px solid rgba(255,255,255,0.07)',
    paddingTop: 20,
    marginTop: 24,
    textAlign: 'center',
  },
  cancelLink: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    cursor: 'pointer',
    textDecoration: 'underline',
    fontFamily: 'inherit',
  },
  emptyCard: {
    maxWidth: 540,
    margin: '0 auto',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20,
    padding: 40,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    margin: 0,
  },
  primaryButton: {
    background: '#fff',
    color: '#1a1a1a',
    border: 'none',
    borderRadius: 12,
    padding: '12px 24px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  secondaryButton: {
    background: 'transparent',
    color: 'rgba(255,255,255,0.85)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 12,
    padding: '12px 24px',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 1000,
  },
  modal: {
    width: '100%',
    maxWidth: 440,
    background: '#1a1a1a',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 20,
    padding: 28,
    boxSizing: 'border-box',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 600,
    margin: '0 0 12px',
  },
  modalText: {
    fontSize: 14,
    lineHeight: 1.55,
    color: 'rgba(255,255,255,0.7)',
    margin: '0 0 20px',
  },
  modalActions: {
    display: 'flex',
    gap: 12,
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  surveyLabel: {
    fontSize: 13,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 8,
  },
  surveyOptions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  surveyOption: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: '8px 14px',
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  surveyOptionActive: {
    background: 'rgba(255,255,255,0.95)',
    color: '#1a1a1a',
    borderColor: '#fff',
  },
  errorText: {
    fontSize: 13,
    color: '#ff6b6b',
    margin: '0 0 12px',
  },
};
