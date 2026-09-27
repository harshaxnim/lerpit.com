/*
 * One URL per candidate fix, so the whole set can be opened on a phone and judged
 * by eye instead of tapped through. Loaded only when the URL carries ?probe=<key>.
 *
 * Each variant sets three things: whether the root carries the paper, where the
 * fixed band sits, and whether the viewport opts into the safe area. Colours are
 * the real ones, so what you see is what that combination would actually ship as.
 *
 * Delete this, its loader in BaseLayout and probe.html once the fix is settled.
 */
(function () {
  var BROW = '.lerpette-brow--pinned';

  var BANDS = {
    off:  'display:none',
    now:  'top:calc(-1 * var(--byline-h));height:var(--byline-h)',
    zero: 'top:0;height:var(--byline-h)',
    hair: 'top:calc(-1 * var(--byline-h));height:calc(var(--byline-h) + 1px)'
  };

  var VARIANTS = {
    ship:   { root: true,  band: null,   cover: false, note: 'as shipped now: root paper + band at -48' },
    noband: { root: true,  band: 'off',  cover: false, note: 'root paper, band deleted. this is what regressed' },
    cover:  { root: true,  band: 'off',  cover: true,  note: 'root paper, no band, viewport-fit=cover' },
    band0:  { root: true,  band: 'zero', cover: false, note: 'root paper + band at top:0. covers the border' },
    hair:   { root: true,  band: 'hair', cover: false, note: 'root paper + band reaching 1px into the viewport' },
    noroot: { root: false, band: null,   cover: false, note: 'root transparent again + band at -48' }
  };

  var key = (/[?&]probe=([a-z0-9]+)/i.exec(location.search) || [])[1] || 'ship';
  var v = VARIANTS[key];
  if (!v) { key = 'ship'; v = VARIANTS.ship; }

  // Root. The shipped CSS already paints it, so only the negative case acts.
  if (!v.root) document.documentElement.style.background = 'transparent';

  // Band. null means leave the shipped rule alone.
  if (v.band) {
    var band = document.createElement('style');
    band.textContent = '@media (max-width:1180px){' + BROW + '.is-stuck::before{' + BANDS[v.band] + '}}';
    document.head.appendChild(band);
  }

  if (v.cover) {
    var vp = document.querySelector('meta[name="viewport"]');
    if (vp) vp.setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover');
  }

  var css = document.createElement('style');
  css.textContent = [
    '.probe-badge{position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#0f1418;color:#e8eef2;',
    'font:12px/1.35 ui-monospace,Menlo,monospace;padding:.5rem .7rem calc(.5rem + env(safe-area-inset-bottom,0px));',
    'display:flex;gap:.6rem;align-items:baseline}',
    '.probe-badge b{color:#7CFF3D;font-size:15px;letter-spacing:.04em}',
    '.probe-badge span{color:#8fa0ac;flex:1}',
    '.probe-badge i{color:#ff2f92;font-style:normal}',
    '.probe-line{position:fixed;left:0;right:0;top:0;height:0;z-index:9998;pointer-events:none;',
    'border-top:2px solid #7CFF3D}',
    '.probe-line::after{content:"0";position:absolute;left:4px;top:-8px;font:600 11px/1 ui-monospace,monospace;',
    'color:#06240a;background:#7CFF3D;padding:2px 4px;border-radius:3px}'
  ].join('');
  document.head.appendChild(css);

  var line = document.createElement('div');
  line.className = 'probe-line';
  document.body.appendChild(line);

  var badge = document.createElement('div');
  badge.className = 'probe-badge';
  badge.innerHTML = '<b></b><span></span><i></i>';
  badge.querySelector('b').textContent = key;
  badge.querySelector('span').textContent = v.note;
  document.body.appendChild(badge);

  var flag = badge.querySelector('i');
  var brow = document.querySelector(BROW);

  // Land pinned. Every run photographed at the top is a run at the one scroll
  // position the gap does not happen at.
  function pin() {
    if (brow && window.scrollY < 8) {
      var was = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, Math.max(600, brow.offsetTop + 400));
      document.documentElement.style.scrollBehavior = was;
    }
  }
  pin();
  setTimeout(pin, 400);
  setTimeout(pin, 1200);

  // Drive is-stuck here too. The site sets it from its own scroll handler, which is
  // the right owner, but a variant that silently shows no band because that handler
  // has not run yet is a variant that reports a false pass.
  function paint() {
    if (!brow) return;
    var pinned = window.scrollY > 0 && brow.getBoundingClientRect().top <= 0;
    brow.classList.toggle('is-stuck', pinned);
    flag.textContent = pinned ? '' : 'SCROLL';
  }
  paint();
  addEventListener('scroll', paint, { passive: true });
  setInterval(paint, 300);
})();
