export function registerOffline(onUpdate: (apply: () => void) => void): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  navigator.serviceWorker.register('/ttokttok/app/service-worker.js', { scope: '/ttokttok/app/', updateViaCache: 'none' })
    .then(registration => {
      const offer = () => {
        const waiting = registration.waiting;
        if (!waiting || !navigator.serviceWorker.controller) return;
        onUpdate(() => {
          navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
          waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
        });
      };
      offer();
      registration.addEventListener('updatefound', () => {
        registration.installing?.addEventListener('statechange', offer);
      });
    }).catch(() => {
      // Online use and device records still work when offline installation is unavailable.
    });
}
