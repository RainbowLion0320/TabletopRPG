/** Pause decorative motion with the page, without changing game or audio state. */
export function initializeUiMotion() {
  const root = document.documentElement;
  const update = () => root.classList.toggle('ui-motion-paused', document.hidden);
  update();
  document.addEventListener('visibilitychange', update);
  return () => {
    document.removeEventListener('visibilitychange', update);
    root.classList.remove('ui-motion-paused');
  };
}
