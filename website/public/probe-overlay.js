/*
 * Diagnostic overlay for the status bar gap, loaded only when the URL carries
 * ?probe. It measures the real byline on the real page rather than a replica,
 * and tints the real band pink so it can be seen at all.
 *
 * Delete this, its loader in BaseLayout and probe.html once the gap is fixed.
 */
(function () {
  var BROW = '.lerpette-brow--pinned';
  /* The band only tints the strip if Safari counts it as touching the top edge.
     At top:-48 it is wholly outside the layout viewport and gets culled, shadows
     and all. So these candidates differ only in how far they reach back in. */
  var MODES = {
    off:  'display:none',
    old:  'top:0;height:var(--byline-h)',
    now:  'top:calc(-1 * var(--byline-h));height:var(--byline-h)',
    hair: 'top:calc(-1 * var(--byline-h));height:calc(var(--byline-h) + 1px)',
    edge: 'top:calc(-1 * var(--byline-h));height:calc(var(--byline-h) + 8px)',
    half: 'top:calc(-1 * var(--byline-h));height:calc(var(--byline-h) + 24px)'
  };

  var css = document.createElement('style');
  css.textContent = [
    '.probe-ruler{position:fixed;left:0;right:0;top:0;height:0;z-index:9998;pointer-events:none}',
    '.probe-ruler i{position:absolute;left:0;right:0;height:0;border-top:1px solid #7CFF3D}',
    '.probe-ruler i::after{content:attr(data-y);position:absolute;left:4px;top:-8px;',
    'font:600 11px/1 ui-monospace,Menlo,monospace;color:#06240a;background:#7CFF3D;padding:2px 4px;border-radius:3px}',
    '.probe-ruler i.zero{border-top-width:2px;border-color:#fff}',
    '.probe-ruler i.zero::after{background:#fff;color:#000}',
    '.probe-panel{position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#172029;color:#e8eef2;',
    'border-top:1px solid #2a3843;padding:.6rem .6rem calc(.6rem + env(safe-area-inset-bottom,0px));',
    'font:13px/1.4 ui-monospace,Menlo,monospace;display:grid;gap:.5rem}',
    '.probe-row{display:grid;grid-template-columns:repeat(4,1fr);gap:.4rem}',
    '.probe-row.two{grid-template-columns:repeat(2,1fr)}',
    '.probe-row.three{grid-template-columns:repeat(3,1fr)}',
    '.probe-row button{font:600 12px/1 ui-monospace,Menlo,monospace;padding:.75rem .2rem;border-radius:6px;',
    'border:1px solid #2a3843;background:transparent;color:#788a97}',
    '.probe-row button[aria-pressed="true"]{border-color:#ff2f92;color:#fff;background:#2a1220}',
    '.probe-grid{display:grid;grid-template-columns:1fr auto;gap:.1rem .6rem}',
    '.probe-grid span:nth-child(odd){color:#788a97;font-size:11px}',
    '.probe-grid span:nth-child(even){text-align:right;font-variant-numeric:tabular-nums}',
    '.probe-grid span.flag{color:#ff2f92;font-weight:600}',
    '.probe-warn{position:fixed;left:0;right:0;top:0;z-index:9999;background:#ffcc00;color:#241d00;',
    'font:600 13px/1.3 ui-monospace,Menlo,monospace;padding:.5rem 1rem;text-align:center}'
  ].join('');
  document.head.appendChild(css);

  var band = document.createElement('style');
  document.head.appendChild(band);

  function setMode(mode) {
    // Same media query the shipped rule lives in, so this measures what ships.
    band.textContent = '@media (max-width:1180px){' + BROW + '.is-stuck::before{' +
      MODES[mode] + ';background:#ff2f92 !important;' +
      'box-shadow:0 calc(-1 * var(--byline-h)) 0 #ff2f92,0 calc(-2 * var(--byline-h)) 0 #ff2f92 !important}}';
    Array.prototype.forEach.call(buttons, function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    });
    current = mode;
  }

  var ruler = document.createElement('div');
  ruler.className = 'probe-ruler';
  for (var y = -96; y <= 144; y += 24) {
    var tick = document.createElement('i');
    tick.style.top = y + 'px';
    tick.dataset.y = String(y);
    if (y === 0) tick.className = 'zero';
    ruler.appendChild(tick);
  }
  document.body.appendChild(ruler);

  var warn = document.createElement('p');
  warn.className = 'probe-warn';
  warn.textContent = 'SCROLL so the byline pins.';
  document.body.appendChild(warn);

  var panel = document.createElement('div');
  panel.className = 'probe-panel';
  panel.innerHTML =
    '<div class="probe-row three">' +
      '<button type="button" data-mode="off">off</button>' +
      '<button type="button" data-mode="old">old 0</button>' +
      '<button type="button" data-mode="now">now -48</button>' +
    '</div>' +
    '<div class="probe-row three">' +
      '<button type="button" data-mode="hair">hair +1</button>' +
      '<button type="button" data-mode="edge">edge +8</button>' +
      '<button type="button" data-mode="half">half +24</button>' +
    '</div>' +
    '<div class="probe-row two">' +
      '<button type="button" id="probe-ruler-toggle" aria-pressed="true">ruler on</button>' +
      '<button type="button" id="probe-copy">copy numbers</button>' +
    '</div>' +
    '<div class="probe-grid" id="probe-grid"></div>';
  document.body.appendChild(panel);

  var buttons = panel.querySelectorAll('[data-mode]');
  var current = 'now';
  Array.prototype.forEach.call(buttons, function (b) {
    b.addEventListener('click', function () { setMode(b.dataset.mode); });
  });

  document.getElementById('probe-ruler-toggle').addEventListener('click', function () {
    var on = ruler.style.display !== 'none';
    ruler.style.display = on ? 'none' : '';
    this.setAttribute('aria-pressed', String(!on));
    this.textContent = on ? 'ruler off' : 'ruler on';
  });

  function brow() { return document.querySelector(BROW); }

  var rows = [
    ['byline top', function () { var b = brow(); return b ? Math.round(b.getBoundingClientRect().top) : 'none'; }, true],
    ['is-stuck', function () { var b = brow(); return b ? (b.classList.contains('is-stuck') ? 'yes' : 'NO') : 'none'; }, true],
    ['band top', function () { var b = brow(); return b ? getComputedStyle(b, '::before').top : 'none'; }, true],
    ['band height', function () { var b = brow(); return b ? getComputedStyle(b, '::before').height : 'none'; }, true],
    ['band reaches to', function () {
      var b = brow();
      if (!b) return 'none';
      var cs = getComputedStyle(b, '::before');
      if (cs.display === 'none') return 'hidden';
      return Math.round(parseFloat(cs.top) + parseFloat(cs.height)) + 'px';
    }, true],
    ['byline height', function () { var b = brow(); return b ? Math.round(b.getBoundingClientRect().height) : 'none'; }, false],
    ['safe-area-top', function () { return safe.getBoundingClientRect().height; }, true],
    ['visual offsetTop', function () { return window.visualViewport ? Math.round(window.visualViewport.offsetTop) : 'n/a'; }, true],
    ['innerHeight', function () { return window.innerHeight; }, false],
    ['innerWidth', function () { return window.innerWidth; }, false],
    ['scrollY', function () { return Math.round(window.scrollY); }, false]
  ];

  var safe = document.createElement('div');
  safe.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:env(safe-area-inset-top,0px);opacity:0;pointer-events:none';
  document.body.appendChild(safe);

  var grid = document.getElementById('probe-grid');
  var values = [];
  rows.forEach(function (row) {
    var label = document.createElement('span');
    label.textContent = row[0];
    var value = document.createElement('span');
    if (row[2]) value.className = 'flag';
    grid.append(label, value);
    values.push(value);
  });

  function paint() {
    rows.forEach(function (row, i) { values[i].textContent = String(row[1]()); });
    warn.style.display = window.scrollY > 8 ? 'none' : '';
  }

  document.getElementById('probe-copy').addEventListener('click', function () {
    var self = this;
    var text = 'page=' + location.pathname + '\nmode=' + current + '\n' +
      rows.map(function (row) { return row[0] + ': ' + row[1](); }).join('\n') +
      '\nua: ' + navigator.userAgent;
    navigator.clipboard.writeText(text).then(function () {
      self.textContent = 'copied';
      setTimeout(function () { self.textContent = 'copy numbers'; }, 1500);
    }).catch(function () { self.textContent = 'copy failed'; });
  });

  setMode('now');
  paint();
  addEventListener('scroll', paint, { passive: true });
  addEventListener('resize', paint);
  setInterval(paint, 300);
})();
