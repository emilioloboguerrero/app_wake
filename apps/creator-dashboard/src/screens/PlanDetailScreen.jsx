import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import PlanStructureSidebar from '../components/PlanStructureSidebar';
import PlanWeeksGrid from '../components/PlanWeeksGrid';
import Modal from '../components/Modal';
import Input from '../components/Input';
import Button from '../components/Button';
import plansService from '../services/plansService';
import libraryService from '../services/libraryService';
import propagationService from '../services/propagationService';
import PropagateChangesModal from '../components/PropagateChangesModal';
import PropagateNavigateModal from '../components/PropagateNavigateModal';
import './PlanDetailScreen.css';

const PlanDetailScreen = () => {
  const { planId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(planId === 'new' ? false : true);
  const [error, setError] = useState(null);
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

  const isNew = planId === 'new';

  const loadModulesWithSessions = async () => {
    if (!planId) return;
    const mods = await plansService.getModulesByPlan(planId);
    const withSessions = await Promise.all(
      mods.map(async (m) => {
        const sessions = await plansService.getSessionsByModule(planId, m.id);
        return { ...m, sessions };
      })
    );
    setModulesWithSessions(withSessions);
  };

  useEffect(() => {
    if (!user || !planId) return;
    if (planId === 'new') {
      setPlan(null);
      setLoading(false);
      return;
    }
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const p = await plansService.getPlanById(planId);
        setPlan(p);
        if (p) {
          setPlanTitle(p.title || '');
          setPlanDescription(p.description || '');
          setPlanDiscipline(p.discipline || 'Fuerza');
        }
        let mods = await plansService.getModulesByPlan(planId);
        if (mods.length === 0) {
          await plansService.createModule(planId, 'Semana 1', 0);
        }
        await loadModulesWithSessions();
      } catch (err) {
        setError(err.message || 'Error al cargar el plan');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user, planId]);

  const handleAddWeek = async () => {
    if (!planId) return;
    try {
      const maxOrder = modulesWithSessions.length === 0
        ? -1
        : Math.max(...modulesWithSessions.map((m) => m.order ?? 0));
      const nextOrder = maxOrder + 1;
      const nextNum = nextOrder + 1;
      await plansService.createModule(planId, `Semana ${nextNum}`, nextOrder);
      await loadModulesWithSessions();
      setHasMadeChanges(true);
    } catch (err) {
      alert(err.message || 'Error al añadir semana');
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
      alert(err.message || 'Error al crear el plan');
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
      setPlan({ ...plan, title: planTitle, description: planDescription, discipline: planDiscipline });
      setIsEditModalOpen(false);
      setHasMadeChanges(true);
    } catch (err) {
      alert(err.message || 'Error al guardar');
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
    loadModulesWithSessions();
  };

  const handleBack = () => {
    if (hasMadeChanges && propagateAffectedCount > 0) {
      setIsNavigateModalOpen(true);
    } else {
      navigate('/content');
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
      console.error('Error finding affected users:', err);
      alert('Error al comprobar usuarios afectados.');
    }
  };

  const handlePropagatePlan = async () => {
    if (!planId) return;
    setIsPropagating(true);
    try {
      const { propagated, errors } = await propagationService.propagatePlan(planId);
      if (errors.length > 0) {
        console.warn('Propagation had some errors:', errors);
        alert(`Propagado parcialmente. ${propagated} copias actualizadas. Algunos errores: ${errors.slice(0, 3).join('; ')}`);
      } else if (propagated > 0) {
        alert(`Cambios propagados correctamente a ${propagated} usuario(s).`);
      }
      setHasMadeChanges(false);
    } catch (err) {
      console.error('Error propagating:', err);
      alert(`Error al propagar: ${err?.message || 'Inténtalo de nuevo.'}`);
    } finally {
      setIsPropagating(false);
    }
  };

  // Fetch affected count when hasMadeChanges becomes true
  useEffect(() => {
    if (!planId || !hasMadeChanges) return;
    propagationService.findAffectedByPlan(planId)
      .then(({ affectedUserIds }) => setPropagateAffectedCount(affectedUserIds.length))
      .catch((err) => console.warn('Error fetching affected count:', err));
  }, [planId, hasMadeChanges]);

  // Fetch affected users when navigate modal opens (for display in modal)
  useEffect(() => {
    if (!isNavigateModalOpen || !planId || propagateAffectedCount === 0) return;
    if (propagateAffectedUsers.length > 0) return; // Already have them
    propagationService.getAffectedUsersWithDetailsByPlan(planId)
      .then(setPropagateAffectedUsers)
      .catch((err) => console.warn('Error fetching affected users:', err));
  }, [isNavigateModalOpen, planId, propagateAffectedCount, propagateAffectedUsers.length]);

  // Block browser close/refresh when unpropagated changes
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
    navigate('/content');
  };

  const handleNavigateLeaveWithoutPropagate = () => {
    setIsNavigateModalOpen(false);
    setHasMadeChanges(false);
    navigate('/content');
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

  if (error || !plan) {
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
