import { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import DashboardLayout from '../components/DashboardLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import {
  GlowingEffect,
  SkeletonCard,
  SpotlightTutorial,
  MenuDropdown,
  FullScreenError,
  ConfirmDeleteModal,
  TextAnimate,
} from '../components/ui';
import CreateFlowOverlay from '../components/CreateFlowOverlay';
import { extractAccentFromImage } from '../components/events/eventFieldComponents';
import apiClient from '../utils/apiClient';
import { cacheConfig, queryKeys } from '../config/queryClient';
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
  const enrollments = program.enrollmentCount ?? 0;
  const [accent, setAccent] = useState(null);

  useEffect(() => {
    if (!program.imageUrl) return;
    return extractAccentFromImage(program.imageUrl, setAccent);
  }, [program.imageUrl]);

  const accentRgb = accent ? `${accent[0]}, ${accent[1]}, ${accent[2]}` : null;
  const titleColor = accentRgb ? `rgb(${accentRgb})` : 'var(--text-primary, #fff)';

  const menuItems = [
    { label: 'Eliminar', onClick: () => onDelete(program), danger: true },
  ];

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
          <span className="pgs-stat__label">
            <span className="pgs-stat__value-inline" style={{ color: titleColor }}>{enrollments}</span>{' '}
            {enrollments === 1 ? 'inscrito' : 'inscritos'}
          </span>
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
    queryKey: queryKeys.programs.byCreator(user?.uid),
    queryFn: () => apiClient.get('/creator/programs', { params: { skipEnrollmentCounts: 'true' } }).then((r) => r.data),
    enabled: !!user?.uid,
    ...cacheConfig.otherPrograms,
  });

  const programs = allPrograms.filter((p) => p.deliveryType !== 'one_on_one');

  const [deleteTarget, setDeleteTarget] = useState(null);
  const programsQueryKey = queryKeys.programs.byCreator(user?.uid);

  const deleteMutation = useMutation({
    mutationFn: (programId) => apiClient.delete(`/creator/programs/${programId}`),
    onMutate: async (programId) => {
      await queryClient.cancelQueries({ queryKey: programsQueryKey });
      const previous = queryClient.getQueryData(programsQueryKey);
      queryClient.setQueryData(programsQueryKey, (old) => old?.filter((p) => p.id !== programId));
      setDeleteTarget(null);
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(programsQueryKey, context.previous);
      showToast('No pudimos eliminar el programa. Intenta de nuevo.', 'error');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: programsQueryKey }),
  });

  const handleDelete = useCallback((program) => {
    setDeleteTarget(program);
  }, []);

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id);
  }, [deleteTarget, deleteMutation]);

  const handleCardClick = useCallback((program) => {
    navigate(`/programs/${program.id}`);
  }, [navigate]);

  const handleCreated = useCallback(({ id }) => {
    setShowCreate(false);
    queryClient.invalidateQueries({ queryKey: queryKeys.programs.byCreator(user?.uid) });
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
                <TextAnimate animation="blurInUp" by="word" as="p" className="pgs-empty__text" once>
                  Todavia no tienes programas grupales.
                </TextAnimate>
                <TextAnimate animation="fadeIn" by="word" as="p" className="pgs-empty__sub" delay={0.15} once>
                  Crea tu primer programa y empieza a vender.
                </TextAnimate>
                <button className="pgs-empty__cta" onClick={() => setShowCreate(true)}>
                  + Nuevo programa
                </button>
              </div>
            ) : (
              <div className="pgs-list">
                <AnimatePresence mode="popLayout">
                  {programs.map((program, i) => (
                    <motion.div
                      key={program.id}
                      layout
                      exit={{ opacity: 0, scale: 0.92, x: -30, filter: 'blur(4px)' }}
                      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <ProgramaCard
                        program={program}
                        index={i}
                        onClick={handleCardClick}
                        onDelete={handleDelete}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
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

        <ConfirmDeleteModal
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
          itemName={deleteTarget?.title || 'este programa'}
          description="Esta acción no se puede deshacer."
          isDeleting={deleteMutation.isPending}
        />
      </ErrorBoundary>
    </DashboardLayout>
  );
};

export default ProgramasScreen;
