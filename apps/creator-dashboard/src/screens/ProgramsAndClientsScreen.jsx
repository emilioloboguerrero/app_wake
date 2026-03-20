import React, { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '../components/DashboardLayout';
import {
  GlowingEffect,
  ScrollableDisplayCards,
  TubelightNavBar,
  SkeletonCard,
  ShimmerSkeleton,
  AnimatedList,
  ProgressRing,
  NumberTicker,
  SpotlightTutorial,
  MenuDropdown,
} from '../components/ui/index.js';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../utils/apiClient';
import { cacheConfig } from '../config/queryClient';
import './ProgramsAndClientsScreen.css';

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const PROFILE_TABS = [
  { id: 'plan', label: 'Planificación' },
  { id: 'nutricion', label: 'Nutrición' },
  { id: 'lab', label: 'Lab' },
  { id: 'llamadas', label: 'Llamadas' },
];

const TUTORIAL_STEPS = [
  {
    selector: '.clientes-roster',
    title: 'Tu lista de clientes',
    body: 'Aquí aparecen todos tus clientes activos. Haz clic en uno para ver su perfil completo.',
  },
  {
    selector: '.clientes-highlights',
    title: 'Destacados del cliente',
    body: 'El mejor PR, consistencia semanal y lectura de nutrición — todo de un vistazo.',
  },
  {
    selector: '.clientes-profile-tabs',
    title: 'Pestañas de detalle',
    body: 'Navega entre planificación, nutrición, métricas de lab y llamadas agendadas.',
  },
];

function getInitial(name) {
  return (name || '?').charAt(0).toUpperCase();
}

function RosterRow({ client, isSelected, onClick }) {
  const name = client.clientName || client.clientEmail || `Cliente ${(client.clientUserId || '').slice(0, 8)}`;
  const isActive = client.status !== 'inactive';

  return (
    <button
      type="button"
      className={`roster-row ${isSelected ? 'roster-row--active' : ''}`}
      onClick={onClick}
      aria-current={isSelected ? 'true' : undefined}
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

function EmptyRoster() {
  return (
    <div className="clientes-empty-state">
      <div className="clientes-empty-state__icon" aria-hidden="true">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="18" r="8" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
          <path d="M6 42c0-9.941 8.059-18 18-18s18 8.059 18 18" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <p className="clientes-empty-state__title">Todavía no tienes clientes</p>
      <p className="clientes-empty-state__body">Invita a tu primer cliente y empieza a transformar vidas.</p>
      <button type="button" className="clientes-empty-state__cta">
        Invita a tu primer cliente →
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

function PlanTab({ clientDetail }) {
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
      {clientDetail.accessEndsAt && (
        <div className="plan-access-pill">
          Acceso hasta: <strong>{clientDetail.accessEndsAt}</strong>
        </div>
      )}
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
        <p className="tab-empty__text">Sin plan de nutrición asignado todavía.</p>
      </div>
    );
  }

  return (
    <div className="tab-content tab-nutricion">
      <div className="nutricion-card">
        <GlowingEffect />
        <h4 className="nutricion-card__title">{plan.name || 'Plan de nutrición'}</h4>
        <div className="macro-row">
          <div className="macro-pill macro-pill--protein">
            <span className="macro-pill__label">Proteína</span>
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
            <span className="macro-pill__label">Calorías</span>
            <span className="macro-pill__value">{plan.calories ?? '—'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LabTab({ clientDetail }) {
  if (!clientDetail) {
    return (
      <div className="tab-content">
        <div style={{ display: 'flex', gap: '16px' }}>
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  const bodyProgress = clientDetail.bodyProgressPercent ?? 0;
  const readinessScore = clientDetail.readinessScore ?? 0;

  return (
    <div className="tab-content tab-lab">
      <div className="lab-card">
        <GlowingEffect />
        <div className="lab-card__ring-wrap">
          <ProgressRing
            percent={bodyProgress}
            size={88}
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
          <span className="lab-card__metric-sub">Promedio últimos 7 días</span>
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
        <p className="tab-empty__text">No hay llamadas agendadas todavía.</p>
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

function ProfilePanel({ client, clientDetail, isLoadingDetail }) {
  const [activeTab, setActiveTab] = useState('plan');

  const name = client.clientName || client.clientEmail || `Cliente ${(client.clientUserId || '').slice(0, 8)}`;
  const isActive = client.status !== 'inactive';

  const highlightItems = useMemo(() => {
    if (!clientDetail) return [];
    return [
      {
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
        title: 'Mejor PR',
        description: clientDetail.latestPR?.label || 'Sin datos aún',
        date: clientDetail.latestPR?.date || '',
      },
      {
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 12H18L15 21L9 3L6 12H2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
        title: 'Consistencia semanal',
        description: clientDetail.weeklyConsistency != null ? `${clientDetail.weeklyConsistency}%` : 'Sin datos',
        date: 'Esta semana',
      },
      {
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M18 8H19C20.0609 8 21.0783 8.42143 21.8284 9.17157C22.5786 9.92172 23 10.9391 23 12C23 13.0609 22.5786 14.0783 21.8284 14.8284C21.0783 15.5786 20.0609 16 19 16H18M18 8H2V17H18V8ZM18 8V5L14 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
        title: 'Nutrición hoy',
        description: clientDetail.nutritionReadiness || 'Sin registro',
        date: 'Adherencia',
      },
    ];
  }, [clientDetail]);

  const menuItems = [
    {
      label: 'Editar plan',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M11 4H4C3.46957 4 2.96086 4.21071 2.58579 4.58579C2.21071 4.96086 2 5.46957 2 6V20C2 20.5304 2.21071 21.0391 2.58579 21.4142C2.96086 21.7893 3.46957 22 4 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M18.5 2.50001C18.8978 2.10219 19.4374 1.87869 20 1.87869C20.5626 1.87869 21.1022 2.10219 21.5 2.50001C21.8978 2.89784 22.1213 3.43741 22.1213 4.00001C22.1213 4.56262 21.8978 5.10219 21.5 5.50001L12 15L8 16L9 12L18.5 2.50001Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      onClick: () => {},
    },
    {
      label: 'Ver historial',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 8V12L14 14M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      onClick: () => {},
    },
    { divider: true },
    {
      label: 'Desasignar',
      danger: true,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ),
      onClick: () => {},
    },
  ];

  return (
    <div className="profile-panel">
      {/* ── Top section (not scrollable) ── */}
      <div className="profile-top">
        {isLoadingDetail ? (
          <ProfileTopSkeleton />
        ) : (
          <>
            {/* Identity row */}
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

            {/* Highlights carousel */}
            <div className="clientes-highlights">
              {highlightItems.length > 0 ? (
                <ScrollableDisplayCards
                  items={highlightItems}
                  renderCard={(item) => ({
                    icon: item.icon,
                    title: item.title,
                    description: item.description,
                    date: item.date,
                  })}
                />
              ) : (
                <SkeletonCard />
              )}
            </div>

            {/* Quick actions */}
            <div className="profile-actions">
              <button type="button" className="profile-actions__btn profile-actions__btn--primary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M15.05 5A5 5 0 0119 8.95M15.05 1A9 9 0 0123 8.94M22 16.92V19.92C22.0011 20.4833 21.7772 21.0235 21.3748 21.4215C20.9724 21.8195 20.4254 22.0442 19.86 22.04C16.5604 21.7049 13.4081 20.5791 10.6696 18.7508C8.12208 17.0818 5.97316 14.9329 4.30425 12.3854C2.47018 9.63416 1.34426 6.46832 1.01506 3.15303C1.01096 2.58907 1.23369 2.04367 1.62879 1.64282C2.02388 1.24197 2.56141 1.01669 3.12197 1.01316H6.1221C7.1156 1.00428 7.95743 1.71413 8.11204 2.69415C8.24762 3.62383 8.47875 4.53616 8.80197 5.41316C9.07217 6.1215 8.88946 6.9202 8.33797 7.44316L7.09204 8.68909C8.64957 11.3286 10.8116 13.4906 13.451 15.0482L14.6969 13.8022C15.2199 13.2507 16.0186 13.068 16.727 13.3382C17.604 13.6614 18.5163 13.8925 19.446 14.028C20.4367 14.1845 21.1516 15.0428 21.1354 16.0461L22 16.92Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Agendar llamada
              </button>
              <button type="button" className="profile-actions__btn profile-actions__btn--ghost">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M9 19V6L21 3V16M9 19C9 20.1046 8.10457 21 7 21C5.89543 21 5 20.1046 5 19C5 17.8954 5.89543 17 7 17C8.10457 17 9 17.8954 9 19ZM21 16C21 17.1046 20.1046 18 19 18C17.8954 18 17 17.1046 17 16C17 14.8954 17.8954 14 19 14C20.1046 14 21 14.8954 21 16Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Ver Lab
              </button>
              <MenuDropdown
                trigger={
                  <button type="button" className="profile-actions__btn profile-actions__btn--ghost">
                    Más
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ marginLeft: '4px' }}>
                      <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                }
                items={menuItems}
              />
            </div>
          </>
        )}
      </div>

      {/* ── Tab nav ── */}
      <div className="clientes-profile-tabs">
        <TubelightNavBar
          items={PROFILE_TABS}
          activeId={activeTab}
          onSelect={setActiveTab}
        />
      </div>

      {/* ── Scrollable tab body ── */}
      <div className="profile-tab-body">
        {activeTab === 'plan' && <PlanTab clientDetail={isLoadingDetail ? null : clientDetail} />}
        {activeTab === 'nutricion' && <NutricionTab clientDetail={isLoadingDetail ? null : clientDetail} />}
        {activeTab === 'lab' && <LabTab clientDetail={isLoadingDetail ? null : clientDetail} />}
        {activeTab === 'llamadas' && <LlamadasTab clientDetail={isLoadingDetail ? null : clientDetail} />}
      </div>
    </div>
  );
}

const ProgramsAndClientsScreen = () => {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState(null);

  const { data: clientsData, isLoading: isLoadingClients, isError: isClientsError } = useQuery({
    queryKey: ['clients', 'creator', user?.uid],
    queryFn: () => apiClient.get('/clients'),
    ...cacheConfig.userProfile,
    enabled: !!user?.uid,
    select: (res) => res?.data ?? [],
  });

  const clients = clientsData || [];

  const { data: clientDetailData, isLoading: isLoadingDetail } = useQuery({
    queryKey: ['client', selectedClientId],
    queryFn: () => apiClient.get('/clients/' + selectedClientId),
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
  }, []);

  const handleClearSearch = useCallback(() => setSearch(''), []);

  const showEmptyState = !isLoadingClients && !isClientsError && clients.length === 0;

  return (
    <DashboardLayout screenName="Clientes">
      <div className="clientes-screen">

        {/* ── Left roster sidebar ── */}
        <aside className="clientes-roster">
          <div className="roster-search-wrap">
            <svg className="roster-search__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.8" />
              <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              className="roster-search__input"
              placeholder="Buscar cliente…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar cliente"
            />
            {search && (
              <button
                type="button"
                className="roster-search__clear"
                onClick={handleClearSearch}
                aria-label="Limpiar búsqueda"
              >
                ✕
              </button>
            )}
          </div>

          <div className="roster-list-wrap">
            {isLoadingClients ? (
              <RosterSkeleton />
            ) : isClientsError ? (
              <p className="roster-no-match">No se pudieron cargar los clientes. Intenta de nuevo.</p>
            ) : showEmptyState ? (
              <EmptyRoster />
            ) : filteredClients.length === 0 ? (
              <p className="roster-no-match">Sin coincidencias.</p>
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

        {/* ── Right profile panel ── */}
        <main className="clientes-profile">
          {!selectedClient && !isLoadingClients && clients.length > 0 && (
            <div className="profile-placeholder">
              <div className="profile-placeholder__inner">
                <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
                  <circle cx="28" cy="20" r="12" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
                  <path d="M6 52c0-12.15 9.85-22 22-22s22 9.85 22 22" stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <p className="profile-placeholder__title">Selecciona un cliente</p>
                <p className="profile-placeholder__sub">Haz clic en cualquier cliente para ver su perfil completo.</p>
              </div>
            </div>
          )}

          {selectedClient && (
            <ProfilePanel
              client={selectedClient}
              clientDetail={clientDetailData ?? null}
              isLoadingDetail={isLoadingDetail}
            />
          )}
        </main>
      </div>

      <SpotlightTutorial screenKey="clients" steps={TUTORIAL_STEPS} />
    </DashboardLayout>
  );
};

export default ProgramsAndClientsScreen;
