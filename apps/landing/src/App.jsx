import React from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate, useParams } from 'react-router-dom';
import Footer from './components/Footer';
import Header from './components/Header';
import SupportScreen from './screens/SupportScreen';
import LegalDocumentsScreen from './screens/LegalDocumentsScreen';
import CreadoresLandingScreen from './screens/CreadoresLandingScreen';
import EventSignupScreen from './screens/EventSignupScreen';
import LandingDesignScreen from './screens/LandingDesignScreen';
import TestLandingScreen from './screens/TestLandingScreen';
import NotFoundScreen from './screens/NotFoundScreen';
import ShowcaseLandingScreen from './screens/ShowcaseLandingScreen';

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

