import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import libraryService from '../services/libraryService';
import StickyHeader from './StickyHeader';
import './DashboardLayout.css';

const DashboardLayout = ({ children, screenName, headerBackgroundImage = null, onHeaderEditClick = null, onBack = null, showBackButton = false, backPath = null }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isBibliotecasExpanded, setIsBibliotecasExpanded] = useState(false);
  const [libraries, setLibraries] = useState([]);
  const [loadingLibraries, setLoadingLibraries] = useState(false);
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

  useEffect(() => {
    if (isBibliotecasExpanded && user) {
      loadLibraries();
    }
  }, [isBibliotecasExpanded, user]);

  const loadLibraries = async () => {
    if (!user || libraries.length > 0) return;
    
    try {
      setLoadingLibraries(true);
      const userLibraries = await libraryService.getLibrariesByCreator(user.uid);
      setLibraries(userLibraries);
    } catch (error) {
      console.error('Error loading libraries:', error);
    } finally {
      setLoadingLibraries(false);
    }
  };

  const handleToggleBibliotecas = (e) => {
    e.stopPropagation();
    setIsBibliotecasExpanded(!isBibliotecasExpanded);
  };

  const handleLibraryClick = (libraryId, e) => {
    e.stopPropagation();
    navigate(`/libraries/${libraryId}`);
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
            {isSidebarVisible && <span className="menu-label">Lab</span>}
          </button>
          <button
            className={`menu-item ${location.pathname === '/programs' || location.pathname.startsWith('/programs/') ? 'active' : ''}`}
            onClick={() => {
              navigate('/programs');
              if (isMobile) {
                setIsSidebarVisible(false);
              }
            }}
          >
            <svg className="menu-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 6H9.33687C9.58146 6 9.70385 6 9.81893 6.02763C9.92097 6.05213 10.0189 6.09263 10.1084 6.14746C10.2093 6.20928 10.2959 6.29591 10.4688 6.46875L13.5315 9.53149C13.7044 9.70444 13.7904 9.79044 13.8523 9.89135C13.9071 9.98082 13.9482 10.0786 13.9727 10.1807C14 10.2946 14 10.4155 14 10.6552V18M9 6H4.59961C4.03956 6 3.75981 6 3.5459 6.10899C3.35774 6.20487 3.20487 6.35774 3.10899 6.5459C3 6.75981 3 7.04004 3 7.6001V19.4001C3 19.9601 3 20.2398 3.10899 20.4537C3.20487 20.6419 3.35774 20.7952 3.5459 20.8911C3.7596 21 4.03902 21 4.598 21L12.4011 21C12.96 21 13.2405 21 13.4542 20.8911C13.6423 20.7952 13.7948 20.6421 13.8906 20.4539C13.9996 20.24 14 19.9599 14 19.3999V18M9 6V9.4C9 9.96005 9 10.2399 9.10899 10.4538C9.20487 10.642 9.35774 10.7952 9.5459 10.8911C9.7596 11 10.039 11 10.598 11H13.9996M10 6.0001V4.6001C10 4.04005 10 3.75981 10.109 3.5459C10.2049 3.35774 10.3577 3.20487 10.5459 3.10899C10.7598 3 11.0396 3 11.5996 3H16M16 3H16.3369C16.5815 3 16.7038 3 16.8189 3.02763C16.921 3.05213 17.0189 3.09263 17.1084 3.14746C17.2093 3.20928 17.2959 3.29592 17.4688 3.46875L20.5315 6.53149C20.7044 6.70444 20.7904 6.79044 20.8523 6.89135C20.9071 6.98082 20.9482 7.07863 20.9727 7.18066C21 7.29458 21 7.41552 21 7.65515V16.3999C21 16.9599 20.9996 17.24 20.8906 17.4539C20.7948 17.6421 20.6429 17.7952 20.4548 17.8911C20.2411 18 19.961 18 19.402 18H14M16 3V6.4C16 6.96005 16 7.23988 16.109 7.4538C16.2049 7.64196 16.3577 7.79524 16.5459 7.89111C16.7596 8 17.039 8 17.598 8H20.9996" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {isSidebarVisible && <span className="menu-label">Programas</span>}
          </button>
          <div className="menu-item-container">
            <button
              className={`menu-item ${location.pathname === '/libraries' || location.pathname.startsWith('/libraries/') ? 'active' : ''}`}
              onClick={(e) => {
                if (isSidebarVisible) {
                  handleToggleBibliotecas(e);
                } else {
                  navigate('/libraries');
                  if (isMobile) {
                    setIsSidebarVisible(false);
                  }
                }
              }}
            >
              <svg className="menu-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 9.25V9.2C21 8.0799 21 7.51984 20.782 7.09202C20.5903 6.7157 20.2843 6.40974 19.908 6.21799C19.4802 6 18.9201 6 17.8 6L3 6M3 6L3 16.8C3 17.9201 3 18.4802 3.21799 18.908C3.40973 19.2843 3.7157 19.5903 4.09202 19.782C4.51984 20 5.0799 20 6.2 20H7M3 6L3 5.6C3 5.03995 3 4.75992 3.109 4.54601C3.20487 4.35785 3.35785 4.20487 3.54601 4.10899C3.75992 4 4.03995 4 4.6 4H9.33726C9.58185 4 9.70415 4 9.81923 4.02763C9.92127 4.05213 10.0188 4.09253 10.1083 4.14736C10.2092 4.2092 10.2957 4.29568 10.4686 4.46863L12 6M16 14L18 16M11 21V18.5L18.5 11L21 13.5L13.5 21H11Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {isSidebarVisible && <span className="menu-label">Bibliotecas</span>}
              {isSidebarVisible && isBibliotecasExpanded ? (
                <svg 
                  className="menu-chevron"
                  width="16" 
                  height="16" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M19 9L12 16L5 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <svg 
                  className="menu-chevron"
                  width="16" 
                  height="16" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M9 5L16 12L9 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
            {isSidebarVisible && isBibliotecasExpanded && (
              <div className="menu-subitems">
                <button
                  className={`menu-subitem ${location.pathname === '/libraries' ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate('/libraries');
                    if (isMobile) {
                      setIsSidebarVisible(false);
                    }
                  }}
                >
                  <span className="menu-subitem-label">Todas las Bibliotecas</span>
                </button>
                {loadingLibraries ? (
                  <div className="menu-subitem-loading">
                    <span>Cargando...</span>
                  </div>
                ) : (
                  libraries.map((library) => (
                    <button
                      key={library.id}
                      className={`menu-subitem ${location.pathname === `/libraries/${library.id}` ? 'active' : ''}`}
                      onClick={(e) => {
                      handleLibraryClick(library.id, e);
                      if (isMobile) {
                        setIsSidebarVisible(false);
                      }
                    }}
                    >
                      <span className="menu-subitem-label">{library.title || `Biblioteca ${library.id.slice(0, 8)}`}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
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
        />
        {children}
      </main>
    </div>
  );
};

export default DashboardLayout;

