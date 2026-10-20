import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import { resetProgressIfRequested } from './app/freshStart';
import { initializeGameUi } from './platform/layout';
import { initializeUiMotion } from './platform/uiMotion';
import './styles/app.css';
import './styles/portrait.css';
import './styles/game-ui.css';
import './styles/motion.css';

// Runs before the first render so `?fresh=1` never flashes a stale session.
resetProgressIfRequested();

const releaseUi = initializeGameUi();
const releaseMotion = initializeUiMotion();
if (import.meta.hot) import.meta.hot.dispose(() => { releaseUi(); releaseMotion(); });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
