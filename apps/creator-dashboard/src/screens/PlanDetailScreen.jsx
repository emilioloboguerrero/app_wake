import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import PlanStructureSidebar from '../components/PlanStructureSidebar';
import PlanWeeksGrid from '../components/PlanWeeksGrid';
import WeekVolumeDrawer from '../components/WeekVolumeDrawer';
import plansService from '../services/plansService';
import libraryService from '../services/libraryService';
import propagationService from '../services/propagationService';
import PropagateNavigateModal from '../components/PropagateNavigateModal';
import ContextualHint from '../components/hints/ContextualHint';
import '../components/PropagateChangesModal.css';
import { computePlannedMuscleVolumes, getPrimaryReferences } from '../utils/plannedVolumeUtils';
import logger from '../utils/logger';
import { useToast } from '../contexts/ToastContext';
import { ShimmerSkeleton, FullScreenError, GlowingEffect } from '../components/ui';
import { cacheConfig } from '../config/queryClient';
import './PlanDetailScreen.css';
import './LibrarySessionDetailScreen.css';

const SPRING_EASE = [0.22, 1, 0.36, 1];

const PlanDetailSkeleton = () => (
  <DashboardLayout screenName="Plan">
    <div className="plan-page" style={{ maxWidth: 'none', padding: '24px 32px 48px' }}>
      {/* Toolbar */}
      <div className="plan-page-toolbar">
        <ShimmerSkeleton width="120px" height="32px" borderRadius="999px" />
      </div>
      {/* Two-column layout */}
      <div className="plan-structure-layout">
        {/* Left sidebar */}
        <div className="plan-structure-sidebars" style={{ overflow: 'hidden' }}>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <ShimmerSkeleton width="160px" height="18px" borderRadius="4px" />
            </div>
            <div style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <ShimmerSkeleton width="100%" height="36px" borderRadius="8px" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 16 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <ShimmerSkeleton key={i} width="100%" height="42px" borderRadius="8px" />
              ))}
            </div>
          </div>
        </div>
        {/* Right main — weeks grid */}
        <div className="plan-structure-main">
          {/* Grid header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <ShimmerSkeleton width="110px" height="40px" borderRadius="999px" />
            <ShimmerSkeleton width="140px" height="40px" borderRadius="999px" />
          </div>
          {/* Day labels */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10, padding: '0 14px 8px' }}>
            {Array.from({ length: 7 }).map((_, i) => (
              <ShimmerSkeleton key={i} width="100%" height="14px" borderRadius="4px" />
            ))}
          </div>
          {/* Week blocks */}
          {Array.from({ length: 3 }).map((_, wi) => (
            <div key={wi} style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              marginBottom: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <ShimmerSkeleton width="80px" height="16px" borderRadius="4px" />
                <ShimmerSkeleton width="28px" height="28px" borderRadius="6px" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10, padding: 14 }}>
                {Array.from({ length: 7 }).map((_, di) => (
                  <div key={di} style={{ minHeight: 44 }}>
                    {di % 3 !== 2 && (
                      <ShimmerSkeleton width="100%" height={di % 2 === 0 ? '56px' : '44px'} borderRadius="8px" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </DashboardLayout>
);

const PlanDetailScreen = () => {
  const { planId } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [planTitle, setPlanTitle] = useState('');
  const [planDescription, setPlanDescription] = useState('');
  const [planDiscipline, setPlanDiscipline] = useState('Fuerza');
  const [isSaving, setIsSaving] = useState(false);
  const [modulesWithSessions, setModulesWithSessions] = useState([]);
  const [structureSearchQuery, setStructureSearchQuery] = useState('');
  const [isAddingWeek, setIsAddingWeek] = useState(false);
  const [weekVolumeDrawerOpen, setWeekVolumeDrawerOpen] = useState(false);
  const [selectedWeekModuleIdForVolume, setSelectedWeekModuleIdForVolume] = useState('');
  const [weekVolumeLoading, setWeekVolumeLoading] = useState(false);
  const [weekVolumeMuscleVolumes, setWeekVolumeMuscleVolumes] = useState({});
  const [compareWeekModuleId, setCompareWeekModuleId] = useState('');
  const [compareVolumes, setCompareVolumes] = useState({});
  const [compareLoading, setCompareLoading] = useState(false);
  const [hasMadeChanges, setHasMadeChanges] = useState(!!location.state?.planHasChanges);
  const [isNavigateModalOpen, setIsNavigateModalOpen] = useState(false);
  const [propagateAffectedCount, setPropagateAffectedCount] = useState(0);
  const [propagateAffectedUsers, setPropagateAffectedUsers] = useState([]);
  const [propagateProgramCount, setPropagateProgramCount] = useState(0);
  const [isPropagating, setIsPropagating] = useState(false);

  const isNew = planId === 'new';

  const { data: plan, isLoading: planLoading, error: planError } = useQuery({
    queryKey: ['plans', planId],
    queryFn: () => plansService.getPlanById(planId),
    enabled: !!user && !!planId && planId !== 'new',
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: modulesData, isLoading: modulesLoading } = useQuery({
    queryKey: ['plans', planId, 'modules'],
    queryFn: async () => {
      let mods = await plansService.getModulesByPlan(planId);
      if (mods.length === 0) {
        await plansService.createModule(planId, 'Semana 1', 0);
        mods = await plansService.getModulesByPlan(planId);
      }
      return mods.map((m) => ({
        ...m,
        sessions: (m.sessions ?? []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
      }));
    },
    enabled: !!user && !!planId && planId !== 'new',
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const loading = planLoading || modulesLoading;
  const error = planError?.message ?? null;

  const planSeededRef = useRef(false);
  useEffect(() => {
    if (plan && !planSeededRef.current) {
      planSeededRef.current = true;
      setPlanTitle(plan.title || '');
      setPlanDescription(plan.description || '');
      setPlanDiscipline(plan.discipline || 'Fuerza');
    }
  }, [plan]);

  useEffect(() => {
    if (modulesData) {
      setModulesWithSessions(modulesData);
    }
  }, [modulesData]);

  const handleAddWeek = async () => {
    if (!planId) return;
    setIsAddingWeek(true);
    try {
      const maxOrder = modulesWithSessions.length === 0
        ? -1
        : Math.max(...modulesWithSessions.map((m) => m.order ?? 0));
      const nextOrder = maxOrder + 1;
      const nextNum = nextOrder + 1;
      await plansService.createModule(planId, `Semana ${nextNum}`, nextOrder);
      await queryClient.invalidateQueries({ queryKey: ['plans', planId, 'modules'] });
      setHasMadeChanges(true);
      showToast('Semana añadida', 'success');
    } catch (err) {
      showToast(err.message || 'No pudimos añadir la semana. Intenta de nuevo.', 'error');
    } finally {
      setIsAddingWeek(false);
    }
  };

  const handleCreatePlan = async () => {
    if (!planTitle.trim() || !user) return;
    try {
      setIsSaving(true);
      const p = await plansService.createPlan(user.uid, user.displayName || user.email, {
        title: planTitle.trim(),
        description: planDescription.trim(),
        discipline: planDiscipline,
      });
      navigate(`/plans/${p.id}`, { replace: true });
    } catch (err) {
      showToast(err.message || 'No pudimos crear el plan. Intenta de nuevo.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePlan = async () => {
    if (!plan || !planId) return;
    try {
      setIsSaving(true);
      await plansService.updatePlan(planId, {
        title: planTitle.trim(),
        description: planDescription.trim(),
        discipline: planDiscipline,
      });
      setIsEditModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['plans', planId] });
      showToast('Plan actualizado', 'success');
    } catch (err) {
      showToast(err.message || 'No pudimos guardar los cambios. Intenta de nuevo.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleModulesChange = (modules) => {
    setModulesWithSessions(modules);
    setHasMadeChanges(true);
  };

  const handleDeleteWeek = () => {
    queryClient.invalidateQueries({ queryKey: ['plans', planId, 'modules'] });
    setHasMadeChanges(true);
  };

  const weekVolumeWeekOptions = React.useMemo(
    () =>
      (modulesWithSessions || []).map((mod, i) => ({
        value: mod.id,
        label: `Semana ${i + 1}`,
      })),
    [modulesWithSessions]
  );

  // Volume computation helper: reads exercises from plan sessions directly (new model)
  // Falls back to library resolution for legacy sessions with librarySessionRef
  const computeVolumeForModule = useCallback(async (moduleId, cancelled) => {
    const mod = modulesWithSessions.find((m) => m.id === moduleId);
    const sessions = mod?.sessions ?? [];
    if (sessions.length === 0) return {};

    const allExercises = [];
    const libraryIds = new Set();

    for (const session of sessions) {
      // New model: session has exercises directly
      if (session.exercises?.length > 0) {
        session.exercises.forEach((ex) => {
          allExercises.push(ex);
          getPrimaryReferences(ex).forEach(({ libraryId }) => { if (libraryId) libraryIds.add(libraryId); });
        });
        continue;
      }
      // Legacy: resolve from library session
      const ref = session.source_library_session_id ?? session.librarySessionRef;
      if (!ref) continue;
      const libSession = await libraryService.getLibrarySessionById(user.uid, ref);
      if (cancelled?.current) return {};
      if (libSession?.exercises?.length) {
        libSession.exercises.forEach((ex) => {
          allExercises.push(ex);
          getPrimaryReferences(ex).forEach(({ libraryId }) => { if (libraryId) libraryIds.add(libraryId); });
        });
      }
    }

    if (cancelled?.current) return {};
    const libraryDataCache = {};
    for (const libraryId of libraryIds) {
      const lib = await libraryService.getLibraryById(libraryId);
      if (cancelled?.current) return {};
      if (lib) libraryDataCache[libraryId] = lib;
    }
    return computePlannedMuscleVolumes(allExercises, libraryDataCache);
  }, [modulesWithSessions, user?.uid]);

  useEffect(() => {
    if (!weekVolumeDrawerOpen || !selectedWeekModuleIdForVolume || !user?.uid || !planId) {
      if (!weekVolumeDrawerOpen) setWeekVolumeMuscleVolumes({});
      return;
    }
    const cancelled = { current: false };
    setWeekVolumeLoading(true);
    computeVolumeForModule(selectedWeekModuleIdForVolume, cancelled)
      .then((volumes) => { if (!cancelled.current) setWeekVolumeMuscleVolumes(volumes); })
      .catch((err) => { logger.warn('[PlanDetail] Week volume load failed:', err); if (!cancelled.current) setWeekVolumeMuscleVolumes({}); })
      .finally(() => { if (!cancelled.current) setWeekVolumeLoading(false); });
    return () => { cancelled.current = true; };
  }, [weekVolumeDrawerOpen, selectedWeekModuleIdForVolume, user?.uid, planId, computeVolumeForModule]);

  // Comparison volume computation
  useEffect(() => {
    if (!weekVolumeDrawerOpen || !compareWeekModuleId || !user?.uid || !planId) {
      if (!compareWeekModuleId) setCompareVolumes({});
      return;
    }
    const cancelled = { current: false };
    setCompareLoading(true);
    computeVolumeForModule(compareWeekModuleId, cancelled)
      .then((volumes) => { if (!cancelled.current) setCompareVolumes(volumes); })
      .catch((err) => { logger.warn('[PlanDetail] Compare volume load failed:', err); if (!cancelled.current) setCompareVolumes({}); })
      .finally(() => { if (!cancelled.current) setCompareLoading(false); });
    return () => { cancelled.current = true; };
  }, [weekVolumeDrawerOpen, compareWeekModuleId, user?.uid, planId, computeVolumeForModule]);

  const openWeekVolumeDrawer = useCallback(() => {
    if (modulesWithSessions.length > 0) {
      const currentExists = modulesWithSessions.some((m) => m.id === selectedWeekModuleIdForVolume);
      if (!currentExists) setSelectedWeekModuleIdForVolume(modulesWithSessions[0].id);
    }
    setWeekVolumeDrawerOpen(true);
  }, [modulesWithSessions, selectedWeekModuleIdForVolume]);

  const contentReturnState = { activeTab: 'contenido' };

  // Fetch affected count on mount
  useEffect(() => {
    if (!planId || planId === 'new') return;
    let cancelled = false;
    propagationService.findAffectedByPlan(planId)
      .then((result) => {
        if (cancelled) return;
        setPropagateAffectedCount(result.affectedUserIds?.length ?? 0);
        setPropagateProgramCount(result.programCount ?? 0);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [planId]);

  // Block browser close when unpropagated changes exist
  useEffect(() => {
    if (!hasMadeChanges || propagateAffectedCount === 0) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasMadeChanges, propagateAffectedCount]);

  const handlePropagate = async () => {
    if (!planId) return;
    setHasMadeChanges(false);
    showToast('Propagando cambios...', 'info', 10000);
    propagationService.propagatePlan(planId)
      .then((result) => {
        const count = result?.propagated ?? 0;
        showToast(count > 0 ? `Cambios propagados a ${count} copia(s).` : 'No habia copias para actualizar.', 'success');
      })
      .catch((err) => {
        logger.error('Error propagating plan:', err);
        setHasMadeChanges(true);
        showToast('Error al propagar.', 'error', 6000, {
          action: { label: 'Reintentar', onClick: handlePropagate },
        });
      });
  };

  const handleBack = () => {
    if (hasMadeChanges && propagateAffectedCount > 0) {
      // Fetch user details for modal
      propagationService.getAffectedUsersWithDetailsByPlan(planId)
        .then((users) => setPropagateAffectedUsers(users))
        .catch(() => {});
      setIsNavigateModalOpen(true);
    } else {
      navigate('/biblioteca', { state: contentReturnState });
    }
  };


  if (!user) {
    return <PlanDetailSkeleton />;
  }

  if (planId === 'new') {
    navigate('/biblioteca?domain=entrenamiento&tab=planes', { replace: true });
    return null;
  }

  if (loading) {
    return <PlanDetailSkeleton />;
  }

  if (error || (!loading && !plan)) {
    return (
      <DashboardLayout screenName="Plan">
        <div className="plan-page">
          <FullScreenError
            title="Plan no encontrado"
            message={error || 'No pudimos cargar este plan.'}
            onRetry={() => queryClient.invalidateQueries({ queryKey: ['plans', planId] })}
          />
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
            <button type="button" className="plan-btn plan-btn--secondary" onClick={handleBack}>
              Volver a Biblioteca
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      screenName={plan.title || 'Plan'}
      showBackButton
      backPath="/content"
      onBack={handleBack}
      onHeaderEditClick={() => setIsEditModalOpen(true)}
      headerRight={hasMadeChanges && propagateAffectedCount > 0 ? (
        <div className="library-session-propagate-group">
          <button
            type="button"
            className="library-session-propagate-button"
            onClick={handlePropagate}
            disabled={isPropagating}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {isPropagating ? 'Propagando...' : `Propagar a ${propagateAffectedCount} cliente(s)`}
          </button>
          <button
            type="button"
            className="library-session-propagate-dismiss"
            onClick={() => setHasMadeChanges(false)}
            title="Descartar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      ) : null}
    >
      <motion.div
        className="plan-page"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, ease: SPRING_EASE }}
      >
        <div className="plan-page-toolbar" />
        <div className="plan-structure-layout">
          <div className="plan-structure-sidebars">
            <GlowingEffect spread={30} proximity={100} borderWidth={1} />
            <PlanStructureSidebar
              creatorId={user.uid}
              searchQuery={structureSearchQuery}
              onSearchChange={setStructureSearchQuery}
            />
          </div>
          <div className="plan-structure-main">
            <PlanWeeksGrid
              planId={planId}
              modules={modulesWithSessions}
              onAddWeek={handleAddWeek}
              onDeleteWeek={handleDeleteWeek}
              onModulesChange={handleModulesChange}
              onSessionClick={(moduleId, sessionId) =>
                navigate(`/plans/${planId}/modules/${moduleId}/sessions/${sessionId}/edit`)
              }
              plansService={plansService}
              libraryService={libraryService}
              creatorId={user.uid}
              isAddingWeek={isAddingWeek}
              onOpenWeekVolume={openWeekVolumeDrawer}
            />
          </div>
        </div>

        <WeekVolumeDrawer
          isOpen={weekVolumeDrawerOpen}
          onClose={() => setWeekVolumeDrawerOpen(false)}
          title="Volumen de la semana"
          subtitle="Series efectivas por músculo (intensidad ≥7) para esta semana."
          weekOptions={weekVolumeWeekOptions}
          selectedWeekValue={selectedWeekModuleIdForVolume}
          onWeekChange={setSelectedWeekModuleIdForVolume}
          loading={weekVolumeLoading}
          plannedMuscleVolumes={weekVolumeMuscleVolumes}
          emptyMessage="Añade sesiones con ejercicios (e intensidad ≥7) a esta semana para ver el volumen por músculo."
          variant="card"
          weekSelectorStyle="list"
          compareWeekValue={compareWeekModuleId}
          onCompareWeekChange={setCompareWeekModuleId}
          compareVolumes={compareVolumes}
          compareLoading={compareLoading}
        />
        {isEditModalOpen && (
          <div className="cfo-overlay" onClick={!isSaving ? () => setIsEditModalOpen(false) : undefined}>
            <div className="cfo-card" onClick={(e) => e.stopPropagation()}>
              <GlowingEffect spread={40} borderWidth={1} />
              <div className="cfo-topbar">
                <div />
                {!isSaving && (
                  <button type="button" className="cfo-close" onClick={() => setIsEditModalOpen(false)} aria-label="Cerrar">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
              <div className="cfo-body">
                <div className="cfo-step" key="edit-plan">
                  <div className="cfo-step__header">
                    <h1 className="cfo-step__title">Editar plan</h1>
                    <p className="cfo-step__desc">Actualiza el nombre, descripción o disciplina.</p>
                  </div>
                  <div className="cfo-step__content">
                    <input
                      className="cfo-name-input"
                      type="text"
                      placeholder="Título del plan"
                      value={planTitle}
                      onChange={(e) => setPlanTitle(e.target.value)}
                      maxLength={80}
                      autoFocus
                    />
                    <textarea
                      className="cfo-desc-input"
                      placeholder="Descripción (opcional)"
                      value={planDescription}
                      onChange={(e) => setPlanDescription(e.target.value)}
                      rows={2}
                    />
                    <input
                      className="cfo-name-input"
                      type="text"
                      placeholder="Disciplina — Ej: Fuerza"
                      value={planDiscipline}
                      onChange={(e) => setPlanDiscipline(e.target.value)}
                      maxLength={40}
                      style={{ fontSize: 'clamp(13px, 3vw, 15px)', fontWeight: 500 }}
                    />
                  </div>
                  <div className="cfo-footer" style={{ justifyContent: 'center' }}>
                    <button
                      type="button"
                      className="cfo-next-btn"
                      onClick={handleSavePlan}
                      disabled={!planTitle.trim() || isSaving}
                    >
                      {isSaving ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <PropagateNavigateModal
          isOpen={isNavigateModalOpen}
          onClose={() => setIsNavigateModalOpen(false)}
          type="plan"
          itemName={plan?.title || 'Este plan'}
          affectedCount={propagateAffectedCount}
          affectedUsers={propagateAffectedUsers}
          programCount={propagateProgramCount}
          isPropagating={isPropagating}
          onPropagate={async () => {
            await handlePropagate();
            setIsNavigateModalOpen(false);
            navigate('/biblioteca', { state: contentReturnState });
          }}
          onLeaveWithoutPropagate={() => {
            setHasMadeChanges(false);
            setIsNavigateModalOpen(false);
            navigate('/biblioteca', { state: contentReturnState });
          }}
        />
      </motion.div>
      <ContextualHint screenKey="plan-detail" />
    </DashboardLayout>
  );
};

export default PlanDetailScreen;
