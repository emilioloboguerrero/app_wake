import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import './PlanSessionDetailScreen.css';

const PlanSessionDetailScreen = () => {
  const { planId, moduleId, sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const didRedirect = useRef(false);

  useEffect(() => {
    if (!user || !planId || !moduleId || !sessionId || didRedirect.current) return;
    didRedirect.current = true;
    navigate(`/plans/${planId}/modules/${moduleId}/sessions/${sessionId}/edit`, { replace: true });
  }, [user, planId, moduleId, sessionId, navigate]);

  if (!user) return null;

  return (
    <DashboardLayout screenName="Sesion" showBackButton backPath={`/plans/${planId}`}>
      <div className="plan-session-detail-container" />
    </DashboardLayout>
  );
};

export default PlanSessionDetailScreen;
