import { useEffect, useState, useCallback } from 'react';

interface PWAState {
  needRefresh: boolean;
  offlineReady: boolean;
  updateServiceWorker: () => Promise<void>;
}

export function usePWA(): PWAState {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [updateSW, setUpdateSW] = useState<(() => Promise<void>) | null>(null);

  const updateServiceWorker = useCallback(async () => {
    if (updateSW) {
      await updateSW();
    }
  }, [updateSW]);

  useEffect(() => {
    let mounted = true;

    const registerSW = async () => {
      const { registerSW: viteRegisterSW } = await import('virtual:pwa-register');
      viteRegisterSW({
        immediate: true,
        onOfflineReady() {
          if (mounted) setOfflineReady(true);
        },
        onNeedRefresh() {
          if (mounted) setNeedRefresh(true);
        },
        onRegisteredSW(_swUrl, r) {
          if (r) {
            setUpdateSW(() => async () => {
              await r.update();
              if (r.waiting) {
                r.waiting.postMessage({ type: 'SKIP_WAITING' });
              }
              window.location.reload();
            });
          }
        }
      });
    };

    if ('serviceWorker' in navigator) {
      registerSW();
    }

    return () => {
      mounted = false;
    };
  }, []);

  return { needRefresh, offlineReady, updateServiceWorker };
}
