import { useState, useMemo, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import { TubelightNavBar, WeekNavigator } from '../components/ui';
import ClientLabTab from '../components/client/ClientLabTab';
import ClientPlanTab from '../components/client/ClientPlanTab';
import ClientNutritionTab from '../components/client/ClientNutritionTab';
import ClientProfileTab from '../components/client/ClientProfileTab';
import CrossTabInsights from '../components/client/CrossTabInsights';
import oneOnOneService from '../services/oneOnOneService';
import programService from '../services/programService';
import clientProgramService from '../services/clientProgramService';
import plansService from '../services/plansService';
import apiClient from '../utils/apiClient';
import './ClientScreen.css';

const TAB_CONFIG = [
  { id: 'lab', label: 'Lab' },
  { id: 'planificacion', label: 'Planificacion' },
  { id: 'nutricion', label: 'Nutricion' },
  { id: 'perfil', label: 'Perfil' },
];

const SHOW_WEEK_NAV = new Set(['nutricion']);

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

  const handleTabChange = useCallback((tabId) => {
    setCurrentTab(tabId);
    navigate('.', { replace: true, state: { ...location.state, tab: tabId } });
  }, [navigate, location.state]);

  // ── Shared week state (synced across plan + nutrition) ───────
  const [currentWeekIndex, setCurrentWeekIndex] = useState(0);

  // ── Core data: client info ───────────────────────────────────
  const { data: client, isLoading: clientLoading, error: clientError } = useQuery({
    queryKey: ['clients', 'detail', clientId],
    queryFn: () => oneOnOneService.getClientById(clientId),
    enabled: !!clientId,
    staleTime: 2 * 60 * 1000,
  });

  const clientUserId = client?.clientUserId;
  const clientName = client?.clientName || 'Cliente';

  // ── Client profile (avatar) ──────────────────────────────────
  const { data: clientProfile } = useQuery({
    queryKey: ['clientProfile', clientId],
    queryFn: () => apiClient.get(`/creator/clients/${clientId}`),
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
  });

  // ── Shared: assigned programs + plan modules ─────────────────
  const { data: programs = [], isLoading: programsLoading } = useQuery({
    queryKey: ['assignedPrograms', clientUserId, creatorId],
    queryFn: async () => {
      const allPrograms = await programService.getProgramsByCreator();
      const oneOnOne = allPrograms.filter(p => p.deliveryType === 'one_on_one');
      const withAssignment = await Promise.all(
        oneOnOne.map(async (prog) => {
          try {
            const assignment = await clientProgramService.getClientProgram(prog.id, clientUserId);
            return { ...prog, assignment };
          } catch { return { ...prog, assignment: null }; }
        })
      );
      return withAssignment.filter(p => p.assignment);
    },
    enabled: !!clientUserId && !!creatorId,
    staleTime: 5 * 60 * 1000,
  });

  const [selectedProgramId, setSelectedProgramId] = useState(null);
  const activeProgram = useMemo(() => {
    if (selectedProgramId) return programs.find(p => p.id === selectedProgramId);
    return programs[0] || null;
  }, [programs, selectedProgramId]);

  const planId = activeProgram?.assignment?.planId || activeProgram?.content_plan_id;

  const { data: modules = [] } = useQuery({
    queryKey: ['plan', 'modules', planId],
    queryFn: () => plansService.getModulesByPlan(planId),
    enabled: !!planId,
    staleTime: 10 * 60 * 1000,
  });

  const sortedModules = useMemo(() =>
    [...modules].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [modules]
  );

  const currentModule = sortedModules[currentWeekIndex] || null;
  const totalWeeks = sortedModules.length;

  // ── Lab data (for cross-tab insights) ────────────────────────
  const { data: labData } = useQuery({
    queryKey: ['analytics', 'client-lab', clientUserId, '30d'],
    queryFn: async () => {
      const res = await apiClient.get(`/analytics/client/${clientUserId}/lab?range=30d`);
      return res.data || res;
    },
    enabled: !!clientUserId,
    staleTime: 2 * 60 * 1000,
  });

  // ── Week date range (for nutrition sync) ─────────────────────
  const weekDateRange = useMemo(() => {
    if (!activeProgram?.assignment?.planAssignments) return null;
    const assignments = activeProgram.assignment.planAssignments;
    const weekKey = currentModule?.id;
    if (!weekKey || !assignments[weekKey]) return null;
    const a = assignments[weekKey];
    return { start: a.startDate || a.start, end: a.endDate || a.end };
  }, [activeProgram, currentModule]);

  // ── Week navigation handlers ─────────────────────────────────
  const handlePreviousWeek = useCallback(() => {
    setCurrentWeekIndex(i => Math.max(0, i - 1));
  }, []);

  const handleNextWeek = useCallback(() => {
    setCurrentWeekIndex(i => Math.min(totalWeeks - 1, i + 1));
  }, [totalWeeks]);

  const handleToday = useCallback(() => {
    setCurrentWeekIndex(0);
  }, []);

  // ── Header avatar ────────────────────────────────────────────
  const headerIcon = useMemo(() => {
    const avatar = clientProfile?.data?.profilePictureUrl || clientProfile?.data?.avatarUrl;
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
  }, [clientProfile, clientName]);

  const backPath = location.state?.returnTo || '/clientes';
  const backState = location.state?.returnState || undefined;

  if (clientLoading) {
    return (
      <DashboardLayout screenName="Cargando..." showBackButton backPath={backPath} backState={backState}>
        <div className="cs-loading"><div className="cs-loading-pulse" /></div>
      </DashboardLayout>
    );
  }

  if (clientError || !client) {
    return (
      <DashboardLayout screenName="Error" showBackButton backPath={backPath} backState={backState}>
        <div className="cs-error">
          <p>No se pudo cargar el cliente.</p>
          <button onClick={() => navigate(backPath)}>Volver</button>
        </div>
      </DashboardLayout>
    );
  }

  const showWeekNav = SHOW_WEEK_NAV.has(currentTab) && totalWeeks > 0;

  return (
    <DashboardLayout
      screenName={clientName}
      showBackButton
      backPath={backPath}
      backState={backState}
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

        {/* ── Shared Week Navigator (plan + nutrition tabs) ──── */}
        {showWeekNav && (
          <div className="cs-week-area">
            <WeekNavigator
              currentWeek={currentWeekIndex + 1}
              totalWeeks={totalWeeks}
              label={currentModule?.title || `Semana ${currentWeekIndex + 1}`}
              onPrevious={handlePreviousWeek}
              onNext={handleNextWeek}
              onToday={handleToday}
            />
            <CrossTabInsights
              labData={labData}
              clientUserId={clientUserId}
              currentWeekIndex={currentWeekIndex}
            />
          </div>
        )}

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
          {currentTab === 'planificacion' && (
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
          {currentTab === 'nutricion' && (
            <ClientNutritionTab
              clientId={clientId}
              clientUserId={clientUserId}
              clientName={clientName}
              creatorId={creatorId}
              currentWeekIndex={currentWeekIndex}
              weekDateRange={weekDateRange}
              labData={labData}
            />
          )}
          {currentTab === 'perfil' && (
            <ClientProfileTab
              clientId={clientId}
              clientUserId={clientUserId}
              clientName={clientName}
              creatorId={creatorId}
            />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
