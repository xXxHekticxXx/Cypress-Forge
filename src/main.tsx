import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// keep the browser's install offer so the "Get the app" button can show it later
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  (window as any).__installPrompt = e;
  window.dispatchEvent(new Event('forge-can-install'));
});
window.addEventListener('appinstalled', () => {
  (window as any).__installPrompt = null;
  window.dispatchEvent(new Event('forge-installed'));
});

createRoot(document.getElementById('root')!).render(<App />);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
