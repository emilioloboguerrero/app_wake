import { useParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import ScreenSkeleton from '../components/ScreenSkeleton';
import ErrorBoundary from '../components/ErrorBoundary';
import { FullScreenError } from '../components/ui/ErrorStates';
import OneOnOneProgramView from '../components/program/OneOnOneProgramView';
import GroupProgramView from '../components/program/GroupProgramView';
import { useProgram } from '../hooks/usePrograms';
import './ProgramDetailScreen.css';

const ProgramDetailScreen = ({ backTo }) => {
  const { programId } = useParams();
  const { data: program, isLoading, error, refetch } = useProgram(programId);

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
    </ErrorBoundary>
  );
};

export default ProgramDetailScreen;
