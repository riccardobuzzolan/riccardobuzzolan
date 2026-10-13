/* Animated favicon: SVG-only frames for browsers that render SVG favicons as static.
   No images, canvas, libraries, animation while the tab is hidden, or tracking. */
(() => {
  const icon = document.querySelector('link[rel="icon"][data-favicon-motion]');
  if (!icon || !window.fetch || !window.DOMParser || !window.matchMedia) return;

  const original = icon.href;
  const mode = icon.dataset.motion;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const dark = matchMedia('(prefers-color-scheme: dark)');
  const lowData = navigator.connection?.saveData === true;
  const frameCount = 30;
  const frameDelay = 120; // One complete cycle in 3.6 seconds (8.3 FPS at 16 px).
  let frames = [];
  let index = 0;
  let timer = null;
  let loading = false;
  let failed = false;
  let source = null;

  const reveal = (t, start, full, hold) => {
    if (t < start) return 0;
    if (t < full) {
      const x = (t - start) / (full - start);
      return 1 - (1 - x) ** 3;
    }
    if (t < hold) return 1;
    return Math.max(0, (1 - t) / (1 - hold));
  };

  function applyFrame(svg, i) {
    const t = i / frameCount;
    const p = reveal(t, .12, .47, .80);
    const p2 = reveal(t, .27, .52, .80);
    const tr = (id, transform, opacity) => {
      const el = svg.querySelector('#' + id);
      if (!el) throw new Error('Missing favicon motion element: ' + id);
      if (transform) el.setAttribute('transform', transform);
      if (opacity !== undefined) el.setAttribute('opacity', String(opacity));
      return el;
    };
    switch (mode) {
      case 'coordinates':
        tr('n', 'translate(0 ' + (-9*(1-p)).toFixed(2) + ')');
        tr('s', 'translate(0 ' + (9*(1-p)).toFixed(2) + ')');
        tr('e', 'translate(' + (9*(1-p)).toFixed(2) + ' 0)');
        tr('w', 'translate(' + (-9*(1-p)).toFixed(2) + ' 0)');
        tr('heart', 'translate(32 32) scale(' + (.25+.75*p2).toFixed(3) + ') translate(-32 -32)', p2);
        break;
      case 'balance':
        tr('top', 'translate(0 ' + (-10*(1-p)).toFixed(2) + ')');
        tr('left', 'translate(' + (-10*(1-p)).toFixed(2) + ' 0)');
        tr('right', 'translate(' + (10*(1-p)).toFixed(2) + ' 0)');
        tr('equal', 'translate(32 38) scale(' + (.35+.65*p2).toFixed(3) + ') translate(-32 -38)', p2);
        break;
      case 'pattern':
        tr('corners','translate(32 32) rotate('+(-24*(1-p)).toFixed(2)+') scale('+(1+.28*(1-p)).toFixed(3)+') translate(-32 -32)',.45+.55*p);
        tr('sides','translate(32 32) rotate('+(18*(1-p)).toFixed(2)+') scale(' + (.84+.16*p).toFixed(3)+') translate(-32 -32)',.5+.5*p);
        tr('center','translate(32 32) rotate('+(-45*(1-p2)).toFixed(2)+') scale('+(.15+.85*p2).toFixed(3)+') translate(-32 -32)',p2);
        break;
      case 'dialogue':
        tr('voice-a','translate('+(-11*(1-p)).toFixed(2)+' '+(-7*(1-p)).toFixed(2)+')',.55+.45*p);
        tr('voice-b','translate('+(11*(1-p)).toFixed(2)+' '+(7*(1-p)).toFixed(2)+')',.55+.45*p);
        tr('insight','translate(32 31) rotate('+(-35*(1-p2)).toFixed(2)+') scale(' + (.1+.9*p2).toFixed(3)+') translate(-32 -31)',p2);
        break;
      case 'ribbon':
        const path=tr('loop');
        path.setAttribute('stroke-dasharray','100');
        path.setAttribute('stroke-dashoffset',(100*(1-p)).toFixed(2));
        tr('leg','translate(39 40) rotate('+(-47*(1-p2)).toFixed(2)+') scale('+(.65+.35*p2).toFixed(3)+') translate(-39 -40)',p2);
        tr('seal','translate(50 12) scale('+(.12+.88*p2).toFixed(3)+') translate(-50 -12)',p2);
        break;
      default: throw new Error('Unknown favicon animation mode');
    }
  }

  function stop() {
    if (timer !== null) clearInterval(timer);
    timer = null;
    if (icon.href !== original) icon.href = original;
  }

  function sync() {
    if (document.hidden || reduced.matches || lowData || frames.length !== frameCount) {
      stop();
      return;
    }
    if (timer !== null) return;
    const tick = () => {
      icon.href = frames[index];
      index = (index + 1) % frameCount;
    };
    tick();
    timer = window.setInterval(tick, frameDelay);
  }

  function makeFrames() {
    frames = [];
    for (let i = 0; i < frameCount; i++) {
      const svg = source.cloneNode(true);
      applyFrame(svg, i);
      frames.push('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
        new XMLSerializer().serializeToString(svg)
      ));
    }
    index = 0;
  }

  async function prepare() {
    if (loading || failed || reduced.matches || lowData || document.hidden) return;
    loading = true;
    try {
      if (!source) {
        const response = await fetch(original, { cache: 'force-cache' });
        if (!response.ok) throw new Error('SVG favicon cannot be loaded');
        const doc = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
        if (doc.querySelector('parsererror')) throw new Error('Invalid SVG favicon');
        source = doc.documentElement;
        source.querySelectorAll('style,script,animate,animateTransform').forEach(el => el.remove());
      }
      makeFrames();
      sync();
    } catch {
      failed = true;
      stop(); // The native SVG favicon remains the fallback.
    } finally {
      loading = false;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (frames.length === frameCount) sync();
    else prepare();
  });
  reduced.addEventListener?.('change', () => {
    if (reduced.matches) stop();
    else if (frames.length === frameCount) sync();
    else prepare();
  });
  dark.addEventListener?.('change', () => {
    if (!source) return;
    stop();
    makeFrames();
    sync();
  });
  window.addEventListener('pagehide', stop, { once: true });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', prepare, { once: true });
  } else {
    prepare();
  }
})();
