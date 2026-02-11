import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ASSET_BASE } from '../config/assets';
import './StickyHeader.css';

// Hysteresis thresholds: collapse only when past COLLAPSE_PX, expand only when below EXPAND_PX.
// Dead zone between them guarantees no flip-flop. Slot has fixed height so scroll position never jumps.
const COLLAPSE_PX = 120;
const EXPAND_PX = 60;

const StickyHeader = ({ screenName, showBackButton = false, backPath = null, backgroundImage = null, onEditClick = null, onBack = null, purchaseButton = null, showMenuButton = false, onMenuClick = null, icon = null, headerImageIcon = null }) => {
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const headerRef = useRef(null);
  const isScrolledRef = useRef(false);

  useEffect(() => {
    if (!backgroundImage) {
      const handleScroll = () => {
        const scrollY = window.scrollY || document.documentElement.scrollTop;
        const shouldBeScrolled = scrollY > 50;
        if (shouldBeScrolled !== isScrolledRef.current) {
          isScrolledRef.current = shouldBeScrolled;
          setIsScrolled(shouldBeScrolled);
          if (headerRef.current) {
            if (shouldBeScrolled) {
              headerRef.current.classList.add('sticky-header-scrolled');
              document.body.classList.add('header-scrolled');
            } else {
              headerRef.current.classList.remove('sticky-header-scrolled');
              document.body.classList.remove('header-scrolled');
            }
          }
        }
      };
      const initialScrollY = window.scrollY || document.documentElement.scrollTop;
      const initialScrolled = initialScrollY > 50;
      isScrolledRef.current = initialScrolled;
      setIsScrolled(initialScrolled);
      if (headerRef.current && initialScrolled) {
        headerRef.current.classList.add('sticky-header-scrolled');
        document.body.classList.add('header-scrolled');
      }
      window.addEventListener('scroll', handleScroll, { passive: true });
      return () => {
        window.removeEventListener('scroll', handleScroll);
        document.body.classList.remove('header-scrolled');
      };
    }

    // Image header: fixed-height slot so document height never changes → no scroll jump → no loop.
    const handleScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      let next = isScrolledRef.current;
      if (scrollY > COLLAPSE_PX) next = true;
      else if (scrollY < EXPAND_PX) next = false;
      if (next === isScrolledRef.current) return;

      isScrolledRef.current = next;
      setIsScrolled(next);
      if (headerRef.current) {
        if (next) {
          headerRef.current.classList.add('sticky-header-scrolled');
          document.body.classList.add('header-scrolled');
        } else {
          headerRef.current.classList.remove('sticky-header-scrolled');
          document.body.classList.remove('header-scrolled');
        }
      }
    };

    const initialScrollY = window.scrollY || document.documentElement.scrollTop;
    const initialScrolled = initialScrollY > COLLAPSE_PX;
    isScrolledRef.current = initialScrolled;
    setIsScrolled(initialScrolled);
    if (headerRef.current && initialScrolled) {
      headerRef.current.classList.add('sticky-header-scrolled');
      document.body.classList.add('header-scrolled');
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.body.classList.remove('header-scrolled');
    };
  }, [backgroundImage]);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (backPath) {
      navigate(backPath);
    } else {
      navigate(-1);
    }
  };

  const header = (
    <header
      ref={headerRef}
      className={`sticky-header ${backgroundImage ? 'sticky-header-with-image' : ''} ${isScrolled ? 'sticky-header-scrolled' : ''}`}
      style={backgroundImage ? { backgroundImage: `url(${backgroundImage})` } : {}}
    >
      {backgroundImage && <div className="sticky-header-gradient"></div>}
      <div className="sticky-header-content">
        {showMenuButton && (
          <button
            className="sticky-header-menu-button"
            onClick={onMenuClick}
            aria-label="Menú"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 12H21M3 6H21M3 18H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
        {showBackButton && (
          <button className="sticky-header-back-button" onClick={handleBack} aria-label="Volver">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m15 19-7-7 7-7"/>
            </svg>
          </button>
        )}
        <img src={`${ASSET_BASE}wake-isotipo.png`} alt="Wake Logo" className="sticky-header-logo" />
        <div className="sticky-header-title-container">
          {icon && <div className="sticky-header-icon">{icon}</div>}
          <h2 className="sticky-header-title">{screenName}</h2>
          {headerImageIcon && <div className="sticky-header-image-icon">{headerImageIcon}</div>}
          {onEditClick && (
            <button className="sticky-header-edit-button" onClick={onEditClick} aria-label="Editar">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M11 4H4C3.46957 4 2.96086 4.21071 2.58579 4.58579C2.21071 4.96086 2 5.46957 2 6V20C2 20.5304 2.21071 21.0391 2.58579 21.4142C2.96086 21.7893 3.46957 22 4 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M18.5 2.50023C18.8978 2.1024 19.4374 1.87891 20 1.87891C20.5626 1.87891 21.1022 2.1024 21.5 2.50023C21.8978 2.89805 22.1213 3.43762 22.1213 4.00023C22.1213 4.56284 21.8978 5.1024 21.5 5.50023L12 15.0002L8 16.0002L9 12.0002L18.5 2.50023Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
        </div>
        {purchaseButton && (
          <div className="sticky-header-purchase-button-container">{purchaseButton}</div>
        )}
      </div>
    </header>
  );

  if (backgroundImage) {
    return <div className="sticky-header-slot">{header}</div>;
  }
  return header;
};

export default StickyHeader;
