import React from 'react';
import ReactDOM from 'react-dom/client';

// Minimal app — Tauri desktop runs as a headless tray service.
// All UI/UX lives in the Chrome extension.
const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <div />
    </React.StrictMode>
  );
}
