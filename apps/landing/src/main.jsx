import React from 'react';
import ReactDOM from 'react-dom/client';
import analyticsService from './services/analyticsService';
import App from './App';
import './index.css';

analyticsService.init();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
