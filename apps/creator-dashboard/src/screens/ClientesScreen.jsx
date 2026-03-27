import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ResponsiveContainer, AreaChart, Area, YAxis } from 'recharts';
import DashboardLayout from '../components/DashboardLayout';
import {
  GlowingEffect,
  SkeletonCard,
  TubelightNavBar,
  NumberTicker,
  SpotlightTutorial,
  MenuDropdown,
  AnimatedList,
  ConfirmDeleteModal,
} from '../components/ui/index.js';
import { FullScreenError } from '../components/ui/ErrorStates';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import apiClient from '../utils/apiClient';
import { cacheConfig } from '../config/queryClient';
import FindUserModal from '../components/FindUserModal';
import AssignProgramModal from '../components/AssignProgramModal';
import CreateFlowOverlay from '../components/CreateFlowOverlay';
import oneOnOneService from '../services/oneOnOneService';
import { extractAccentFromImage } from '../components/events/eventFieldComponents';
import { AvailabilityContent } from './AvailabilityCalendarScreen';
import './ClientesScreen.css';

// ─── Constants ───────────────────────────────────────────────────────────────

const TABS = [
  { id: 'clientes', label: 'Clientes' },
  { id: 'asesorias', label: 'Programas 1:1' },
  { id: 'llamadas', label: 'Llamadas' },
];

const TUTORIAL_STEPS = [
  {
    selector: '.cl-tabs',
    title: 'Todo en un lugar',
    body: 'Clientes, programas 1:1 y llamadas. Todo lo relacionado con tus clientes individuales en una sola pantalla.',
  },
  {
    selector: '.cl-group',
    title: 'Agrupados por programa',
    body: 'Tus clientes agrupados por programa. El color del borde viene de la imagen del programa.',
  },
];

function getInitial(name) {
  return (name || '?').charAt(0).toUpperCase();
}

// ─── Client card ─────────────────────────────────────────────────────────────

function ClientCard({ client, onClick }) {
  const name = client.clientName || client.clientEmail || `Cliente ${(client.clientUserId || client.userId || '').slice(0, 8)}`;
  const isActive = client.status !== 'inactive';

  return (
    <button type="button" className="cl-card" onClick={onClick}>
      <GlowingEffect spread={20} proximity={48} inactiveZone={0.6} />
      <div className="cl-card__avatar">
        {client.avatarUrl
          ? <img src={client.avatarUrl} alt={name} className="cl-card__avatar-img" />
          : <span className="cl-card__avatar-initial">{getInitial(name)}</span>}
      </div>
      <div className="cl-card__info">
        <span className="cl-card__name">{name}</span>
        {client.clientEmail && client.clientName && (
          <span className="cl-card__email">{client.clientEmail}</span>
        )}
      </div>
      <span
        className="cl-card__status"
        style={{ background: isActive ? 'rgba(74,222,128,0.9)' : 'var(--text-tertiary, rgba(255,255,255,0.25))' }}
        aria-label={isActive ? 'Activo' : 'Inactivo'}
      />
      <svg className="cl-card__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

// ─── Color-coded client group ────────────────────────────────────────────────

function ClientGroup({ title, clients, programId, imageUrl, onSelectClient, onConfigClick, defaultExpanded = true }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [accent, setAccent] = useState(null);

  useEffect(() => {
    if (!imageUrl) return;
    const cleanup = extractAccentFromImage(imageUrl, setAccent);
    return cleanup;
  }, [imageUrl]);

  const borderColor = accent
    ? `rgb(${accent[0]}, ${accent[1]}, ${accent[2]})`
    : 'rgba(255, 255, 255, 0.08)';

  const glowColor = accent
    ? `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, 0.06)`
    : 'transparent';

  return (
    <div
      className="cl-group"
      style={{
        borderLeftColor: borderColor,
        '--cl-group-glow': glowColor,
      }}
    >
      <div className="cl-group__header" role="button" tabIndex={0} onClick={() => setExpanded((v) => !v)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded((v) => !v); }}>
        <svg
          className={`cl-group__chevron ${expanded ? 'cl-group__chevron--open' : ''}`}
          width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden
        >
          <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="cl-group__title">{title}</span>
        <span className="cl-group__count">{clients.length}</span>
        {programId && (
          <button
            type="button"
            className="cl-group__gear"
            onClick={(e) => { e.stopPropagation(); onConfigClick(programId); }}
            aria-label="Configurar programa"
            title="Configurar programa"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="1.8" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </button>
        )}
      </div>
      {expanded && (
        <div className="cl-group__grid">
          {clients.map((client) => (
            <ClientCard
              key={client.id || client.clientUserId}
              client={client}
              onClick={() => onSelectClient(client)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Asesoría program card (same style as ProgramasScreen) ──────────────────

function AsesoriaCard({ program, index, enrollmentHistory, onClick, onDelete }) {
  const completion = program.completionRate ?? 0;
  const enrollments = program.enrollmentCount ?? 0;
  const [accent, setAccent] = useState(null);

  useEffect(() => {
    if (!program.imageUrl) return;
    const cleanup = extractAccentFromImage(program.imageUrl, setAccent);
    return cleanup;
  }, [program.imageUrl]);

  const accentRgb = accent ? `${accent[0]}, ${accent[1]}, ${accent[2]}` : null;
  const titleColor = accentRgb ? `rgb(${accentRgb})` : 'var(--text-primary, #fff)';
  const strokeColor = accentRgb ? `rgba(${accentRgb}, 0.7)` : 'rgba(255,255,255,0.5)';
  const gradTopColor = accentRgb ? `rgba(${accentRgb}, 0.35)` : 'rgba(255,255,255,0.3)';
  const gradBotColor = accentRgb ? `rgba(${accentRgb}, 0)` : 'rgba(255,255,255,0)';

  const adherenceData = useMemo(() => {
    if (program.adherenceHistory?.length) return program.adherenceHistory;
    const base = Math.max(0, completion - 15);
    return Array.from({ length: 8 }, (_, i) => ({
      adherence: Math.round(base + Math.random() * 20 + (i * (completion - base)) / 8),
    }));
  }, [program.adherenceHistory, completion]);

  const menuItems = [
    { label: 'Eliminar', onClick: () => onDelete(program), danger: true },
  ];

  return (
    <div
      className="cl-asesoria-card"
      style={{ '--card-index': index }}
      role="button"
      tabIndex={0}
      onClick={() => onClick(program)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(program); }}
    >
      <GlowingEffect spread={24} proximity={60} inactiveZone={0.6} />

      <div className="cl-asesoria-card__image-side">
        {program.imageUrl ? (
          <>
            <img src={program.imageUrl} alt={program.title || 'Programa 1:1'} className="cl-asesoria-card__img" loading="lazy" />
            <div className="cl-asesoria-card__img-gradient" />
          </>
        ) : (
          <div className="cl-asesoria-card__placeholder">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M16 21V19C16 17.9391 15.5786 16.9217 14.8284 16.1716C14.0783 15.4214 13.0609 15 12 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="8.5" cy="7" r="4" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M20 8V14M17 11H23" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </div>
        )}
      </div>

      <div className="cl-asesoria-card__content">
        <div className="cl-asesoria-card__top-row">
          <h3 className="cl-asesoria-card__title" style={{ color: titleColor }}>{program.title || 'Sin nombre'}</h3>
          <div onClick={(e) => e.stopPropagation()}>
            <MenuDropdown
              trigger={
                <button type="button" className="cl-asesoria-card__menu-btn" aria-label="Opciones">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="12" cy="5" r="1.5" fill="currentColor" />
                    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                    <circle cx="12" cy="19" r="1.5" fill="currentColor" />
                  </svg>
                </button>
              }
              items={menuItems}
            />
          </div>
        </div>

        <div className="cl-asesoria-card__stats">
          <div className="cl-asesoria-stat cl-asesoria-stat--chart">
            <span className="cl-asesoria-stat__label">{Math.round(completion)}% adherencia</span>
            <div className="cl-asesoria-card__chart">
              <ResponsiveContainer width="100%" height={48}>
                <AreaChart data={adherenceData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`adh-grad-${index}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={gradTopColor} />
                      <stop offset="100%" stopColor={gradBotColor} />
                    </linearGradient>
                  </defs>
                  <YAxis hide domain={[dataMin => Math.max(0, dataMin - 5), dataMax => Math.min(100, dataMax + Math.max(10, Math.ceil(dataMax * 0.3)))]} />
                  <Area
                    type="monotone"
                    dataKey="adherence"
                    stroke={strokeColor}
                    strokeWidth={1.5}
                    fill={`url(#adh-grad-${index})`}
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="cl-asesoria-stat cl-asesoria-stat--chart">
            <span className="cl-asesoria-stat__label">
              <span className="cl-asesoria-stat__value-inline" style={{ color: titleColor }}>{enrollments}</span> clientes
            </span>
            {enrollmentHistory?.length > 0 && (
              <div className="cl-asesoria-card__chart">
                <ResponsiveContainer width="100%" height={48}>
                  <AreaChart data={enrollmentHistory} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id={`enroll-grad-${index}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={gradTopColor} />
                        <stop offset="100%" stopColor={gradBotColor} />
                      </linearGradient>
                    </defs>
                    <YAxis hide domain={[dataMin => Math.max(0, dataMin - 1), dataMax => dataMax + Math.max(1, Math.ceil(dataMax * 0.3))]} />
                    <Area
                      type="monotone"
                      dataKey="clients"
                      stroke={strokeColor}
                      strokeWidth={1.5}
                      fill={`url(#enroll-grad-${index})`}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton / empty states ─────────────────────────────────────────────────

function ListSkeleton() {
  return (
    <div className="cl-skeleton">
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonCard key={i} className="cl-skeleton__card" />
      ))}
    </div>
  );
}

function AsesoriasSkeleton() {
  return (
    <div className="cl-asesorias-list">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="cl-asesoria-skeleton" style={{ animationDelay: `${i * 80}ms` }}>
          <div className="cl-asesoria-skeleton__image" />
          <div className="cl-asesoria-skeleton__content">
            <div className="cl-asesoria-skeleton__title" />
            <div className="cl-asesoria-skeleton__stats">
              <div className="cl-asesoria-skeleton__stat" />
              <div className="cl-asesoria-skeleton__chart" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyClients({ onAddClient }) {
  return (
    <div className="cl-empty">
      <div className="cl-empty__icon" aria-hidden="true">
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
          <circle cx="28" cy="20" r="10" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
          <path d="M8 50c0-11.046 8.954-20 20-20s20 8.954 20 20" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <p className="cl-empty__title">Tu lista está vacía</p>
      <p className="cl-empty__sub">Agrega tu primer cliente para empezar a gestionar sus programas, nutrición y progreso.</p>
      <button type="button" className="cl-empty__cta" onClick={onAddClient}>+ Agregar primer cliente</button>
    </div>
  );
}

function EmptyAsesorias({ onCreate }) {
  return (
    <div className="cl-empty">
      <div className="cl-empty__icon" aria-hidden="true">
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
          <rect x="8" y="12" width="40" height="32" rx="4" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
          <path d="M28 24V36M22 30H34" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <p className="cl-empty__title">Sin programas 1:1</p>
      <p className="cl-empty__sub">Crea tu primer programa individual para empezar a trabajar con clientes.</p>
      <button type="button" className="cl-empty__cta" onClick={onCreate}>+ Nuevo programa 1:1</button>
    </div>
  );
}

// ─── Filter/Sort panel ───────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { id: 'name_asc', label: 'Nombre A→Z' },
  { id: 'name_desc', label: 'Nombre Z→A' },
  { id: 'date_newest', label: 'Más recientes' },
  { id: 'date_oldest', label: 'Más antiguos' },
];

const STATUS_OPTIONS = [
  { id: 'all', label: 'Todos' },
  { id: 'active', label: 'Activos' },
  { id: 'inactive', label: 'Inactivos' },
];

const ACCESS_OPTIONS = [
  { id: 'all', label: 'Todos' },
  { id: 'active', label: 'Vigente' },
  { id: 'expiring', label: 'Por vencer (< 7 días)' },
  { id: 'expired', label: 'Vencido' },
];

function FilterSortPanel({ isOpen, onClose, filters, onFiltersChange, programs }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const update = (key, value) => onFiltersChange({ ...filters, [key]: value });

  const activeCount = [
    filters.status !== 'all' ? 1 : 0,
    filters.program !== 'all' ? 1 : 0,
    filters.access !== 'all' ? 1 : 0,
    filters.sort !== 'name_asc' ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  return (
    <div className="cl-filter-panel" ref={panelRef}>
      <div className="cl-filter-panel__section">
        <span className="cl-filter-panel__label">Estado</span>
        <div className="cl-filter-panel__chips">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`cl-filter-chip ${filters.status === opt.id ? 'cl-filter-chip--active' : ''}`}
              onClick={() => update('status', opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="cl-filter-panel__section">
        <span className="cl-filter-panel__label">Programa 1:1</span>
        <div className="cl-filter-panel__chips">
          <button
            type="button"
            className={`cl-filter-chip ${filters.program === 'all' ? 'cl-filter-chip--active' : ''}`}
            onClick={() => update('program', 'all')}
          >
            Todas
          </button>
          {programs.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`cl-filter-chip ${filters.program === p.id ? 'cl-filter-chip--active' : ''}`}
              onClick={() => update('program', p.id)}
            >
              {p.title || 'Sin nombre'}
            </button>
          ))}
        </div>
      </div>

      <div className="cl-filter-panel__section">
        <span className="cl-filter-panel__label">Acceso</span>
        <div className="cl-filter-panel__chips">
          {ACCESS_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`cl-filter-chip ${filters.access === opt.id ? 'cl-filter-chip--active' : ''}`}
              onClick={() => update('access', opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="cl-filter-panel__divider" />

      <div className="cl-filter-panel__section">
        <span className="cl-filter-panel__label">Ordenar por</span>
        <div className="cl-filter-panel__chips">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`cl-filter-chip ${filters.sort === opt.id ? 'cl-filter-chip--active' : ''}`}
              onClick={() => update('sort', opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {activeCount > 0 && (
        <button
          type="button"
          className="cl-filter-panel__clear"
          onClick={() => onFiltersChange({ status: 'all', program: 'all', access: 'all', sort: 'name_asc' })}
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}

function getAccessStatus(client) {
  const programs = client.enrolledPrograms;
  if (!programs?.length) return 'unknown';
  for (const p of programs) {
    if (!p.expires_at && !p.accessEndsAt) continue;
    const dateStr = p.expires_at || p.accessEndsAt;
    try {
      const end = new Date(dateStr);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      const days = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
      if (days < 0) return 'expired';
      if (days < 7) return 'expiring';
      return 'active';
    } catch { continue; }
  }
  return 'unknown';
}

const DEFAULT_FILTERS = { status: 'all', program: 'all', access: 'all', sort: 'name_asc' };

// ─── Main screen ─────────────────────────────────────────────────────────────

const ClientesScreen = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = searchParams.get('tab') || 'clientes';
  const setActiveTab = useCallback((tab) => {
    setSearchParams({ tab }, { replace: true });
  }, [setSearchParams]);

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);

  const activeFilterCount = useMemo(() => [
    filters.status !== 'all' ? 1 : 0,
    filters.program !== 'all' ? 1 : 0,
    filters.access !== 'all' ? 1 : 0,
    filters.sort !== 'name_asc' ? 1 : 0,
  ].reduce((a, b) => a + b, 0), [filters]);

  // Add client flow
  const [isFindUserOpen, setIsFindUserOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [lookedUpUser, setLookedUpUser] = useState(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState(null);
  const [showCreateAsesoria, setShowCreateAsesoria] = useState(false);

  // Data fetching
  const { data: clientsData, isLoading: isLoadingClients, isError: isClientsError, refetch: refetchClients } = useQuery({
    queryKey: ['clients', 'creator', user?.uid],
    queryFn: () => apiClient.get('/creator/clients').then((res) => res?.data ?? []),
    ...cacheConfig.userProfile,
    enabled: !!user?.uid,
  });

  const { data: programsData = [], isLoading: isLoadingPrograms } = useQuery({
    queryKey: ['programs', 'creator', user?.uid],
    queryFn: () => apiClient.get('/creator/programs').then((r) => r.data),
    enabled: !!user?.uid,
    ...cacheConfig.programStructure,
  });

  const { data: adherenceData } = useQuery({
    queryKey: ['analytics', 'adherence', user?.uid],
    queryFn: () => apiClient.get('/analytics/adherence').then((r) => r.data),
    enabled: !!user?.uid,
    ...cacheConfig.analytics,
  });

  const adherenceByProgram = useMemo(() => {
    if (!adherenceData?.byProgram) return {};
    const map = {};
    for (const p of adherenceData.byProgram) {
      map[p.programId] = p;
    }
    return map;
  }, [adherenceData]);

  const clients = clientsData || [];

  // Count enrolled clients per program from already-fetched clients data
  const enrollmentCounts = useMemo(() => {
    const counts = {};
    for (const client of clients) {
      for (const enrollment of client.enrolledPrograms || []) {
        counts[enrollment.courseId] = (counts[enrollment.courseId] || 0) + 1;
      }
    }
    return counts;
  }, [clients]);

  const oneOnOnePrograms = useMemo(() => {
    return programsData
      .filter((p) => p.deliveryType === 'one_on_one')
      .map((p) => {
        const adh = adherenceByProgram[p.id];
        return {
          ...p,
          enrollmentCount: enrollmentCounts[p.id] ?? 0,
          completionRate: adh?.adherence ?? 0,
          adherenceHistory: adh?.weeklyHistory ?? null,
        };
      });
  }, [programsData, enrollmentCounts, adherenceByProgram]);

  // Build a map of programId → imageUrl for color extraction
  const programImageMap = useMemo(() => {
    const map = {};
    for (const p of programsData) {
      if (p.imageUrl) map[p.id] = p.imageUrl;
    }
    return map;
  }, [programsData]);

  // Group clients by asesoría program
  const grouped = useMemo(() => {
    const groups = {};
    const ungrouped = [];

    for (const client of clients) {
      const programs = client.enrolledPrograms;
      if (!programs?.length) {
        ungrouped.push(client);
        continue;
      }
      for (const enrollment of programs) {
        if (!groups[enrollment.courseId]) {
          groups[enrollment.courseId] = {
            programId: enrollment.courseId,
            programTitle: enrollment.title || 'Sin nombre',
            clients: [],
          };
        }
        groups[enrollment.courseId].clients.push(client);
      }
    }

    return { groups: Object.values(groups), ungrouped };
  }, [clients]);

  // Filter + sort
  const filterAndSortClients = useCallback((clientList) => {
    let result = clientList;

    // Text search
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((c) => {
        const name = (c.clientName || '').toLowerCase();
        const email = (c.clientEmail || '').toLowerCase();
        return name.includes(q) || email.includes(q);
      });
    }

    // Status filter
    if (filters.status === 'active') {
      result = result.filter((c) => c.status !== 'inactive');
    } else if (filters.status === 'inactive') {
      result = result.filter((c) => c.status === 'inactive');
    }

    // Access filter
    if (filters.access !== 'all') {
      result = result.filter((c) => getAccessStatus(c) === filters.access);
    }

    // Sort
    result = [...result].sort((a, b) => {
      const nameA = (a.clientName || a.clientEmail || '').toLowerCase();
      const nameB = (b.clientName || b.clientEmail || '').toLowerCase();
      switch (filters.sort) {
        case 'name_desc': return nameB.localeCompare(nameA);
        case 'date_newest': return (b.created_at || '').localeCompare(a.created_at || '');
        case 'date_oldest': return (a.created_at || '').localeCompare(b.created_at || '');
        default: return nameA.localeCompare(nameB);
      }
    });

    return result;
  }, [search, filters]);

  const handleSelectClient = useCallback((client) => {
    const id = client.id || client.clientUserId || client.userId;
    navigate(`/clients/${id}`);
  }, [navigate]);

  const handleConfigClick = useCallback((programId) => {
    navigate(`/clientes/programa/${programId}`);
  }, [navigate]);

  // Add client handlers
  const handleLookupUser = useCallback(async (emailOrUsername) => {
    if (!emailOrUsername?.trim()) return null;
    try {
      return await oneOnOneService.lookupUserByEmailOrUsername(emailOrUsername.trim());
    } catch { return null; }
  }, []);

  const handleUserFound = useCallback((userInfo) => {
    setLookedUpUser(userInfo);
    setIsFindUserOpen(false);
    setIsAssignOpen(true);
    setAssignError(null);
  }, []);

  const handleAssign = useCallback(async (clientUserId, programId) => {
    if (!clientUserId || !programId || !user) return;
    try {
      setIsAssigning(true);
      setAssignError(null);
      await oneOnOneService.addClientToProgram(user.uid, clientUserId, programId);
      await queryClient.invalidateQueries({ queryKey: ['clients', 'creator', user.uid] });
      setIsAssignOpen(false);
      setLookedUpUser(null);
    } catch (err) {
      setAssignError(err.message || 'Error al agregar el cliente');
    } finally {
      setIsAssigning(false);
    }
  }, [user, queryClient]);

  const handleAsesoriaCreated = useCallback(() => {
    setShowCreateAsesoria(false);
    queryClient.invalidateQueries({ queryKey: ['programs', 'creator', user?.uid] });
    setActiveTab('asesorias');
  }, [queryClient, user?.uid]);

  const { showToast } = useToast();

  const [deleteTarget, setDeleteTarget] = useState(null);

  const deleteAsesoriaMutation = useMutation({
    mutationFn: (programId) => apiClient.delete(`/creator/programs/${programId}`),
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['programs', 'creator', user?.uid] });
      showToast('Programa eliminado.', 'success');
    },
    onError: () => showToast('No pudimos eliminar el programa. Intenta de nuevo.', 'error'),
  });

  const handleDeleteAsesoria = useCallback((program) => {
    setDeleteTarget(program);
  }, []);

  const confirmDeleteAsesoria = useCallback(() => {
    if (!deleteTarget) return;
    deleteAsesoriaMutation.mutate(deleteTarget.id);
  }, [deleteTarget, deleteAsesoriaMutation]);

  // ── Primary action per tab ─────────────────────────────────────────────────

  const handlePrimaryAction = useCallback(() => {
    if (activeTab === 'clientes') {
      setIsFindUserOpen(true);
    } else if (activeTab === 'asesorias') {
      setShowCreateAsesoria(true);
    }
  }, [activeTab]);

  const primaryLabel = activeTab === 'clientes' ? 'Agregar cliente' : activeTab === 'asesorias' ? 'Nuevo programa 1:1' : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isClientsError && activeTab === 'clientes') {
    return (
      <DashboardLayout screenName="Asesorías">
        <FullScreenError title="No pudimos cargar tus clientes" message="Revisa tu conexion e intenta de nuevo." onRetry={refetchClients} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout screenName="Asesorías">
      <div className="cl-screen">
        <div className="cl-topbar">
          <TubelightNavBar items={TABS} activeId={activeTab} onSelect={setActiveTab} />
          {primaryLabel && (
            <button type="button" className="cl-topbar__add-btn" onClick={handlePrimaryAction}>
              <span className="cl-topbar__add-plus">+</span>
              {primaryLabel}
            </button>
          )}
        </div>

        <div className="cl-body" key={activeTab}>
          {activeTab === 'clientes' && (
            <div className="cl-search-row">
              <div className="cl-search cl-search--full">
                <svg className="cl-search__icon" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <input
                  type="text"
                  className="cl-search__input"
                  placeholder="Buscar clientes…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="cl-filter-wrap">
                <button
                  type="button"
                  className={`cl-filter-btn ${activeFilterCount > 0 ? 'cl-filter-btn--active' : ''}`}
                  onClick={() => setFilterOpen((v) => !v)}
                  aria-label="Filtrar"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M22 3H2L10 12.46V19L14 21V12.46L22 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Filtrar
                  {activeFilterCount > 0 && (
                    <span className="cl-filter-btn__badge">{activeFilterCount}</span>
                  )}
                </button>
                <FilterSortPanel
                  isOpen={filterOpen}
                  onClose={() => setFilterOpen(false)}
                  filters={filters}
                  onFiltersChange={setFilters}
                  programs={oneOnOnePrograms}
                />
              </div>
            </div>
          )}
          {/* ── Clientes tab ─────────────────────────────────── */}
          {activeTab === 'clientes' && (
            isLoadingClients ? (
              <ListSkeleton />
            ) : clients.length === 0 ? (
              <EmptyClients onAddClient={() => setIsFindUserOpen(true)} />
            ) : (
              <div className="cl-groups">
                {grouped.groups.map((group) => {
                  if (filters.program !== 'all' && group.programId !== filters.program) return null;
                  const filteredGroupClients = filterAndSortClients(group.clients);
                  if (filteredGroupClients.length === 0) return null;
                  return (
                    <ClientGroup
                      key={group.programId}
                      title={group.programTitle}
                      clients={filteredGroupClients}
                      programId={group.programId}
                      imageUrl={programImageMap[group.programId]}
                      onSelectClient={handleSelectClient}
                      onConfigClick={handleConfigClick}
                    />
                  );
                })}
                {grouped.ungrouped.length > 0 && filters.program === 'all' && (() => {
                  const filteredUngrouped = filterAndSortClients(grouped.ungrouped);
                  if (filteredUngrouped.length === 0) return null;
                  return (
                    <ClientGroup
                      title="Sin programa"
                      clients={filteredUngrouped}
                      programId={null}
                      imageUrl={null}
                      onSelectClient={handleSelectClient}
                      onConfigClick={() => {}}
                    />
                  );
                })()}
              </div>
            )
          )}

          {/* ── Asesorías tab ────────────────────────────────── */}
          {activeTab === 'asesorias' && (
            isLoadingPrograms ? (
              <AsesoriasSkeleton />
            ) : oneOnOnePrograms.length === 0 ? (
              <EmptyAsesorias onCreate={() => setShowCreateAsesoria(true)} />
            ) : (
              <div className="cl-asesorias-list">
                <AnimatePresence mode="popLayout">
                  {oneOnOnePrograms.map((program, i) => (
                    <motion.div
                      key={program.id}
                      layout
                      exit={{ opacity: 0, scale: 0.92, x: -30, filter: 'blur(4px)' }}
                      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <AsesoriaCard
                        program={program}
                        index={i}
                        enrollmentHistory={adherenceData?.enrollmentHistory ?? null}
                        onClick={(p) => navigate(`/clientes/programa/${p.id}`)}
                        onDelete={handleDeleteAsesoria}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )
          )}

          {/* ── Llamadas tab ─────────────────────────────────── */}
          {activeTab === 'llamadas' && (
            <div className="cl-llamadas-wrap">
              <AvailabilityContent />
            </div>
          )}
        </div>
      </div>

      <FindUserModal
        isOpen={isFindUserOpen}
        onClose={() => setIsFindUserOpen(false)}
        onLookup={handleLookupUser}
        onUserFound={handleUserFound}
        onViewClient={(clientId) => { setIsFindUserOpen(false); navigate(`/clients/${clientId}`); }}
      />

      <AssignProgramModal
        isOpen={isAssignOpen}
        onClose={() => { setIsAssignOpen(false); setLookedUpUser(null); }}
        clientUser={lookedUpUser}
        creatorId={user?.uid}
        onAssign={handleAssign}
        isAssigning={isAssigning}
        error={assignError}
      />

      <CreateFlowOverlay
        isOpen={showCreateAsesoria}
        onClose={() => setShowCreateAsesoria(false)}
        type="program"
        defaultDeliveryType="one_on_one"
        onCreated={handleAsesoriaCreated}
      />

      <SpotlightTutorial screenKey="clientes" steps={TUTORIAL_STEPS} />

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteAsesoria}
        itemName={deleteTarget?.title || 'este programa'}
        description="Esta acción no se puede deshacer."
        isDeleting={deleteAsesoriaMutation.isPending}
      />
    </DashboardLayout>
  );
};

export default ClientesScreen;
