import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import programService from '../services/programService';
import programAnalyticsService from '../services/programAnalyticsService';
import { queryKeys, cacheConfig } from '../config/queryClient';
import {
  PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import './ProgramDetailScreen.css';

const LabScreen = () => {
  const { user } = useAuth();
  const [selectedUserInfo, setSelectedUserInfo] = useState(null);
  const [isUserInfoModalOpen, setIsUserInfoModalOpen] = useState(false);
  const [statExplanation, setStatExplanation] = useState(null);
  const [isStatExplanationModalOpen, setIsStatExplanationModalOpen] = useState(false);

  // Fetch all programs for the creator
  const { data: programs, isLoading: isLoadingPrograms } = useQuery({
    queryKey: user ? queryKeys.programs.byCreator(user.uid) : ['programs', 'none'],
    queryFn: async () => {
      if (!user?.uid) return [];
      return await programService.getProgramsByCreator(user.uid);
    },
    enabled: !!user?.uid,
    ...cacheConfig.otherPrograms,
  });

  // Fetch aggregated analytics for all programs
  const { data: analytics, isLoading: isLoadingAnalytics, error: analyticsQueryError } = useQuery({
    queryKey: ['aggregatedAnalytics', user?.uid],
    queryFn: async () => {
      if (!programs || programs.length === 0) return null;
      const programIds = programs.map(p => p.id);
      return await programAnalyticsService.getAggregatedAnalyticsForCreator(programIds);
    },
    enabled: !!programs && programs.length > 0,
    ...cacheConfig.analytics,
  });

  const analyticsError = analyticsQueryError ? 'Error al cargar las estadísticas' : null;

  const handleShowUserInfo = (user) => {
    setSelectedUserInfo(user);
    setIsUserInfoModalOpen(true);
  };

  const handleShowStatExplanation = (statKey) => {
    setStatExplanation(statKey);
    setIsStatExplanationModalOpen(true);
  };

  // Helper component for metric card with info icon
  const MetricCard = ({ statKey, value, label, onClick, percentageChange }) => (
    <div className="lab-metric-card" onClick={() => handleShowStatExplanation(statKey)}>
      <button className="lab-metric-info-icon" onClick={(e) => { e.stopPropagation(); handleShowStatExplanation(statKey); }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
          <path d="M12 16V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <path d="M12 8H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>
      <div className="lab-metric-value">{value}</div>
      {percentageChange !== null && (
        <div className={`lab-metric-change ${percentageChange >= 0 ? 'lab-metric-change-positive' : 'lab-metric-change-negative'}`}>
          {percentageChange >= 0 ? '↑' : '↓'} {Math.abs(percentageChange).toFixed(1)}%
        </div>
      )}
      <div className="lab-metric-label">{label}</div>
    </div>
  );

  return (
    <DashboardLayout screenName="Lab">
      <div className="program-tab-content">
        <div className="lab-content">
          {isLoadingAnalytics || isLoadingPrograms ? (
            <div className="lab-loading">
              <p>Cargando estadísticas...</p>
            </div>
          ) : analyticsError ? (
            <div className="lab-error">
              <p>{analyticsError}</p>
            </div>
          ) : analytics ? (
            <>
              {/* Enrollment Metrics */}
              <div className="lab-section">
                <h3 className="lab-section-title">Inscripciones</h3>
                
                {/* Enrollments and Free Trials Over Time - Full Width Above Cards */}
                {analytics.enrollment.enrollmentsOverTime && analytics.enrollment.enrollmentsOverTime.length > 0 && (
                  <div className="lab-chart-container lab-chart-full-width">
                    <h4 className="lab-subsection-title">Inscripciones y Pruebas Gratis en el Tiempo (Últimos 30 días)</h4>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={analytics.enrollment.enrollmentsOverTime}>
                        <defs>
                          <linearGradient id="colorEnrollments" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="rgba(150, 130, 60, 1)" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="rgba(150, 130, 60, 1)" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorTrials" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="rgba(191, 168, 77, 1)" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="rgba(191, 168, 77, 1)" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Area 
                          type="monotone" 
                          dataKey="enrollments" 
                          stroke="rgba(150, 130, 60, 1)" 
                          fillOpacity={1} 
                          fill="url(#colorEnrollments)" 
                          name="Inscripciones"
                        />
                        <Area 
                          type="monotone" 
                          dataKey="trials" 
                          stroke="rgba(191, 168, 77, 1)" 
                          fillOpacity={1} 
                          fill="url(#colorTrials)" 
                          name="Pruebas Gratis"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
                
                <div className="lab-enrollment-container">
                  <div className="lab-metrics-grid">
                    <MetricCard 
                      statKey="totalEnrolled"
                      value={analytics.enrollment.totalEnrolled}
                      label="Total Inscritos"
                    />
                    <MetricCard 
                      statKey="activeEnrollments"
                      value={analytics.enrollment.activeEnrollments}
                      label="Activos"
                    />
                    <MetricCard 
                      statKey="trialUsers"
                      value={analytics.enrollment.trialUsers}
                      label="Pruebas Gratis"
                    />
                    <MetricCard 
                      statKey="expiredEnrollments"
                      value={analytics.enrollment.expiredEnrollments}
                      label="Expirados"
                    />
                    <MetricCard 
                      statKey="cancelledEnrollments"
                      value={analytics.enrollment.cancelledEnrollments}
                      label="Cancelados"
                    />
                    <MetricCard 
                      statKey="recentEnrollments30Days"
                      value={analytics.enrollment.recentEnrollments30Days}
                      label="Últimos 30 días"
                      percentageChange={analytics.enrollment.recentEnrollmentsPercentageChange}
                    />
                    <MetricCard 
                      statKey="averageEnrollmentDurationDays"
                      value={analytics.enrollment.averageEnrollmentDurationDays}
                      label="Duración Promedio (días)"
                    />
                  </div>
                </div>
                
                {/* Demographics Section */}
                {analytics.enrollment.demographics && (
                  <div className="lab-demographics-section">
                    <h4 className="lab-subsection-title">Demografía de Usuarios</h4>
                    
                    {/* Most Common Customer Profile */}
                    {((analytics.enrollment.mostCommonCustomer) || 
                      (analytics.enrollment.demographics.age && analytics.enrollment.demographics.age.distribution)) && (
                      <div className="lab-profile-age-container">
                        {/* Customer Profile */}
                        {analytics.enrollment.mostCommonCustomer && (
                          <div className="lab-customer-profile">
                            <h5 className="lab-profile-title">Perfil del Cliente Más Común</h5>
                            <div className="lab-profile-cards-scrollable">
                              {analytics.enrollment.mostCommonCustomer.age && (
                                <div className="lab-profile-card">
                                  <span className="lab-profile-card-label">Edad</span>
                                  <span className="lab-profile-card-value">{analytics.enrollment.mostCommonCustomer.age} años</span>
                                </div>
                              )}
                              {analytics.enrollment.mostCommonCustomer.gender && (
                                <div className="lab-profile-card">
                                  <span className="lab-profile-card-label">Género</span>
                                  <span className="lab-profile-card-value">{analytics.enrollment.mostCommonCustomer.gender}</span>
                                </div>
                              )}
                              {analytics.enrollment.mostCommonCustomer.city && (
                                <div className="lab-profile-card">
                                  <span className="lab-profile-card-label">Ciudad</span>
                                  <span className="lab-profile-card-value">{analytics.enrollment.mostCommonCustomer.city}</span>
                                </div>
                              )}
                              {Object.keys(analytics.enrollment.mostCommonCustomer.onboardingAnswers || {}).length > 0 && (
                                <>
                                  {Object.entries(analytics.enrollment.mostCommonCustomer.onboardingAnswers)
                                    .filter(([key]) => key.toLowerCase() !== 'completedat' && key.toLowerCase() !== 'completed_at')
                                    .map(([key, value]) => (
                                    <div key={key} className="lab-profile-card">
                                      <span className="lab-profile-card-label">{key}</span>
                                      <span className="lab-profile-card-value">{value}</span>
                                    </div>
                                  ))}
                                </>
                              )}
                            </div>
                            <p className="lab-profile-sample-size">Basado en {analytics.enrollment.mostCommonCustomer.sampleSize} usuarios con datos completos</p>
                          </div>
                        )}
                        
                        {/* Age Distribution */}
                        {analytics.enrollment.demographics.age && analytics.enrollment.demographics.age.distribution && Object.keys(analytics.enrollment.demographics.age.distribution).length > 0 && (
                          <div className="lab-chart-container">
                            <h5 className="lab-chart-title">Distribución por Edad</h5>
                            <ResponsiveContainer width="100%" height={300}>
                              <BarChart data={Object.entries(analytics.enrollment.demographics.age.distribution).map(([age, count]) => ({ age, count }))}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="age" />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="count" fill="rgba(150, 130, 60, 1)" />
                              </BarChart>
                            </ResponsiveContainer>
                            {analytics.enrollment.demographics.age.average && (
                              <p className="lab-chart-note">Edad promedio: {analytics.enrollment.demographics.age.average} años</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Gender Distribution and Top Cities */}
                    {(analytics.enrollment.demographics.gender && Object.keys(analytics.enrollment.demographics.gender).length > 0) || 
                     (analytics.enrollment.demographics.topCities && analytics.enrollment.demographics.topCities.length > 0) ? (
                      <div className="lab-demographics-container">
                        {/* Gender Distribution */}
                        {analytics.enrollment.demographics.gender && Object.keys(analytics.enrollment.demographics.gender).length > 0 && (
                          <div className="lab-chart-container">
                            <h5 className="lab-chart-title">Distribución por Género</h5>
                            <ResponsiveContainer width="100%" height={300}>
                              <PieChart>
                                <Pie
                                  data={Object.entries(analytics.enrollment.demographics.gender).map(([gender, count]) => ({ name: gender, value: count }))}
                                  cx="50%"
                                  cy="50%"
                                  labelLine={false}
                                  stroke="none"
                                  label={false}
                                  outerRadius={100}
                                  fill="#8884d8"
                                  dataKey="value"
                                >
                                  {Object.entries(analytics.enrollment.demographics.gender).map((entry, index) => {
                                    const colors = [
                                      'rgba(150, 130, 60, 1)',
                                      'rgba(191, 168, 77, 1)',
                                      'rgba(100, 100, 100, 1)'
                                    ];
                                    const colorIndex = index < colors.length ? index : index % colors.length;
                                    return <Cell key={`cell-${index}`} fill={colors[colorIndex]} stroke="none" />;
                                  })}
                                </Pie>
                                <Tooltip />
                                <Legend 
                                  formatter={(value, entry) => {
                                    const genderData = Object.entries(analytics.enrollment.demographics.gender);
                                    const total = genderData.reduce((sum, [, count]) => sum + count, 0);
                                    
                                    const itemValue = entry.payload?.value || 0;
                                    const percent = total > 0 ? ((itemValue / total) * 100).toFixed(0) : 0;
                                    
                                    return `${value} ${percent}%`;
                                  }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                        
                        {/* Top Cities */}
                        {analytics.enrollment.demographics.topCities && analytics.enrollment.demographics.topCities.length > 0 && (
                          <div className="lab-chart-container">
                            <h5 className="lab-chart-title">Top 10 Ciudades</h5>
                            <ResponsiveContainer width="100%" height={300}>
                              <BarChart data={analytics.enrollment.demographics.topCities} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" />
                                <YAxis dataKey="city" type="category" width={100} />
                                <Tooltip />
                                <Bar dataKey="count" fill="rgba(150, 130, 60, 1)" />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Engagement Metrics */}
              <div className="lab-section">
                <h3 className="lab-section-title">Compromiso</h3>
                <div className="lab-engagement-container">
                  <div className="lab-metrics-grid">
                    <MetricCard 
                      statKey="totalSessionsCompleted"
                      value={analytics.engagement.totalSessionsCompleted}
                      label="Sesiones Completadas"
                    />
                    <MetricCard 
                      statKey="averageSessionsPerUser"
                      value={analytics.engagement.averageSessionsPerUser}
                      label="Promedio por Usuario"
                    />
                    <MetricCard 
                      statKey="completionRate"
                      value={`${analytics.engagement.completionRate}%`}
                      label="Tasa de Finalización"
                    />
                    <MetricCard 
                      statKey="usersWithAtLeastOneSession"
                      value={analytics.engagement.usersWithAtLeastOneSession}
                      label="Usuarios Activos"
                    />
                  </div>
                  
                  {/* Completion Rate Gauge */}
                  <div className="lab-chart-container">
                    <h4 className="lab-subsection-title">Tasa de Finalización</h4>
                    <div className="lab-gauge-container">
                      <div className="lab-gauge-circle" style={{
                        background: `conic-gradient(rgba(150, 130, 60, 1) 0% ${analytics.engagement.completionRate}%, rgba(255, 255, 255, 0.1) ${analytics.engagement.completionRate}% 100%)`
                      }}>
                        <div className="lab-gauge-inner">
                          <span className="lab-gauge-value">{analytics.engagement.completionRate}%</span>
                          <span className="lab-gauge-label">Completación</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Sessions Completed Over Time */}
                {analytics.engagement.sessionsCompletedOverTime && analytics.engagement.sessionsCompletedOverTime.length > 0 && (
                  <div className="lab-chart-container">
                    <h4 className="lab-subsection-title">Sesiones Completadas en el Tiempo (Últimos 30 días)</h4>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={analytics.engagement.sessionsCompletedOverTime}>
                        <defs>
                          <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="rgba(150, 130, 60, 1)" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="rgba(150, 130, 60, 1)" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Area type="monotone" dataKey="count" stroke="rgba(150, 130, 60, 1)" fillOpacity={1} fill="url(#colorSessions)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
                
                {/* Top Active Users Bar Chart */}
                {analytics.engagement.topActiveUsers && analytics.engagement.topActiveUsers.length > 0 && (
                  <div className="lab-top-users-container">
                    <div className="lab-chart-container">
                      <h4 className="lab-subsection-title">Top 10 Usuarios Más Activos</h4>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={analytics.engagement.topActiveUsers.map((user, index) => ({
                          name: user.userName.length > 15 ? user.userName.substring(0, 15) + '...' : user.userName,
                          sessions: user.sessionsCompleted
                        }))}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="sessions" fill="rgba(150, 130, 60, 1)" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="lab-top-users-list-container">
                      <h4 className="lab-subsection-title">Lista de Usuarios</h4>
                      <div className="lab-top-users-list">
                        {analytics.engagement.topActiveUsers.map((user, index) => (
                          <div key={user.userId} className="lab-top-user-item" onClick={() => handleShowUserInfo(user)}>
                            <span className="lab-top-user-rank">#{index + 1}</span>
                            <span className="lab-top-user-name lab-top-user-name-clickable">{user.userName}</span>
                            <span className="lab-top-user-sessions">{user.sessionsCompleted} sesiones</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>


              {/* Program Statistics */}
              {programs && programs.length > 0 && (
                <div className="lab-section">
                  <h3 className="lab-section-title">Estadísticas por Programa</h3>
                  <div className="lab-program-stats-container">
                    {/* Users per Program */}
                    <div className="lab-chart-container">
                      <h4 className="lab-subsection-title">Usuarios por Programa</h4>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={programs.map(program => ({
                          name: program.title || program.name || 'Sin título',
                          users: analytics.programs?.[program.id]?.users || 0
                        })).filter(p => p.users > 0)}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="users" fill="rgba(150, 130, 60, 1)" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    
                    {/* Program Distribution Pie Chart */}
                    {analytics.programs && Object.keys(analytics.programs).length > 0 && (
                      <div className="lab-chart-container">
                        <h4 className="lab-subsection-title">Distribución de Programas</h4>
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart>
                            <Pie
                              data={Object.entries(analytics.programs)
                                .map(([programId, data]) => {
                                  const program = programs.find(p => p.id === programId);
                                  return {
                                    name: program?.title || program?.name || 'Sin título',
                                    value: data.users || 0
                                  };
                                })
                                .filter(item => item.value > 0)}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              stroke="none"
                              label={false}
                              outerRadius={100}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {Object.entries(analytics.programs)
                                .map(([programId, data]) => {
                                  const program = programs.find(p => p.id === programId);
                                  const colors = [
                                    'rgba(150, 130, 60, 1)',
                                    'rgba(191, 168, 77, 1)',
                                    'rgba(100, 100, 100, 1)',
                                    'rgba(191, 168, 77, 0.7)',
                                    'rgba(150, 130, 60, 0.7)'
                                  ];
                                  const programIndex = Object.keys(analytics.programs).indexOf(programId);
                                  return {
                                    name: program?.title || program?.name || 'Sin título',
                                    value: data.users || 0,
                                    color: colors[programIndex % colors.length]
                                  };
                                })
                                .filter(item => item.value > 0)
                                .map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend 
                              formatter={(value, entry) => {
                                const total = Object.values(analytics.programs || {})
                                  .reduce((sum, data) => sum + (data.users || 0), 0);
                                
                                const itemValue = entry.payload?.value || 0;
                                const percent = total > 0 ? ((itemValue / total) * 100).toFixed(0) : 0;
                                
                                return `${value} ${percent}%`;
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* User Progression */}
              <div className="lab-section">
                <h3 className="lab-section-title">Progresión de Usuarios</h3>
                <div className="lab-progression-container">
                  <div className="lab-metrics-grid">
                    <MetricCard 
                      statKey="usersWithZeroSessions"
                      value={analytics.progression.usersWithZeroSessions}
                      label="0 Sesiones"
                    />
                    <MetricCard 
                      statKey="usersWithOneToFiveSessions"
                      value={analytics.progression.usersWithOneToFiveSessions}
                      label="1-5 Sesiones"
                    />
                    <MetricCard 
                      statKey="usersWithSixToTenSessions"
                      value={analytics.progression.usersWithSixToTenSessions}
                      label="6-10 Sesiones"
                    />
                    <MetricCard 
                      statKey="usersWithTenPlusSessions"
                      value={analytics.progression.usersWithTenPlusSessions}
                      label="10+ Sesiones"
                    />
                    <MetricCard 
                      statKey="averageWeeklyStreak"
                      value={analytics.progression.averageWeeklyStreak}
                      label="Racha Semanal Promedio"
                    />
                  </div>
                  
                  {/* User Progression Distribution */}
                  <div className="lab-chart-container">
                    <h4 className="lab-subsection-title">Distribución de Progresión de Usuarios</h4>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={[
                            { name: '0 Sesiones', value: analytics.progression.usersWithZeroSessions, color: 'rgba(150, 130, 60, 1)' },
                            { name: '1-5 Sesiones', value: analytics.progression.usersWithOneToFiveSessions, color: 'rgba(191, 168, 77, 1)' },
                            { name: '6-10 Sesiones', value: analytics.progression.usersWithSixToTenSessions, color: 'rgba(191, 168, 77, 0.7)' },
                            { name: '10+ Sesiones', value: analytics.progression.usersWithTenPlusSessions, color: 'rgba(100, 100, 100, 1)' }
                          ].filter(item => item.value > 0)}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          stroke="none"
                          label={false}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {[
                            { name: '0 Sesiones', value: analytics.progression.usersWithZeroSessions, color: 'rgba(150, 130, 60, 1)' },
                            { name: '1-5 Sesiones', value: analytics.progression.usersWithOneToFiveSessions, color: 'rgba(191, 168, 77, 1)' },
                            { name: '6-10 Sesiones', value: analytics.progression.usersWithSixToTenSessions, color: 'rgba(191, 168, 77, 0.7)' },
                            { name: '10+ Sesiones', value: analytics.progression.usersWithTenPlusSessions, color: 'rgba(100, 100, 100, 1)' }
                          ].filter(item => item.value > 0).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend 
                          formatter={(value, entry) => {
                            const total = [
                              analytics.progression.usersWithZeroSessions,
                              analytics.progression.usersWithOneToFiveSessions,
                              analytics.progression.usersWithSixToTenSessions,
                              analytics.progression.usersWithTenPlusSessions
                            ].reduce((sum, val) => sum + val, 0);
                            
                            const itemValue = entry.payload?.value || 0;
                            const percent = total > 0 ? ((itemValue / total) * 100).toFixed(0) : 0;
                            
                            return `${value} ${percent}%`;
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="lab-loading">
              <p>No hay programas disponibles</p>
            </div>
          )}
        </div>
      </div>

      {/* User Info Modal */}
      {isUserInfoModalOpen && selectedUserInfo && (
        <Modal
          isOpen={isUserInfoModalOpen}
          onClose={() => setIsUserInfoModalOpen(false)}
          title="Información del Usuario"
        >
          <div style={{ padding: '20px' }}>
            <p><strong>Nombre:</strong> {selectedUserInfo.userName}</p>
            {selectedUserInfo.userEmail && (
              <p><strong>Email:</strong> {selectedUserInfo.userEmail}</p>
            )}
            <p><strong>Sesiones Completadas:</strong> {selectedUserInfo.sessionsCompleted}</p>
          </div>
        </Modal>
      )}

      {/* Stat Explanation Modal */}
      {isStatExplanationModalOpen && statExplanation && (
        <Modal
          isOpen={isStatExplanationModalOpen}
          onClose={() => setIsStatExplanationModalOpen(false)}
          title="Explicación de Métrica"
        >
          <div style={{ padding: '20px' }}>
            <p>Información sobre: {statExplanation}</p>
          </div>
        </Modal>
      )}
    </DashboardLayout>
  );
};

export default LabScreen;

