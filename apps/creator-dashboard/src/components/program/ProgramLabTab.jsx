import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys, cacheConfig } from '../../config/queryClient';
import programAnalyticsService from '../../services/programAnalyticsService';
import Modal from '../Modal';
import { InlineError } from '../ui/ErrorStates';

const STAT_EXPLANATIONS = {
  'totalEnrolled': { title: 'Total Inscritos', description: 'Número total de usuarios que se han inscrito en este programa, incluyendo activos, expirados, cancelados y pruebas gratuitas.' },
  'activeEnrollments': { title: 'Activos', description: 'Usuarios con inscripción activa. Un usuario se considera activo si su estado es "active" y su fecha de expiración no ha pasado.' },
  'trialUsers': { title: 'Pruebas Gratis', description: 'Número de usuarios que están usando o han usado una prueba gratuita del programa.' },
  'expiredEnrollments': { title: 'Expirados', description: 'Usuarios cuyas inscripciones han expirado.' },
  'cancelledEnrollments': { title: 'Cancelados', description: 'Usuarios que han cancelado su suscripción al programa.' },
  'recentEnrollments30Days': { title: 'Últimos 30 días', description: 'Número de nuevas inscripciones en los últimos 30 días.' },
  'averageEnrollmentDurationDays': { title: 'Duración Promedio (días)', description: 'Duración promedio de las inscripciones, calculada desde la fecha de compra hasta la fecha de expiración.' },
  'totalSessionsCompleted': { title: 'Sesiones Completadas', description: 'Número total de sesiones completadas por todos los usuarios inscritos en el programa.' },
  'averageSessionsPerUser': { title: 'Promedio por Usuario', description: 'Número promedio de sesiones completadas por usuario inscrito en el programa.' },
  'completionRate': { title: 'Tasa de Finalización', description: 'Porcentaje de usuarios inscritos que han completado al menos una sesión del programa.' },
  'usersWithAtLeastOneSession': { title: 'Usuarios Activos', description: 'Número de usuarios que han completado al menos una sesión.' },
  'totalCompletions': { title: 'Total Completadas', description: 'Número total de veces que se han completado sesiones del programa por todos los usuarios.' },
  'averageDuration': { title: 'Duración Promedio', description: 'Tiempo promedio que los usuarios tardan en completar una sesión, calculado en minutos y segundos.' },
  'mostCompletedSession': { title: 'Más Completada', description: 'La sesión que ha sido completada más veces por los usuarios del programa.' },
  'leastCompletedSession': { title: 'Menos Completada', description: 'La sesión que ha sido completada menos veces por los usuarios del programa.' },
  'totalUniqueExercises': { title: 'Ejercicios Únicos Realizados', description: 'Número total de ejercicios diferentes que han sido realizados al menos una vez.' },
  'totalModules': { title: 'Módulos', description: 'Número total de módulos que contiene el programa.' },
  'totalSessions': { title: 'Sesiones', description: 'Número total de sesiones que contiene el programa.' },
  'totalExercises': { title: 'Ejercicios', description: 'Número total de ejercicios que contiene el programa.' },
  'averageExercisesPerSession': { title: 'Promedio Ejercicios/Sesión', description: 'Número promedio de ejercicios por sesión en el programa.' },
  'usersWithZeroSessions': { title: '0 Sesiones', description: 'Usuarios inscritos que no han completado ninguna sesión.' },
  'usersWithOneToFiveSessions': { title: '1-5 Sesiones', description: 'Usuarios que han completado entre 1 y 5 sesiones.' },
  'usersWithSixToTenSessions': { title: '6-10 Sesiones', description: 'Usuarios que han completado entre 6 y 10 sesiones.' },
  'usersWithTenPlusSessions': { title: '10+ Sesiones', description: 'Usuarios que han completado 10 o más sesiones.' },
  'averageWeeklyStreak': { title: 'Racha Semanal Promedio', description: 'Promedio de semanas consecutivas completadas según los requisitos de la racha semanal.' }
};

const MetricCard = ({ statKey, value, label, percentageChange, description, onExplain }) => (
  <div
    className="lab-metric-card"
    onClick={() => {
      if (STAT_EXPLANATIONS[statKey]) {
        onExplain && onExplain(statKey);
      }
    }}
    style={{ cursor: STAT_EXPLANATIONS[statKey] ? 'pointer' : 'default' }}
  >
    <div className="lab-metric-header">
      <div className="lab-metric-value">{value || 0}</div>
      {percentageChange !== null && percentageChange !== undefined && !isNaN(percentageChange) && (
        <div className={`lab-metric-change ${percentageChange >= 0 ? 'lab-metric-change-positive' : 'lab-metric-change-negative'}`}>
          {percentageChange >= 0 ? '↑' : '↓'} {Math.abs(percentageChange).toFixed(1)}%
        </div>
      )}
    </div>
    <div className="lab-metric-label">{label}</div>
    {description && <div className="lab-metric-description">{description}</div>}
  </div>
);

export default function ProgramLabTab({ programId, isActive }) {
  const [statExplanation, setStatExplanation] = useState(null);
  const [isStatExplanationModalOpen, setIsStatExplanationModalOpen] = useState(false);

  const { data: analytics, isLoading: isLoadingAnalytics, error: analyticsQueryError } = useQuery({
    queryKey: queryKeys.analytics.program(programId),
    queryFn: async () => {
      if (!programId) return null;
      return programAnalyticsService.getProgramAnalytics(programId);
    },
    enabled: !!programId && isActive,
    ...cacheConfig.analytics,
  });

  const analyticsError = analyticsQueryError ? 'No pudimos cargar las estadisticas de este programa' : null;

  const handleExplain = (statKey) => {
    if (STAT_EXPLANATIONS[statKey]) {
      setStatExplanation(STAT_EXPLANATIONS[statKey]);
      setIsStatExplanationModalOpen(true);
    }
  };

  return (
    <div className="program-tab-content">
      <h1 className="program-page-title">Estadisticas</h1>
      <div className="lab-content">
        {isLoadingAnalytics ? (
          <div className="lab-loading">
            <p>Cargando estadisticas...</p>
          </div>
        ) : analyticsError ? (
          <InlineError message={analyticsError} />
        ) : analytics ? (
          <>
            <div className="program-section lab-section lab-section-overview">
              <div className="program-section__header">
                <h2 className="program-section__title">Resumen general</h2>
              </div>
              <div className="lab-metrics-grid lab-metrics-grid-overview">
                <MetricCard
                  statKey="totalEnrolled"
                  value={analytics.enrollment?.totalEnrolled}
                  label="Total Inscritos"
                  description="Usuarios que se han inscrito en el programa"
                  onExplain={handleExplain}
                />
                <MetricCard
                  statKey="activeEnrollments"
                  value={analytics.enrollment?.activeEnrollments}
                  label="Activos"
                  description="Usuarios con inscripcion activa actualmente"
                  onExplain={handleExplain}
                />
                <MetricCard
                  statKey="totalSessionsCompleted"
                  value={analytics.engagement?.totalSessionsCompleted}
                  label="Sesiones Completadas"
                  description="Total de sesiones completadas por todos los usuarios"
                  onExplain={handleExplain}
                />
                <MetricCard
                  statKey="completionRate"
                  value={`${analytics.engagement?.completionRate || 0}%`}
                  label="Tasa de Finalizacion"
                  description="Porcentaje de usuarios que han completado al menos una sesion"
                  onExplain={handleExplain}
                />
              </div>
            </div>

            <div className="program-section lab-section">
              <div className="program-section__header">
                <h2 className="program-section__title">Inscripciones</h2>
              </div>
              <div className="lab-metrics-grid">
                <MetricCard
                  statKey="recentEnrollments30Days"
                  value={analytics.enrollment?.recentEnrollments30Days}
                  label="Ultimos 30 dias"
                  description="Nuevas inscripciones en el ultimo mes"
                  percentageChange={analytics.enrollment?.recentEnrollmentsPercentageChange}
                  onExplain={handleExplain}
                />
                <MetricCard
                  statKey="trialUsers"
                  value={analytics.enrollment?.trialUsers}
                  label="Pruebas Gratis"
                  description="Usuarios que estan usando o usaron prueba gratis"
                  onExplain={handleExplain}
                />
                <MetricCard
                  statKey="expiredEnrollments"
                  value={analytics.enrollment?.expiredEnrollments}
                  label="Expirados"
                  description="Inscripciones que han expirado"
                  onExplain={handleExplain}
                />
                <MetricCard
                  statKey="cancelledEnrollments"
                  value={analytics.enrollment?.cancelledEnrollments}
                  label="Cancelados"
                  description="Usuarios que cancelaron su suscripcion"
                  onExplain={handleExplain}
                />
                <MetricCard
                  statKey="averageEnrollmentDurationDays"
                  value={analytics.enrollment?.averageEnrollmentDurationDays}
                  label="Duracion Promedio"
                  description="Duracion promedio de las inscripciones en dias"
                  onExplain={handleExplain}
                />
              </div>
            </div>

            <div className="program-section lab-section">
              <div className="program-section__header">
                <h2 className="program-section__title">Compromiso</h2>
              </div>
              <div className="lab-metrics-grid">
                <MetricCard
                  statKey="averageSessionsPerUser"
                  value={analytics.engagement?.averageSessionsPerUser}
                  label="Promedio por Usuario"
                  description="Sesiones completadas en promedio por usuario"
                  onExplain={handleExplain}
                />
                <MetricCard
                  statKey="usersWithAtLeastOneSession"
                  value={analytics.engagement?.usersWithAtLeastOneSession}
                  label="Usuarios Activos"
                  description="Usuarios que han completado al menos una sesion"
                  onExplain={handleExplain}
                />
                <MetricCard
                  statKey="averageDuration"
                  value={analytics.sessions?.averageDuration > 0
                    ? `${Math.floor(analytics.sessions.averageDuration / 60)}m ${analytics.sessions.averageDuration % 60}s`
                    : 'N/A'}
                  label="Duracion Promedio"
                  description="Tiempo promedio que tardan los usuarios en completar una sesion"
                  onExplain={handleExplain}
                />
                <MetricCard
                  statKey="totalCompletions"
                  value={analytics.sessions?.totalCompletions}
                  label="Total Completadas"
                  description="Numero total de veces que se completaron sesiones"
                  onExplain={handleExplain}
                />
              </div>
            </div>

            <div className="program-section lab-section">
              <div className="program-section__header">
                <h2 className="program-section__title">Progresion de usuarios</h2>
              </div>
              <div className="lab-metrics-grid">
                <MetricCard
                  statKey="usersWithZeroSessions"
                  value={analytics.progression?.usersWithZeroSessions}
                  label="0 Sesiones"
                  description="Usuarios que aun no han completado ninguna sesion"
                  onExplain={handleExplain}
                />
                <MetricCard
                  statKey="usersWithOneToFiveSessions"
                  value={analytics.progression?.usersWithOneToFiveSessions}
                  label="1-5 Sesiones"
                  description="Usuarios que han completado entre 1 y 5 sesiones"
                  onExplain={handleExplain}
                />
                <MetricCard
                  statKey="usersWithSixToTenSessions"
                  value={analytics.progression?.usersWithSixToTenSessions}
                  label="6-10 Sesiones"
                  description="Usuarios que han completado entre 6 y 10 sesiones"
                  onExplain={handleExplain}
                />
                <MetricCard
                  statKey="usersWithTenPlusSessions"
                  value={analytics.progression?.usersWithTenPlusSessions}
                  label="10+ Sesiones"
                  description="Usuarios que han completado 10 o mas sesiones"
                  onExplain={handleExplain}
                />
                {analytics.progression?.averageWeeklyStreak !== undefined && (
                  <MetricCard
                    statKey="averageWeeklyStreak"
                    value={analytics.progression.averageWeeklyStreak}
                    label="Racha Semanal Promedio"
                    description="Promedio de semanas consecutivas completadas"
                    onExplain={handleExplain}
                  />
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="lab-empty">
            <p>Cuando tengas clientes inscritos, aqui vas a ver como van.</p>
          </div>
        )}
      </div>

      <Modal
        isOpen={isStatExplanationModalOpen}
        onClose={() => setIsStatExplanationModalOpen(false)}
        title={statExplanation?.title || 'Informacion'}
      >
        <div className="stat-explanation-modal-content">
          <p className="stat-explanation-text">{statExplanation?.description || ''}</p>
        </div>
      </Modal>
    </div>
  );
}
