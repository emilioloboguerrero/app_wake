import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import wakeLogo from '../assets/Logotipo-WAKE-positivo.svg';
import './Header.css';

const ANIM_DURATION = 300;

const SCROLL_THRESHOLD = 10;

const Header = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnimating, setMenuAnimating] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) setMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const y = window.scrollY || window.pageYOffset;
          const prev = lastScrollY.current;
          if (y < SCROLL_THRESHOLD) {
            setHeaderVisible(true);
          } else if (y > prev + SCROLL_THRESHOLD) {
            setHeaderVisible(false);
          } else if (y < prev - SCROLL_THRESHOLD) {
            setHeaderVisible(true);
          }
          lastScrollY.current = y;
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (menuOpen) {
      requestAnimationFrame(() => requestAnimationFrame(() => setMenuAnimating(true)));
    } else {
      setMenuAnimating(false);
    }
  }, [menuOpen]);

  const closeMenu = () => {
    setMenuAnimating(false);
    setTimeout(() => setMenuOpen(false), ANIM_DURATION);
  };

  const navItems = [
    { to: '/creators', label: 'Creadores' },
  ];

  return (
    <header className={`header ${!headerVisible ? 'header-hidden' : ''}`}>
      <div className="header-container">
        <Link to="/" className="header-logo">
          <img src={wakeLogo} alt="Wake" className="header-logo-img" />
        </Link>

        <nav className="header-nav header-nav-desktop">
          {navItems.map(({ to, label }) => (
            <Link key={to} to={to} className="header-nav-link">
              {label}
            </Link>
          ))}
        </nav>

        <button
          className="header-menu-btn"
          onClick={() => setMenuOpen(true)}
          aria-label="Abrir menú"
        >
          <svg
            className="header-menu-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="2" y1="6" x2="22" y2="6" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <line x1="2" y1="18" x2="22" y2="18" />
          </svg>
        </button>
      </div>

      {menuOpen &&
        createPortal(
          <>
            <div
              className={`header-menu-overlay ${menuAnimating ? 'header-menu-overlay-open' : ''}`}
              onClick={closeMenu}
              aria-hidden="true"
            />
            <div className={`header-menu-popup ${menuAnimating ? 'header-menu-popup-open' : ''}`}>
              <button
                className="header-menu-close"
                onClick={closeMenu}
                aria-label="Cerrar menú"
              >
                ✕
              </button>
              <nav className="header-nav header-nav-mobile">
                {navItems.map(({ to, label }) => (
                  <Link key={to} to={to} className="header-nav-link" onClick={closeMenu}>
                    {label}
                  </Link>
                ))}
              </nav>
            </div>
          </>,
          document.body
        )}
    </header>
  );
};

export default Header;
