import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './App.css';

// PWA Service Worker Registration (silent on startup, manual check only)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // Registered successfully - manual update checks will call reg.update()
        if (reg.waiting) {
          console.log('⚡ A pending service worker is waiting for user activation');
        }
      })
      .catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
