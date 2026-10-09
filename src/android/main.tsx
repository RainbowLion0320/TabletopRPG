import React from 'react';
import ReactDOM from 'react-dom/client';
import { initializeAndroidPlatform } from './native';
import { initializeGameUi } from '../platform/layout';
import '../styles/app.css';
import './mobile.css';
import '../styles/game-ui.css';

// Scope phone layout overrides above shared/lazy component styles, including portals.
document.documentElement.classList.add('android-app');
const releaseUi = initializeGameUi(true);
if (import.meta.hot) import.meta.hot.dispose(releaseUi);
const root = ReactDOM.createRoot(document.getElementById('root')!);
async function start() {
  try {
    const partialRecovery = await initializeAndroidPlatform();
    // Load game modules only after the native storage cache is ready.
    const { AndroidApp } = await import('./AndroidApp');
    root.render(<React.StrictMode><AndroidApp partialRecovery={partialRecovery} /></React.StrictMode>);
  } catch {
    root.render(<main className="android-start-error"><h1>暂时无法读取游戏数据</h1>
      <p>请确认设备有可用存储空间后重试。已有存档不会被清空。</p>
      <button className="primary-btn" onClick={() => void start()}>重试</button></main>);
  }
}
void start();
