/**
 * Theme helpers. The gradual dark-mode toggle (Animate UI "Theme Toggler")
 * uses the native View Transitions API to wipe the new theme in as a circle
 * expanding from the toggle button. Falls back to an instant swap where the
 * API is unavailable or reduced-motion is requested.
 */

// Apply a theme to the DOM exactly the way AppContext's appearance effect does,
// so the two never fight over the data-theme attribute.
export function setThemeDom(theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark');
  } else if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
  } else {
    root.removeAttribute('data-theme');
  }
}

export function toggleThemeWithReveal(nextTheme, originEl) {
  const run = () => setThemeDom(nextTheme);

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || typeof document.startViewTransition !== 'function' || !originEl) {
    run();
    return;
  }

  const rect = originEl.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );

  const transition = document.startViewTransition(run);
  transition.ready.then(() => {
    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${endRadius}px at ${x}px ${y}px)`,
        ],
      },
      {
        duration: 480,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        pseudoElement: '::view-transition-new(root)',
      }
    );
  }).catch(() => {});
}
