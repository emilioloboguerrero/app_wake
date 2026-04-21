import { useCallback, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import DashboardLayout from '../components/DashboardLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import {
  GlowingEffect,
  SkeletonCard,
  MenuDropdown,
  FullScreenError,
  ConfirmDeleteModal,
  TextAnimate,
  TubelightNavBar,
} from '../components/ui';
import ContextualHint from '../components/hints/ContextualHint';
import CreateFlowOverlay from '../components/CreateFlowOverlay';
import CreateBundleFlow from '../components/bundles/CreateBundleFlow';
import BundleCover from '../components/bundles/BundleCover';
import { useCreatorBundles, useUpdateBundleStatus, useDeleteBundle } from '../hooks/useBundles';
import { extractAccentFromImage } from '../components/events/eventFieldComponents';
import apiClient from '../utils/apiClient';
import { cacheConfig, queryKeys } from '../config/queryClient';
import './ProgramasScreen.css';

const BUNDLE_STATUS_LABEL = {
  draft: 'Borrador',
  published: 'Publicado',
  archived: 'Archivado',
};

const TABS = [
  { id: 'programas', label: 'Programas' },
  { id: 'bundles', label: 'Bundles' },
];

// ─── Programa card ────────────────────────────────────────────────────────────

const ProgramaCard = ({ program, index, onClick, onDelete, onToggleBundleOnly }) => {
  const enrollments = program.enrollmentCount ?? 0;
  const [accent, setAccent] = useState(null);

  useEffect(() => {
    if (!program.imageUrl) return;
    return extractAccentFromImage(program.imageUrl, setAccent);
  }, [program.imageUrl]);

  const accentRgb = accent ? `${accent[0]}, ${accent[1]}, ${accent[2]}` : null;
  const titleColor = accentRgb ? `rgb(${accentRgb})` : 'var(--text-primary, #fff)';

  const bundleOnly = program.bundleOnly ?? (program.visibility === 'bundle-only');

  const menuItems = [
    {
      label: bundleOnly ? 'Vender también como programa standalone' : 'Vender solo dentro de bundles',
      onClick: () => onToggleBundleOnly(program, !bundleOnly),
    },
    { divider: true },
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
            <img src={program.imageUrl} alt={program.title || 'Programa'} className="pgs-card__img" loading="lazy" />
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
          {bundleOnly && (
            <>
              <span className="pgs-stat__divider">·</span>
              <span className="pgs-visibility-badge pgs-visibility-badge--bundle-only">
                Solo en bundles
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Bundle card ──────────────────────────────────────────────────────────────

const BundleCard = ({ bundle, index, onClick, onArchive, onUnarchive, onDelete }) => {
  const coverImages = bundle.coverImages || [];
  const firstImage = coverImages[0];
  const [accent, setAccent] = useState(null);

  useEffect(() => {
    if (!firstImage) return;
    return extractAccentFromImage(firstImage, setAccent);
  }, [firstImage]);

  const accentRgb = accent ? `${accent[0]}, ${accent[1]}, ${accent[2]}` : null;
  const titleColor = accentRgb ? `rgb(${accentRgb})` : 'var(--text-primary, #fff)';

  const courseCount = bundle.courseIds?.length ?? 0;
  const priceCount = Object.keys(bundle.pricing?.otp || {}).length +
    Object.keys(bundle.pricing?.subscription || {}).length;

  const isArchived = bundle.status === 'archived';
  const menuItems = [
    ...(isArchived
      ? [{ label: 'Reactivar', onClick: () => onUnarchive(bundle) }]
      : [{ label: 'Archivar', onClick: () => onArchive(bundle) }]),
    { divider: true },
    { label: 'Eliminar', onClick: () => onDelete(bundle), danger: true },
  ];

  return (
    <div
      className="pgs-card pgs-card--bundle"
      style={{ '--card-index': index }}
      role="button"
      tabIndex={0}
      onClick={() => onClick(bundle)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(bundle); }}
    >
      <GlowingEffect spread={24} proximity={60} inactiveZone={0.6} />

      <div className="pgs-card__image-side pgs-card__image-side--bundle">
        <BundleCover imageUrls={coverImages} size="card" title={bundle.title} />
      </div>

      <div className="pgs-card__content">
        <div className="pgs-card__top-row">
          <h3 className="pgs-card__title" style={{ color: titleColor }}>{bundle.title || 'Sin nombre'}</h3>
          <div className="pgs-card__top-row-right" onClick={(e) => e.stopPropagation()}>
            <span className={`pgs-bundle-status pgs-bundle-status--${bundle.status}`}>
              {BUNDLE_STATUS_LABEL[bundle.status] || bundle.status}
            </span>
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
            <span className="pgs-stat__value-inline" style={{ color: titleColor }}>{courseCount}</span>{' '}
            {courseCount === 1 ? 'programa' : 'programas'}
          </span>
          <span className="pgs-stat__divider">·</span>
          <span className="pgs-stat__label">
            <span className="pgs-stat__value-inline" style={{ color: titleColor }}>{priceCount}</span>{' '}
            {priceCount === 1 ? 'precio' : 'precios'}
          </span>
        </div>
      </div>
    </div>
  );
};

const GridSkeleton = () => (
  <div className="pgs-skeleton-list" aria-busy="true" aria-label="Cargando">
    {Array.from({ length: 3 }).map((_, i) => (
      <SkeletonCard key={i} className="pgs-skeleton-card" />
    ))}
  </div>
);

// ─── Screen ───────────────────────────────────────────────────────────────────

const ProgramasScreen = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = searchParams.get('tab') === 'bundles' ? 'bundles' : 'programas';
  const handleTabChange = useCallback((tabId) => {
    const next = new URLSearchParams(searchParams);
    if (tabId === 'programas') next.delete('tab');
    else next.set('tab', tabId);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const [showCreate, setShowCreate] = useState(false);
  const [showBundleCreate, setShowBundleCreate] = useState(false);
  const [bundleDeleteTarget, setBundleDeleteTarget] = useState(null);

  // ── Programs data ──
  const programsQueryKey = queryKeys.programs.byCreator(user?.uid);
  const { data: allPrograms = [], isLoading: programsLoading, error: programsError } = useQuery({
    queryKey: programsQueryKey,
    queryFn: () => apiClient.get('/creator/programs', { params: { skipEnrollmentCounts: 'true' } }).then((r) => r.data),
    enabled: !!user?.uid,
    ...cacheConfig.otherPrograms,
  });
  const programs = allPrograms.filter((p) => p.deliveryType !== 'one_on_one');

  const [deleteTarget, setDeleteTarget] = useState(null);

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

  const bundleOnlyMutation = useMutation({
    mutationFn: ({ programId, bundleOnly }) =>
      apiClient.patch(`/creator/programs/${programId}`, { bundleOnly }),
    onMutate: async ({ programId, bundleOnly }) => {
      await queryClient.cancelQueries({ queryKey: programsQueryKey });
      const previous = queryClient.getQueryData(programsQueryKey);
      queryClient.setQueryData(programsQueryKey, (old) =>
        old?.map((p) => (p.id === programId
          ? { ...p, bundleOnly, visibility: bundleOnly ? 'bundle-only' : 'both' }
          : p))
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(programsQueryKey, context.previous);
      showToast('No pudimos actualizar el programa. Intenta de nuevo.', 'error');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: programsQueryKey }),
  });

  const handleToggleBundleOnly = useCallback((program, bundleOnly) => {
    const current = program.bundleOnly ?? (program.visibility === 'bundle-only');
    if (current === bundleOnly) return;
    bundleOnlyMutation.mutate({ programId: program.id, bundleOnly });
  }, [bundleOnlyMutation]);

  const handleDelete = useCallback((program) => {
    setDeleteTarget(program);
  }, []);

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id);
  }, [deleteTarget, deleteMutation]);

  const handleProgramCardClick = useCallback((program) => {
    navigate(`/programs/${program.id}`);
  }, [navigate]);

  const handleCreated = useCallback(({ id }) => {
    setShowCreate(false);
    queryClient.invalidateQueries({ queryKey: programsQueryKey });
    if (id) navigate(`/programs/${id}`);
  }, [navigate, queryClient, programsQueryKey]);

  // ── Bundles data ──
  const { data: bundles = [], isLoading: bundlesLoading, error: bundlesError } = useCreatorBundles();
  const bundleStatusMutation = useUpdateBundleStatus();
  const bundleDeleteMutation = useDeleteBundle();

  const handleBundleCardClick = useCallback((bundle) => {
    navigate(`/bundles/${bundle.id}`);
  }, [navigate]);

  const handleBundleArchive = useCallback(async (bundle) => {
    try {
      await bundleStatusMutation.mutateAsync({ bundleId: bundle.id, status: 'archived' });
      showToast('Bundle archivado.', 'success');
    } catch (err) {
      showToast(err?.message || 'No pudimos archivar.', 'error');
    }
  }, [bundleStatusMutation, showToast]);

  const handleBundleUnarchive = useCallback(async (bundle) => {
    try {
      await bundleStatusMutation.mutateAsync({ bundleId: bundle.id, status: 'draft' });
      showToast('Bundle reactivado en borrador.', 'success');
    } catch (err) {
      showToast(err?.message || 'No pudimos reactivar.', 'error');
    }
  }, [bundleStatusMutation, showToast]);

  const handleBundleDeleteRequest = useCallback((bundle) => {
    setBundleDeleteTarget(bundle);
  }, []);

  const confirmBundleDelete = useCallback(async () => {
    if (!bundleDeleteTarget) return;
    try {
      await bundleDeleteMutation.mutateAsync(bundleDeleteTarget.id);
      setBundleDeleteTarget(null);
      showToast('Bundle eliminado.', 'success');
    } catch (err) {
      setBundleDeleteTarget(null);
      showToast(err?.message || 'No pudimos eliminar.', 'error');
    }
  }, [bundleDeleteTarget, bundleDeleteMutation, showToast]);

  const handleBundleCreated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.bundles.byCreator(user?.uid) });
  }, [queryClient, user?.uid]);

  // ── FAB action depends on active tab ──
  const handleFabClick = useCallback(() => {
    if (activeTab === 'bundles') {
      setShowBundleCreate(true);
    } else {
      setShowCreate(true);
    }
  }, [activeTab]);

  const fabLabel = activeTab === 'bundles' ? 'Nuevo bundle' : 'Nuevo programa';

  return (
    <DashboardLayout screenName="Programas Generales">
      <ErrorBoundary>
        <div className="pgs-screen">
          <div className="pgs-header">
            <div className="pgs-tabs">
              <TubelightNavBar
                items={TABS}
                activeId={activeTab}
                onSelect={handleTabChange}
              />
            </div>
            <button
              className="pgs-fab"
              onClick={handleFabClick}
              aria-label={fabLabel}
            >
              <span className="pgs-fab-plus">+</span>
              {fabLabel}
            </button>
          </div>

          <div className="pgs-content">
            {activeTab === 'programas' ? (
              programsLoading ? (
                <GridSkeleton />
              ) : programsError ? (
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
                          onClick={handleProgramCardClick}
                          onDelete={handleDelete}
                          onToggleBundleOnly={handleToggleBundleOnly}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )
            ) : (
              bundlesLoading ? (
                <GridSkeleton />
              ) : bundlesError ? (
                <FullScreenError
                  title="No pudimos cargar tus bundles"
                  message="Revisa tu conexion e intenta de nuevo."
                  onRetry={() => window.location.reload()}
                />
              ) : bundles.length === 0 ? (
                <div className="pgs-empty">
                  <div className="pgs-empty__icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M3 7h18M3 12h18M3 17h18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </div>
                  <TextAnimate animation="blurInUp" by="word" as="p" className="pgs-empty__text" once>
                    Empaqueta tus mejores programas.
                  </TextAnimate>
                  <TextAnimate animation="fadeIn" by="word" as="p" className="pgs-empty__sub" delay={0.15} once>
                    Junta 2 o más programas en una sola compra.
                  </TextAnimate>
                  <button className="pgs-empty__cta" onClick={() => setShowBundleCreate(true)}>
                    + Crear mi primer bundle
                  </button>
                </div>
              ) : (
                <div className="pgs-list">
                  <AnimatePresence mode="popLayout">
                    {bundles.map((bundle, i) => (
                      <motion.div
                        key={bundle.id}
                        layout
                        exit={{ opacity: 0, scale: 0.92, x: -30, filter: 'blur(4px)' }}
                        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <BundleCard
                          bundle={bundle}
                          index={i}
                          onClick={handleBundleCardClick}
                          onArchive={handleBundleArchive}
                          onUnarchive={handleBundleUnarchive}
                          onDelete={handleBundleDeleteRequest}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )
            )}
          </div>
        </div>

        <ContextualHint screenKey="programas" />

        <CreateFlowOverlay
          isOpen={showCreate}
          onClose={() => setShowCreate(false)}
          type="program"
          onCreated={handleCreated}
        />

        <CreateBundleFlow
          isOpen={showBundleCreate}
          onClose={() => setShowBundleCreate(false)}
          onCreated={handleBundleCreated}
        />

        <ConfirmDeleteModal
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
          itemName={deleteTarget?.title || 'este programa'}
          description="Esta acción no se puede deshacer."
          isDeleting={deleteMutation.isPending}
        />

        <ConfirmDeleteModal
          isOpen={!!bundleDeleteTarget}
          onClose={() => setBundleDeleteTarget(null)}
          onConfirm={confirmBundleDelete}
          itemName={bundleDeleteTarget?.title || 'este bundle'}
          description="Esta acción no se puede deshacer. Si el bundle ya tiene compras, archívalo en lugar de eliminarlo."
          isDeleting={bundleDeleteMutation.isPending}
        />
      </ErrorBoundary>
    </DashboardLayout>
  );
};

export default ProgramasScreen;
