import { useState, useMemo, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import { TubelightNavBar } from '../components/ui';
import ClientLabTab from '../components/client/ClientLabTab';
import ClientPlanTab from '../components/client/ClientPlanTab';
import ClientNutritionTab from '../components/client/ClientNutritionTab';
import ClientProfileTab from '../components/client/ClientProfileTab';
import oneOnOneService from '../services/oneOnOneService';
import apiClient from '../utils/apiClient';
import { cacheConfig, queryKeys } from '../config/queryClient';
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
  console.log(`[ClientScreen] render — clientId=${clientId}, tab=${location?.state?.tab || 'lab'}`);

  // ── Tab state ────────────────────────────────────────────────
  const [currentTab, setCurrentTab] = useState(
    () => location.state?.tab || 'lab'
  );
  const [contenidoSubtab, setContenidoSubtab] = useState(
    () => location.state?.subtab || 'entrenamiento'
  );

  const handleTabChange = useCallback((tabId) => {
    setCurrentTab(tabId);
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

  // ── Shared week state (synced across plan + nutrition) ───────
  const [currentWeekIndex, setCurrentWeekIndex] = useState(0);

  // ── Core data: single client detail query ────────────────────
  // Use clientUserId from navigation state as early hint to allow
  // parallel queries (e.g., Lab data) before client detail resolves.
  const hintClientUserId = location.state?.clientUserId;

  const { data: client, isLoading: clientLoading, error: clientError } = useQuery({
    queryKey: queryKeys.clients.detail(clientId),
    queryFn: async () => {
      const t0 = performance.now();
      const result = await oneOnOneService.getClientById(clientId, { userId: hintClientUserId });
      console.log(`[ClientScreen] getClientById — ${Math.round(performance.now() - t0)}ms`);
      return result;
    },
    enabled: !!clientId,
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

  const programsLoading = clientLoading;

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
    return (
      <DashboardLayout screenName="Error" showBackButton backPath={backPath} backState={backState}>
        <div className="cs-error">
          <p>No se pudo cargar el cliente.</p>
          <button onClick={() => navigate(backPath)}>Volver</button>
        </div>
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

        {/* ── Tab Content ─────────────────────────────────────── */}
        <div className="cs-content">
          {currentTab === 'lab' && (
            <ClientLabTab
              clientId={clientId}
              clientUserId={clientUserId}
              clientName={clientName}
              creatorId={creatorId}
            />
          )}
          {currentTab === 'contenido' && (
            <>
              <div className="cs-subtab-bar">
                <TubelightNavBar
                  items={CONTENIDO_SUBTABS}
                  activeId={contenidoSubtab}
                  onSelect={setContenidoSubtab}
                />
              </div>
              {contenidoSubtab === 'entrenamiento' && (
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
              )}
              {contenidoSubtab === 'nutricion' && (
                <ClientNutritionTab
                  clientId={clientId}
                  clientUserId={clientUserId}
                  clientName={clientName}
                  creatorId={creatorId}
                  labData={labData}
                  nutritionGoal={client?.onboardingData?.nutritionGoal}
                  dietaryRestrictions={client?.onboardingData?.dietaryRestrictions || []}
                />
              )}
            </>
          )}
          {currentTab === 'perfil' && (
            <ClientProfileTab
              clientId={clientId}
              clientUserId={clientUserId}
              clientName={clientName}
              creatorId={creatorId}
              clientDetail={client}
            />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
