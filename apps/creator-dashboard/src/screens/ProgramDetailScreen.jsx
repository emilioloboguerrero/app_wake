import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import DashboardLayout from '../components/DashboardLayout';
import ScreenSkeleton from '../components/ScreenSkeleton';
import ErrorBoundary from '../components/ErrorBoundary';
import MediaPickerModal from '../components/MediaPickerModal';
import { FullScreenError } from '../components/ui/ErrorStates';
import { default as SpotlightTutorial } from '../components/ui/SpotlightTutorial';
import ProgramLabTab from '../components/program/ProgramLabTab';
import ProgramConfigTab from '../components/program/ProgramConfigTab';
import ProgramContentTab from '../components/program/ProgramContentTab';
import { useProgram } from '../hooks/usePrograms';
import { queryKeys } from '../config/queryClient';
import programService from '../services/programService';
import plansService from '../services/plansService';
import libraryService from '../services/libraryService';
import useConfirm from '../hooks/useConfirm';
import logger from '../utils/logger';
import './ProgramDetailScreen.css';

const TAB_CONFIG = [
  { key: 'lab', navLabel: 'Estadisticas' },
  { key: 'configuracion', navLabel: 'Configuracion' },
  { key: 'contenido', navLabel: 'Contenido' },
];

const TUTORIAL_STEPS = [
  {
    selector: '[data-tutorial="program-tabs"]',
    title: 'Navegacion del programa',
    body: 'Estadisticas te muestra como van tus clientes. Configuracion es la info del programa. Contenido es donde armas la estructura.',
  },
  {
    selector: '[data-tutorial="content-editor"]',
    title: 'Editor de contenido',
    body: 'Cada fila es un dia de la semana. Arrastra sesiones desde la biblioteca o crea nuevas directo aca.',
  },
  {
    selector: '[data-tutorial="library-sidebar"]',
    title: 'Tu biblioteca',
    body: 'Tu biblioteca aparece al costado. Arrastra lo que necesites al programa.',
  },
  {
    selector: '[data-tutorial="week-volume"]',
    title: 'Volumen semanal',
    body: 'Revisa el volumen muscular por semana para equilibrar tu programacion.',
  },
];

const ProgramDetailScreen = () => {
  const { programId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { confirm, ConfirmModal } = useConfirm();

  const [currentTabIndex, setCurrentTabIndex] = useState(0);
  const [selectedModule, setSelectedModule] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
  const [mediaPickerContext, setMediaPickerContext] = useState('program');
  const [isMigratingSessionToLibrary, setIsMigratingSessionToLibrary] = useState(false);

  const { data: program, isLoading: programLoading, error: programError, refetch: refetchProgram } = useProgram(programId);

  const effectiveTabConfig = useMemo(() =>
    program?.deliveryType === 'one_on_one'
      ? TAB_CONFIG.filter((t) => t.key !== 'contenido')
      : TAB_CONFIG,
    [program?.deliveryType]
  );

  useEffect(() => {
    if (currentTabIndex >= effectiveTabConfig.length) {
      setCurrentTabIndex(Math.max(0, effectiveTabConfig.length - 1));
    }
  }, [effectiveTabConfig.length, currentTabIndex]);

  const currentTab = effectiveTabConfig[Math.min(currentTabIndex, effectiveTabConfig.length - 1)] ?? effectiveTabConfig[0];
  const isLowTicket = program?.deliveryType !== 'one_on_one';
  const isContenidoTab = currentTab?.key === 'contenido';

  const [contentPlanId, setContentPlanId] = useState(null);
  const [isSavingContentPlan, setIsSavingContentPlan] = useState(false);

  const { data: plans = [] } = useQuery({
    queryKey: ['plans', user?.uid],
    queryFn: async () => (user ? plansService.getPlansByCreator(user.uid) : []),
    enabled: !!user && !!programId && !!isLowTicket,
  });

  useEffect(() => {
    setContentPlanId(program?.content_plan_id ?? null);
  }, [program?.content_plan_id]);

  const handleContentPlanChange = async (planId) => {
    if (!program?.id) return;
    setIsSavingContentPlan(true);
    try {
      await programService.updateProgram(program.id, { content_plan_id: planId || null });
      queryClient.setQueryData(queryKeys.programs.detail(program.id), (old) => ({ ...old, content_plan_id: planId || null }));
      queryClient.invalidateQueries({ queryKey: queryKeys.modules.all(programId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.modules.withCounts(programId) });
      setContentPlanId(planId || null);
    } catch (err) {
      showToast('Los cambios no se guardaron. Revisa tu conexion.', 'error');
    } finally {
      setIsSavingContentPlan(false);
    }
  };

  const handleTabClick = useCallback((index) => {
    if (index === currentTabIndex) return;
    const newTab = effectiveTabConfig[index];
    const oldTab = effectiveTabConfig[currentTabIndex];
    if (oldTab?.key === 'contenido' && newTab?.key !== 'contenido') {
      setSelectedModule(null);
      setSelectedSession(null);
    }
    setCurrentTabIndex(index);
  }, [currentTabIndex, effectiveTabConfig]);

  const handleOpenMediaPicker = (context) => {
    setMediaPickerContext(context);
    setIsMediaPickerOpen(true);
  };

  const handleMediaPickerSelect = async (item) => {
    if (mediaPickerContext === 'program' && program) {
      try {
        await programService.updateProgram(program.id, { image_url: item.url, image_path: null });
        queryClient.setQueryData(queryKeys.programs.detail(program.id), (old) => ({ ...old, image_url: item.url, image_path: null }));
      } catch (err) {
        showToast('No pudimos subir la imagen. Revisa tu conexion e intenta de nuevo.', 'error');
      }
      setIsMediaPickerOpen(false);
      return;
    }
    if (mediaPickerContext === 'session' && selectedSession && programId && selectedModule) {
      try {
        if (selectedSession.librarySessionRef && user) {
          await libraryService.updateLibrarySession(user.uid, selectedSession.librarySessionRef, { image_url: item.url });
        }
        await programService.updateSession(programId, selectedModule.id, selectedSession.id, { image_url: item.url });
        setSelectedSession((prev) => ({ ...prev, image_url: item.url }));
        queryClient.invalidateQueries({ queryKey: queryKeys.modules.all(programId) });
      } catch (err) {
        showToast('No pudimos subir la imagen. Revisa tu conexion e intenta de nuevo.', 'error');
      }
      setIsMediaPickerOpen(false);
    }
  };

  const navigateToSessionEdit = useCallback(async (session, module) => {
    if (!programId || !user || !module) return;
    const targetLibraryId = session.librarySessionRef;
    if (targetLibraryId) {
      navigate(`/content/sessions/${targetLibraryId}`, { state: { returnTo: location.pathname } });
      return;
    }
    setIsMigratingSessionToLibrary(true);
    try {
      const librarySession = await libraryService.createLibrarySession(user.uid, {
        title: session.title || session.name || 'Sesion',
        image_url: session.image_url || null,
      });
      const librarySessionId = librarySession.id;
      const programExercises = await programService.getExercisesBySession(programId, module.id, session.id);
      for (let i = 0; i < programExercises.length; i++) {
        const ex = programExercises[i];
        const exerciseName = ex.title || ex.name || (ex.primary && typeof ex.primary === 'object' && Object.values(ex.primary)[0]) || 'Ejercicio';
        const created = await libraryService.createExerciseInLibrarySession(user.uid, librarySessionId, exerciseName, i);
        const exerciseUpdateData = {};
        if (ex.primary != null && typeof ex.primary === 'object') exerciseUpdateData.primary = ex.primary;
        if (ex.alternatives != null && typeof ex.alternatives === 'object') exerciseUpdateData.alternatives = ex.alternatives;
        if (Array.isArray(ex.measures)) exerciseUpdateData.measures = ex.measures;
        if (Array.isArray(ex.objectives)) exerciseUpdateData.objectives = ex.objectives;
        if (ex.customObjectiveLabels != null && typeof ex.customObjectiveLabels === 'object') exerciseUpdateData.customObjectiveLabels = ex.customObjectiveLabels;
        if (ex.customMeasureLabels != null && typeof ex.customMeasureLabels === 'object') exerciseUpdateData.customMeasureLabels = ex.customMeasureLabels;
        if (Object.keys(exerciseUpdateData).length > 0) {
          await libraryService.updateExerciseInLibrarySession(user.uid, librarySessionId, created.id, exerciseUpdateData);
        }
        const programSets = await programService.getSetsByExercise(programId, module.id, session.id, ex.id);
        for (let j = 0; j < programSets.length; j++) {
          const setData = programSets[j];
          const newSet = await libraryService.createSetInLibraryExercise(user.uid, librarySessionId, created.id, j);
          const setUpdates = {};
          const skipKeys = new Set(['id', 'created_at', 'updated_at']);
          Object.keys(setData).forEach((k) => { if (!skipKeys.has(k)) setUpdates[k] = setData[k]; });
          if (Object.keys(setUpdates).length > 0) {
            await libraryService.updateSetInLibraryExercise(user.uid, librarySessionId, created.id, newSet.id, setUpdates);
          }
        }
      }
      await programService.updateSession(programId, module.id, session.id, { librarySessionRef: librarySessionId });
      navigate(`/content/sessions/${librarySessionId}`, { state: { returnTo: location.pathname } });
    } catch (err) {
      logger.error('[ProgramDetailScreen] navigateToSessionEdit error:', err);
      showToast('No pudimos abrir la sesion para editar. Intenta de nuevo.', 'error');
    } finally {
      setIsMigratingSessionToLibrary(false);
    }
  }, [programId, user, navigate, location.pathname]);

  const handleBackToModules = () => {
    setSelectedModule(null);
    setSelectedSession(null);
  };

  const handleBackToSessions = () => {
    setSelectedSession(null);
  };

  const getScreenName = () => {
    if (selectedSession && isContenidoTab) return selectedSession.title || selectedSession.name || 'Sesion';
    if (selectedModule && isContenidoTab) return `Sesiones - ${selectedModule.title || selectedModule.name || 'Semana'}`;
    return program?.title || 'Programa';
  };

  const shouldShowBackButton = isContenidoTab && (selectedSession || selectedModule);
  const getBackPath = () => {
    if (selectedSession || selectedModule) return null;
    return location.state?.returnTo || '/products';
  };
  const showBreadcrumb = isContenidoTab && (selectedModule || selectedSession);

  if (programLoading) {
    return (
      <DashboardLayout screenName="Programa">
        <ScreenSkeleton />
      </DashboardLayout>
    );
  }

  if (programError || (!programLoading && !program)) {
    return (
      <DashboardLayout screenName="Programa" backPath="/products">
        <FullScreenError
          title="No pudimos cargar este programa"
          message="Puede que haya sido eliminado."
          onRetry={refetchProgram}
        />
      </DashboardLayout>
    );
  }

  const renderTabContent = () => {
    switch (currentTab?.key) {
      case 'lab':
        return <ProgramLabTab programId={programId} isActive={currentTab?.key === 'lab'} />;
      case 'configuracion':
        return (
          <ProgramConfigTab
            program={program}
            programId={programId}
            user={user}
            queryClient={queryClient}
            showToast={showToast}
            confirm={confirm}
            onOpenMediaPicker={handleOpenMediaPicker}
          />
        );
      case 'contenido':
        return (
          <ProgramContentTab
            program={program}
            programId={programId}
            user={user}
            showToast={showToast}
            confirm={confirm}
            selectedModule={selectedModule}
            selectedSession={selectedSession}
            onModuleSelect={setSelectedModule}
            onSessionSelect={setSelectedSession}
            onNavigateToSession={navigateToSessionEdit}
            contentPlanId={contentPlanId}
            plans={plans}
            onContentPlanChange={handleContentPlanChange}
            isSavingContentPlan={isSavingContentPlan}
          />
        );
      default:
        return null;
    }
  };

  return (
    <ErrorBoundary>
      <DashboardLayout
        screenName={getScreenName()}
        headerBackgroundImage={isLowTicket ? null : (selectedSession?.image_url || program?.image_url || null)}
        onBack={selectedSession ? handleBackToSessions : selectedModule ? handleBackToModules : null}
        showBackButton={shouldShowBackButton}
        backPath={getBackPath()}
        backState={location.state?.returnState ?? {}}
      >
        <div className={`program-page ${isLowTicket ? 'program-page--compact-header' : ''}`}>
          <main className="program-page__main">
            {isLowTicket ? (
              <div className="program-detail-tab-bar program-detail-tab-bar--client-style" aria-label="Secciones del programa" data-tutorial="program-tabs">
                <div className="program-detail-tab-bar__container">
                  <div className="program-detail-tab-bar__indicator-wrapper">
                    {effectiveTabConfig.map((tab, index) => (
                      <button
                        key={tab.key}
                        type="button"
                        className={`program-detail-tab-bar__button ${currentTabIndex === index ? 'program-detail-tab-bar__button--active' : ''}`}
                        onClick={() => handleTabClick(index)}
                      >
                        <span className="program-detail-tab-bar__label">{tab.navLabel}</span>
                      </button>
                    ))}
                    <div
                      className="program-detail-tab-bar__indicator"
                      style={{
                        width: `${100 / effectiveTabConfig.length}%`,
                        transform: `translateX(${currentTabIndex * 100}%)`,
                      }}
                      aria-hidden
                    />
                  </div>
                </div>
              </div>
            ) : (
              <nav className="program-page__top-nav" aria-label="Secciones del programa" data-tutorial="program-tabs">
                {effectiveTabConfig.map((tab, index) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={`program-page__tab ${currentTabIndex === index ? 'program-page__tab--active' : ''}`}
                    onClick={() => handleTabClick(index)}
                  >
                    <span className="program-page__tab-label">{tab.navLabel}</span>
                  </button>
                ))}
              </nav>
            )}

            {showBreadcrumb && (
              <div className="program-page__breadcrumb">
                <button type="button" className="program-page__breadcrumb-link" onClick={() => navigate('/products')}>
                  {program?.title || 'Programa'}
                </button>
                {selectedModule && (
                  <>
                    <span className="program-page__breadcrumb-sep">/</span>
                    <button type="button" className="program-page__breadcrumb-link" onClick={handleBackToModules}>
                      {selectedModule.title || selectedModule.name || 'Semana'}
                    </button>
                  </>
                )}
                {selectedSession && (
                  <>
                    <span className="program-page__breadcrumb-sep">/</span>
                    <button type="button" className="program-page__breadcrumb-link program-page__breadcrumb-link--current" onClick={handleBackToSessions}>
                      {selectedSession.title || selectedSession.name || 'Sesion'}
                    </button>
                    <button type="button" className="program-page__breadcrumb-image-btn" onClick={() => handleOpenMediaPicker('session')} aria-label="Cambiar imagen" title="Cambiar imagen">
                      {selectedSession.image_url ? (
                        <img src={selectedSession.image_url} alt="" />
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15M17 8L12 3L7 8M12 3V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                  </>
                )}
              </div>
            )}

            <div className="program-page__content">
              {renderTabContent()}
            </div>
          </main>
        </div>

        {isMigratingSessionToLibrary && (
          <div className="program-detail-migrating-overlay" role="alert" aria-busy="true">
            <div className="program-detail-migrating-content">
              <div className="program-detail-migrating-spinner" aria-hidden />
              <p className="program-detail-migrating-text">Preparando sesion para editar...</p>
            </div>
          </div>
        )}

        <MediaPickerModal
          isOpen={isMediaPickerOpen}
          onClose={() => setIsMediaPickerOpen(false)}
          onSelect={handleMediaPickerSelect}
          context={mediaPickerContext}
        />

        <SpotlightTutorial screenKey="program-detail" steps={TUTORIAL_STEPS} />
      </DashboardLayout>
      {ConfirmModal}
    </ErrorBoundary>
  );
};

export default ProgramDetailScreen;
