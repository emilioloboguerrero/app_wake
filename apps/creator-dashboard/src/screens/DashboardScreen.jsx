import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, BookOpen } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import TubelightNavBar from '../components/ui/TubelightNavBar';
import ContextualHint from '../components/hints/ContextualHint';
import { FullScreenError } from '../components/ui/ErrorStates';
import DashboardOneOnOneView from '../components/dashboard/DashboardOneOnOneView';
import DashboardProgramsView from '../components/dashboard/DashboardProgramsView';
import { cacheConfig } from '../config/queryClient';
import apiClient from '../utils/apiClient';
import './DashboardScreen.css';

// ── Constants ─────────────────────────────────────────────────────────────────

const VIEW_KEY = 'wake_dashboard_view';

function getStoredView(hasOneOnOne, hasPrograms) {
  try {
    const stored = localStorage.getItem(VIEW_KEY);
    if (stored === 'one-on-one' || stored === 'programs') return stored;
  } catch { /* noop */ }
  return hasOneOnOne ? 'one-on-one' : 'programs';
}

function useGreeting(displayName) {
  const firstName = displayName?.split(' ')[0];
  const h = new Date().getHours();
  if (h < 12) return firstName ? `Buenos días, ${firstName}` : 'Buenos días';
  if (h < 19) return firstName ? `Buenas tardes, ${firstName}` : 'Buenas tardes';
  return firstName ? `Buenas noches, ${firstName}` : 'Buenas noches';
}

// ── Component ─────────────────────────────────────────────────────────────────

const DashboardScreen = () => {
  const { user } = useAuth();
  const greeting = useGreeting(user?.displayName);

  const { data: queryResult, isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics', 'dashboard', user?.uid],
    queryFn: () => apiClient.get('/analytics/dashboard'),
    enabled: !!user?.uid,
    ...cacheConfig.analytics,
  });

  const dashData = queryResult?.data;
  const hasOneOnOne = dashData?.hasOneOnOne ?? true;
  const hasPrograms = dashData?.hasPrograms ?? false;

  const [activeView, setActiveView] = useState(() => getStoredView(hasOneOnOne, hasPrograms));

  const handleSelectView = useCallback((id) => {
    setActiveView(id);
    try { localStorage.setItem(VIEW_KEY, id); } catch { /* noop */ }
  }, []);

  const unreadVideoExchanges = dashData?.oneOnOne?.unreadVideoExchanges ?? 0;

  const navItems = useMemo(() => [
    {
      id: 'one-on-one',
      label: '1 a 1',
      icon: <Users size={14} />,
      badge: unreadVideoExchanges > 0 ? unreadVideoExchanges : null,
    },
    {
      id: 'programs',
      label: 'Programas',
      icon: <BookOpen size={14} />,
    },
  ], [unreadVideoExchanges]);

  if (isError) {
    return (
      <ErrorBoundary>
        <DashboardLayout screenName={greeting}>
          <FullScreenError
            title="Algo no está funcionando"
            message="Revisa tu conexión e intenta de nuevo."
            onRetry={refetch}
          />
        </DashboardLayout>
      </ErrorBoundary>
    );
  }

  const oneOnOneData = dashData?.oneOnOne ?? null;
  const programsData = dashData?.programs ?? null;

  return (
    <ErrorBoundary>
      <DashboardLayout screenName={greeting}>
        <div className="ds-canvas">
          <div className="ds-view-nav">
            <TubelightNavBar
              items={navItems}
              activeId={activeView}
              onSelect={handleSelectView}
            />
          </div>

          <div className="ds-view-body">
            {activeView === 'one-on-one' ? (
              <DashboardOneOnOneView
                data={oneOnOneData}
                isLoading={isLoading}
                isError={isError}
              />
            ) : (
              <DashboardProgramsView
                data={programsData}
                isLoading={isLoading}
                isError={isError}
              />
            )}
          </div>

          <ContextualHint screenKey="dashboard" />
        </div>
      </DashboardLayout>
    </ErrorBoundary>
  );
};

export default DashboardScreen;
