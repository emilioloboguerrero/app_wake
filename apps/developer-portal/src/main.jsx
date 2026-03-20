import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const AppWrapper = import.meta.env.DEV ? (
  <React.StrictMode>
    <App />
  </React.StrictMode>
) : (
  <App />
);

ReactDOM.createRoot(document.getElementById('root')).render(AppWrapper);
