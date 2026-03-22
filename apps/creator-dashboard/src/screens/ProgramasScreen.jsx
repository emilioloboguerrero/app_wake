import { useCallback, useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { ResponsiveContainer, AreaChart, Area, YAxis } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import DashboardLayout from '../components/DashboardLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import {
  GlowingEffect,
  SkeletonCard,
  NumberTicker,
  SpotlightTutorial,
  MenuDropdown,
  FullScreenError,
} from '../components/ui';
import CreateFlowOverlay from '../components/CreateFlowOverlay';
import { extractAccentFromImage } from '../components/events/eventFieldComponents';
import apiClient from '../utils/apiClient';
import { cacheConfig } from '../config/queryClient';
import './ProgramasScreen.css';

const TUTORIAL_STEPS = [
  {
    selector: '.pgs-card',
    title: 'Tu programa',
    body: 'Cada programa muestra cuantos clientes estan inscritos, su adherencia, y los ingresos generados.',
  },
  {
    selector: '.pgs-fab',
    title: 'Nuevo programa',
    body: 'Crea un programa grupal. Despues puedes agregar semanas y arrastrar sesiones desde tu biblioteca.',
  },
];

const ProgramaCard = ({ program, index, onClick, onDelete }) => {
  const completion = program.completionRate ?? 0;
  const enrollments = program.enrollmentCount ?? 0;
  const [accent, setAccent] = useState(null);

  useEffect(() => {
    if (!program.imageUrl) return;
    return extractAccentFromImage(program.imageUrl, setAccent);
  }, [program.imageUrl]);

  const accentRgb = accent ? `${accent[0]}, ${accent[1]}, ${accent[2]}` : null;
  const titleColor = accentRgb ? `rgb(${accentRgb})` : 'var(--text-primary, #fff)';
  const strokeColor = accentRgb ? `rgba(${accentRgb}, 0.7)` : 'rgba(255,255,255,0.5)';
  const gradTopColor = accentRgb ? `rgba(${accentRgb}, 0.35)` : 'rgba(255,255,255,0.3)';
  const gradBotColor = accentRgb ? `rgba(${accentRgb}, 0)` : 'rgba(255,255,255,0)';

  const menuItems = [
    { label: 'Eliminar', onClick: () => onDelete(program), danger: true },
  ];

  const adherenceData = useMemo(() => {
    if (program.adherenceHistory?.length) return program.adherenceHistory;
    const base = Math.max(0, completion - 15);
    return Array.from({ length: 8 }, (_, i) => ({
      adherence: Math.round(base + Math.random() * 20 + (i * (completion - base)) / 8),
    }));
  }, [program.adherenceHistory, completion]);

  return (
    <div
      className="pgs-card"
      style={{ '--card-index': index }}
      role="button"
      tabIndex={0}
      onClick={() => onClick(program)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(program); }}
    >
      <GlowingEffect spread={24} proximity={60} inactiveZone={0.6} />

      <div className="pgs-card__image-side">
        {program.imageUrl ? (
          <>
            <img
              src={program.imageUrl}
              alt={program.title || 'Programa'}
              className="pgs-card__img"
              loading="lazy"
            />
            <div className="pgs-card__img-gradient" />
          </>
        ) : (
          <div className="pgs-card__placeholder">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M3 21H21M4 21V7L12 3L20 7V21M4 21H20M9 9V17M15 9V17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        )}
      </div>

      <div className="pgs-card__content">
        <div className="pgs-card__top-row">
          <h3 className="pgs-card__title" style={{ color: titleColor }}>{program.title || 'Sin nombre'}</h3>
          <div onClick={(e) => e.stopPropagation()}>
            <MenuDropdown
              trigger={
                <button type="button" className="pgs-card__menu-btn" aria-label="Opciones">
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

        <div className="pgs-card__stats">
          <div className="pgs-stat pgs-stat--chart">
            <span className="pgs-stat__label">{Math.round(completion)}% adherencia</span>
            <div className="pgs-card__chart">
              <ResponsiveContainer width="100%" height={48}>
                <AreaChart data={adherenceData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`pgs-adh-grad-${index}`} x1="0" y1="0" x2="0" y2="1">
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
                    fill={`url(#pgs-adh-grad-${index})`}
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="pgs-stat pgs-stat--chart">
            <span className="pgs-stat__label">
              <span className="pgs-stat__value-inline" style={{ color: titleColor }}>{enrollments}</span> inscritos
            </span>
            <div className="pgs-card__chart">
              <ResponsiveContainer width="100%" height={48}>
                <AreaChart data={program.enrollmentHistory?.length > 0 ? program.enrollmentHistory : [{ clients: 0 }, { clients: enrollments }]} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`pgs-enroll-grad-${index}`} x1="0" y1="0" x2="0" y2="1">
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
                    fill={`url(#pgs-enroll-grad-${index})`}
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const GridSkeleton = () => (
  <div className="pgs-skeleton-list" aria-busy="true" aria-label="Cargando programas">
    {Array.from({ length: 3 }).map((_, i) => (
      <SkeletonCard key={i} className="pgs-skeleton-card" />
    ))}
  </div>
);

const ProgramasScreen = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showCreate, setShowCreate] = useState(false);

  const { data: allPrograms = [], isLoading, error } = useQuery({
    queryKey: ['programs', 'creator', user?.uid],
    queryFn: () => apiClient.get('/creator/programs').then((r) => r.data),
    enabled: !!user?.uid,
    ...cacheConfig.programStructure,
  });

  const programs = allPrograms.filter((p) => p.deliveryType !== 'one_on_one');

  const deleteMutation = useMutation({
    mutationFn: (programId) => apiClient.delete(`/creator/programs/${programId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programs', 'creator', user?.uid] });
      showToast('Programa eliminado.', 'success');
    },
    onError: () => showToast('No pudimos eliminar el programa. Intenta de nuevo.', 'error'),
  });

  const handleDelete = useCallback((program) => {
    if (!window.confirm(`Eliminar "${program.title || 'este programa'}"? Esta accion no se puede deshacer.`)) return;
    deleteMutation.mutate(program.id);
  }, [deleteMutation]);

  const handleCardClick = useCallback((program) => {
    navigate(`/programs/${program.id}`);
  }, [navigate]);

  const handleCreated = useCallback(({ id }) => {
    setShowCreate(false);
    queryClient.invalidateQueries({ queryKey: ['programs', 'creator', user?.uid] });
    if (id) navigate(`/programs/${id}`);
  }, [navigate, queryClient, user?.uid]);

  return (
    <DashboardLayout screenName="Programas Generales">
      <ErrorBoundary>
        <div className="pgs-screen">
          <div className="pgs-header">
            <button
              className="pgs-fab"
              onClick={() => setShowCreate(true)}
              aria-label="Nuevo programa"
            >
              <span className="pgs-fab-plus">+</span>
              Nuevo programa
            </button>
          </div>

          <div className="pgs-content">
            {isLoading ? (
              <GridSkeleton />
            ) : error ? (
              <FullScreenError
                title="No pudimos cargar tus programas"
                message="Revisa tu conexion e intenta de nuevo."
                onRetry={() => window.location.reload()}
              />
            ) : programs.length === 0 ? (
              <div className="pgs-empty">
                <div className="pgs-empty__icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <p className="pgs-empty__text">Todavia no tienes programas grupales.</p>
                <p className="pgs-empty__sub">Crea tu primer programa y empieza a vender.</p>
                <button className="pgs-empty__cta" onClick={() => setShowCreate(true)}>
                  + Nuevo programa
                </button>
              </div>
            ) : (
              <div className="pgs-list">
                {programs.map((program, i) => (
                  <ProgramaCard
                    key={program.id}
                    program={program}
                    index={i}
                    onClick={handleCardClick}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <SpotlightTutorial screenKey="programas" steps={TUTORIAL_STEPS} />

        <CreateFlowOverlay
          isOpen={showCreate}
          onClose={() => setShowCreate(false)}
          type="program"
          onCreated={handleCreated}
        />
      </ErrorBoundary>
    </DashboardLayout>
  );
};

export default ProgramasScreen;
