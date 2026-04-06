import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import DashboardLayout from '../components/DashboardLayout';
import SessionAssignmentModal from '../components/SessionAssignmentModal';
import {
  GlowingEffect,
  ScrollableDisplayCards,
  TubelightNavBar,
  SkeletonCard,
  ShimmerSkeleton,
  AnimatedList,
  ProgressRing,
  NumberTicker,
  Toast,
  VirtualList,
  KeepAlivePane,
} from '../components/ui/index.js';
import ContextualHint from '../components/hints/ContextualHint';
import { FullScreenError, InlineError } from '../components/ui/ErrorStates';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import apiClient from '../utils/apiClient';
import { cacheConfig } from '../config/queryClient';
import FindUserModal from '../components/FindUserModal';
import AssignProgramModal from '../components/AssignProgramModal';
import oneOnOneService from '../services/oneOnOneService';
import './ProgramsAndClientsScreen.css';

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const PROFILE_TABS = [
  { id: 'plan', label: 'Planificación' },
  { id: 'nutricion', label: 'Nutrición' },
  { id: 'lab', label: 'Lab' },
  { id: 'llamadas', label: 'Llamadas' },
];


const VIRTUAL_ROSTER_THRESHOLD = 50;
const ROSTER_ITEM_HEIGHT = 50;

function getInitial(name) {
  return (name || '?').charAt(0).toUpperCase();
}

function formatAccessDate(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function getDaysRemaining(dateStr) {
  if (!dateStr) return null;
  try {
    const end = new Date(dateStr);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

function toInputDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toISOString().split('T')[0];
  } catch {
    return '';
  }
}

function RosterRow({ client, isSelected, onClick, style }) {
  const name = client.clientName || client.clientEmail || `Cliente ${(client.clientUserId || '').slice(0, 8)}`;
  const isActive = client.status !== 'inactive';

  return (
    <button
      type="button"
      className={`roster-row ${isSelected ? 'roster-row--active' : ''}`}
      onClick={onClick}
      aria-current={isSelected ? 'true' : undefined}
      style={style}
    >
      {isSelected && <span className="roster-row__accent-bar" aria-hidden="true" />}
      <div className="roster-row__avatar" aria-hidden="true">
        {client.avatarUrl
          ? <img src={client.avatarUrl} alt={name} className="roster-row__avatar-img" />
          : <span className="roster-row__avatar-initial">{getInitial(name)}</span>}
      </div>
      <span className="roster-row__name">{name}</span>
      <span
        className="roster-row__status-dot"
        style={{
          background: isActive
            ? 'rgba(74,222,128,0.9)'
            : 'var(--text-tertiary, rgba(255,255,255,0.25))',
        }}
        aria-label={isActive ? 'Activo' : 'Inactivo'}
      />
    </button>
  );
}

function RosterSkeleton() {
  return (
    <div className="roster-skeleton">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="roster-skeleton__row" style={{ animationDelay: `${i * 60}ms` }}>
          <ShimmerSkeleton width="32px" height="32px" borderRadius="50%" />
          <ShimmerSkeleton width="60%" height="14px" borderRadius="6px" />
        </div>
      ))}
    </div>
  );
}

function EmptyRoster({ onAddClient }) {
  return (
    <div className="clientes-empty-state">
      <div className="clientes-empty-state__icon" aria-hidden="true">
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
          <circle cx="28" cy="20" r="10" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
          <path d="M8 50c0-11.046 8.954-20 20-20s20 8.954 20 20" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M38 18l4 4m0-4l-4 4" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <p className="clientes-empty-state__title">Tu lista está vacía</p>
      <p className="clientes-empty-state__body">Agrega tu primer cliente para empezar a gestionar sus programas, nutrición y progreso.</p>
      <button type="button" className="clientes-empty-state__cta" onClick={onAddClient}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Agregar primer cliente
      </button>
    </div>
  );
}

function ProfileTopSkeleton() {
  return (
    <div className="profile-top-skeleton">
      <div className="profile-top-skeleton__header">
        <ShimmerSkeleton width="64px" height="64px" borderRadius="50%" />
        <div className="profile-top-skeleton__info">
          <ShimmerSkeleton width="160px" height="20px" borderRadius="6px" />
          <ShimmerSkeleton width="90px" height="14px" borderRadius="4px" />
        </div>
      </div>
      <SkeletonCard />
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        <ShimmerSkeleton width="140px" height="36px" borderRadius="10px" />
        <ShimmerSkeleton width="100px" height="36px" borderRadius="10px" />
        <ShimmerSkeleton width="72px" height="36px" borderRadius="10px" />
      </div>
    </div>
  );
}

function ClientHighlightCard({ clientDetail }) {
  if (!clientDetail) return null;

  const prLabel = clientDetail.latestPR?.label || 'Sin PRs recientes';
  const prDate = clientDetail.latestPR?.date || '';
  const consistency = clientDetail.weeklyConsistency;
  const nutritionAdherence = clientDetail.nutritionAdherence;
  const hasNutritionPlan = clientDetail.nutritionPlan != null;

  return (
    <div className="clientes-highlights">
      <div className="highlight-card">
        <div className="highlight-card__item">
          <div className="highlight-card__icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="highlight-card__label">Ultimo PR</span>
          <span className="highlight-card__value">{prLabel}</span>
          {prDate && <span className="highlight-card__sub">{prDate}</span>}
        </div>

        <div className="highlight-card__item">
          <div className="highlight-card__ring">
            <ProgressRing
              percent={consistency ?? 0}
              size={44}
              strokeWidth={4}
              color="rgba(255,255,255,0.75)"
              label={consistency != null ? `${consistency}%` : '—'}
            />
          </div>
          <span className="highlight-card__label">Consistencia</span>
          <span className="highlight-card__value">
            {consistency != null ? `${consistency}%` : 'Sin datos'}
          </span>
          <span className="highlight-card__sub">Esta semana</span>
        </div>

        <div className="highlight-card__item">
          <div className="highlight-card__icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M18 8H19C20.0609 8 21.0783 8.42143 21.8284 9.17157C22.5786 9.92172 23 10.9391 23 12C23 13.0609 22.5786 14.0783 21.8284 14.8284C21.0783 15.5786 20.0609 16 19 16H18M18 8H2V17H18V8ZM18 8V5L14 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="highlight-card__label">Nutricion</span>
          <span className="highlight-card__value">
            {hasNutritionPlan
              ? (nutritionAdherence != null ? `${nutritionAdherence}%` : 'Sin datos')
              : 'Sin plan asignado'}
          </span>
          {hasNutritionPlan && <span className="highlight-card__sub">Adherencia</span>}
        </div>
      </div>
    </div>
  );
}

function AccessManagement({ clientDetail, clientName, clientId }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [localDate, setLocalDate] = useState('');
  const saveTimerRef = useRef(null);

  const accessEndsAt = clientDetail?.accessEndsAt;
  const daysRemaining = getDaysRemaining(accessEndsAt);

  useEffect(() => {
    setLocalDate(toInputDate(accessEndsAt));
  }, [accessEndsAt]);

  const updateAccessMutation = useMutation({
    mutationKey: ['clients', 'update-access'],
    mutationFn: (newDate) =>
      apiClient.patch(`/creator/clients/${clientId}`, { accessEndsAt: newDate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients', 'detail', clientId] });
    },
    onError: () => {
      showToast('No pudimos actualizar la fecha de acceso. Intenta de nuevo.', 'error');
      setLocalDate(toInputDate(accessEndsAt));
    },
  });

  const handleDateChange = useCallback((e) => {
    const newDate = e.target.value;
    setLocalDate(newDate);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (newDate) updateAccessMutation.mutate(newDate);
    }, 800);
  }, [updateAccessMutation]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const isExpired = daysRemaining !== null && daysRemaining < 0;
  const isWarning = daysRemaining !== null && daysRemaining >= 0 && daysRemaining < 7;

  return (
    <div className="access-management">
      <div className="access-management__row">
        <span className="access-management__label">Acceso hasta:</span>
        <input
          type="date"
          className="access-management__date-input"
          value={localDate}
          onChange={handleDateChange}
          aria-label="Fecha de acceso"
        />
        {daysRemaining !== null && !isExpired && (
          <span className="access-management__days">
            {daysRemaining} {daysRemaining === 1 ? 'dia' : 'dias'} restantes
          </span>
        )}
      </div>
      {isWarning && (
        <p className="access-management__warning">
          El acceso de {clientName} vence en {daysRemaining} {daysRemaining === 1 ? 'dia' : 'dias'}.
        </p>
      )}
      {isExpired && (
        <p className="access-management__expired">
          Acceso vencido desde {formatAccessDate(accessEndsAt)}.
        </p>
      )}
    </div>
  );
}

function PlanTab({ clientDetail, clientName, clientId }) {
  if (!clientDetail) {
    return (
      <div className="tab-content tab-plan">
        <SkeletonCard />
      </div>
    );
  }

  const weekPlan = clientDetail.weekPlan || [];

  return (
    <div className="tab-content tab-plan">
      <div className="week-grid">
        {DAYS.map((day, i) => {
          const daySessions = weekPlan[i] || [];
          return (
            <div key={day} className="week-grid__col">
              <span className="week-grid__day-label">{day}</span>
              <div className="week-grid__sessions">
                {daySessions.length === 0
                  ? <span className="week-grid__rest">Descanso</span>
                  : daySessions.map((s, j) => (
                    <span key={j} className="week-grid__session-chip">{s}</span>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
      <AccessManagement
        clientDetail={clientDetail}
        clientName={clientName}
        clientId={clientId}
      />
    </div>
  );
}

function NutricionTab({ clientDetail }) {
  if (!clientDetail) {
    return (
      <div className="tab-content">
        <SkeletonCard />
      </div>
    );
  }

  const plan = clientDetail.nutritionPlan;

  if (!plan) {
    return (
      <div className="tab-content tab-empty">
        <p className="tab-empty__text">Sin plan de nutricion asignado todavia.</p>
      </div>
    );
  }

  return (
    <div className="tab-content tab-nutricion">
      <div className="nutricion-card">
        <GlowingEffect />
        <h4 className="nutricion-card__title">{plan.name || 'Plan de nutricion'}</h4>
        <div className="macro-row">
          <div className="macro-pill macro-pill--protein">
            <span className="macro-pill__label">Proteina</span>
            <span className="macro-pill__value">{plan.proteinG ?? '—'}g</span>
          </div>
          <div className="macro-pill macro-pill--carbs">
            <span className="macro-pill__label">Carbos</span>
            <span className="macro-pill__value">{plan.carbsG ?? '—'}g</span>
          </div>
          <div className="macro-pill macro-pill--fat">
            <span className="macro-pill__label">Grasa</span>
            <span className="macro-pill__value">{plan.fatG ?? '—'}g</span>
          </div>
          <div className="macro-pill macro-pill--kcal">
            <span className="macro-pill__label">Calorias</span>
            <span className="macro-pill__value">{plan.calories ?? '—'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LabSkeleton() {
  return (
    <div className="tab-content tab-lab">
      <div className="lab-grid lab-grid--top">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div className="lab-grid lab-grid--charts">
        <div className="lab-chart-card"><ShimmerSkeleton width="100%" height="180px" borderRadius="12px" /></div>
        <div className="lab-chart-card"><ShimmerSkeleton width="100%" height="180px" borderRadius="12px" /></div>
      </div>
      <div className="lab-chart-card"><ShimmerSkeleton width="100%" height="140px" borderRadius="12px" /></div>
    </div>
  );
}

const LAB_CHART_TOOLTIP_STYLE = {
  backgroundColor: 'rgba(26,26,26,0.95)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#fff',
};

const NUTRI_BARS = [
  { key: 'calories', label: 'Calorias', unit: 'kcal' },
  { key: 'protein', label: 'Proteina', unit: 'g' },
  { key: 'carbs', label: 'Carbos', unit: 'g' },
  { key: 'fat', label: 'Grasa', unit: 'g' },
];

function LabTab({ client, clientDetail }) {
  const clientUserId = client?.clientUserId || client?.id;

  const { data: labData, isLoading: isLabLoading } = useQuery({
    queryKey: ['analytics', 'client-lab', clientUserId],
    queryFn: () => apiClient.get(`/analytics/client/${clientUserId}/lab`),
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    enabled: !!clientUserId,
    select: (res) => res?.data ?? null,
  });

  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (labData || clientDetail) {
      const t = setTimeout(() => setEntered(true), 50);
      return () => clearTimeout(t);
    }
    setEntered(false);
  }, [labData, clientDetail]);

  if (!clientDetail || isLabLoading) return <LabSkeleton />;

  const bodyProgress = clientDetail.bodyProgressPercent ?? 0;
  const readinessScore = labData?.trends?.readinessAvg ?? clientDetail.readinessScore ?? 0;
  const completionRate = labData?.completionRate ?? 0;
  const weeklyVolume = labData?.trends?.weeklyVolume ?? [];
  const bodyProgressData = (labData?.trends?.bodyProgress ?? [])
    .filter((p) => p.weight != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const nutrition = labData?.nutritionComparison ?? { actual: {}, target: {} };

  const volumeChartData = weeklyVolume.map((w) => ({
    name: w.week.slice(5),
    series: w.totalSets,
    sesiones: w.sessions,
  }));

  const bodyChartData = bodyProgressData.map((p) => ({
    name: p.date.slice(5),
    peso: p.weight,
  }));

  return (
    <div className="tab-content tab-lab">
      <div className={`lab-grid lab-grid--top lab-entrance ${entered ? 'lab-entrance--in' : ''}`}>
        <div className="lab-card">
          <GlowingEffect />
          <div className="lab-card__ring-wrap">
            <ProgressRing
              percent={bodyProgress}
              size={80}
              strokeWidth={6}
              color="rgba(255,255,255,0.75)"
              label={`${bodyProgress}%`}
            />
          </div>
          <div className="lab-card__info">
            <span className="lab-card__metric-label">Progreso corporal</span>
            <span className="lab-card__metric-sub">vs. objetivo</span>
          </div>
        </div>

        <div className="lab-card">
          <GlowingEffect />
          <div className="lab-card__ticker-wrap">
            <NumberTicker value={readinessScore} suffix="/10" decimals={1} />
          </div>
          <div className="lab-card__info">
            <span className="lab-card__metric-label">Readiness</span>
            <span className="lab-card__metric-sub">Promedio 7 dias</span>
          </div>
        </div>

        <div className="lab-card">
          <GlowingEffect />
          <div className="lab-card__ring-wrap">
            <ProgressRing
              percent={completionRate > 100 ? 100 : completionRate}
              size={80}
              strokeWidth={6}
              color="rgba(255,255,255,0.75)"
              label={`${completionRate}`}
            />
          </div>
          <div className="lab-card__info">
            <span className="lab-card__metric-label">Sesiones completadas</span>
            <span className="lab-card__metric-sub">Ultimos 30 dias</span>
          </div>
        </div>
      </div>

      <div className={`lab-grid lab-grid--charts lab-entrance ${entered ? 'lab-entrance--in' : ''}`} style={{ transitionDelay: '80ms' }}>
        <div className="lab-chart-card">
          <h4 className="lab-chart-card__title">Volumen semanal</h4>
          <p className="lab-chart-card__sub">Series totales — ultimas 8 semanas</p>
          {volumeChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={volumeChartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={LAB_CHART_TOOLTIP_STYLE} />
                <Line type="monotone" dataKey="series" stroke="rgba(255,255,255,0.8)" strokeWidth={2} dot={{ r: 3, fill: '#fff' }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="lab-chart-card__empty">Sin datos de volumen</p>
          )}
        </div>

        <div className="lab-chart-card">
          <h4 className="lab-chart-card__title">Peso corporal</h4>
          <p className="lab-chart-card__sub">Ultimos 30 dias</p>
          {bodyChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={bodyChartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={LAB_CHART_TOOLTIP_STYLE} formatter={(v) => [`${v} kg`, 'Peso']} />
                <Line type="monotone" dataKey="peso" stroke="rgba(255,255,255,0.8)" strokeWidth={2} dot={{ r: 3, fill: '#fff' }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="lab-chart-card__empty">Sin registros de peso</p>
          )}
        </div>
      </div>

      <div className={`lab-chart-card lab-entrance ${entered ? 'lab-entrance--in' : ''}`} style={{ transitionDelay: '160ms' }}>
        <h4 className="lab-chart-card__title">Nutricion: real vs. objetivo</h4>
        <p className="lab-chart-card__sub">Promedio diario — ultimos 7 dias</p>
        <div className="lab-nutri-bars">
          {NUTRI_BARS.map(({ key, label, unit }) => {
            const actual = nutrition.actual?.[key] ?? 0;
            const target = nutrition.target?.[key] ?? 0;
            const pct = target > 0 ? Math.min((actual / target) * 100, 100) : 0;
            return (
              <div key={key} className="lab-nutri-row">
                <div className="lab-nutri-row__header">
                  <span className="lab-nutri-row__label">{label}</span>
                  <span className="lab-nutri-row__values">{actual} / {target} {unit}</span>
                </div>
                <div className="lab-nutri-row__track">
                  <div
                    className="lab-nutri-row__fill"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LlamadasTab({ clientDetail }) {
  if (!clientDetail) {
    return (
      <div className="tab-content">
        <SkeletonCard />
      </div>
    );
  }

  const calls = clientDetail.calls || [];

  if (calls.length === 0) {
    return (
      <div className="tab-content tab-empty">
        <p className="tab-empty__text">No hay llamadas agendadas todavia.</p>
      </div>
    );
  }

  return (
    <div className="tab-content tab-llamadas">
      <AnimatedList stagger={50}>
        {calls.map((call, i) => (
          <div key={call.id || i} className="call-row">
            <GlowingEffect spread={12} />
            <div className="call-row__info">
              <span className="call-row__title">{call.title || 'Llamada'}</span>
              <span className="call-row__date">{call.scheduledAt || '—'}</span>
            </div>
            <span className={`call-row__status call-row__status--${call.status || 'pending'}`}>
              {call.status === 'completed'
                ? 'Completada'
                : call.status === 'cancelled'
                ? 'Cancelada'
                : 'Pendiente'}
            </span>
          </div>
        ))}
      </AnimatedList>
    </div>
  );
}

function ProfilePanel({ client, clientDetail, isLoadingDetail, isDetailError, refetchDetail }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('plan');
  const [visitedTabs, setVisitedTabs] = useState(() => new Set(['plan']));
  const [showSessionModal, setShowSessionModal] = useState(false);
  const tabBodyRef = useRef(null);

  const handleTabChange = useCallback((tabId) => {
    setActiveTab(tabId);
    setVisitedTabs(prev => {
      if (prev.has(tabId)) return prev;
      const next = new Set(prev);
      next.add(tabId);
      return next;
    });
  }, []);

  const clientId = client.id || client.clientUserId;
  const name = client.clientName || client.clientEmail || `Cliente ${(client.clientUserId || '').slice(0, 8)}`;
  const isActive = client.status !== 'inactive';

  const handleAssignSession = useCallback(() => {
    setShowSessionModal(true);
  }, []);

  const handleScheduleCall = useCallback(() => {
    navigate('/availability');
  }, [navigate]);

  const handleViewProgram = useCallback(() => {
    setActiveTab('plan');
    if (tabBodyRef.current) {
      tabBodyRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const handleSessionAssigned = useCallback((sessionData) => {
    showToast('Sesion asignada correctamente', 'success');
    setShowSessionModal(false);
  }, [showToast]);

  if (isDetailError) {
    return (
      <div className="profile-panel">
        <div className="profile-top">
          <div className="profile-identity">
            <div className="profile-avatar">
              {client.avatarUrl
                ? <img src={client.avatarUrl} alt={name} className="profile-avatar__img" />
                : <span className="profile-avatar__initial">{getInitial(name)}</span>}
            </div>
            <div className="profile-identity__info">
              <h2 className="profile-identity__name">{name}</h2>
            </div>
          </div>
        </div>
        <div className="profile-detail-error">
          <InlineError message="No pudimos cargar los datos de este cliente. Intenta de nuevo." />
          {refetchDetail && (
            <button
              type="button"
              className="profile-detail-error__retry"
              onClick={refetchDetail}
            >
              Reintentar
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="profile-panel">
      <div className="profile-top">
        {isLoadingDetail ? (
          <ProfileTopSkeleton />
        ) : (
          <>
            <div className="profile-identity">
              <div className="profile-avatar">
                {client.avatarUrl
                  ? <img src={client.avatarUrl} alt={name} className="profile-avatar__img" />
                  : <span className="profile-avatar__initial">{getInitial(name)}</span>}
              </div>
              <div className="profile-identity__info">
                <h2 className="profile-identity__name">{name}</h2>
                <div className="profile-identity__meta">
                  {client.programTitle && (
                    <span className="profile-program-badge">{client.programTitle}</span>
                  )}
                  <span
                    className="profile-status-dot"
                    style={{
                      background: isActive
                        ? 'rgba(74,222,128,0.9)'
                        : 'var(--text-tertiary, rgba(255,255,255,0.25))',
                    }}
                  />
                  <span className="profile-status-label">{isActive ? 'Activo' : 'Inactivo'}</span>
                </div>
              </div>
            </div>

            <ClientHighlightCard clientDetail={clientDetail} />

            <div className="profile-quick-actions">
              <button
                type="button"
                className="quick-action-pill"
                onClick={handleAssignSession}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Asignar sesion
              </button>
              <button
                type="button"
                className="quick-action-pill"
                onClick={handleScheduleCall}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M22 16.92V19.92C22.0011 20.4833 21.7772 21.0235 21.3748 21.4215C20.9724 21.8195 20.4254 22.0442 19.86 22.04C16.56 21.705 13.408 20.579 10.67 18.751C8.122 17.082 5.973 14.933 4.304 12.385C2.47 9.634 1.344 6.468 1.015 3.153C1.011 2.589 1.234 2.044 1.629 1.643C2.024 1.242 2.561 1.017 3.122 1.013H6.122C7.116 1.004 7.957 1.714 8.112 2.694C8.248 3.624 8.479 4.536 8.802 5.413C9.072 6.122 8.889 6.920 8.338 7.443L7.092 8.689C8.650 11.329 10.812 13.491 13.451 15.048L14.697 13.802C15.220 13.251 16.019 13.068 16.727 13.338C17.604 13.661 18.516 13.893 19.446 14.028C20.437 14.185 21.152 15.043 21.135 16.046L22 16.92Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Agendar llamada
              </button>
              <button
                type="button"
                className="quick-action-pill"
                onClick={handleViewProgram}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M3 10H21" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M10 4V10" stroke="currentColor" strokeWidth="1.8" />
                </svg>
                Ver programa
              </button>
            </div>
          </>
        )}
      </div>

      <div className="clientes-profile-tabs">
        <TubelightNavBar
          items={PROFILE_TABS}
          activeId={activeTab}
          onSelect={handleTabChange}
        />
      </div>

      <div className="profile-tab-body" ref={tabBodyRef}>
        {visitedTabs.has('plan') && (
          <KeepAlivePane active={activeTab === 'plan'}>
            <PlanTab
              clientDetail={isLoadingDetail ? null : clientDetail}
              clientName={name}
              clientId={clientId}
            />
          </KeepAlivePane>
        )}
        {visitedTabs.has('nutricion') && (
          <KeepAlivePane active={activeTab === 'nutricion'}>
            <NutricionTab clientDetail={isLoadingDetail ? null : clientDetail} />
          </KeepAlivePane>
        )}
        {visitedTabs.has('lab') && (
          <KeepAlivePane active={activeTab === 'lab'}>
            <LabTab client={client} clientDetail={isLoadingDetail ? null : clientDetail} />
          </KeepAlivePane>
        )}
        {visitedTabs.has('llamadas') && (
          <KeepAlivePane active={activeTab === 'llamadas'}>
            <LlamadasTab clientDetail={isLoadingDetail ? null : clientDetail} />
          </KeepAlivePane>
        )}
      </div>

      <SessionAssignmentModal
        isOpen={showSessionModal}
        onClose={() => setShowSessionModal(false)}
        selectedDate={new Date()}
        creatorId={user?.uid}
        onSessionAssigned={handleSessionAssigned}
        onAddFromLibrary={() => setShowSessionModal(false)}
      />
    </div>
  );
}

const ProgramsAndClientsScreen = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [mobileView, setMobileView] = useState('roster'); // 'roster' | 'profile'
  const rosterWrapRef = useRef(null);
  const [rosterHeight, setRosterHeight] = useState(400);

  // ── Add client flow ────────────────────────────────────────
  const [isFindUserOpen, setIsFindUserOpen] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [findUserError, setFindUserError] = useState(null);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [lookedUpUser, setLookedUpUser] = useState(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState(null);

  const handleOpenAddClient = useCallback(() => {
    setIsFindUserOpen(true);
    setFindUserError(null);
  }, []);

  const handleCloseFindUser = useCallback(() => {
    setIsFindUserOpen(false);
    setFindUserError(null);
  }, []);

  const handleLookupUser = useCallback(async (emailOrUsername) => {
    if (!emailOrUsername?.trim()) return null;
    try {
      setIsLookingUp(true);
      setFindUserError(null);
      const found = await oneOnOneService.lookupUserByEmailOrUsername(emailOrUsername.trim());
      return found;
    } catch (err) {
      setFindUserError(err.message || 'No se encontró ningún usuario');
      return null;
    } finally {
      setIsLookingUp(false);
    }
  }, []);

  const handleUserFound = useCallback((userInfo) => {
    setLookedUpUser(userInfo);
    setIsFindUserOpen(false);
    setIsAssignOpen(true);
    setAssignError(null);
  }, []);

  const handleCloseAssign = useCallback(() => {
    setIsAssignOpen(false);
    setLookedUpUser(null);
    setAssignError(null);
  }, []);

  const handleAssign = useCallback(async (clientUserId, programId) => {
    if (!clientUserId || !programId || !user) return;
    try {
      setIsAssigning(true);
      setAssignError(null);
      await oneOnOneService.addClientToProgram(user.uid, clientUserId, programId);
      await queryClient.invalidateQueries({ queryKey: ['clients', 'creator', user.uid] });
      setSelectedClientId(clientUserId);
      handleCloseAssign();
    } catch (err) {
      setAssignError(err.message || 'Error al agregar el cliente');
    } finally {
      setIsAssigning(false);
    }
  }, [user, queryClient, handleCloseAssign]);

  const handleViewClientFromModal = useCallback((clientId) => {
    handleCloseFindUser();
    setSelectedClientId(clientId);
  }, [handleCloseFindUser]);

  const {
    data: clientsData,
    isLoading: isLoadingClients,
    isError: isClientsError,
    refetch: refetchClients,
  } = useQuery({
    queryKey: ['clients', 'creator', user?.uid],
    queryFn: () => apiClient.get('/creator/clients').then((res) => res?.data ?? []),
    ...cacheConfig.userProfile,
    enabled: !!user?.uid,
  });

  const clients = clientsData || [];

  const {
    data: clientDetailData,
    isLoading: isLoadingDetail,
    isError: isDetailError,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: ['clients', 'detail', selectedClientId],
    queryFn: () => apiClient.get('/creator/clients/' + selectedClientId),
    ...cacheConfig.userProfile,
    enabled: !!selectedClientId,
    select: (res) => res?.data ?? null,
  });

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => {
      const name = (c.clientName || '').toLowerCase();
      const email = (c.clientEmail || '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [clients, search]);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId || c.clientUserId === selectedClientId) ?? null,
    [clients, selectedClientId]
  );

  const handleSelectClient = useCallback((client) => {
    const id = client.id || client.clientUserId;
    setSelectedClientId((prev) => (prev === id ? null : id));
    setMobileView('profile');
  }, []);

  const handleClearSearch = useCallback(() => setSearch(''), []);

  const showEmptyState = !isLoadingClients && !isClientsError && clients.length === 0;
  const useVirtualList = filteredClients.length >= VIRTUAL_ROSTER_THRESHOLD;

  useEffect(() => {
    if (useVirtualList && rosterWrapRef.current) {
      const obs = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setRosterHeight(entry.contentRect.height);
        }
      });
      obs.observe(rosterWrapRef.current);
      return () => obs.disconnect();
    }
  }, [useVirtualList]);

  const renderVirtualRow = useCallback((client, index, style) => {
    const id = client.id || client.clientUserId;
    return (
      <RosterRow
        key={id}
        client={client}
        isSelected={selectedClientId === id}
        onClick={() => handleSelectClient(client)}
        style={style}
      />
    );
  }, [selectedClientId, handleSelectClient]);

  const handleMobileBack = useCallback(() => {
    setMobileView('roster');
    setSelectedClientId(null);
  }, []);

  return (
    <DashboardLayout screenName="Clientes">
      <div className={`clientes-screen clientes-screen--${mobileView}`}>

        <aside className="clientes-roster">
          <div className="roster-header">
            <div className="roster-search-wrap">
              <svg className="roster-search__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.8" />
                <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                className="roster-search__input"
                placeholder="Buscar cliente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Buscar cliente"
              />
              {search && (
                <button
                  type="button"
                  className="roster-search__clear"
                  onClick={handleClearSearch}
                  aria-label="Limpiar busqueda"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="roster-header__row">
              <span className="roster-count">{clients.length} {clients.length === 1 ? 'cliente' : 'clientes'}</span>
              <button
                type="button"
                className="roster-add-btn"
                onClick={handleOpenAddClient}
                aria-label="Agregar cliente"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Agregar
              </button>
            </div>
          </div>

          <div className="roster-list-wrap" ref={rosterWrapRef}>
            {isLoadingClients ? (
              <RosterSkeleton />
            ) : isClientsError ? (
              <FullScreenError
                title="No pudimos cargar tus clientes"
                message="Revisa tu conexion e intenta de nuevo."
                onRetry={refetchClients}
              />
            ) : showEmptyState ? (
              <EmptyRoster onAddClient={handleOpenAddClient} />
            ) : filteredClients.length === 0 ? (
              <p className="roster-no-match">Sin coincidencias.</p>
            ) : useVirtualList ? (
              <VirtualList
                items={filteredClients}
                renderItem={renderVirtualRow}
                itemHeight={ROSTER_ITEM_HEIGHT}
                height={rosterHeight}
              />
            ) : (
              <AnimatedList stagger={55}>
                {filteredClients.map((client) => {
                  const id = client.id || client.clientUserId;
                  return (
                    <RosterRow
                      key={id}
                      client={client}
                      isSelected={selectedClientId === id}
                      onClick={() => handleSelectClient(client)}
                    />
                  );
                })}
              </AnimatedList>
            )}
          </div>
        </aside>

        <main className="clientes-profile">
          {/* Mobile back button */}
          <button type="button" className="clientes-mobile-back" onClick={handleMobileBack}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Clientes
          </button>

          {!selectedClient && !isLoadingClients && clients.length > 0 && (
            <div className="profile-placeholder">
              <div className="profile-placeholder__inner">
                <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
                  <circle cx="28" cy="20" r="12" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
                  <path d="M6 52c0-12.15 9.85-22 22-22s22 9.85 22 22" stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <p className="profile-placeholder__title">Selecciona un cliente</p>
                <p className="profile-placeholder__sub">Elige un cliente de la lista para ver su perfil, programa y métricas.</p>
              </div>
            </div>
          )}

          {selectedClient && (
            <ProfilePanel
              client={selectedClient}
              clientDetail={clientDetailData ?? null}
              isLoadingDetail={isLoadingDetail}
              isDetailError={isDetailError}
              refetchDetail={refetchDetail}
            />
          )}
        </main>
      </div>

      <ContextualHint screenKey="clients" />

      <FindUserModal
        isOpen={isFindUserOpen}
        onClose={handleCloseFindUser}
        onUserFound={handleUserFound}
        onLookup={handleLookupUser}
        onViewClient={handleViewClientFromModal}
        clients={clients}
        isLookingUp={isLookingUp}
        error={findUserError}
      />

      <AssignProgramModal
        isOpen={isAssignOpen}
        onClose={handleCloseAssign}
        onAssign={handleAssign}
        clientUser={lookedUpUser}
        isAssigning={isAssigning}
        error={assignError}
        creatorId={user?.uid}
      />
    </DashboardLayout>
  );
};

export default ProgramsAndClientsScreen;
