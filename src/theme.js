// Apply before the stylesheet paints so a saved preference does not flash.
(() => {
  const key = 'world-clock-theme';
  const modes = ['dark', 'light', 'system'];
  const system = matchMedia('(prefers-color-scheme: dark)');
  let mode = 'system';
  try {
    const saved = localStorage.getItem(key);
    if (modes.includes(saved)) mode = saved;
  } catch { /* The selector still works when storage is unavailable. */ }
  function apply() {
    const theme = mode === 'system' ? (system.matches ? 'dark' : 'light') : mode;
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#000000' : '#f2f2f7';
    document.querySelectorAll('[data-theme-choice]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.themeChoice === mode));
    });
  }
  apply();
  system.addEventListener('change', apply);
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.querySelectorAll('[data-theme-choice]').forEach(button => button.addEventListener('click', () => {
      mode = button.dataset.themeChoice;
      try { localStorage.setItem(key, mode); } catch { /* Session-only preference. */ }
      apply();
    }));
  });
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) {
      mode = modes.includes(event.newValue) ? event.newValue : 'system';
      apply();
    }
  });
})();
