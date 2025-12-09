import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import StickyHeader from './StickyHeader';
import './DashboardLayout.css';

const UserDashboardLayout = ({ children, screenName, purchaseButton }) => {
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
            src="/wake-logo-new.png" 
            alt="Wake Logo" 
            className="sidebar-logo-image"
          />
          {isSidebarVisible && <p className="sidebar-subtitle">Usuarios</p>}
        </div>

        <nav className="sidebar-nav">
          <button
            className={`menu-item ${location.pathname === '/user/biblioteca' ? 'active' : ''}`}
            onClick={() => {
              navigate('/user/biblioteca');
              if (isMobile) {
                setIsSidebarVisible(false);
              }
            }}
          >
            <svg className="menu-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 9.25V9.2C21 8.0799 21 7.51984 20.782 7.09202C20.5903 6.7157 20.2843 6.40974 19.908 6.21799C19.4802 6 18.9201 6 17.8 6L3 6M3 6L3 16.8C3 17.9201 3 18.4802 3.21799 18.908C3.40973 19.2843 3.7157 19.5903 4.09202 19.782C4.51984 20 5.0799 20 6.2 20H17.8C18.9201 20 19.4802 20 19.908 19.782C20.2843 19.5903 20.5903 19.2843 20.782 18.908C21 18.4802 21 17.9201 21 16.8V9.25M3 6L3 5.6C3 5.03995 3 4.75992 3.109 4.54601C3.20487 4.35785 3.35785 4.20487 3.54601 4.10899C3.75992 4 4.03995 4 4.6 4H9.33726C9.58185 4 9.70415 4 9.81923 4.02763C9.92127 4.05213 10.0188 4.09253 10.1083 4.14736C10.2092 4.2092 10.2957 4.29568 10.4686 4.46863L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {isSidebarVisible && <span className="menu-label">Biblioteca</span>}
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
            onClick={() => navigate('/profile')}
            style={{ cursor: 'pointer' }}
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
          purchaseButton={purchaseButton}
          onMenuClick={isMobile ? toggleSidebar : undefined}
          showMenuButton={isMobile}
        />
        {children}
      </main>
    </div>
  );
};

export default UserDashboardLayout;