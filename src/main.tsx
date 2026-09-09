import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import { initializeGameUi } from './platform/layout';
import './styles/app.css';
import './styles/portrait.css';
import './styles/game-ui.css';

const releaseUi = initializeGameUi();
if (import.meta.hot) import.meta.hot.dispose(releaseUi);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
