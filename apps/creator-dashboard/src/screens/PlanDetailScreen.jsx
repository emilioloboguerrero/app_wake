import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import PlanStructureSidebar from '../components/PlanStructureSidebar';
import PlanWeeksGrid from '../components/PlanWeeksGrid';
import WeekVolumeDrawer from '../components/WeekVolumeDrawer';
import Modal from '../components/Modal';
import Input from '../components/Input';
import Button from '../components/Button';
import plansService from '../services/plansService';
import libraryService from '../services/libraryService';
import propagationService from '../services/propagationService';
import { computePlannedMuscleVolumes, getPrimaryReferences } from '../utils/plannedVolumeUtils';
import PropagateChangesModal from '../components/PropagateChangesModal';
import PropagateNavigateModal from '../components/PropagateNavigateModal';
import logger from '../utils/logger';
import { useToast } from '../contexts/ToastContext';
import './PlanDetailScreen.css';

const PlanDetailScreen = () => {
  const { planId } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [planTitle, setPlanTitle] = useState('');
  const [planDescription, setPlanDescription] = useState('');
  const [planDiscipline, setPlanDiscipline] = useState('Fuerza');
  const [isSaving, setIsSaving] = useState(false);
  const [modulesWithSessions, setModulesWithSessions] = useState([]);
  const [structureSearchQuery, setStructureSearchQuery] = useState('');
  const [isPropagateModalOpen, setIsPropagateModalOpen] = useState(false);
  const [isNavigateModalOpen, setIsNavigateModalOpen] = useState(false);
  const [propagateAffectedCount, setPropagateAffectedCount] = useState(0);
  const [propagateAffectedUsers, setPropagateAffectedUsers] = useState([]);
  const [isPropagating, setIsPropagating] = useState(false);
  const [hasMadeChanges, setHasMadeChanges] = useState(false);
  const [isAddingWeek, setIsAddingWeek] = useState(false);
  const [weekVolumeDrawerOpen, setWeekVolumeDrawerOpen] = useState(false);
  const [selectedWeekModuleIdForVolume, setSelectedWeekModuleIdForVolume] = useState('');
  const [weekVolumeLoading, setWeekVolumeLoading] = useState(false);
  const [weekVolumeMuscleVolumes, setWeekVolumeMuscleVolumes] = useState({});

  const isNew = planId === 'new';

  const { data: plan, isLoading: planLoading, error: planError } = useQuery({
    queryKey: ['plans', planId],
    queryFn: () => plansService.getPlanById(planId),
    enabled: !!user && !!planId && planId !== 'new',
  });

  const { data: modulesData, isLoading: modulesLoading } = useQuery({
    queryKey: ['plans', planId, 'modules'],
    queryFn: async () => {
      let mods = await plansService.getModulesByPlan(planId);
      if (mods.length === 0) {
        await plansService.createModule(planId, 'Semana 1', 0);
        mods = await plansService.getModulesByPlan(planId);
      }
      return await Promise.all(
        mods.map(async (m) => {
          const sessions = await plansService.getSessionsByModule(planId, m.id);
          return { ...m, sessions };
        })
      );
    },
    enabled: !!user && !!planId && planId !== 'new',
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
    } catch (err) {
      showToast(err.message || 'Error al añadir semana', 'error');
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
      showToast(err.message || 'Error al crear el plan', 'error');
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
      setHasMadeChanges(true);
    } catch (err) {
      showToast(err.message || 'Error al guardar', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleModulesChange = (modules) => {
    setModulesWithSessions(modules);
    setHasMadeChanges(true);
  };

  const handleDeleteWeek = () => {
    setHasMadeChanges(true);
    queryClient.invalidateQueries({ queryKey: ['plans', planId, 'modules'] });
  };

  const weekVolumeWeekOptions = React.useMemo(
    () =>
      (modulesWithSessions || []).map((mod, i) => ({
        value: mod.id,
        label: `Semana ${i + 1}`,
      })),
    [modulesWithSessions]
  );

  useEffect(() => {
    if (!weekVolumeDrawerOpen || !selectedWeekModuleIdForVolume || !user?.uid || !planId) {
      if (!weekVolumeDrawerOpen) setWeekVolumeMuscleVolumes({});
      return;
    }
    const mod = modulesWithSessions.find((m) => m.id === selectedWeekModuleIdForVolume);
    const sessions = mod?.sessions ?? [];
    if (sessions.length === 0) {
      setWeekVolumeMuscleVolumes({});
      return;
    }
    let cancelled = false;
    setWeekVolumeLoading(true);
    (async () => {
      try {
        const allExercises = [];
        const libraryIds = new Set();
        for (const session of sessions) {
          const ref = session.librarySessionRef;
          if (!ref) continue;
          const libSession = await libraryService.getLibrarySessionById(user.uid, ref);
          if (cancelled) return;
          if (libSession?.exercises?.length) {
            libSession.exercises.forEach((ex) => {
              allExercises.push(ex);
              getPrimaryReferences(ex).forEach(({ libraryId }) => {
                if (libraryId) libraryIds.add(libraryId);
              });
            });
          }
        }
        if (cancelled) return;
        const libraryDataCache = {};
        for (const libraryId of libraryIds) {
          const lib = await libraryService.getLibraryById(libraryId);
          if (cancelled) return;
          if (lib) libraryDataCache[libraryId] = lib;
        }
        if (cancelled) return;
        const volumes = computePlannedMuscleVolumes(allExercises, libraryDataCache);
        setWeekVolumeMuscleVolumes(volumes);
      } catch (err) {
        logger.warn('[PlanDetail] Week volume load failed:', err);
        if (!cancelled) setWeekVolumeMuscleVolumes({});
      } finally {
        if (!cancelled) setWeekVolumeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    weekVolumeDrawerOpen,
    selectedWeekModuleIdForVolume,
    user?.uid,
    planId,
    modulesWithSessions,
  ]);

  const openWeekVolumeDrawer = useCallback(() => {
    if (modulesWithSessions.length > 0) {
      const currentExists = modulesWithSessions.some((m) => m.id === selectedWeekModuleIdForVolume);
      if (!currentExists) setSelectedWeekModuleIdForVolume(modulesWithSessions[0].id);
    }
    setWeekVolumeDrawerOpen(true);
  }, [modulesWithSessions, selectedWeekModuleIdForVolume]);

  const contentReturnState = { activeTab: 'contenido' };

  const handleBack = () => {
    if (hasMadeChanges && propagateAffectedCount > 0) {
      setIsNavigateModalOpen(true);
    } else {
      navigate('/content', { state: contentReturnState });
    }
  };

  const handleOpenPropagateModal = async () => {
    if (!planId) return;
    try {
      const { affectedUserIds } = await propagationService.findAffectedByPlan(planId);
      setPropagateAffectedCount(affectedUserIds.length);
      const users = await propagationService.getAffectedUsersWithDetailsByPlan(planId);
      setPropagateAffectedUsers(users);
      setIsPropagateModalOpen(true);
    } catch (err) {
      logger.error('Error finding affected users:', err);
      showToast('Error al comprobar usuarios afectados.', 'error');
    }
  };

  const handlePropagatePlan = async () => {
    if (!planId) return;
    setIsPropagating(true);
    try {
      const { propagated, errors } = await propagationService.propagatePlan(planId);
      if (errors.length > 0) {
        logger.warn('Propagation had some errors:', errors);
        showToast(`Propagado parcialmente. ${propagated} copias actualizadas. Algunos errores: ${errors.slice(0, 3).join('; ')}`, 'error');
      } else if (propagated > 0) {
        showToast(`Cambios propagados correctamente a ${propagated} usuario(s).`, 'success');
      }
      setHasMadeChanges(false);
    } catch (err) {
      logger.error('Error propagating:', err);
      showToast(`Error al propagar: ${err?.message || 'Inténtalo de nuevo.'}`, 'error');
    } finally {
      setIsPropagating(false);
    }
  };

  useEffect(() => {
    if (!planId || !hasMadeChanges) return;
    propagationService.findAffectedByPlan(planId)
      .then(({ affectedUserIds }) => setPropagateAffectedCount(affectedUserIds.length))
      .catch((err) => logger.warn('Error fetching affected count:', err));
  }, [planId, hasMadeChanges]);

  useEffect(() => {
    if (!isNavigateModalOpen || !planId || propagateAffectedCount === 0) return;
    if (propagateAffectedUsers.length > 0) return;
    propagationService.getAffectedUsersWithDetailsByPlan(planId)
      .then(setPropagateAffectedUsers)
      .catch((err) => logger.warn('Error fetching affected users:', err));
  }, [isNavigateModalOpen, planId, propagateAffectedCount, propagateAffectedUsers.length]);

  useEffect(() => {
    const shouldBlock = hasMadeChanges && propagateAffectedCount > 0;
    const handler = (e) => {
      if (shouldBlock) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    if (shouldBlock) {
      window.addEventListener('beforeunload', handler);
    }
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasMadeChanges, propagateAffectedCount]);

  const handleNavigatePropagate = async () => {
    await handlePropagatePlan();
    setIsNavigateModalOpen(false);
    navigate('/content', { state: contentReturnState });
  };

  const handleNavigateLeaveWithoutPropagate = () => {
    setIsNavigateModalOpen(false);
    setHasMadeChanges(false);
    navigate('/content', { state: contentReturnState });
  };

  if (!user) {
    return (
      <DashboardLayout screenName="Nuevo plan">
        <div className="plan-page">
          <div className="plan-loading">Cargando...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (planId === 'new') {
    return (
      <DashboardLayout screenName="Nuevo plan">
        <div className="plan-page plan-page--new">
          <nav className="plan-breadcrumb">
            <button type="button" className="plan-breadcrumb-link" onClick={handleBack}>
              Contenido
            </button>
            <span className="plan-breadcrumb-sep">/</span>
            <span className="plan-breadcrumb-current">Nuevo plan</span>
          </nav>
          <div className="plan-card">
            <h1 className="plan-card-title">Crear nuevo plan</h1>
            <p className="plan-card-subtitle">Define el título y la disciplina de tu plan. Después podrás añadir semanas, sesiones y ejercicios.</p>
            <div className="plan-form">
              <div className="plan-form-field">
                <label>Título *</label>
                <Input value={planTitle} onChange={(e) => setPlanTitle(e.target.value)} placeholder="Ej: Plan de 8 semanas" light />
              </div>
              <div className="plan-form-field">
                <label>Descripción</label>
                <Input value={planDescription} onChange={(e) => setPlanDescription(e.target.value)} placeholder="Descripción opcional" light />
              </div>
              <div className="plan-form-field">
                <label>Disciplina</label>
                <Input value={planDiscipline} onChange={(e) => setPlanDiscipline(e.target.value)} placeholder="Ej: Fuerza, Hipertrofia" light />
              </div>
              <div className="plan-form-actions">
                <Button title={isSaving ? 'Creando...' : 'Crear plan'} onClick={handleCreatePlan} disabled={!planTitle.trim() || isSaving} loading={isSaving} />
                <button type="button" className="plan-btn plan-btn--secondary" onClick={handleBack}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (loading) {
    return (
      <DashboardLayout screenName="Plan">
        <div className="plan-page">
          <div className="plan-loading">Cargando...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || (!loading && !plan)) {
    return (
      <DashboardLayout screenName="Plan">
        <div className="plan-page">
          <div className="plan-error">
            <p>{error || 'Plan no encontrado'}</p>
            <button type="button" className="plan-btn plan-btn--primary" onClick={handleBack}>
              Volver a Contenido
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
    >
      <div className="plan-page">
        <div className="plan-page-toolbar">
          {hasMadeChanges && propagateAffectedCount > 0 && (
            <button
              type="button"
              className="plan-propagate-button"
              onClick={handleOpenPropagateModal}
              title="Propagar cambios del plan a los usuarios que lo tienen asignado"
            >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M17 1L21 5L17 9M3 11V16C3 16.5304 3.21071 17.0391 3.58579 17.4142C3.96086 17.7893 4.46957 18 5 18H16M21 5H9C7.93913 5 6.92172 5.42143 6.17157 6.17157C5.42143 6.92172 5 7.93913 5 9V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Propagar a usuarios
          </button>
          )}
        </div>
        <div className="plan-structure-layout">
          <div className="plan-structure-sidebars">
            <PlanStructureSidebar
              creatorId={user.uid}
              libraryService={libraryService}
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
                navigate(`/plans/${planId}/modules/${moduleId}/sessions/${sessionId}`)
              }
              plansService={plansService}
              libraryService={libraryService}
              creatorId={user.uid}
              isAddingWeek={isAddingWeek}
              onOpenWeekVolume={openWeekVolumeDrawer}
            />
          </div>
        </div>

        <PropagateChangesModal
          isOpen={isPropagateModalOpen}
          onClose={() => setIsPropagateModalOpen(false)}
          type="plan"
          itemName={plan?.title}
          affectedCount={propagateAffectedCount}
          affectedUsers={propagateAffectedUsers}
          isPropagating={isPropagating}
          onPropagate={handlePropagatePlan}
        />
        <PropagateNavigateModal
          isOpen={isNavigateModalOpen}
          onClose={() => setIsNavigateModalOpen(false)}
          type="plan"
          itemName={plan?.title}
          affectedCount={propagateAffectedCount}
          affectedUsers={propagateAffectedUsers}
          isPropagating={isPropagating}
          onPropagate={handleNavigatePropagate}
          onLeaveWithoutPropagate={handleNavigateLeaveWithoutPropagate}
        />
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
        />
        <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Editar plan">
          <div className="plan-modal-body">
            <div className="plan-form-field">
              <label>Título *</label>
              <Input value={planTitle} onChange={(e) => setPlanTitle(e.target.value)} placeholder="Título del plan" light />
            </div>
            <div className="plan-form-field">
              <label>Descripción</label>
              <Input value={planDescription} onChange={(e) => setPlanDescription(e.target.value)} placeholder="Descripción" light />
            </div>
            <div className="plan-form-field">
              <label>Disciplina</label>
              <Input value={planDiscipline} onChange={(e) => setPlanDiscipline(e.target.value)} placeholder="Ej: Fuerza" light />
            </div>
            <div className="plan-modal-actions">
              <Button title={isSaving ? 'Guardando...' : 'Guardar'} onClick={handleSavePlan} disabled={!planTitle.trim() || isSaving} loading={isSaving} />
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
};

export default PlanDetailScreen;
