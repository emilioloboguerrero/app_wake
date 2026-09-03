import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate, useParams } from 'react-router-dom';
import Footer from './components/Footer';
import Header from './components/Header';

// Every route screen is lazy-loaded so the entry bundle carries only the router
// shell (React + react-router + Header/Footer). Each screen — and the heavy libs
// it drags in (motion, lenis, the Firebase Auth SDK) — becomes its own on-demand
// chunk. This keeps cold loads fast on the surfaces that matter most: the buy
// page and creator storefront that IG/ad traffic lands on.
const SupportScreen = lazy(() => import('./screens/SupportScreen'));
const AccessRecoveryScreen = lazy(() => import('./screens/AccessRecoveryScreen'));
const LegalDocumentsScreen = lazy(() => import('./screens/LegalDocumentsScreen'));
const CreadoresLandingScreen = lazy(() => import('./screens/CreadoresLandingScreen'));
const StorefrontScreen = lazy(() => import('./screens/StorefrontScreen'));
const EventSignupScreen = lazy(() => import('./screens/EventSignupScreen'));
const PublicDocumentScreen = lazy(() => import('./screens/PublicDocumentScreen'));
const LandingDesignScreen = lazy(() => import('./screens/LandingDesignScreen'));
const TestLandingScreen = lazy(() => import('./screens/TestLandingScreen'));
const NotFoundScreen = lazy(() => import('./screens/NotFoundScreen'));
const ShowcaseLandingScreen = lazy(() => import('./screens/ShowcaseLandingScreen'));
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
  'lab', 'comprar', 'gracias', 'cancelar', 'acceso',
]);

// Empty, layout-stable placeholder while a route chunk loads. No spinner: the
// chunk lands in a few hundred ms and a flash of spinner reads worse than a
// brief blank on the surfaces this guards.
function RouteFallback() {
  return <div style={{ minHeight: '60vh' }} aria-hidden="true" />;
}

function AppContent() {
  const location = useLocation();

  if (location.pathname === '/design') {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/design" element={<LandingDesignScreen />} />
        </Routes>
      </Suspense>
    );
  }

  if (location.pathname.startsWith('/e/')) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/e/:eventId" element={<EventSignupScreen />} />
        </Routes>
      </Suspense>
    );
  }

  if (location.pathname.startsWith('/d/')) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/d/:docId" element={<PublicDocumentScreen />} />
        </Routes>
      </Suspense>
    );
  }

  if (location.pathname === '/') {
    return (
      <>
        <Header />
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<ShowcaseLandingScreen />} />
          </Routes>
        </Suspense>
      </>
    );
  }

  if (location.pathname === '/test') {
    return (
      <>
        <Header />
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/test" element={<TestLandingScreen />} />
          </Routes>
        </Suspense>
      </>
    );
  }

  if (location.pathname === '/creadores') {
    return (
      <>
        <Header />
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/creadores" element={<CreadoresLandingScreen />} />
          </Routes>
        </Suspense>
      </>
    );
  }

  if (location.pathname === '/lab' || location.pathname === '/tienda') {
    return (
      <>
        <Header />
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/lab" element={<StorefrontScreen />} />
            <Route path="/tienda" element={<StorefrontScreen />} />
          </Routes>
        </Suspense>
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
        <Suspense fallback={<RouteFallback />}>
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
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/support" element={<SupportScreen />} />
            <Route path="/acceso" element={<AccessRecoveryScreen />} />
            <Route path="/legal" element={<LegalDocumentsScreen />} />
            <Route path="/landing" element={<Navigate to="/" replace />} />
            <Route path="/landing/*" element={<LandingPathRedirect />} />
            <Route path="*" element={<NotFoundScreen />} />
          </Routes>
        </Suspense>
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
