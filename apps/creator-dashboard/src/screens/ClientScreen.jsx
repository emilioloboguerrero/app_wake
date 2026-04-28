import { useState, useMemo, useCallback, lazy, Suspense } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import { TubelightNavBar, FullScreenError, KeepAlivePane } from '../components/ui';
import ClientLabTab from '../components/client/ClientLabTab';
// Inactive tabs are lazy-loaded so their bundles (calendar, dnd-kit, recharts
// configs, nutrition pickers) don't ship on first paint of the Lab tab.
const ClientPlanTab = lazy(() => import('../components/client/ClientPlanTab'));
const ClientNutritionTab = lazy(() => import('../components/client/ClientNutritionTab'));
const ClientProfileTab = lazy(() => import('../components/client/ClientProfileTab'));
import oneOnOneService from '../services/oneOnOneService';
import apiClient from '../utils/apiClient';
import { cacheConfig, queryKeys } from '../config/queryClient';
import ContextualHint from '../components/hints/ContextualHint';
import './ClientScreen.css';

const TAB_CONFIG = [
  { id: 'lab', label: 'Lab' },
  { id: 'contenido', label: 'Contenido' },
  { id: 'perfil', label: 'Perfil' },
];

const CONTENIDO_SUBTABS = [
  { id: 'entrenamiento', label: 'Entrenamiento' },
  { id: 'nutricion', label: 'Nutricion' },
];


export default function ClientScreen() {
  const { clientId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const creatorId = user?.uid;

  // ── Tab state ────────────────────────────────────────────────
  const [currentTab, setCurrentTab] = useState(
    () => location.state?.tab || 'lab'
  );
  const [contenidoSubtab, setContenidoSubtab] = useState(
    () => location.state?.subtab || 'entrenamiento'
  );

  // Keep-alive: track which tabs have been visited so we mount once & never unmount
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([location.state?.tab || 'lab']));
  const [visitedSubtabs, setVisitedSubtabs] = useState(
    () => new Set([location.state?.subtab || 'entrenamiento'])
  );

  const handleTabChange = useCallback((tabId) => {
    setCurrentTab(tabId);
    setVisitedTabs(prev => { const next = new Set(prev); next.add(tabId); return next; });
    navigate('.', { replace: true, state: { ...location.state, tab: tabId } });
  }, [navigate, location.state]);

  const handleBack = useCallback(() => {
    if (currentTab === 'contenido') {
      setCurrentTab('lab');
      navigate('.', { replace: true, state: { ...location.state, tab: 'lab' } });
    } else {
      navigate(location.state?.returnTo || '/clientes', {
        state: location.state?.returnState || {},
      });
    }
  }, [currentTab, navigate, location.state]);

  const handleSubtabChange = useCallback((subtabId) => {
    setContenidoSubtab(subtabId);
    setVisitedSubtabs(prev => { const next = new Set(prev); next.add(subtabId); return next; });
  }, []);

  // ── Shared week state (synced across plan + nutrition) ───────
  const [currentWeekIndex, setCurrentWeekIndex] = useState(0);

  // ── Core data: single client detail query ────────────────────
  // Use the navigation-state hints to (a) parallelize lab analytics before
  // the detail GET resolves, and (b) paint the header instantly with the
  // client's name + avatar via placeholderData. Do NOT use setQueryData
  // for priming — it writes dataUpdatedAt=now and combined with staleTime
  // suppresses the real fetch, which silently masked enrolledPrograms.
  const hintClientUserId = location.state?.clientUserId;
  const clientHint = location.state?.clientHint;

  const placeholderClient = clientHint ? {
    clientId,
    clientUserId: hintClientUserId,
    ...clientHint,
    notes: [],
  } : undefined;

  const { data: client, isLoading: clientLoading, isFetching: clientFetching, error: clientError } = useQuery({
    queryKey: queryKeys.clients.detail(clientId),
    queryFn: async () => {
      const result = await oneOnOneService.getClientById(clientId, { userId: hintClientUserId });
      return result;
    },
    enabled: !!clientId,
    placeholderData: placeholderClient,
    ...cacheConfig.userProfile,
  });

  const clientUserId = client?.clientUserId || hintClientUserId;
  const clientName = client?.clientName || 'Cliente';

  // ── Derive assigned programs from enriched client detail ─────
  const programs = useMemo(() => {
    if (!client?.enrolledPrograms) return [];
    return client.enrolledPrograms
      .filter(p => p.status === 'active')
      .map(p => ({
        id: p.courseId,
        title: p.title,
        imageUrl: p.image_url,
        image_url: p.image_url,
        deliveryType: 'one_on_one',
        content_plan_id: p.content_plan_id,
        assignment: {
          planAssignments: p.planAssignments,
          planId: p.content_plan_id,
        },
      }));
  }, [client?.enrolledPrograms]);

  // Treat the placeholder period as loading too so ClientPlanTab doesn't flash
  // its empty state in the gap between paint-from-hint and the real GET resolving.
  const programsLoading = clientLoading || (clientFetching && !client?.enrolledPrograms);

  const [selectedProgramId, setSelectedProgramId] = useState(null);
  const activeProgram = useMemo(() => {
    if (selectedProgramId) return programs.find(p => p.id === selectedProgramId);
    return programs[0] || null;
  }, [programs, selectedProgramId]);

  const planId = activeProgram?.assignment?.planId || activeProgram?.content_plan_id;

  // ── Derive week count from planAssignments keys ──────────────
  // Module titles come from the calendar response; here we only need count + IDs
  const sortedModules = useMemo(() => {
    const assignments = activeProgram?.assignment?.planAssignments;
    if (!assignments || typeof assignments !== 'object') return [];
    return Object.entries(assignments)
      .map(([weekKey, entry]) => ({
        id: entry.moduleId || weekKey,
        weekKey,
        title: null, // titles populated by calendar data
        order: null,
      }))
      .sort((a, b) => a.weekKey.localeCompare(b.weekKey));
  }, [activeProgram]);

  const currentModule = sortedModules[currentWeekIndex] || null;
  // ── Lab data (lazy-loaded: only for nutrition subtab's CrossTabInsights) ──
  const { data: labData } = useQuery({
    queryKey: ['analytics', 'client-lab', clientUserId, '30d'],
    queryFn: async () => {
      const res = await apiClient.get(`/analytics/client/${clientUserId}/lab?range=30d`);
      return res.data || res;
    },
    enabled: !!clientUserId && currentTab === 'contenido' && contenidoSubtab === 'nutricion',
    ...cacheConfig.analytics,
  });

  // ── Header avatar ────────────────────────────────────────────
  const headerIcon = useMemo(() => {
    const avatar = client?.avatarUrl || client?.profilePictureUrl;
    const initial = clientName?.charAt(0)?.toUpperCase() || 'C';
    return (
      <div className="cs-header-client">
        {avatar ? (
          <img src={avatar} alt={clientName} className="cs-header-avatar" />
        ) : (
          <div className="cs-header-avatar-fallback">{initial}</div>
        )}
      </div>
    );
  }, [client, clientName]);

  const backPath = location.state?.returnTo || '/clientes';
  const backState = location.state?.returnState || undefined;

  if (!clientUserId && clientLoading) {
    return (
      <DashboardLayout screenName="Cargando..." showBackButton backPath={backPath} backState={backState}>
        <div className="cs-loading"><div className="cs-loading-pulse" /></div>
      </DashboardLayout>
    );
  }

  if (clientError || (!clientLoading && !client)) {
    const isNotFound = clientError?.status === 404 || clientError?.code === 'NOT_FOUND';
    return (
      <DashboardLayout screenName="Cliente" showBackButton backPath={backPath} backState={backState}>
        <FullScreenError
          title={isNotFound ? 'Cliente no encontrado' : 'No pudimos cargar este cliente'}
          message={isNotFound ? 'Este cliente puede haber sido eliminado o el enlace es incorrecto.' : 'Ocurrio un error inesperado.'}
          onRetry={() => navigate(backPath, { state: backState })}
          retryLabel="Volver a clientes"
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      screenName={clientName}
      showBackButton
      onBack={handleBack}
      headerIcon={headerIcon}
    >
      <div className="cs-container">
        {/* ── Tab Navigation ──────────────────────────────────── */}
        <div className="cs-tab-bar">
          <TubelightNavBar
            items={TAB_CONFIG}
            activeId={currentTab}
            onSelect={handleTabChange}
          />
        </div>

        {/* ── Tab Content (keep-alive: mount once, toggle via CSS) ── */}
        <div className="cs-content">
          <KeepAlivePane active={currentTab === 'lab'}>
            <ClientLabTab
              clientId={clientId}
              clientUserId={clientUserId}
              clientName={clientName}
              creatorId={creatorId}
              avatarUrl={client?.profilePictureUrl || client?.avatarUrl}
            />
          </KeepAlivePane>
          {visitedTabs.has('contenido') && (
            <KeepAlivePane active={currentTab === 'contenido'}>
              <div className="cs-subtab-bar">
                <TubelightNavBar
                  items={CONTENIDO_SUBTABS}
                  activeId={contenidoSubtab}
                  onSelect={handleSubtabChange}
                />
              </div>
              <Suspense fallback={null}>
                {visitedSubtabs.has('entrenamiento') && (
                  <KeepAlivePane active={contenidoSubtab === 'entrenamiento'}>
                    <ClientPlanTab
                      clientId={clientId}
                      clientUserId={clientUserId}
                      clientName={clientName}
                      creatorId={creatorId}
                      currentModule={currentModule}
                      planId={planId}
                      activeProgram={activeProgram}
                      programs={programs}
                      programsLoading={programsLoading}
                      selectedProgramId={selectedProgramId}
                      onProgramChange={setSelectedProgramId}
                    />
                  </KeepAlivePane>
                )}
                {visitedSubtabs.has('nutricion') && (
                  <KeepAlivePane active={contenidoSubtab === 'nutricion'}>
                    <ClientNutritionTab
                      clientId={clientId}
                      clientUserId={clientUserId}
                      clientName={clientName}
                      creatorId={creatorId}
                      labData={labData}
                      nutritionGoal={client?.onboardingData?.nutritionGoal}
                      dietaryRestrictions={client?.onboardingData?.dietaryRestrictions || []}
                    />
                  </KeepAlivePane>
                )}
              </Suspense>
            </KeepAlivePane>
          )}
          {visitedTabs.has('perfil') && (
            <KeepAlivePane active={currentTab === 'perfil'}>
              <Suspense fallback={null}>
                <ClientProfileTab
                  clientId={clientId}
                  clientUserId={clientUserId}
                  clientName={clientName}
                  creatorId={creatorId}
                  clientDetail={client}
                />
              </Suspense>
            </KeepAlivePane>
          )}
        </div>
      </div>
      <ContextualHint screenKey="client" />
    </DashboardLayout>
  );
}
