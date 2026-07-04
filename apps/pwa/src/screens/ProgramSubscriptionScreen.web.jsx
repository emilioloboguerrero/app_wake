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
// Dark cinematic palette — white-tone intensity instead of hardcoded chroma.
// docs/STANDARDS.md mandates: "image-extracted accent on screens that show
// an image; pure white-tones everywhere else." This screen has no image, so
// status differentiation is by opacity, not color.
const STATUS_COLOR = {
  pending: 'rgba(255, 255, 255, 0.55)',
  authorized: 'rgba(255, 255, 255, 0.85)',
  active: 'rgba(255, 255, 255, 0.85)',
  paused: 'rgba(255, 255, 255, 0.45)',
  cancelled: 'rgba(255, 255, 255, 0.35)',
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
  // Help paragraph about changing the card is collapsed by default — the
  // most common path is read-only review; expand only if the user asks.
  const [paymentHelpOpen, setPaymentHelpOpen] = useState(false);

  useEffect(() => { document.title = 'Gestionar suscripción — Wake'; }, []);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['user', user?.uid, 'profile'],
    queryFn: () => apiClient.get('/users/me').then((r) => r?.data ?? null),
    enabled: !!user?.uid,
    staleTime: 30_000,
  });

  const { data: subscriptions = [], isLoading: subsLoading, refetch: refetchSubs } = useQuery({
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
      // Transform UI's flat survey to the server's { answers: [...] } shape.
      // The server reads `survey.answers` and ignores anything else; without
      // this transform, every cancel succeeded but the qualitative data was
      // silently dropped on the floor.
      const answers = [
        survey.reason ? `reason: ${survey.reason}` : null,
        survey.satisfaction != null ? `satisfaction: ${survey.satisfaction}` : null,
        survey.resubscribeLikelihood != null ? `resubscribe_likelihood: ${survey.resubscribeLikelihood}` : null,
        survey.improvement ? `improvement: ${survey.improvement}` : null,
      ].filter(Boolean);
      const surveyPayload = answers.length > 0 ? {
        answers,
        source: 'in_app_cancel_flow_v1',
        courseId,
        courseTitle: course?.title,
        subscriptionStatusBefore: subscription.status,
      } : undefined;
      await apiClient.post(`/payments/subscriptions/${subscription.subscription_id}/cancel`, {
        ...(surveyPayload ? { survey: surveyPayload } : {}),
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
  // Hold the empty-state copy until BOTH queries have settled. Without this
  // gate, the screen flashes "No encontramos esta suscripción" for the
  // ~500ms before /users/me + /users/me/subscriptions resolve.
  const stillLoading = profileLoading || subsLoading;
  if (!course && !subscription) {
    if (stillLoading) {
      return (
        <div style={styles.page}>
          <button style={styles.backButton} onClick={() => navigate('/library')}>
            ← Biblioteca
          </button>
          <div style={styles.card} aria-busy="true">
            <div style={styles.heroSkeleton} />
            <div style={styles.body}>
              <div style={styles.skeletonTitle} />
              <div style={styles.skeletonLine} />
              <div style={{ ...styles.skeletonLine, width: '60%' }} />
            </div>
          </div>
        </div>
      );
    }
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
          <div style={{ ...styles.heroImage, backgroundImage: `url(${imageUrl})` }}>
            <div style={styles.heroGradient} />
          </div>
        ) : (
          <div style={styles.heroFallback} aria-hidden="true" />
        )}

        <div style={styles.body}>
          <h1 style={styles.title}>{programTitle}</h1>

          <div style={styles.statusRow}>
            <span style={{ ...styles.statusDot, background: statusColor }} />
            <span style={styles.statusText}>
              {isTrial ? `Prueba · ${trialDaysLeft} ${trialDaysLeft === 1 ? 'día' : 'días'}` : statusLabel}
            </span>
          </div>

          {!isCancelled && nextBilling ? (
            <div style={styles.billingRow}>
              <div>
                <div style={styles.billingLabel}>
                  {isTrial ? 'Primer cobro' : 'Próximo cobro'}
                </div>
                <div style={styles.billingDate}>{fmtDate(nextBilling)}</div>
              </div>
              {monthlyAmount ? (
                <div style={styles.billingAmount}>
                  {fmtMoney(monthlyAmount, currency)}
                </div>
              ) : null}
            </div>
          ) : null}

          {isCancelled && course?.expires_at ? (
            <p style={styles.note}>
              Acceso hasta el {fmtDate(course.expires_at)}.
            </p>
          ) : null}

          <div style={styles.section}>
            <div style={styles.paymentRow}>
              <span style={styles.paymentText}>Tarjeta de Mercado Pago</span>
              <button
                type="button"
                style={styles.paymentToggle}
                onClick={() => setPaymentHelpOpen((v) => !v)}
                aria-expanded={paymentHelpOpen}
              >
                {paymentHelpOpen ? 'Ocultar' : 'Cambiar'}
              </button>
            </div>
            {paymentHelpOpen ? (
              <div style={styles.paymentSub}>
                Para cambiar la tarjeta, cancelá esta suscripción y suscribite de nuevo.
                Mantenés el acceso hasta el final del período pago.
              </div>
            ) : null}
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
                  Si quieres, cuéntanos qué pasó. Nos ayuda a mejorar Wake.
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
    position: 'relative',
  },
  heroGradient: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(to bottom, rgba(0,0,0,0) 55%, rgba(26,26,26,0.85) 100%)',
  },
  heroFallback: {
    width: '100%',
    height: 6,
    background: 'linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.12), rgba(255,255,255,0.04))',
  },
  heroSkeleton: {
    width: '100%',
    aspectRatio: '16/9',
    background: 'linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.08), rgba(255,255,255,0.04))',
  },
  skeletonTitle: {
    width: '70%',
    height: 24,
    borderRadius: 6,
    background: 'rgba(255,255,255,0.06)',
    margin: '0 0 16px',
  },
  skeletonLine: {
    width: '90%',
    height: 12,
    borderRadius: 4,
    background: 'rgba(255,255,255,0.04)',
    margin: '0 0 10px',
  },
  body: {
    padding: '24px 22px 20px',
  },
  title: {
    fontSize: 22,
    fontWeight: 600,
    letterSpacing: '-0.3px',
    lineHeight: 1.2,
    margin: '0 0 14px',
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
  billingRow: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
    padding: '14px 0 18px',
  },
  billingLabel: {
    fontSize: 11,
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 4,
    fontWeight: 600,
  },
  billingDate: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.95)',
    fontWeight: 500,
  },
  billingAmount: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.95)',
    fontWeight: 600,
    letterSpacing: '-0.2px',
  },
  section: {
    borderTop: '1px solid rgba(255,255,255,0.07)',
    paddingTop: 14,
    marginTop: 4,
  },
  paymentRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  paymentText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: 500,
  },
  paymentToggle: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    cursor: 'pointer',
    padding: '4px 0',
    fontFamily: 'inherit',
    textDecoration: 'underline',
  },
  paymentSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 1.5,
    marginTop: 10,
  },
  cancelSection: {
    paddingTop: 18,
    marginTop: 14,
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
