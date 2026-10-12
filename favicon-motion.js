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
    const primary = svg.querySelector('#motion');
    if (!primary) throw new Error('Animated SVG subject is missing');
    const p = reveal(t, .12, .55, .84);
    const transform = (id, value) => {
      const node = svg.querySelector(id);
      if (node) node.setAttribute('transform', value);
    };

    switch (mode) {
      case 'orbit': {
        primary.setAttribute('transform', `rotate(${(360 * t).toFixed(2)} 32 32)`);
        const lift = Math.sin(Math.PI * Math.min(1, t / .7)) ** 2 * -3;
        transform('#pin', `translate(0 ${lift.toFixed(2)})`);
        break;
      }
      case 'check': {
        primary.setAttribute('stroke-dasharray', '38');
        primary.setAttribute('stroke-dashoffset', String((38 * (1 - p)).toFixed(2)));
        transform('#corner', `rotate(${(-9 * p).toFixed(2)} 46 47)`);
        break;
      }
      case 'route': {
        primary.setAttribute('stroke-dasharray', '100');
        primary.setAttribute('stroke-dashoffset', String((100 * (1 - p)).toFixed(2)));
        const s = .78 + p * .38;
        transform('#destination', `translate(52 31) scale(${s.toFixed(3)}) translate(-52 -31)`);
        break;
      }
      case 'page': {
        const angle = -31 * Math.sin(Math.PI * p);
        primary.setAttribute('transform', `rotate(${angle.toFixed(2)} 32 49)`);
        transform('#orbit', `rotate(${(360 * t).toFixed(2)} 32 32)`);
        break;
      }
      case 'reveal': {
        const scale = .08 + p * .92;
        primary.setAttribute('transform', `translate(31 32) scale(${scale.toFixed(3)} 1) translate(-31 -32)`);
        const accent = svg.querySelector('#accent');
        if (accent) {
          accent.setAttribute('transform', `translate(${(-5 * (1 - p)).toFixed(2)} 0)`);
          accent.setAttribute('opacity', String((.3 + .7 * p).toFixed(2)));
        }
        const letterR = svg.querySelector('#letter-r');
        if (letterR && dark.matches) letterR.setAttribute('stroke', '#F0F3FA');
        break;
      }
      default:
        throw new Error('Unsupported favicon motion');
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
