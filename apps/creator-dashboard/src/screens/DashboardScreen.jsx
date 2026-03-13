import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import './DashboardScreen.css';

const DashboardScreen = () => {
  const { user } = useAuth();

  return (
    <ErrorBoundary>
    <DashboardLayout screenName="Dashboard">
      <div className="dashboard-content">
        <div className="dashboard-welcome">
          <p className="welcome-text">Bienvenido, {user?.displayName || 'Usuario'}</p>
          <p className="welcome-subtext">Gestiona tus programas y contenido desde aquí</p>
        </div>
        
        <div className="dashboard-stats">
          <div className="stat-card">
            <h3 className="stat-number">0</h3>
            <p className="stat-label">Programas</p>
          </div>
          <div className="stat-card">
            <h3 className="stat-number">0</h3>
            <p className="stat-label">Estudiantes</p>
          </div>
          <div className="stat-card">
            <h3 className="stat-number">0</h3>
            <p className="stat-label">Vistas</p>
          </div>
        </div>
      </div>
    </DashboardLayout>
    </ErrorBoundary>
  );
};

export default DashboardScreen;

