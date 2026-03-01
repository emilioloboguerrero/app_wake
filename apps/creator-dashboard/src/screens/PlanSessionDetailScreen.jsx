/**
 * PlanSessionDetailScreen - Entry for editing a plan session.
 * For sessions with librarySessionRef: shows scope modal (apply everywhere vs only this week).
 * For legacy sessions (no librarySessionRef): migrate to library, then redirect to library edit.
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import plansService from '../services/plansService';
import libraryService from '../services/libraryService';
import '../components/PropagateChangesModal.css';
import './LibrarySessionDetailScreen.css';

const PlanSessionDetailScreen = () => {
  const { planId, moduleId, sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showScopeModal, setShowScopeModal] = useState(false);
  const [scopeModalLibraryId, setScopeModalLibraryId] = useState(null);
  const [applyingScope, setApplyingScope] = useState(false);

  useEffect(() => {
    const loadAndDecide = async () => {
      if (!user || !planId || !moduleId || !sessionId) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const sessions = await plansService.getSessionsByModule(planId, moduleId);
        const sessionData = sessions.find(s => s.id === sessionId) || null;

        if (!sessionData) {
          setError('Sesión no encontrada');
          setLoading(false);
          return;
        }

        if (sessionData.useLocalContent) {
          navigate(`/plans/${planId}/modules/${moduleId}/sessions/${sessionId}/edit`, { replace: true });
          return;
        }

        const librarySessionId = sessionData.librarySessionRef;

        if (!librarySessionId) {
          const librarySession = await libraryService.createLibrarySession(user.uid, {
            title: sessionData.title || 'Sesión',
            image_url: sessionData.image_url || null,
          });
          const newLibraryId = librarySession.id;

          const planExercises = await plansService.getExercisesBySession(planId, moduleId, sessionId);
          for (let i = 0; i < planExercises.length; i++) {
            const ex = planExercises[i];
            const exerciseName = ex.title || ex.name || 'Ejercicio';
            const created = await libraryService.createExerciseInLibrarySession(
              user.uid,
              newLibraryId,
              exerciseName,
              i
            );

            const planSets = await plansService.getSetsByExercise(planId, moduleId, sessionId, ex.id);
            for (let j = 0; j < planSets.length; j++) {
              const setData = planSets[j];
              const newSet = await libraryService.createSetInLibraryExercise(user.uid, newLibraryId, created.id, j);
              const hasRepsOrIntensity = setData.reps != null || setData.intensity != null;
              if (hasRepsOrIntensity && newSet?.id) {
                const updates = {};
                if (setData.reps != null) updates.reps = setData.reps;
                if (setData.intensity != null) updates.intensity = setData.intensity;
                if (setData.title) updates.title = setData.title;
                if (Object.keys(updates).length > 0) {
                  await libraryService.updateSetInLibraryExercise(
                    user.uid,
                    newLibraryId,
                    created.id,
                    newSet.id,
                    updates
                  );
                }
              }
            }
          }

          await plansService.updateSession(planId, moduleId, sessionId, {
            librarySessionRef: newLibraryId,
          });
          navigate(`/content/sessions/${newLibraryId}`, {
            replace: true,
            state: { returnTo: `/plans/${planId}` },
          });
          return;
        }

        setScopeModalLibraryId(librarySessionId);
        setShowScopeModal(true);
      } catch (err) {
        console.error('Error loading plan session:', err);
        setError(err.message || 'Error al cargar la sesión');
      } finally {
        setLoading(false);
      }
    };
    loadAndDecide();
  }, [user, planId, moduleId, sessionId, navigate]);

  const handleScopeEverywhere = () => {
    if (!scopeModalLibraryId) return;
    setShowScopeModal(false);
    navigate(`/content/sessions/${scopeModalLibraryId}`, {
      replace: true,
      state: { returnTo: `/plans/${planId}` },
    });
    setScopeModalLibraryId(null);
  };

  const handleScopeOnlyThisWeek = async () => {
    if (!scopeModalLibraryId || !user) return;
    setApplyingScope(true);
    try {
      const libSession = await libraryService.getLibrarySessionById(user.uid, scopeModalLibraryId);
      if (libSession?.exercises?.length) {
        await plansService.copyLibraryContentToPlanSession(planId, moduleId, sessionId, libSession);
      }
      await plansService.updateSession(planId, moduleId, sessionId, { useLocalContent: true });
      setShowScopeModal(false);
      setScopeModalLibraryId(null);
      navigate(`/plans/${planId}/modules/${moduleId}/sessions/${sessionId}/edit`, { replace: true });
    } catch (err) {
      console.error('Error detaching session for this week:', err);
      alert(err?.message || 'Error al aplicar solo a esta semana');
    } finally {
      setApplyingScope(false);
    }
  };

  const handleBack = () => {
    navigate(`/plans/${planId}`);
  };

  if (!user) return null;

  if (loading) {
    return (
      <DashboardLayout screenName="Sesión" showBackButton backPath={`/plans/${planId}`}>
        <div className="library-session-detail-container">
          <div className="library-session-detail-loading">Cargando...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout screenName="Sesión" showBackButton backPath={`/plans/${planId}`}>
        <div className="library-session-detail-container">
          <div className="library-session-detail-error">
            <p>{error}</p>
            <button onClick={handleBack} className="back-button">
              Volver al plan
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const handleCloseScopeModal = () => {
    if (!applyingScope) {
      setShowScopeModal(false);
      setScopeModalLibraryId(null);
      navigate(`/plans/${planId}`);
    }
  };

  return (
    <DashboardLayout screenName="Sesión" showBackButton backPath={`/plans/${planId}`}>
      <div className="library-session-detail-container">
        <Modal
          isOpen={showScopeModal}
          onClose={handleCloseScopeModal}
          title="¿Dónde aplicar los cambios?"
          containerClassName="propagate-modal-container"
          contentClassName="propagate-modal-content-wrapper"
        >
          <div className="propagate-modal-content">
            <div className="propagate-modal-intro-wrap">
              <p className="propagate-modal-intro">
                <strong>Solo esta sesión</strong> → Cambios solo aquí. Nadie más los ve.
                <br /><br />
                <strong>Todos los sitios</strong> → Se actualiza la sesión en la biblioteca. Todos los planes que la usan cambian.
              </p>
            </div>
            <div className="propagate-modal-footer">
              <button
                type="button"
                className="propagate-modal-btn propagate-modal-btn-dont"
                onClick={handleScopeOnlyThisWeek}
                disabled={applyingScope}
              >
                {applyingScope ? 'Preparando…' : 'Solo esta sesión'}
              </button>
              <button
                type="button"
                className="propagate-modal-btn propagate-modal-btn-propagate"
                onClick={handleScopeEverywhere}
                disabled={applyingScope}
              >
                Todos los sitios
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
};

export default PlanSessionDetailScreen;
