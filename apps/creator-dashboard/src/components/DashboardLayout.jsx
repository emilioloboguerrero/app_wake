import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ASSET_BASE } from '../config/assets';
import { useNavigate, useLocation } from 'react-router-dom';
import StickyHeader from './StickyHeader';
import './DashboardLayout.css';

const DashboardLayout = ({ children, screenName, headerBackgroundImage = null, onHeaderEditClick = null, onBack = null, showBackButton = false, backPath = null, headerIcon = null, headerImageIcon = null }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 640);
      // On mobile, sidebar should be closed by default
      if (window.innerWidth <= 640) {
        setIsSidebarVisible(false);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Close sidebar when navigating on mobile
  useEffect(() => {
    if (isMobile) {
      setIsSidebarVisible(false);
    }
  }, [location.pathname, isMobile]);

  const toggleSidebar = () => {
    setIsSidebarVisible(!isSidebarVisible);
  };

  return (
    <div className="dashboard-layout">
      {/* Sidebar Overlay for Mobile */}
      {isMobile && isSidebarVisible && (
        <div 
          className="sidebar-overlay"
          onClick={() => setIsSidebarVisible(false)}
        />
      )}

      {/* Left Sidebar */}
      <aside className={`sidebar ${isSidebarVisible ? 'sidebar-expanded' : 'sidebar-collapsed'} ${isMobile ? (isSidebarVisible ? 'sidebar-open' : '') : ''}`}>
        <div className="sidebar-header">
          <img 
            src={`${ASSET_BASE}wake-logo-new.png`}
            alt="Wake Logo" 
            className="sidebar-logo-image"
          />
          {isSidebarVisible && <p className="sidebar-subtitle">Creadores</p>}
        </div>

        <nav className="sidebar-nav">
          <button
            className={`menu-item ${location.pathname === '/lab' ? 'active' : ''}`}
            onClick={() => {
              navigate('/lab');
              if (isMobile) {
                setIsSidebarVisible(false);
              }
            }}
          >
            <svg className="menu-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21C16.9706 21 21 16.9706 21 12M12 3C16.9706 3 21 7.02944 21 12M12 3V12M21 12H12M18 18.5L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {isSidebarVisible && <span className="menu-label">Dashboard</span>}
          </button>
          <button
            className={`menu-item ${location.pathname === '/content' || location.pathname.startsWith('/plans/') || location.pathname.startsWith('/libraries') || location.pathname.startsWith('/content/') || location.pathname === '/library/sessions/new' || location.pathname === '/library/modules/new' ? 'active' : ''}`}
            onClick={() => {
              navigate('/content');
              if (isMobile) {
                setIsSidebarVisible(false);
              }
            }}
          >
            <svg className="menu-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 9.25V9.2C21 8.0799 21 7.51984 20.782 7.09202C20.5903 6.7157 20.2843 6.40974 19.908 6.21799C19.4802 6 18.9201 6 17.8 6L3 6M3 6L3 16.8C3 17.9201 3 18.4802 3.21799 18.908C3.40973 19.2843 3.7157 19.5903 4.09202 19.782C4.51984 20 5.0799 20 6.2 20H7M3 6L3 5.6C3 5.03995 3 4.75992 3.109 4.54601C3.20487 4.35785 3.35785 4.20487 3.54601 4.10899C3.75992 4 4.03995 4 4.6 4H9.33726C9.58185 4 9.70415 4 9.81923 4.02763C9.92127 4.05213 10.0188 4.09253 10.1083 4.14736C10.2092 4.2092 10.2957 4.29568 10.4686 4.46863L12 6M16 14L18 16M11 21V18.5L18.5 11L21 13.5L13.5 21H11Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {isSidebarVisible && <span className="menu-label">Biblioteca</span>}
          </button>
          <button
            className={`menu-item ${location.pathname === '/products' || location.pathname.startsWith('/programs/') || location.pathname.startsWith('/clients') || location.pathname.startsWith('/one-on-one') ? 'active' : ''}`}
            onClick={() => {
              navigate('/products');
              if (isMobile) {
                setIsSidebarVisible(false);
              }
            }}
          >
            <svg className="menu-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M17 20C17 18.3431 14.7614 17 12 17C9.23858 17 7 18.3431 7 20M21 17.0004C21 15.7702 19.7659 14.7129 18 14.25M3 17.0004C3 15.7702 4.2341 14.7129 6 14.25M18 10.2361C18.6137 9.68679 19 8.8885 19 8C19 6.34315 17.6569 5 16 5C15.2316 5 14.5308 5.28885 14 5.76389M6 10.2361C5.38625 9.68679 5 8.8885 5 8C5 6.34315 6.34315 5 8 5C8.76835 5 9.46924 5.28885 10 5.76389M12 14C10.3431 14 9 12.6569 9 11C9 9.34315 10.3431 8 12 8C13.6569 8 15 9.34315 15 11C15 12.6569 13.6569 14 12 14Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {isSidebarVisible && <span className="menu-label">Programas y clientes</span>}
          </button>
        </nav>

        <div className="sidebar-footer">
          <button 
            className="sidebar-toggle-button"
            onClick={toggleSidebar}
            aria-label={isSidebarVisible ? 'Ocultar menú' : 'Mostrar menú'}
          >
            {isSidebarVisible ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 14H10V19M19 10H14V5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 19H5V14M14 5H19V10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
          <div 
            className="user-info user-info-clickable"
            onClick={() => {
              navigate('/profile');
              if (isMobile) {
                setIsSidebarVisible(false);
              }
            }}
            style={{ cursor: 'pointer' }}
            title="Perfil"
            aria-label="Ir a Perfil"
          >
            {user?.photoURL ? (
              <img 
                src={user.photoURL} 
                alt={user?.displayName || 'Usuario'} 
                className="user-avatar-image"
              />
            ) : (
              <div className="user-avatar">
                {user?.displayName?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
              </div>
            )}
            {isSidebarVisible && (
            <div className="user-details">
              <p className="user-name">{user?.displayName || 'Usuario'}</p>
              <p className="user-email">{user?.email}</p>
            </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className={`main-content ${isMobile ? 'main-content-mobile' : (isSidebarVisible ? 'main-content-sidebar-expanded' : 'main-content-sidebar-collapsed')}`}>
        <StickyHeader 
          screenName={screenName}
          showBackButton={showBackButton}
          backPath={backPath}
          backgroundImage={headerBackgroundImage}
          onEditClick={onHeaderEditClick}
          onBack={onBack}
          onMenuClick={isMobile ? toggleSidebar : undefined}
          showMenuButton={isMobile}
          icon={headerIcon}
          headerImageIcon={headerImageIcon}
        />
        {children}
      </main>
    </div>
  );
};

export default DashboardLayout;

