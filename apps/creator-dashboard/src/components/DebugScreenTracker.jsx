import { useEffect, useRef, Profiler } from 'react';
import { useLocation } from 'react-router-dom';
import wakeDebug from '../utils/wakeDebug';

/**
 * Wraps a screen component with:
 * 1. Screen name tracking (sets wakeDebug.setScreen on mount/route change)
 * 2. React Profiler (measures render time)
 * 3. Re-render counter (logs how many times the screen re-renders)
 *
 * Usage in App.jsx:
 *   <DebugScreenTracker name="DashboardScreen">
 *     <DashboardScreen />
 *   </DebugScreenTracker>
 */
export default function DebugScreenTracker({ name, children }) {
  if (!wakeDebug.IS_ENABLED) return children;

  return <TrackedScreen name={name}>{children}</TrackedScreen>;
}

function TrackedScreen({ name, children }) {
  const location = useLocation();
  const renderCount = useRef(0);
  const mountTime = useRef(performance.now());

  renderCount.current++;

  useEffect(() => {
    mountTime.current = performance.now();
    wakeDebug.setScreen(name);

    return () => {
      const timeOnScreen = performance.now() - mountTime.current;
      console.log(
        `%c[SCREEN] ${name} unmounted — ${renderCount.current} total renders, ${Math.round(timeOnScreen)}ms on screen`,
        'color:#6b7280'
      );
    };
  }, [name]);

  // Track route param changes within same screen
  useEffect(() => {
    wakeDebug.setScreen(`${name} ${location.pathname}`);
  }, [location.pathname, name]);

  return (
    <Profiler id={name} onRender={wakeDebug.onRender}>
      {children}
    </Profiler>
  );
}
