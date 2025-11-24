
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
// Import UUID polyfill to ensure it's available globally
import './utils/uuid';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
