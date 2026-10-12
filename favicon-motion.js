/* Transparent favicon: SVG animation with PNG-frame fallback for browser tabs.
   Only the icon's semantic element moves; the complete logo stays stationary. */
(() => {
  const link = document.querySelector('link[data-favicon-motion]');
  if (!link || !window.matchMedia || !window.fetch) return;

  const source = link.href;
  const type = link.type;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mode = link.dataset.faviconMode || 'float';
  const frames = [];
  const count = 16;
  let cursor = 0;
  let interval = null;
  let running = false;

  function stop() {
    if (interval !== null) clearInterval(interval);
    interval = null;
    if (link.href !== source) {
      link.type = type;
      link.href = source;
    }
  }

  function sync() {
    if (document.hidden || reduced.matches || frames.length !== count) {
      stop();
      return;
    }
    if (interval !== null) return;
    function advance() {
      link.type = 'image/png';
      link.href = frames[cursor];
      cursor = (cursor + 1) % count;
    }
    advance();
    interval = window.setInterval(advance, 180);
  }

  async function prepare() {
    if (running || reduced.matches || document.hidden) return;
    running = true;
    try {
      const response = await fetch(source);
      if (!response.ok) throw new Error('Favicon unavailable');
      const markup = await response.text();
      const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
      if (doc.querySelector('parsererror')) throw new Error('Invalid SVG');
      const root = doc.documentElement;
      root.querySelectorAll('style, script').forEach((node) => node.remove());
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      for (let i = 0; i < count; i++) {
        const snapshot = root.cloneNode(true);
        const subject = snapshot.querySelector('#motion');
        if (!subject) throw new Error('No animated subject');
        const phase = (i * Math.PI * 2) / count;
        const progress = (1 - Math.cos(phase)) / 2;

        if (mode === 'orbit') {
          subject.setAttribute('transform', 'translate(0 ' + (-3 * progress).toFixed(2) + ')');
        } else if (mode === 'tick') {
          subject.setAttribute('stroke-dashoffset', String(18 * (1 - progress)));
          subject.setAttribute('opacity', String(.25 + progress * .75));
        } else if (mode === 'float') {
          subject.setAttribute('stroke-dashoffset', String(100 * (1 - progress)));
        } else if (mode === 'breathe') {
          const sx = 1 - progress * .18;
          subject.setAttribute('transform', 'translate(' + (32 * (1 - sx)).toFixed(2) + ' 0) scale(' + sx.toFixed(3) + ' 1)');
        } else if (mode === 'sway') {
          subject.setAttribute('stroke-dashoffset', String(36 * (1 - progress)));
        }
        const uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
          new XMLSerializer().serializeToString(snapshot)
        );
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = uri;
        });
        ctx.clearRect(0, 0, 64, 64);
        ctx.drawImage(img, 0, 0, 64, 64);
        frames.push(canvas.toDataURL('image/png'));
        // Keep initial rendering and page interactions responsive.
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
      sync();
    } catch {
      // Leave the standalone CSS-animated SVG in place if rasterization fails.
      stop();
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !frames.length) prepare();
    sync();
  });
  reduced.addEventListener?.('change', () => {
    if (!reduced.matches && !frames.length) prepare();
    sync();
  });
  window.addEventListener('pagehide', stop, { once: true });
  window.setTimeout(prepare, 250);
})();