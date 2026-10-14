const status = document.querySelector('#offline-status');
if (document.querySelector('meta[name="offline-enabled"]')) {
  status.hidden = false;
  if (!('serviceWorker' in navigator) || !isSecureContext) {
    status.textContent = 'Offline use requires a supported browser and HTTPS.';
  } else {
    status.textContent = 'Preparing offline access…';
    const start = async () => {
      try {
        const registration = await navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { updateViaCache: 'none' });
        function update() {
          status.textContent = registration.waiting ? 'Update ready — close all dashboard tabs and reopen to update.'
            : registration.active ? 'Ready offline · search is saved after first use' : 'Preparing offline access…';
        }
        function watch() {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'redundant' && !registration.active) status.textContent = 'Offline setup failed. Reload online to retry.';
            else update();
          });
        }
        registration.addEventListener('updatefound', watch);
        navigator.serviceWorker.addEventListener('controllerchange', update);
        watch(); update();
        navigator.serviceWorker.ready.then(update);
      } catch { status.textContent = 'Offline setup unavailable. You can still use the dashboard online.'; }
    };
    if (document.readyState === 'complete') start(); else window.addEventListener('load', start, { once: true });
  }
}
