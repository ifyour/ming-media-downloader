import { usePWA } from './PWAProvider';
import './PWAUpdatePrompt.css';

export function PWAUpdatePrompt() {
  const { needRefresh, updateServiceWorker } = usePWA();

  if (!needRefresh) return null;

  return (
    <div className="pwa-update-toast" role="status" aria-live="polite">
      <span className="pwa-update-message">发现新版本，是否立即更新？</span>
      <button
        type="button"
        className="pwa-update-btn"
        onClick={() => updateServiceWorker()}
      >
        立即刷新
      </button>
    </div>
  );
}
