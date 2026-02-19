import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ASSET_BASE } from '../config/assets';
import { useNavigate, useLocation } from 'react-router-dom';
import StickyHeader from './StickyHeader';
import './DashboardLayout.css';

const DashboardLayout = ({ children, screenName, headerBackgroundImage = null, onHeaderEditClick = null, onBack = null, showBackButton = false, backPath = null, backState = null, headerIcon = null, headerImageIcon = null }) => {
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
            className={`menu-item ${location.pathname === '/availability' ? 'active' : ''}`}
            onClick={() => {
              navigate('/availability');
              if (isMobile) {
                setIsSidebarVisible(false);
              }
            }}
          >
            <svg className="menu-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {isSidebarVisible && <span className="menu-label">Disponibilidad</span>}
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
              <path d="M2.01792 20.3051C3.14656 21.9196 8.05942 23.1871 10.3797 20.1645C12.8894 21.3649 17.0289 20.9928 20.3991 19.1134C20.8678 18.8521 21.3112 18.5222 21.5827 18.0593C22.1957 17.0143 22.2102 15.5644 21.0919 13.4251C19.2274 8.77072 15.874 4.68513 14.5201 3.04212C14.2421 2.78865 12.4687 2.42868 11.3872 2.08279C10.9095 1.93477 10.02 1.83664 8.95612 3.23862C8.45176 3.90329 6.16059 5.5357 9.06767 6.63346C9.51805 6.74806 9.84912 6.95939 11.9038 6.58404C12.1714 6.53761 12.8395 6.58404 13.3103 7.41041L14.2936 8.81662C14.3851 8.94752 14.4445 9.09813 14.4627 9.25682C14.635 10.7557 14.6294 12.6323 15.4651 13.5826C14.1743 12.6492 10.8011 11.5406 8.2595 14.6951M2.00189 12.94C3.21009 11.791 6.71197 9.97592 10.4179 12.5216" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {isSidebarVisible && <span className="menu-label">Entrenamiento</span>}
          </button>
          <button
            className={`menu-item ${location.pathname === '/nutrition' || location.pathname.startsWith('/nutrition') ? 'active' : ''}`}
            onClick={() => {
              navigate('/nutrition');
              if (isMobile) {
                setIsSidebarVisible(false);
              }
            }}
          >
            <svg className="menu-icon" width="24" height="24" viewBox="62 98 258 190" fill="currentColor" stroke="currentColor" strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round" xmlns="http://www.w3.org/2000/svg">
              <path d="M219.985489,279.211578 C176.028000,287.907776 133.130386,285.344025 91.079231,271.211945 C79.096054,267.184784 69.006714,260.217865 64.324257,247.503906 C63.149464,244.314072 62.688599,241.093765 62.708195,237.721436 C62.770184,227.056458 63.299770,216.355667 62.623966,205.733917 C61.606403,189.740799 69.851913,180.422180 83.421516,174.554245 C98.242065,168.145355 114.038109,165.667007 129.912552,163.704208 C136.997604,162.828156 144.134964,162.384155 151.236603,161.630966 C162.345871,160.452774 169.792465,154.373138 173.173096,143.891983 C180.861237,120.055984 197.615860,106.965149 221.579086,102.156792 C244.841232,97.489128 267.451843,99.174706 288.474518,110.777664 C308.673065,121.925789 320.228516,138.631607 319.357727,162.657944 C319.001831,172.477142 319.081390,182.325790 319.342804,192.150925 C319.923798,213.987778 310.417694,231.032135 294.400757,244.871689 C273.715698,262.744781 249.122208,272.481720 222.806671,278.454895 C221.996140,278.638855 221.202408,278.896729 219.985489,279.211578 M292.783722,126.712547 C289.776398,124.634132 286.928253,122.263405 283.735718,120.525169 C264.426666,110.012070 243.994797,108.513618 222.753143,112.952316 C207.613068,116.116005 195.514633,123.512939 187.844589,137.170853 C185.499863,141.346085 184.097412,146.044327 182.180176,150.466980 C177.290573,161.746185 169.212112,169.105255 156.850723,171.549133 C144.097672,174.070480 131.009720,173.653641 118.276077,176.271027 C106.071342,178.779694 93.659027,180.567001 82.728836,187.200089 C71.810577,193.825928 70.575661,203.552139 79.434441,212.819519 C85.664276,219.336685 93.706108,222.485504 102.087868,224.855331 C130.001724,232.747559 158.364578,236.055374 187.417542,233.997742 C209.357727,232.443848 230.541046,228.033020 250.838547,219.659912 C267.277344,212.878601 282.602692,204.259872 294.648834,190.747406 C302.395477,182.057724 307.691437,172.053284 308.459930,160.402756 C309.352783,146.866257 303.540497,135.899002 292.783722,126.712547 M73.355034,228.911560 C73.297150,248.153763 78.216728,255.120392 96.553635,261.753693 C97.491920,262.093079 98.433258,262.429443 99.388779,262.715057 C134.483780,273.205200 170.127457,276.344543 206.415741,270.619385 C229.650436,266.953644 251.764099,259.991974 271.998657,247.753494 C286.210876,239.157486 298.505493,228.642883 305.021210,212.776169 C307.769287,206.084137 309.340973,199.157516 308.279083,191.159821 C302.213379,199.078079 295.941589,205.735992 288.460480,211.123505 C256.855072,233.884064 220.823517,243.137604 182.598618,245.240616 C164.949539,246.211609 147.316071,245.149353 129.870407,242.174118 C115.603714,239.741058 101.444969,236.811722 87.914383,231.392700 C83.017487,229.431519 78.877876,226.104172 74.152512,223.867477 C73.812904,224.498459 73.556923,224.770874 73.527451,225.065918 C73.428253,226.058517 73.409698,227.059174 73.355034,228.911560 z" />
              <path d="M130.700989,184.878433 C137.798447,185.701859 144.294434,186.857178 150.138977,190.475021 C159.452011,196.239899 159.881363,206.622971 150.961182,212.919830 C139.102188,221.291229 114.396217,221.213867 102.425842,212.767838 C94.125458,206.911270 94.049118,196.988190 102.513443,191.199112 C110.857239,185.492447 120.437271,184.522919 130.700989,184.878433 M133.420425,196.204498 C125.852028,194.318771 118.633568,195.909622 111.553162,198.514694 C109.883415,199.129044 107.792862,199.887039 107.842422,202.033752 C107.891502,204.159485 110.032196,204.848877 111.680878,205.453690 C121.510811,209.059708 131.427780,209.089111 141.308655,205.684464 C143.271851,205.008011 145.411530,204.218796 146.124619,201.534149 C143.003311,197.942642 138.630234,197.122589 133.420425,196.204498 z" />
            </svg>
            {isSidebarVisible && <span className="menu-label">Nutrición</span>}
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
          backState={backState}
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

