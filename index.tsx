
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ToastProvider } from './components/Toast';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>
);

const APP_SHELL_RECOVERY_KEY = 'qs_app_shell_recovery_reload';

const getAssetStylesheetLinks = (): HTMLLinkElement[] => (
  Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href*="/assets/"]'))
);

const hasLoadedAssetStylesheet = (): boolean => {
  const assetLinks = getAssetStylesheetLinks();
  if (assetLinks.length === 0) return true;

  return assetLinks.some((link) => {
    if (!link.sheet) return false;

    try {
      void link.sheet.cssRules;
      return true;
    } catch {
      return true;
    }
  });
};

const clearQuickServeCaches = async (): Promise<void> => {
  if (!('caches' in window)) return;

  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((cacheName) => cacheName.startsWith('quickserve-'))
      .map((cacheName) => caches.delete(cacheName))
  );
};

const updateServiceWorkers = async (): Promise<void> => {
  if (!('serviceWorker' in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.update()));
};

const recoverFromMissingStylesheet = () => {
  if (hasLoadedAssetStylesheet()) {
    sessionStorage.removeItem(APP_SHELL_RECOVERY_KEY);
    return;
  }

  if (sessionStorage.getItem(APP_SHELL_RECOVERY_KEY) === '1') return;

  sessionStorage.setItem(APP_SHELL_RECOVERY_KEY, '1');
  Promise.all([
    clearQuickServeCaches().catch(() => undefined),
    updateServiceWorkers().catch(() => undefined),
  ]).finally(() => {
    window.location.reload();
  });
};

window.addEventListener('load', () => {
  window.setTimeout(recoverFromMissingStylesheet, 1200);
});

window.addEventListener('pageshow', () => {
  window.setTimeout(recoverFromMissingStylesheet, 1200);
});

// Register Service Worker for PWA support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        registration.update().catch(() => undefined);

        const cachePwaShell = () => {
          const worker = registration.active || navigator.serviceWorker.controller;
          worker?.postMessage({ type: 'PRECACHE_BASIC_PWA' });
        };

        if (registration.active) {
          cachePwaShell();
        }

        navigator.serviceWorker.ready.then(cachePwaShell).catch(() => undefined);
      })
      .catch((err) => {
        console.log('SW registration failed: ', err);
      });
  });
}
