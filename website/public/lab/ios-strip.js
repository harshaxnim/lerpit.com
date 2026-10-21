/*
 * TEMPORARY lab for the iOS 26 Safari status-bar strip. Loaded by BaseLayout only when
 * the URL carries ?lab=<variant>; delete this file and that loader once it is fixed.
 *
 * The cause, from WebKit's own sampler (LocalFrameView::fixedContainerEdges): once the
 * page scrolls, Safari hit-tests ONE point, the middle of the top edge 4px down, walks
 * up from whatever is there, and fills the strip behind the status bar with solid
 * colour only if it meets a fixed or sticky box at least 90% of the viewport wide
 * (after 4px off each side), over 10px tall, with a background colour. A pseudo-element
 * counts as its host. Otherwise the strip shows the page through it.
 *
 * On phones the pinned byline is 88-89.5% wide, just under. Each variant below is one
 * way past that, plus controls. The readout sits mid-screen, away from every edge
 * midpoint Safari samples, so it cannot become what it measures.
 */
(() => {
  const PAPER = '253 251 244';
  const VARIANTS = {
    ship: {
      about: 'The shipped page, untouched. Control.',
      expect: 'Prose shows in the strip above the byline (the bug).',
      css: ''
    },
    bleed: {
      about: 'Byline box reaches the screen edges; its paint stays in the column.',
      expect: 'Strip is plain paper. Page looks otherwise identical to ship.',
      css: `@media (max-width: 1180px) { .lerpette-brow--pinned {
        margin-inline: calc(50% - 50vw); padding: 0 calc(50vw - 50%);
        line-height: var(--byline-h); background-clip: content-box; } }`
    },
    'bleed-solid': {
      about: 'Byline box AND its paint reach the screen edges. Control for bleed.',
      expect: 'Strip is plain paper; byline covers the side rules for its height.',
      css: `@media (max-width: 1180px) { .lerpette-brow--pinned {
        margin-inline: calc(50% - 50vw); padding: 0 calc(50vw - 50%);
        line-height: var(--byline-h); } }`
    },
    strip: {
      about: 'Invisible 12px fixed strip at the top, paper at 2% alpha.',
      expect: 'Strip is plain paper. Page looks identical to ship.',
      strip: `rgb(${PAPER} / 0.02)`
    },
    'strip-solid': {
      about: 'Opaque 12px fixed paper strip at the top. Control for strip.',
      expect: 'Strip is plain paper; a 12px paper band shows at the top.',
      strip: `rgb(${PAPER})`
    }
  };

  const params = new URLSearchParams(location.search);
  const name = params.get('lab') in VARIANTS ? params.get('lab') : 'ship';
  const variant = VARIANTS[name];

  const style = document.createElement('style');
  style.textContent = `${variant.css ?? ''}
    .lab-strip { position: fixed; top: 0; left: 0; right: 0; height: 12px; z-index: 2147483000; pointer-events: none; }
    .lab-readout { position: fixed; top: 44%; left: 9%; right: 9%; z-index: 2147483001; padding: 8px 10px;
      font: 11px/1.4 ui-monospace, Menlo, monospace; color: #20313f; background: rgb(255 255 255 / 0.95);
      border: 2px solid #c2185b; white-space: pre-wrap; word-break: break-word; }
    .lab-readout b { color: #c2185b; }
    .lab-readout a { margin-right: 10px; color: #2e6da4; }
    .lab-readout a.is-on { font-weight: 700; color: #c2185b; }
    .lab-readout.is-folded .lab-body { display: none; }`;
  document.head.append(style);

  const ready = () => {
    if (variant.strip) {
      const strip = document.createElement('div');
      strip.className = 'lab-strip';
      strip.style.background = variant.strip;
      document.body.append(strip);
    }

    const readout = document.createElement('div');
    readout.className = 'lab-readout';
    const links = Object.keys(VARIANTS)
      .map((key) => `<a class="${key === name ? 'is-on' : ''}" href="?lab=${key}">${key}</a>`)
      .join('');
    readout.innerHTML = `<b>LAB · ${name}</b>  (tap to fold)\n<span class="lab-body">${variant.about}\nexpect: ${variant.expect}\n\n<span class="lab-live"></span>\n\n${links}</span>`;
    readout.querySelector('b').addEventListener('click', () => readout.classList.toggle('is-folded'));
    document.body.append(readout);
    const live = readout.querySelector('.lab-live');

    // env(safe-area-inset-top), measured off-screen and out of the fixed layer.
    const inset = document.createElement('div');
    inset.style.cssText = 'position:absolute;left:-9999px;top:0;padding-top:env(safe-area-inset-top)';
    document.body.append(inset);

    // What WebKit's sampler would find at the top edge, emulated with the page's real
    // layout. Its first pass ignores pointer-events, so this does too.
    const sample = () => {
      const W = innerWidth;
      const usable = W - 8;
      const off = document.createElement('style');
      off.textContent = '*, *::before, *::after { pointer-events: auto !important }';
      document.head.append(off);
      const hit = document.elementFromPoint(W / 2, 4);
      off.remove();
      const lines = [];
      let verdict = 'NONE: no fixed/sticky box >= 90% wide here, so Safari shows the page through the strip';
      for (let el = hit; el && el !== document.documentElement; el = el.parentElement) {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const pct = ((r.width / usable) * 100).toFixed(1);
        const tag = `${el.tagName.toLowerCase()}${el.classList[0] ? '.' + el.classList[0] : ''}`;
        if (cs.position === 'fixed' || cs.position === 'sticky') {
          lines.push(`${tag} ${cs.position} ${Math.round(r.width)}px = ${pct}%`);
          if (r.width >= 0.9 * usable && r.height > 10) {
            verdict = `SOLID from ${tag}: ${cs.backgroundColor}`;
            break;
          }
        }
      }
      const vv = window.visualViewport;
      live.textContent =
        `emulated sampler: ${verdict}\n` +
        (lines.length ? `  checked: ${lines.join(' | ')}\n` : '') +
        `viewport ${innerWidth}x${innerHeight}  scrollY ${Math.round(scrollY)}  ` +
        `vv.top ${vv ? Math.round(vv.offsetTop) : '-'}  safe-top ${inset.offsetHeight}  dpr ${devicePixelRatio}\n` +
        `${(navigator.userAgent.match(/Version\/[\d.]+|CriOS\/[\d.]+|OS [\d_]+/g) ?? []).join(' ')}` +
        (matchMedia('(display-mode: standalone)').matches ? '  standalone' : '');
    };

    let timer = 0;
    addEventListener('scroll', () => { clearTimeout(timer); timer = setTimeout(sample, 150); }, { passive: true });
    addEventListener('resize', sample);

    // Land every variant at the same place: prose under the pinned byline, as in the
    // report. Only from the top, so a reload's own scroll restore is left alone.
    setTimeout(() => {
      const chapter = document.getElementById('teleportation');
      if (chapter && scrollY < 10) window.scrollTo({ top: chapter.getBoundingClientRect().top + scrollY + 140, behavior: 'instant' });
      sample();
    }, 900);
  };

  if (document.body) ready();
  else addEventListener('DOMContentLoaded', ready, { once: true });
})();
