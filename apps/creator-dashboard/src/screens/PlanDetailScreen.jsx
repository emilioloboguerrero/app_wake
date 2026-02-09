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
    } catch (err) {
      alert(err.message || 'Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
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
      onHeaderEditClick={() => setIsEditModalOpen(true)}
    >
      <div className="plan-page">
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
              onDeleteWeek={loadModulesWithSessions}
              onModulesChange={setModulesWithSessions}
              onSessionClick={(moduleId, sessionId) =>
                navigate(`/plans/${planId}/modules/${moduleId}/sessions/${sessionId}`)
              }
              plansService={plansService}
              libraryService={libraryService}
              creatorId={user.uid}
            />
          </div>
        </div>

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
