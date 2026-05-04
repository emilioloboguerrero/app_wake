import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate, useParams } from 'react-router-dom';
import Footer from './components/Footer';
import Header from './components/Header';
import SupportScreen from './screens/SupportScreen';
import LegalDocumentsScreen from './screens/LegalDocumentsScreen';
import CreadoresLandingScreen from './screens/CreadoresLandingScreen';
import StorefrontScreen from './screens/StorefrontScreen';
import EventSignupScreen from './screens/EventSignupScreen';
import LandingDesignScreen from './screens/LandingDesignScreen';
import TestLandingScreen from './screens/TestLandingScreen';
import NotFoundScreen from './screens/NotFoundScreen';
import ShowcaseLandingScreen from './screens/ShowcaseLandingScreen';

// Storefront screens carry the Firebase Auth + App Check + reCAPTCHA SDK
// payload. Lazy-loading them keeps that ~100KB gz off the homepage bundle so
// IG-bio-link cold loads stay fast.
const CreatorStorefrontScreen = lazy(() => import('./screens/CreatorStorefrontScreen'));
const CreatorProgramDetailScreen = lazy(() => import('./screens/CreatorProgramDetailScreen'));
const PostPaymentScreen = lazy(() => import('./screens/PostPaymentScreen'));

// Mirror functions/src/api/utils/reservedUsernames.ts. Keep these in sync —
// any single-segment path the landing app actually handles must be excluded
// from the storefront fallback so /support, /legal, /design, etc. never
// resolve as a creator username.
const RESERVED_TOP_LEVEL_PATHS = new Set([
  'support', 'legal', 'landing', 'design', 'developers',
  'creadores', 'creators', 'app', 'api', 'e', 'test',
  // Brand / future routes that the SPA must never treat as a username.
  'wake', 'wakelab', 'about', 'precios', 'pricing',
  'tienda', 'store', 'shop', 'athletes', 'atletas', 'biblioteca', 'library',
  'lab', 'comprar', 'gracias', 'cancelar',
]);

function StorefrontFallback() {
  return <div style={{ minHeight: '60vh' }} aria-hidden="true" />;
}

function AppContent() {
  const location = useLocation();

  if (location.pathname === '/design') {
    return (
      <Routes>
        <Route path="/design" element={<LandingDesignScreen />} />
      </Routes>
    );
  }

  if (location.pathname.startsWith('/e/')) {
    return (
      <Routes>
        <Route path="/e/:eventId" element={<EventSignupScreen />} />
      </Routes>
    );
  }

  if (location.pathname === '/') {
    return (
      <>
        <Header />
        <Routes>
          <Route path="/" element={<ShowcaseLandingScreen />} />
        </Routes>
      </>
    );
  }

  if (location.pathname === '/test') {
    return (
      <>
        <Header />
        <Routes>
          <Route path="/test" element={<TestLandingScreen />} />
        </Routes>
      </>
    );
  }

  if (location.pathname === '/creadores') {
    return (
      <>
        <Header />
        <Routes>
          <Route path="/creadores" element={<CreadoresLandingScreen />} />
        </Routes>
      </>
    );
  }

  if (location.pathname === '/lab' || location.pathname === '/tienda') {
    return (
      <>
        <Header />
        <Routes>
          <Route path="/lab" element={<StorefrontScreen />} />
          <Route path="/tienda" element={<StorefrontScreen />} />
        </Routes>
      </>
    );
  }

  // Creator storefront paths render their own footer (LandingFooter), so we
  // detect them and skip the default app-layout footer to avoid duplication.
  // The path shape is /:username or /:username/:programId — single or
  // two-segment paths that didn't match any earlier branch above.
  const segments = location.pathname.split('/').filter(Boolean);
  const firstSegment = (segments[0] || '').toLowerCase();
  const isStorefrontPath =
    (segments.length === 1 || segments.length === 2) &&
    !RESERVED_TOP_LEVEL_PATHS.has(firstSegment);

  if (isStorefrontPath) {
    return (
      <>
        <Header />
        <Suspense fallback={<StorefrontFallback />}>
          <Routes>
            {/* /:username/comprado MUST come before /:username/:programId so
                react-router matches it first. */}
            <Route path="/:username/comprado" element={<PostPaymentScreen />} />
            <Route path="/:username/:programId" element={<CreatorProgramDetailScreen />} />
            <Route path="/:username" element={<CreatorStorefrontScreen />} />
          </Routes>
        </Suspense>
      </>
    );
  }

  return (
    <div className="app-layout">
      <Header />
      <main className="main-content">
        <Routes>
          <Route path="/support" element={<SupportScreen />} />
          <Route path="/legal" element={<LegalDocumentsScreen />} />
          <Route path="/landing" element={<Navigate to="/" replace />} />
          <Route path="/landing/*" element={<LandingPathRedirect />} />
          <Route path="*" element={<NotFoundScreen />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

function LandingPathRedirect() {
  const { '*': splat } = useParams();
  return <Navigate to={splat ? `/${splat}` : '/'} replace />;
}

export default function App() {
  return (
    <BrowserRouter basename="/">
      <AppContent />
    </BrowserRouter>
  );
}
