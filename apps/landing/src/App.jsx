import React from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate, useParams } from 'react-router-dom';
import Footer from './components/Footer';
import SupportScreen from './screens/SupportScreen';
import LegalDocumentsScreen from './screens/LegalDocumentsScreen';
import CreatorsPage from './screens/CreatorsPage';
import EventSignupScreen from './screens/EventSignupScreen';
import LandingDesignScreen from './screens/LandingDesignScreen';
import TestLandingScreen, { Nav } from './screens/TestLandingScreen';
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
      <Routes>
        <Route path="/" element={<ShowcaseLandingScreen />} />
      </Routes>
    );
  }

  if (location.pathname === '/test') {
    return (
      <Routes>
        <Route path="/test" element={<TestLandingScreen />} />
      </Routes>
    );
  }

  return (
    <div className="app-layout">
      <Nav />
      <main className="main-content">
        <Routes>
          <Route path="/creators" element={<CreatorsPage />} />
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

