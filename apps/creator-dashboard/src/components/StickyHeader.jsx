import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ASSET_BASE } from '../config/assets';
import './StickyHeader.css';

const StickyHeader = ({ screenName, showBackButton = false, backPath = null, backgroundImage = null, onEditClick = null, onBack = null, purchaseButton = null, showMenuButton = false, onMenuClick = null, icon = null }) => {
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const headerRef = useRef(null);
  const sentinelRef = useRef(null);
  const observerRef = useRef(null);
  const isScrolledRef = useRef(false);
  const isTransitioningRef = useRef(false);
  const transitionTimeoutRef = useRef(null);

  useEffect(() => {
    // Only create sentinel if we have a background image (header that needs to shrink)
    if (!backgroundImage) {
      // For headers without images, use simple scroll threshold
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

      // Initialize
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

    // Intersection Observer approach for headers with background images
    const SCROLL_THRESHOLD = 50;
    const TRANSITION_DURATION = 300; // Match CSS transition duration
    const TRANSITION_BUFFER = 100; // Extra buffer after transition

    // Create sentinel element at the threshold position in the document
    // Place it at SCROLL_THRESHOLD pixels from the top
    const sentinel = document.createElement('div');
    sentinel.style.position = 'absolute';
    sentinel.style.top = `${SCROLL_THRESHOLD}px`;
    sentinel.style.left = '0';
    sentinel.style.height = '1px';
    sentinel.style.width = '1px';
    sentinel.style.pointerEvents = 'none';
    sentinel.style.visibility = 'hidden';
    sentinel.style.zIndex = '-1';
    document.body.insertBefore(sentinel, document.body.firstChild);
    sentinelRef.current = sentinel;

    const updateScrollState = (shouldBeScrolled, skipLock = false) => {
      // Don't update if already in that state
      if (shouldBeScrolled === isScrolledRef.current) {
        return;
      }

      // Don't update if currently transitioning (unless we're explicitly skipping the lock)
      if (!skipLock && isTransitioningRef.current) {
        return;
      }

      // Mark as transitioning to prevent updates during CSS transition
      isTransitioningRef.current = true;

      // Clear any existing transition timeout
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }

      // Update state
      isScrolledRef.current = shouldBeScrolled;
      setIsScrolled(shouldBeScrolled);
      
      // Update DOM classes
      if (headerRef.current) {
        if (shouldBeScrolled) {
          headerRef.current.classList.add('sticky-header-scrolled');
          document.body.classList.add('header-scrolled');
        } else {
          headerRef.current.classList.remove('sticky-header-scrolled');
          document.body.classList.remove('header-scrolled');
        }
      }

      // Unlock after transition completes + buffer
      // This prevents the layout shift from triggering the observer again
      transitionTimeoutRef.current = setTimeout(() => {
        isTransitioningRef.current = false;
        transitionTimeoutRef.current = null;
        
        // After transition, manually check the scroll position to ensure correct state
        // The layout shift might have changed things, so we verify
        requestAnimationFrame(() => {
          if (sentinelRef.current && observerRef.current && !isTransitioningRef.current) {
            // Manually check if sentinel is in viewport with the threshold
            const scrollY = window.scrollY || document.documentElement.scrollTop;
            const expectedScrolled = scrollY > SCROLL_THRESHOLD;
            
            // Only update if there's a mismatch
            if (expectedScrolled !== isScrolledRef.current) {
              // Use skipLock since we just unlocked
              updateScrollState(expectedScrolled, true);
            }
          }
        });
      }, TRANSITION_DURATION + TRANSITION_BUFFER);
    };

    // Create Intersection Observer
    // When sentinel (at 50px) is visible in viewport, header should be expanded
    // When sentinel scrolls out of viewport (scrolled past 50px), header should be collapsed
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        
        // When sentinel is NOT intersecting (scrolled past it), header should be scrolled/collapsed
        const shouldBeScrolled = !entry.isIntersecting;
        
        // Use the update function which handles transition locking
        updateScrollState(shouldBeScrolled);
      },
      {
        threshold: 0, // Trigger when any part enters/leaves
        rootMargin: '0px', // No margin adjustment needed since sentinel is at threshold position
      }
    );

    // Start observing immediately
    observer.observe(sentinel);
    observerRef.current = observer;

    // Initialize state based on current scroll position (skip lock for initial setup)
    const initialScrollY = window.scrollY || document.documentElement.scrollTop;
    const initialScrolled = initialScrollY > SCROLL_THRESHOLD;
    isScrolledRef.current = initialScrolled;
    setIsScrolled(initialScrolled);
    
    if (headerRef.current) {
      if (initialScrolled) {
        headerRef.current.classList.add('sticky-header-scrolled');
        document.body.classList.add('header-scrolled');
      }
    }

    // Cleanup
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      if (sentinelRef.current && sentinelRef.current.parentNode) {
        sentinelRef.current.parentNode.removeChild(sentinelRef.current);
      }
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
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

  return (
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
            <svg 
              width="24" 
              height="24" 
              viewBox="0 0 24 24" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M3 12H21M3 6H21M3 18H21"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        {showBackButton && (
          <button 
            className="sticky-header-back-button"
            onClick={handleBack}
            aria-label="Volver"
          >
            <svg 
              width="24" 
              height="24" 
              viewBox="0 0 24 24" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                stroke="#fff"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="m15 19-7-7 7-7"
              />
            </svg>
          </button>
        )}
        <img 
          src={`${ASSET_BASE}wake-isotipo.png`}
          alt="Wake Logo" 
          className="sticky-header-logo"
        />
        <div className="sticky-header-title-container">
          {icon && (
            <div className="sticky-header-icon">{icon}</div>
          )}
          <h2 className="sticky-header-title">{screenName}</h2>
          {onEditClick && (
            <button
              className="sticky-header-edit-button"
              onClick={onEditClick}
              aria-label="Editar"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 8.00012L4 16.0001V20.0001L8 20.0001L16 12.0001M12 8.00012L14.8686 5.13146L14.8704 5.12976C15.2652 4.73488 15.463 4.53709 15.691 4.46301C15.8919 4.39775 16.1082 4.39775 16.3091 4.46301C16.5369 4.53704 16.7345 4.7346 17.1288 5.12892L18.8686 6.86872C19.2646 7.26474 19.4627 7.46284 19.5369 7.69117C19.6022 7.89201 19.6021 8.10835 19.5369 8.3092C19.4628 8.53736 19.265 8.73516 18.8695 9.13061L18.8686 9.13146L16 12.0001M12 8.00012L16 12.0001" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
        </div>
        {purchaseButton && (
          <div className="sticky-header-purchase-button-container">
            {purchaseButton}
          </div>
        )}
      </div>
    </header>
  );
};

export default StickyHeader;
