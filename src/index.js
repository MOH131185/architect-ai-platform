import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import globalErrorHandler from './utils/globalErrorHandler';
import logger from './utils/logger';

// Initialize global error handling
globalErrorHandler.initialize();
logger.info('Application starting', {
  environment: process.env.NODE_ENV,
  version: process.env.REACT_APP_VERSION || '1.0.0'
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
