/* SVG-only favicon animation. No canvas, PNG, GIF or external libraries.
   Native SVG animation runs in browsers supporting it; this script supplies
   SVG-only frames for browsers that do not animate tab SVGs directly. */
(() => {
  const icon = document.querySelector('link[rel="icon"][data-favicon-motion]');
  if (!icon || !window.matchMedia || !window.fetch) return;
  const original = icon.href;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mode = icon.dataset.motion;
  const count = 18;
  const intervalMs = 180;
  const frames = [];
  let timer = null;
  let cursor = 0;
  let loading = false;
  let failed = false;

  function reveal(t, start, finish, hold) {
    if (t <= start) return 0;
    if (t < finish) {
      const x = (t - start) / (finish - start);
      return 1 - (1 - x) ** 3;
    }
    if (t <= hold) return 1;
    return Math.max(0, 1 - (t - hold) / (1 - hold));
  }

  function position(svg, index) {
    const t = index / count;
    const target = svg.querySelector('#motion');
    if (!target) throw new Error('Missing favicon motion element');
    const p = reveal(t, .1, .5, .82);
    const extra = svg.querySelector('#pin, #date, #destination, #orbit, #accent');

    if (mode === 'orbit') {
      target.setAttribute('transform', 'rotate(' + (360 * t).toFixed(1) + ' 32 32)');
      if (extra) extra.setAttribute('transform', 'translate(0 ' + (-2 * Math.sin(Math.PI * 2 * t) ** 2).toFixed(2) + ')');
    } else if (mode === 'check') {
      target.setAttribute('stroke-dasharray', '38');
      target.setAttribute('stroke-dashoffset', String(38 * (1 - p)));
      if (extra) extra.setAttribute('fill', p > .6 ? '#1ED760' : '#167D51');
    } else if (mode === 'route') {
      target.setAttribute('stroke-dasharray', '80');
      target.setAttribute('stroke-dashoffset', String(80 * (1 - p)));
      if (extra) {
        const scale = .7 + .6 * p;
        extra.setAttribute('transform', 'translate(51 30) scale(' + scale.toFixed(2) + ') translate(-51 -30)');
      }
    } else if (mode === 'page') {
      target.setAttribute('transform', 'rotate(' + (-30 * Math.sin(Math.PI * p)).toFixed(1) + ' 32 50)');
      if (extra) extra.setAttribute('transform', 'rotate(' + (160 * t).toFixed(1) + ' 32 32)');
    } else if (mode === 'reveal') {
      target.setAttribute('stroke-dasharray', '110');
      target.setAttribute('stroke-dashoffset', String(110 * (1 - p)));
      target.setAttribute('opacity', String(.25 + .75 * p));
      if (extra) extra.setAttribute('opacity', String(.3 + .7 * p));
    }
  }

  function stop() {
    if (timer !== null) clearInterval(timer);
    timer = null;
    if (icon.href !== original) icon.href = original;
  }

  function sync() {
    if (document.hidden || reduced.matches || frames.length !== count) {
      stop();
      return;
    }
    if (timer !== null) return;
    const tick = () => {
      icon.href = frames[cursor];
      cursor = (cursor + 1) % frames.length;
    };
    tick();
    timer = window.setInterval(tick, intervalMs);
  }

  async function start() {
    if (loading || failed || reduced.matches || document.hidden) return;
    loading = true;
    try {
      const response = await fetch(original, {cache: 'force-cache'});
      if (!response.ok) throw new Error('Missing favicon SVG');
      const dom = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
      if (dom.querySelector('parsererror')) throw new Error('Invalid favicon SVG');
      const source = dom.documentElement;
      source.querySelectorAll('style, script, animate, animateTransform').forEach(node => node.remove());
      for (let i = 0; i < count; i++) {
        const copy = source.cloneNode(true);
        position(copy, i);
        frames.push('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(copy)));
      }
      sync();
    } catch {
      failed = true;
      stop(); // Keep the original animated SVG if the compatibility path fails.
    } finally {
      loading = false;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && frames.length !== count) start();
    sync();
  });
  reduced.addEventListener?.('change', () => {
    if (!reduced.matches && frames.length !== count) start();
    sync();
  });
  window.addEventListener('pagehide', stop, { once: true });
  start();
})();