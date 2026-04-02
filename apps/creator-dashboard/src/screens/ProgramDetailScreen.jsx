import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '../components/DashboardLayout';
import ScreenSkeleton from '../components/ScreenSkeleton';
import ErrorBoundary from '../components/ErrorBoundary';
import { FullScreenError } from '../components/ui/ErrorStates';
import OneOnOneProgramView from '../components/program/OneOnOneProgramView';
import GroupProgramView from '../components/program/GroupProgramView';
import { useProgram } from '../hooks/usePrograms';
import { useAuth } from '../contexts/AuthContext';
import ContextualHint from '../components/hints/ContextualHint';
import { queryKeys, cacheConfig } from '../config/queryClient';
import apiClient from '../utils/apiClient';
import libraryService from '../services/libraryService';
import './ProgramDetailScreen.css';

const ProgramDetailScreen = ({ backTo }) => {
  const { programId } = useParams();
  const { user } = useAuth();
  const { data: program, isLoading, error, refetch } = useProgram(programId);

  // Pre-warm: fire in parallel with useProgram to eliminate waterfall
  useQuery({
    queryKey: queryKeys.clients.byProgram(programId),
    queryFn: () => apiClient.get(`/creator/clients?programId=${programId}`).then((r) => r.data),
    enabled: !!programId,
    ...cacheConfig.clientsOverview,
  });
  useQuery({
    queryKey: queryKeys.library.sessionsSlim(user?.uid),
    queryFn: () => libraryService.getSessionLibrarySlim(),
    enabled: !!user?.uid,
    ...cacheConfig.otherPrograms,
  });
  useQuery({
    queryKey: queryKeys.analytics.adherence(user?.uid, { programId }),
    queryFn: () => apiClient.get(`/analytics/adherence?programId=${programId}`).then((r) => r.data),
    enabled: !!user?.uid && !!programId,
    ...cacheConfig.analytics,
  });

  if (isLoading) {
    return (
      <DashboardLayout screenName="Programa">
        <ScreenSkeleton />
      </DashboardLayout>
    );
  }

  if (error || (!isLoading && !program)) {
    return (
      <DashboardLayout screenName="Programa" backPath="/products">
        <FullScreenError
          title="No pudimos cargar este programa"
          message="Puede que haya sido eliminado."
          onRetry={refetch}
        />
      </DashboardLayout>
    );
  }

  if (program.deliveryType === 'one_on_one') {
    return (
      <ErrorBoundary>
        <OneOnOneProgramView
          program={program}
          programId={programId}
          backTo={backTo}
          refetchProgram={refetch}
        />
        <ContextualHint screenKey="program-detail" />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <GroupProgramView
        program={program}
        programId={programId}
        backTo={backTo}
        refetchProgram={refetch}
      />
      <ContextualHint screenKey="program-detail" />
    </ErrorBoundary>
  );
};

export default ProgramDetailScreen;
