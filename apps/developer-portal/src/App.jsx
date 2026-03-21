import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import LoginGate from './components/LoginGate';
import Layout from './components/Layout';
import Home from './pages/Home';
import Reference from './pages/Reference';
import Keys from './pages/Keys';
import RequestAccess from './pages/RequestAccess';
import Changelog from './pages/Changelog';

export default function App() {
  return (
    <BrowserRouter basename="/developers">
      <AuthProvider>
        <LoginGate>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="api-reference" element={<Reference />} />
              <Route path="api-keys" element={<Keys />} />
              <Route path="request-access" element={<RequestAccess />} />
              <Route path="changelog" element={<Changelog />} />
            </Route>
          </Routes>
        </LoginGate>
      </AuthProvider>
    </BrowserRouter>
  );
}
