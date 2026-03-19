import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '../components/DashboardLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import programService from '../services/programService';
import programAnalyticsService from '../services/programAnalyticsService';
import { queryKeys, cacheConfig } from '../config/queryClient';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import './LabScreen.css';

// ─── Skeleton primitives ──────────────────────────────────────────
const Skeleton = ({ w = '100%', h = 16, radius = 6, style = {} }) => (
  <div className="sk-block" style={{ width: w, height: h, borderRadius: radius, ...style }} />
);

const WidgetSkeleton = () => (
  <div className="ini-widget sk-widget">
    <Skeleton w="60%" h={12} />
    <Skeleton w="40%" h={32} style={{ marginTop: 12 }} />
    <Skeleton w="80%" h={8} style={{ marginTop: 10 }} />
  </div>
);

// ─── Metric widget ────────────────────────────────────────────────
const Widget = ({ label, value, sub, trend, trendPositive, icon, onClick }) => (
  <div className={`ini-widget ${onClick ? 'ini-widget--clickable' : ''}`} onClick={onClick}>
    <div className="ini-widget-header">
      <span className="ini-widget-label">{label}</span>
      {icon && <span className="ini-widget-icon">{icon}</span>}
    </div>
    <div className="ini-widget-value">{value ?? '—'}</div>
    <div className="ini-widget-footer">
      {trend != null && (
        <span className={`ini-widget-trend ${trendPositive ? 'ini-widget-trend--up' : 'ini-widget-trend--down'}`}>
          {trendPositive ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
        </span>
      )}
      {sub && <span className="ini-widget-sub">{sub}</span>}
    </div>
  </div>
);

// ─── Quick action card ────────────────────────────────────────────
const QuickAction = ({ label, sub, onClick, icon }) => (
  <button className="ini-quick" onClick={onClick}>
    <span className="ini-quick-icon">{icon}</span>
    <span className="ini-quick-body">
      <span className="ini-quick-label">{label}</span>
      <span className="ini-quick-sub">{sub}</span>
    </span>
    <svg className="ini-quick-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  </button>
);

// ─── Chart tooltip ────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="ini-tooltip">
      <p className="ini-tooltip-label">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} className="ini-tooltip-value">{p.value}</p>
      ))}
    </div>
  );
};

// ─── Section header ───────────────────────────────────────────────
const SectionHeader = ({ title, sub }) => (
  <div className="ini-section-header">
    <h3 className="ini-section-title">{title}</h3>
    {sub && <p className="ini-section-sub">{sub}</p>}
  </div>
);

// ─── Empty state ──────────────────────────────────────────────────
const EmptyState = ({ onCreateProgram, onAddClient }) => (
  <div className="ini-empty">
    <div className="ini-empty-icon">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    </div>
    <h3 className="ini-empty-title">Tu dashboard está esperando</h3>
    <p className="ini-empty-sub">
      Crea tu primer programa o agrega un cliente para empezar a ver datos aquí.
    </p>
    <div className="ini-empty-actions">
      <button className="ini-empty-btn ini-empty-btn--primary" onClick={onCreateProgram}>
        Crear programa
      </button>
      <button className="ini-empty-btn" onClick={onAddClient}>
        Agregar cliente
      </button>
    </div>
  </div>
);

// ─── Main screen ──────────────────────────────────────────────────
const LabScreen = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const firstName = user?.displayName?.split(' ')[0];

  const { data: programs, isLoading: isLoadingPrograms } = useQuery({
    queryKey: user ? queryKeys.programs.byCreator(user.uid) : ['programs', 'none'],
    queryFn: async () => {
      if (!user?.uid) return [];
      return await programService.getProgramsByCreator(user.uid);
    },
    enabled: !!user?.uid,
    ...cacheConfig.otherPrograms,
  });

  const hasPrograms = programs && programs.length > 0;

  const { data: analytics, isLoading: isLoadingAnalytics } = useQuery({
    queryKey: ['aggregatedAnalytics', user?.uid],
    queryFn: async () => {
      if (!hasPrograms) return null;
      const ids = programs.map(p => p.id);
      return await programAnalyticsService.getAggregatedAnalyticsForCreator(ids);
    },
    enabled: hasPrograms,
    ...cacheConfig.analytics,
  });

  const isLoading = isLoadingPrograms || isLoadingAnalytics;

  // ── Derived values ─────────────────────────────────────────────
  const totalEnrolled    = analytics?.enrollment?.totalEnrolled ?? null;
  const activeNow        = analytics?.enrollment?.activeEnrollments ?? null;
  const completionRate   = analytics?.engagement?.completionRate ?? null;
  const recentSignups    = analytics?.enrollment?.recentEnrollments30Days ?? null;
  const recentChange     = analytics?.enrollment?.recentEnrollmentsPercentageChange ?? null;
  const totalSessions    = analytics?.engagement?.totalSessionsCompleted ?? null;
  const avgSessions      = analytics?.engagement?.averageSessionsPerUser ?? null;
  const enrollmentsChart = analytics?.enrollment?.enrollmentsOverTime ?? [];
  const sessionsChart    = analytics?.engagement?.sessionsCompletedOverTime ?? [];
  const hasAnyData       = totalEnrolled != null && totalEnrolled > 0;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return firstName ? `Buenos días, ${firstName}` : 'Buenos días';
    if (h < 19) return firstName ? `Buenas tardes, ${firstName}` : 'Buenas tardes';
    return firstName ? `Buenas noches, ${firstName}` : 'Buenas noches';
  })();

  return (
    <ErrorBoundary>
      <DashboardLayout screenName="Inicio">
        <div className="ini-root">

          {/* ── Greeting ────────────────────────────────────────── */}
          <div className="ini-greeting">
            <h1 className="ini-greeting-text">{greeting}.</h1>
            <p className="ini-greeting-sub">
              {isLoading
                ? 'Cargando tu resumen…'
                : hasAnyData
                  ? 'Aquí tienes lo que importa hoy.'
                  : 'Configura tu espacio para ver datos aquí.'}
            </p>
          </div>

          {/* ── Metric widgets ───────────────────────────────────── */}
          <div className="ini-widgets">
            {isLoading ? (
              <>
                <WidgetSkeleton />
                <WidgetSkeleton />
                <WidgetSkeleton />
                <WidgetSkeleton />
              </>
            ) : (
              <>
                <Widget
                  label="Clientes activos"
                  value={activeNow}
                  sub={totalEnrolled != null ? `de ${totalEnrolled} en total` : undefined}
                  icon={
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  }
                  onClick={() => navigate('/products?tab=clientes')}
                />
                <Widget
                  label="Inscripciones (30 días)"
                  value={recentSignups}
                  trend={recentChange}
                  trendPositive={recentChange >= 0}
                  icon={
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M12 7a4 4 0 100 8 4 4 0 000-8zM20 8v6M23 11h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  }
                />
                <Widget
                  label="Tasa de finalización"
                  value={completionRate != null ? `${completionRate}%` : null}
                  sub="de sesiones completadas"
                  icon={
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                      <path d="M22 4L12 14.01l-3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  }
                />
                <Widget
                  label="Sesiones completadas"
                  value={totalSessions}
                  sub={avgSessions != null ? `${avgSessions} por usuario` : undefined}
                  icon={
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <path d="M6 4v16M18 4v16M3 8h3M18 8h3M3 16h3M18 16h3M6 12h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                  }
                />
              </>
            )}
          </div>

          {/* ── No data state ────────────────────────────────────── */}
          {!isLoading && !hasAnyData && (
            <EmptyState
              onCreateProgram={() => navigate('/products/new')}
              onAddClient={() => navigate('/products?tab=clientes')}
            />
          )}

          {/* ── Charts (only when data exists) ───────────────────── */}
          {!isLoading && hasAnyData && (
            <div className="ini-charts">
              {enrollmentsChart.length > 0 && (
                <div className="ini-chart-card">
                  <SectionHeader
                    title="Inscripciones"
                    sub="Últimos 30 días"
                  />
                  <div className="ini-chart-area">
                    <ResponsiveContainer width="100%" height={160}>
                      <AreaChart data={enrollmentsChart} margin={{ top: 4, right: 0, left: -24, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gEnroll" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="rgba(255,255,255,0.5)" stopOpacity={1}/>
                            <stop offset="95%" stopColor="rgba(255,255,255,0)"   stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Area type="monotone" dataKey="enrollments" stroke="rgba(255,255,255,0.6)" strokeWidth={1.5} fill="url(#gEnroll)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {sessionsChart.length > 0 && (
                <div className="ini-chart-card">
                  <SectionHeader
                    title="Actividad"
                    sub="Sesiones completadas · últimos 30 días"
                  />
                  <div className="ini-chart-area">
                    <ResponsiveContainer width="100%" height={160}>
                      <AreaChart data={sessionsChart} margin={{ top: 4, right: 0, left: -24, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gSessions" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="rgba(255,255,255,0.4)" stopOpacity={1}/>
                            <stop offset="95%" stopColor="rgba(255,255,255,0)"   stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Area type="monotone" dataKey="count" stroke="rgba(255,255,255,0.6)" strokeWidth={1.5} fill="url(#gSessions)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Quick actions ─────────────────────────────────────── */}
          {!isLoading && (
            <div className="ini-section">
              <SectionHeader title="Accesos rápidos" />
              <div className="ini-quick-list">
                <QuickAction
                  label="Programas y clientes"
                  sub="Gestiona tu catálogo y clientes"
                  onClick={() => navigate('/products')}
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  }
                />
                <QuickAction
                  label="Biblioteca"
                  sub="Ejercicios, sesiones y módulos"
                  onClick={() => navigate('/content')}
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M2 20h20M4 20V8l8-5 8 5v12M9 20v-6h6v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  }
                />
                <QuickAction
                  label="Nutrición"
                  sub="Recetas y planes alimenticios"
                  onClick={() => navigate('/nutrition')}
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10M12 2c2.5 0 5 5 5 10s-2.5 10-5 10M12 2C9.5 2 7 7 7 12s2.5 10 5 10M2 12h20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                  }
                />
                <QuickAction
                  label="Disponibilidad"
                  sub="Configura tus horarios de llamadas"
                  onClick={() => navigate('/availability')}
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
                      <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  }
                />
              </div>
            </div>
          )}

        </div>
      </DashboardLayout>
    </ErrorBoundary>
  );
};

export default LabScreen;
