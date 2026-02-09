/**
 * PlanSessionDetailScreen - Redirect-only component for plan sessions.
 * Always redirects to LibrarySessionDetailScreen (the single session editing screen).
 * For sessions with librarySessionRef: redirect directly.
 * For legacy sessions (no librarySessionRef): migrate to library (copy exercises + sets), link, then redirect.
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import plansService from '../services/plansService';
import libraryService from '../services/libraryService';
import './LibrarySessionDetailScreen.css';

const PlanSessionDetailScreen = () => {
  const { planId, moduleId, sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadAndRedirect = async () => {
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

        const returnTo = `/plans/${planId}`;
        let librarySessionId = sessionData.librarySessionRef;

        if (!librarySessionId) {
          const librarySession = await libraryService.createLibrarySession(user.uid, {
            title: sessionData.title || 'Sesión',
            image_url: sessionData.image_url || null,
          });
          librarySessionId = librarySession.id;

          const planExercises = await plansService.getExercisesBySession(planId, moduleId, sessionId);
          for (let i = 0; i < planExercises.length; i++) {
            const ex = planExercises[i];
            const exerciseName = ex.title || ex.name || 'Ejercicio';
            const created = await libraryService.createExerciseInLibrarySession(
              user.uid,
              librarySessionId,
              exerciseName,
              i
            );

            const planSets = await plansService.getSetsByExercise(planId, moduleId, sessionId, ex.id);
            for (let j = 0; j < planSets.length; j++) {
              const setData = planSets[j];
              const newSet = await libraryService.createSetInLibraryExercise(user.uid, librarySessionId, created.id, j);
              const hasRepsOrIntensity = setData.reps != null || setData.intensity != null;
              if (hasRepsOrIntensity && newSet?.id) {
                const updates = {};
                if (setData.reps != null) updates.reps = setData.reps;
                if (setData.intensity != null) updates.intensity = setData.intensity;
                if (setData.title) updates.title = setData.title;
                if (Object.keys(updates).length > 0) {
                  await libraryService.updateSetInLibraryExercise(
                    user.uid,
                    librarySessionId,
                    created.id,
                    newSet.id,
                    updates
                  );
                }
              }
            }
          }

          await plansService.updateSession(planId, moduleId, sessionId, {
            librarySessionRef: librarySessionId,
          });
        }

        navigate(`/content/sessions/${librarySessionId}`, {
          replace: true,
          state: { returnTo },
        });
      } catch (err) {
        console.error('Error loading/migrating plan session:', err);
        setError(err.message || 'Error al cargar la sesión');
      } finally {
        setLoading(false);
      }
    };
    loadAndRedirect();
  }, [user, planId, moduleId, sessionId, navigate]);

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

  return null;
};

export default PlanSessionDetailScreen;
