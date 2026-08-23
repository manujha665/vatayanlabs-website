/* Vatayan Labs — Buy vs Invest, UI layer.
   Form generation, SVG charting (no chart library), URL state, exports. */
(function () {
  'use strict';
  var E = window.BVI, f = E.fmtINR, fp = E.fmtPct, fw = E.fmtWords, fg = E.fmtGrouped;
  var $ = function (id) { return document.getElementById(id); };

  var C = {
    a: '#1d4ed8', aFill: 'rgba(29,78,216,.10)',
    b: '#059669', bFill: 'rgba(5,150,105,.10)',
    grid: '#e2e8f0', axis: '#94a3b8', text: '#334155', faint: '#94a3b8',
    warn: '#d97706', bad: '#dc2626', band: 'rgba(100,116,139,.14)'
  };

  // ── field spec ────────────────────────────────────────────────────────────
  var G = [
    { id: 'basics', title: 'Your situation', open: true, fields: [
      ['age', 'Your age today', '', 1, 'Only used to label the timeline, so you can see which birthday each row lands on.'],
      ['years', 'Horizon (years)', 'yr', 1, 'How long before you sell up and count the money. Everything is settled at this point.']
    ]},
    { id: 'property', title: 'The flat', open: true, fields: [
      ['price', 'All-in price', '₹', 100000, 'The agreement value, before stamp duty and registration.'],
      ['downPct', 'Down payment', '%', 1, 'Share of the price you pay from your own pocket.'],
      ['stampDutyPct', 'Stamp duty', '%', 0.5, 'State-level, typically 5–7%. Paid on day one and never recovered — though it does count toward your capital-gains cost base.'],
      ['registrationPct', 'Registration', '%', 0.5, 'Usually around 1%.'],
      ['otherBuyPct', 'Brokerage, legal, GST etc.', '%', 0.5, 'Everything else you pay to complete the purchase.']
    ]},
    { id: 'loan', title: 'The loan', open: true, fields: [
      ['loanRate', 'Interest rate', '%', 0.05, 'Assumed constant. Real floating rates move — try a couple of values.'],
      ['loanTenure', 'Tenure', 'yr', 1, 'Can run past your horizon; anything still outstanding is settled on sale.'],
      ['emiStepUpPct', 'EMI step-up each year', '%', 1, 'Raise the EMI annually as your income grows. Closes the loan early and cuts total interest.'],
      ['prepayAnnual', 'Annual lump-sum prepayment', '₹', 25000, 'A once-a-year prepayment straight off the principal.']
    ]},
    { id: 'market', title: 'Property market', open: true, fields: [
      ['propCagr', 'Price appreciation', '%', 0.25, 'Long-run CAGR. This is the single assumption the answer is most sensitive to — check the heat map.'],
      ['rentYieldPct', 'Starting rent yield', '%', 0.1, 'Annual rent as a share of price today. Indian metros mostly sit between 2% and 3.5%.'],
      ['rentGrowthPct', 'Rent growth', '%', 0.25, 'Annual increase in rent.'],
      ['vacancyPct', 'Vacancy', '%', 1, 'Share of rent lost to empty months and defaults. Only bites when the flat is let out.']
    ]},
    { id: 'running', title: 'Running costs', open: false, fields: [
      ['maintPct', 'Society maintenance', '%', 0.05, 'Per year, as a share of property value. Paid by the owner, not the tenant.'],
      ['propTaxPct', 'Municipal property tax', '%', 0.05, 'Per year, as a share of property value.'],
      ['repairPct', 'Major repair', '%', 0.5, 'Painting, waterproofing, fittings. Capitalised into your cost base.'],
      ['repairEvery', 'Repair every', 'yr', 1, 'Set to 0 for no periodic repairs.']
    ]},
    { id: 'equity', title: 'The mutual fund', open: true, fields: [
      ['equityCagr', 'Gross return', '%', 0.25, 'Before fees. Compounded on exactly the same convention as property — a true annual CAGR.'],
      ['expenseRatio', 'Expense ratio', '%', 0.05, 'Deducted from the return. Direct plans ~0.5–1%, regular plans ~1.5–2.2%.']
    ]},
    { id: 'tax', title: 'Income tax', open: false, fields: [
      ['marginalTaxPct', 'Your marginal tax rate', '%', 1, 'Including surcharge and cess, if they apply to you.'],
      ['sec24Cap', 'Sec 24(b) interest cap', '₹', 50000, 'Self-occupied interest deduction, old regime only.'],
      ['sec80cHeadroom', '80C headroom for principal', '₹', 25000, 'What is LEFT of your 80C limit after EPF, insurance and ELSS. Old regime only.'],
      ['hpLossCap', 'House-property loss set-off cap', '₹', 50000, 'Annual cap on setting a let-out loss against salary. The excess carries forward.']
    ]},
    { id: 'exit', title: 'Selling up', open: false, fields: [
      ['sellCostPct', 'Brokerage on sale', '%', 0.25, 'What it costs to convert the flat back into money.'],
      ['propLtcgFlatPct', 'Property LTCG — flat rate', '%', 0.5, 'Rate applied when no indexation is claimed.'],
      ['propLtcgIndexedPct', 'Property LTCG — indexed rate', '%', 0.5, 'Rate applied when the cost base is indexed.'],
      ['ciiPct', 'Cost inflation index growth', '%', 0.5, 'How fast the indexed cost base rises each year.'],
      ['eqLtcgPct', 'Equity LTCG rate', '%', 0.5, 'On gains above the exemption.'],
      ['eqExemption', 'Equity LTCG exemption', '₹', 25000, 'Applied once at redemption in this model.']
    ]},
    { id: 'misc', title: 'Money illusion', open: false, fields: [
      ['inflation', 'Inflation', '%', 0.25, 'Used to restate the answer in today’s money. A crore in 2046 is not a crore.']
    ]}
  ];

  var SELECTS = {
    mode: { label: 'What is the flat for?', opts: [
      ['self', 'I live in it — and the alternative is renting a similar home'],
      ['letout', 'I let it out — and I rent my own home either way'] ] },
    regime: { label: 'Tax regime', opts: [['new', 'New regime (no home-loan deductions)'], ['old', 'Old regime (Sec 24b + 80C apply)']] },
    propGainMode: { label: 'Property capital gains', opts: [['flat', 'Flat rate, no indexation'], ['indexed', 'Indexed cost base, higher rate']] }
  };

  var PRESETS = {
    mumbai: { label: 'Mumbai-style', price: 25000000, rentYieldPct: 2.4, propCagr: 6, stampDutyPct: 6, rentGrowthPct: 6 },
    bengaluru: { label: 'Bengaluru-style', price: 14000000, rentYieldPct: 3.4, propCagr: 7.5, stampDutyPct: 5.6, rentGrowthPct: 7 },
    tier2: { label: 'Tier-2 city', price: 7000000, rentYieldPct: 4, propCagr: 6.5, stampDutyPct: 7, rentGrowthPct: 5.5 }
  };

  var ALL_NUM = [];
  G.forEach(function (g) { g.fields.forEach(function (fd) { ALL_NUM.push(fd[0]); }); });
  var ALL_KEYS = ALL_NUM.concat(['mode', 'regime', 'propGainMode', 'useSec54']);

  // ── build the form ────────────────────────────────────────────────────────
  function buildForm() {
    var d = E.defaults(), host = $('bviForm'), html = '';

    html += '<div class="bvi-group is-open" id="grp-scenario"><h3 class="bvi-grp-head" role="heading" aria-level="3">' +
      '<button type="button" class="bvi-grp-btn" aria-expanded="true" aria-controls="body-scenario">Scenario<span class="bvi-caret" aria-hidden="true"></span></button></h3>' +
      '<div class="bvi-grp-body" id="body-scenario">';
    html += selectHtml('mode', d.mode);
    html += '<div class="bvi-presets" role="group" aria-label="Starting points"><span class="bvi-preset-lab">Start from</span>';
    Object.keys(PRESETS).forEach(function (k) {
      html += '<button type="button" class="bvi-chip" data-preset="' + k + '">' + PRESETS[k].label + '</button>';
    });
    html += '</div></div></div>';

    G.forEach(function (g) {
      html += '<div class="bvi-group' + (g.open ? ' is-open' : '') + '" id="grp-' + g.id + '">' +
        '<h3 class="bvi-grp-head" role="heading" aria-level="3"><button type="button" class="bvi-grp-btn" aria-expanded="' + (g.open ? 'true' : 'false') +
        '" aria-controls="body-' + g.id + '">' + g.title + '<span class="bvi-caret" aria-hidden="true"></span></button></h3>' +
        '<div class="bvi-grp-body" id="body-' + g.id + '">';
      if (g.id === 'tax') html += selectHtml('regime', d.regime);
      g.fields.forEach(function (fd) { html += fieldHtml(fd, d[fd[0]]); });
      if (g.id === 'exit') {
        html += selectHtml('propGainMode', d.propGainMode);
        html += '<div class="bvi-check"><input type="checkbox" id="useSec54"' + (d.useSec54 ? ' checked' : '') + '>' +
          '<label for="useSec54">Roll the gain into another house (Sec 54)</label>' +
          '<p class="bvi-help">Zeroes the property tax bill — but the money is then locked in another flat, not in your hand.</p></div>';
      }
      if (g.id === 'tax') html += '<p class="bvi-note">Defaults reflect ' + E.TAX_AS_OF + '. Rates change with every Budget — check them against the current year before you rely on the answer.</p>';
      html += '</div></div>';
    });
    host.innerHTML = html;

    host.addEventListener('click', function (ev) {
      var btn = ev.target.closest('.bvi-grp-btn');
      if (btn) {
        var grp = btn.closest('.bvi-group'), open = grp.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        return;
      }
      var chip = ev.target.closest('[data-preset]');
      if (chip) { applyPreset(chip.getAttribute('data-preset')); }
    });
    host.addEventListener('input', function () { updateWords(); schedule(); });
    host.addEventListener('change', function () { updateWords(); schedule(); });
    updateWords();
  }

  function fieldHtml(fd, val) {
    var id = fd[0], label = fd[1], unit = fd[2], step = fd[3], help = fd[4];
    var money = unit === '₹';
    return '<div class="bvi-field' + (unit ? ' has-unit u-' + (money ? 'rs' : unit === '%' ? 'pc' : 'yr') + '' : '') + '">' +
      '<label for="' + id + '">' + label + '</label>' +
      '<div class="bvi-inwrap"><input type="number" id="' + id + '" value="' + val + '" step="' + step + '" inputmode="decimal" aria-describedby="' + (money ? 'a-' + id + ' ' : '') + 'h-' + id + '">' +
      (unit ? '<span class="bvi-unit" aria-hidden="true">' + unit + '</span>' : '') + '</div>' +
      // Reading back the amount in words is the cheapest possible guard against
      // typing one zero too many — the single most common input error here.
      (money ? '<p class="bvi-amt" id="a-' + id + '" aria-live="polite"></p>' : '') +
      '<p class="bvi-help" id="h-' + id + '">' + help + '</p></div>';
  }

  function selectHtml(id, val) {
    var s = SELECTS[id], h = '<div class="bvi-field"><label for="' + id + '">' + s.label + '</label><select id="' + id + '">';
    s.opts.forEach(function (o) { h += '<option value="' + o[0] + '"' + (o[0] === val ? ' selected' : '') + '>' + o[1] + '</option>'; });
    return h + '</select></div>';
  }

  // Every rupee input carries an echo line; refresh them all together.
  var MONEY_IDS = [];
  G.forEach(function (g) { g.fields.forEach(function (fd) { if (fd[2] === '₹') MONEY_IDS.push(fd[0]); }); });

  function updateWords() {
    MONEY_IDS.forEach(function (id) {
      var el = $(id), out = $('a-' + id);
      if (!el || !out) return;
      var raw = el.value.trim();
      if (raw === '') { out.textContent = ''; out.className = 'bvi-amt'; return; }
      var v = parseFloat(raw);
      if (!isFinite(v)) { out.textContent = ''; out.className = 'bvi-amt'; return; }
      out.textContent = fg(v) + '  ·  ' + fw(v);
      out.className = 'bvi-amt' + (v < 0 ? ' is-neg' : '');
    });
  }

  // ── read / write state ────────────────────────────────────────────────────
  function readOpts() {
    var o = E.defaults();
    ALL_NUM.forEach(function (k) {
      var el = $(k); if (!el) return;
      var v = parseFloat(el.value);
      o[k] = isFinite(v) ? v : 0;
    });
    o.mode = $('mode').value; o.regime = $('regime').value;
    o.propGainMode = $('propGainMode').value; o.useSec54 = $('useSec54').checked;
    o.years = Math.max(1, Math.min(60, Math.round(o.years)));
    o.loanTenure = Math.max(0, Math.min(40, o.loanTenure));
    o.downPct = Math.max(0, Math.min(100, o.downPct));
    return o;
  }

  function writeOpts(o) {
    ALL_NUM.forEach(function (k) { if ($(k) && o[k] !== undefined) $(k).value = o[k]; });
    ['mode', 'regime', 'propGainMode'].forEach(function (k) { if (o[k] !== undefined) $(k).value = o[k]; });
    $('useSec54').checked = !!o.useSec54;
    updateWords();
  }

  function applyPreset(k) {
    var p = PRESETS[k]; if (!p) return;
    Object.keys(p).forEach(function (key) { if (key !== 'label' && $(key)) $(key).value = p[key]; });
    updateWords();
    run();
  }

  function toQuery(o) {
    var d = E.defaults(), parts = [];
    ALL_KEYS.forEach(function (k) {
      var v = o[k], dv = d[k];
      if (typeof v === 'boolean') { if (v !== dv) parts.push(k + '=' + (v ? 1 : 0)); }
      else if (v !== dv) parts.push(k + '=' + encodeURIComponent(v));
    });
    return parts.join('&');
  }

  function fromQuery() {
    var q = location.search.replace(/^\?/, ''); if (!q) return null;
    var o = E.defaults(), got = false;
    q.split('&').forEach(function (kv) {
      var i = kv.indexOf('='); if (i < 0) return;
      var k = decodeURIComponent(kv.slice(0, i)), v = decodeURIComponent(kv.slice(i + 1));
      if (ALL_KEYS.indexOf(k) < 0) return;
      got = true;
      if (k === 'useSec54') o[k] = v === '1' || v === 'true';
      else if (['mode', 'regime', 'propGainMode'].indexOf(k) >= 0) o[k] = v;
      else { var n = parseFloat(v); if (isFinite(n)) o[k] = n; }
    });
    return got ? o : null;
  }

  // ── SVG chart primitives ──────────────────────────────────────────────────
  function svgEl(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
    return e;
  }
  function niceTicks(min, max, count) {
    var span = max - min || 1, raw = span / count, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag, step = mag * (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10);
    var t = [], s = Math.ceil(min / step) * step;
    for (var v = s; v <= max + step * 1e-9; v += step) t.push(v);
    return t;
  }

  var W = 920, H = 420, M = { t: 18, r: 18, b: 34, l: 74 };

  function lineChart(host, cfg) {
    host.innerHTML = '';
    var iw = W - M.l - M.r, ih = H - M.t - M.b;
    var xs = cfg.x, n = xs.length;
    var all = [];
    cfg.series.forEach(function (s) { all = all.concat(s.data); });
    if (cfg.bands) cfg.bands.forEach(function (b) { all = all.concat(b.hi, b.lo); });
    var lo = Math.min(0, Math.min.apply(null, all)), hi = Math.max.apply(null, all) * 1.06;
    var X = function (i) { return M.l + (n === 1 ? 0 : i / (n - 1) * iw); };
    var Y = function (v) { return M.t + ih - (v - lo) / (hi - lo || 1) * ih; };

    var svg = svgEl('svg', {
      viewBox: '0 0 ' + W + ' ' + H, class: 'bvi-svg', role: 'img',
      'aria-label': cfg.ariaLabel || 'Chart', preserveAspectRatio: 'xMidYMid meet'
    });
    svg.appendChild(svgEl('rect', { x: 0, y: 0, width: W, height: H, fill: '#ffffff' }));

    niceTicks(lo, hi, 5).forEach(function (v) {
      svg.appendChild(svgEl('line', { x1: M.l, x2: W - M.r, y1: Y(v), y2: Y(v), stroke: C.grid, 'stroke-width': 1 }));
      var t = svgEl('text', { x: M.l - 9, y: Y(v) + 4, 'text-anchor': 'end', fill: C.faint, 'font-size': 12, 'font-family': 'Inter, sans-serif' });
      t.textContent = f(v, v >= 1e7 ? 1 : 0); svg.appendChild(t);
    });
    var xStep = Math.max(1, Math.ceil(n / 12));
    for (var i = 0; i < n; i += xStep) {
      var tx = svgEl('text', { x: X(i), y: H - 12, 'text-anchor': 'middle', fill: C.faint, 'font-size': 12, 'font-family': 'Inter, sans-serif' });
      tx.textContent = cfg.xLabel ? cfg.xLabel(xs[i]) : xs[i]; svg.appendChild(tx);
    }

    (cfg.bands || []).forEach(function (b) {
      var d = '';
      for (var i2 = 0; i2 < n; i2++) d += (i2 ? 'L' : 'M') + X(i2) + ' ' + Y(b.hi[i2]);
      for (var j = n - 1; j >= 0; j--) d += 'L' + X(j) + ' ' + Y(b.lo[j]);
      svg.appendChild(svgEl('path', { d: d + 'Z', fill: b.fill || C.band, stroke: 'none' }));
    });

    cfg.series.forEach(function (s) {
      var d = '';
      for (var i3 = 0; i3 < n; i3++) d += (i3 ? 'L' : 'M') + X(i3) + ' ' + Y(s.data[i3]);
      if (s.fill) svg.appendChild(svgEl('path', { d: d + 'L' + X(n - 1) + ' ' + Y(lo) + 'L' + X(0) + ' ' + Y(lo) + 'Z', fill: s.fill, stroke: 'none' }));
      svg.appendChild(svgEl('path', { d: d, fill: 'none', stroke: s.color, 'stroke-width': s.width || 2.75, 'stroke-linejoin': 'round', 'stroke-dasharray': s.dash || null }));
    });

    // crossover marker
    if (cfg.series.length >= 2) {
      var A = cfg.series[0].data, Bd = cfg.series[1].data, cross = -1;
      for (var k = 1; k < n; k++) if ((A[k - 1] - Bd[k - 1]) * (A[k] - Bd[k]) < 0) { cross = k; break; }
      if (cross > 0) {
        svg.appendChild(svgEl('line', { x1: X(cross), x2: X(cross), y1: M.t, y2: M.t + ih, stroke: C.warn, 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }));
        var ct = svgEl('text', { x: X(cross) + 6, y: M.t + 14, fill: C.warn, 'font-size': 12, 'font-weight': 700, 'font-family': 'Inter, sans-serif' });
        ct.textContent = 'crossover · year ' + xs[cross]; svg.appendChild(ct);
      }
    }

    var guide = svgEl('line', { x1: 0, x2: 0, y1: M.t, y2: M.t + ih, stroke: C.axis, 'stroke-width': 1, opacity: 0 });
    svg.appendChild(guide);
    var dots = cfg.series.map(function (s) {
      var c = svgEl('circle', { r: 4.5, fill: '#fff', stroke: s.color, 'stroke-width': 2.5, opacity: 0 });
      svg.appendChild(c); return c;
    });
    host.appendChild(svg);

    var tip = document.createElement('div'); tip.className = 'bvi-tip'; tip.hidden = true; host.appendChild(tip);
    svg.addEventListener('mousemove', function (ev) {
      var r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * W;
      var idx = Math.round((px - M.l) / (iw || 1) * (n - 1));
      idx = Math.max(0, Math.min(n - 1, idx));
      guide.setAttribute('x1', X(idx)); guide.setAttribute('x2', X(idx)); guide.setAttribute('opacity', .5);
      cfg.series.forEach(function (s, si) {
        dots[si].setAttribute('cx', X(idx)); dots[si].setAttribute('cy', Y(s.data[idx])); dots[si].setAttribute('opacity', 1);
      });
      var h = '<strong>' + (cfg.tipTitle ? cfg.tipTitle(idx) : 'Year ' + xs[idx]) + '</strong>';
      cfg.series.forEach(function (s) { h += '<span><i style="background:' + s.color + '"></i>' + s.label + '<b>' + f(s.data[idx]) + '</b></span>'; });
      tip.innerHTML = h; tip.hidden = false;
      var left = (X(idx) / W) * r.width;
      tip.style.left = Math.min(Math.max(left, 70), r.width - 70) + 'px';
    });
    svg.addEventListener('mouseleave', function () {
      guide.setAttribute('opacity', 0); dots.forEach(function (d2) { d2.setAttribute('opacity', 0); }); tip.hidden = true;
    });
    return svg;
  }

  function heatmap(host, grid, rows, cols) {
    host.innerHTML = '';
    var cw = 92, ch = 42, ml = 92, mt = 44;
    var w = ml + cols.length * cw + 16, h = mt + rows.length * ch + 40;
    var maxAbs = 1;
    grid.forEach(function (r) { r.forEach(function (c) { maxAbs = Math.max(maxAbs, Math.abs(c.gap)); }); });
    var svg = svgEl('svg', { viewBox: '0 0 ' + w + ' ' + h, class: 'bvi-svg', role: 'img', 'aria-label': 'Sensitivity of the outcome to property and equity returns' });
    svg.appendChild(svgEl('rect', { x: 0, y: 0, width: w, height: h, fill: '#ffffff' }));

    var lab = svgEl('text', { x: ml + cols.length * cw / 2, y: 18, 'text-anchor': 'middle', fill: C.text, 'font-size': 12, 'font-weight': 700, 'font-family': 'Inter, sans-serif' });
    lab.textContent = 'Equity return (net of fees) →'; svg.appendChild(lab);
    var lab2 = svgEl('text', { x: -(mt + rows.length * ch / 2), y: 14, 'text-anchor': 'middle', fill: C.text, 'font-size': 12, 'font-weight': 700, transform: 'rotate(-90)', 'font-family': 'Inter, sans-serif' });
    lab2.textContent = '← Property CAGR'; svg.appendChild(lab2);

    cols.forEach(function (c, j) {
      var t = svgEl('text', { x: ml + j * cw + cw / 2, y: mt - 10, 'text-anchor': 'middle', fill: C.faint, 'font-size': 12, 'font-family': 'Inter, sans-serif' });
      t.textContent = c.toFixed(0) + '%'; svg.appendChild(t);
    });
    rows.forEach(function (r, i) {
      var t = svgEl('text', { x: ml - 10, y: mt + i * ch + ch / 2 + 4, 'text-anchor': 'end', fill: C.faint, 'font-size': 12, 'font-family': 'Inter, sans-serif' });
      t.textContent = r.toFixed(1) + '%'; svg.appendChild(t);
      grid[i].forEach(function (cell, j) {
        var v = cell.gap, k = Math.min(1, Math.abs(v) / maxAbs);
        var col = v >= 0 ? 'rgba(29,78,216,' + (0.10 + k * 0.72) + ')' : 'rgba(5,150,105,' + (0.10 + k * 0.72) + ')';
        var g = svgEl('g', {});
        g.appendChild(svgEl('rect', { x: ml + j * cw + 2, y: mt + i * ch + 2, width: cw - 4, height: ch - 4, rx: 6, fill: col }));
        var tt = svgEl('text', {
          x: ml + j * cw + cw / 2, y: mt + i * ch + ch / 2 + 4, 'text-anchor': 'middle',
          fill: k > 0.55 ? '#fff' : C.text, 'font-size': 11.5, 'font-weight': 600, 'font-family': 'Inter, sans-serif'
        });
        tt.textContent = (v >= 0 ? '+' : '−') + f(Math.abs(v)).replace('₹', '');
        g.appendChild(tt);
        var title = svgEl('title', {});
        title.textContent = 'Property ' + r.toFixed(1) + '%, equity ' + cols[j].toFixed(0) + '% → ' + (v >= 0 ? 'buying' : 'renting + investing') + ' ahead by ' + f(Math.abs(v));
        g.appendChild(title);
        svg.appendChild(g);
      });
    });
    var key = svgEl('text', { x: ml, y: h - 12, fill: C.faint, 'font-size': 11.5, 'font-family': 'Inter, sans-serif' });
    key.textContent = 'Blue = buying ends ahead · Green = renting + investing ends ahead · figures are the gap in final net worth';
    svg.appendChild(key);
    host.appendChild(svg);
  }

  function histogram(host, mc) {
    host.innerHTML = '';
    var w = 920, h = 300, ml = 60, mb = 46, mt = 16, mr = 16;
    var diffs = mc.samples.a.map(function (v, i) { return v - mc.samples.b[i]; });
    // Equity's right tail is unbounded, so a raw min-to-max axis squashes the
    // region around zero — the only part anyone is actually reading. Clip the
    // axis to the 1st–99th percentile and pile the outliers into the end bins.
    var sorted = diffs.slice().sort(function (x, y) { return x - y; });
    var q = function (t) { return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * t)))]; };
    var lo = q(0.01), hi = q(0.99);
    if (hi - lo < 1) { lo -= 1; hi += 1; }
    // always keep the tie line inside the frame
    if (lo > 0) lo = -Math.abs(hi) * 0.1;
    if (hi < 0) hi = Math.abs(lo) * 0.1;
    var nb = 36, bw = (hi - lo) / nb || 1, bins = new Array(nb).fill(0);
    var clipped = 0;
    diffs.forEach(function (d) {
      if (d < lo || d > hi) clipped++;
      bins[Math.min(nb - 1, Math.max(0, Math.floor((Math.min(hi, Math.max(lo, d)) - lo) / bw)))]++;
    });
    var maxc = Math.max.apply(null, bins);
    var X = function (v) { return ml + (v - lo) / (hi - lo || 1) * (w - ml - mr); };
    var svg = svgEl('svg', { viewBox: '0 0 ' + w + ' ' + h, class: 'bvi-svg', role: 'img', 'aria-label': 'Distribution of the outcome gap across simulated return paths' });
    svg.appendChild(svgEl('rect', { x: 0, y: 0, width: w, height: h, fill: '#ffffff' }));
    bins.forEach(function (c, i) {
      var x0 = X(lo + i * bw), x1 = X(lo + (i + 1) * bw), bh = c / maxc * (h - mt - mb);
      svg.appendChild(svgEl('rect', {
        x: x0 + 1, y: h - mb - bh, width: Math.max(1, x1 - x0 - 2), height: bh, rx: 2,
        fill: (lo + (i + 0.5) * bw) >= 0 ? C.a : C.b, opacity: .82
      }));
    });
    svg.appendChild(svgEl('line', { x1: X(0), x2: X(0), y1: mt, y2: h - mb, stroke: C.text, 'stroke-width': 2, 'stroke-dasharray': '5 4' }));
    var z = svgEl('text', { x: X(0), y: mt + 12, 'text-anchor': 'middle', fill: C.text, 'font-size': 12, 'font-weight': 700, 'font-family': 'Inter, sans-serif' });
    z.textContent = 'tie'; svg.appendChild(z);
    [lo, lo + (hi - lo) / 2, hi].forEach(function (v) {
      var t = svgEl('text', { x: X(v), y: h - mb + 20, 'text-anchor': 'middle', fill: C.faint, 'font-size': 12, 'font-family': 'Inter, sans-serif' });
      t.textContent = (v >= 0 ? '+' : '−') + f(Math.abs(v)); svg.appendChild(t);
    });
    var cap = svgEl('text', { x: ml, y: h - 8, fill: C.faint, 'font-size': 11.5, 'font-family': 'Inter, sans-serif' });
    cap.textContent = 'Final net worth: buying minus renting+investing, across ' + mc.n + ' simulated return paths. Blue bars = buying won that path.'
      + (clipped ? '  Axis clipped to the 1st–99th percentile; ' + clipped + ' extreme paths sit in the end bars.' : '');
    svg.appendChild(cap);
    host.appendChild(svg);
  }

  // ── rendering ─────────────────────────────────────────────────────────────
  var last = null, realMode = false, postTax = true;

  function run() {
    var o = readOpts(), s = E.simulate(o);
    last = { o: o, s: s };
    renderVerdict(o, s); renderCards(o, s); renderKpis(o, s);
    renderChart(o, s); renderTables(o, s); renderBreakdown(o, s); renderWarnings(o, s);
    renderSensitivity(o); renderNarrative(o, s);
    $('mcPanel').innerHTML = '<p class="bvi-muted">Volatility is the whole argument. Run it to see how often each answer actually wins.</p>' +
      '<button type="button" class="btn btn-primary" id="mcRun">Run 500 simulations</button>';
    $('mcRun').addEventListener('click', function () { runMonteCarlo(o); });
    try { localStorage.setItem('bvi.state', JSON.stringify(o)); } catch (e) {}
    var q = toQuery(o);
    history.replaceState(null, '', location.pathname + (q ? '?' + q : ''));
  }

  var timer = null;
  function schedule() { clearTimeout(timer); timer = setTimeout(run, 160); }

  function adj(v) { return realMode ? v / last.s.deflator : v; }

  function renderVerdict(o, s) {
    var gap = adj(s.gap), aWin = s.gap > 0;
    var who = aWin ? 'Buying the flat' : 'Renting and investing';
    $('verdict').className = 'bvi-verdict ' + (aWin ? 'is-a' : 'is-b');
    $('verdict').innerHTML =
      '<div class="bvi-verdict-main">' + who + ' ends ahead by <strong>' + f(Math.abs(gap)) + '</strong></div>' +
      '<div class="bvi-verdict-sub">After ' + o.years + ' years, both having paid the identical ' + f(adj(s.totalCommitted)) +
      ' — every rupee of EMI, rent, stamp duty, maintenance and tax accounted for, and both sides sold and taxed at the end.' +
      (realMode ? ' Shown in today’s money.' : '') + '</div>';
  }

  function renderCards(o, s) {
    var isLet = o.mode === 'letout';
    // A signed line only earns its sign when there is something there. Printing
    // "−₹0" for a loan that has already closed just reads as a bug.
    function less(v, suffix) { return (Math.abs(v) < 0.5 ? f(0) : '−' + f(v)) + (suffix || ''); }
    function plus(v) { return Math.abs(v) < 0.5 ? f(0) : '+' + f(v); }

    $('cardA').innerHTML =
      '<div class="bvi-card-tag">Person A · buys the flat</div>' +
      '<div class="bvi-big">' + f(adj(s.aNet)) + '</div>' +
      '<div class="bvi-card-sub">final net worth, after selling and paying tax</div>' +
      '<dl class="bvi-dl">' +
      row('Flat sells for', f(adj(s.finalProp))) +
      row('Less brokerage', less(adj(s.sellCost))) +
      row('Less capital-gains tax', less(adj(s.propGainTax), o.useSec54 ? ' <em>(rolled over)</em>' : '')) +
      row('Less loan outstanding', less(adj(s.outstanding))) +
      row('Plus side investments', plus(adj(s.aPort - s.aEqTax))) +
      '</dl>';

    // Card B's first two rows are the arithmetic that produces the headline;
    // the rest is context, so it sits below a divider rather than looking like
    // a subtraction that has already been applied twice.
    $('cardB').innerHTML =
      '<div class="bvi-card-tag">Person B · rents' + (isLet ? ' the same as A' : ' and invests') + '</div>' +
      '<div class="bvi-big">' + f(adj(s.bNet)) + '</div>' +
      '<div class="bvi-card-sub">final net worth, after redeeming and paying tax</div>' +
      '<dl class="bvi-dl">' +
      row('Portfolio value', f(adj(s.bPort))) +
      row('Less LTCG tax', less(adj(s.bEqTax))) +
      '</dl><dl class="bvi-dl bvi-dl-ctx">' +
      row('Total actually invested', f(adj(s.bContrib))) +
      row(isLet ? 'Rent on own home' : 'Rent paid over the period',
          isLet ? 'same as A, so it cancels' : f(adj(s.cum.rentPaid))) +
      row('Fund fees', o.expenseRatio + '% a year, netted off the return') +
      '</dl>';
  }
  function row(k, v) { return '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>'; }

  function renderKpis(o, s) {
    var bp = E.solveBreakeven(o, 'property'), be = E.solveBreakeven(o, 'equity');
    function bshow(r) { return r.rate === null ? 'above 30%' : r.note === 'below' ? 'already ahead' : r.rate.toFixed(2) + '%'; }
    $('kpis').innerHTML =
      kpi('Return on money committed — buying', fp(s.aIRR), 'IRR on the identical cash schedule') +
      kpi('Return on money committed — investing', fp(s.bIRR), 'IRR on the identical cash schedule') +
      kpi('Property CAGR needed to tie', bshow(bp), 'holding everything else fixed') +
      kpi('Equity return needed to tie', bshow(be), 'holding everything else fixed') +
      kpi('EMI', f(s.emi) + '/mo', s.loanClosedMonth ? 'loan closes in year ' + Math.ceil(s.loanClosedMonth / 12) : 'runs the full tenure') +
      kpi('Rent yield by year ' + o.years, s.finalRentYield.toFixed(2) + '%', 'started at ' + o.rentYieldPct + '%');
  }
  function kpi(k, v, s2) { return '<div class="bvi-kpi"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="s">' + s2 + '</div></div>'; }

  function renderChart(o, s) {
    var A = postTax ? s.series.aNet : s.series.aGross, Bs = postTax ? s.series.bNet : s.series.bGross;
    if (realMode) {
      A = A.map(function (v, i) { return v / Math.pow(1 + o.inflation / 100, s.series.year[i]); });
      Bs = Bs.map(function (v, i) { return v / Math.pow(1 + o.inflation / 100, s.series.year[i]); });
    }
    lineChart($('chart'), {
      x: s.series.year,
      xLabel: function (y) { return 'Y' + y; },
      tipTitle: function (i) { return 'Year ' + s.series.year[i] + ' · age ' + Math.round(s.series.age[i]); },
      ariaLabel: 'Net worth of the buyer and the renter-investor over ' + o.years + ' years',
      series: [
        { label: 'Buys the flat', data: A, color: C.a, fill: C.aFill },
        { label: 'Rents + invests', data: Bs, color: C.b }
      ]
    });
    $('chartNote').textContent = (postTax ? 'Both lines are shown net of the tax and selling costs you would pay if you liquidated that year. ' : 'Both lines are gross — no exit tax or selling cost applied. ')
      + (realMode ? 'Values are deflated to today’s money.' : 'Values are in future rupees.');
  }

  function renderSensitivity(o) {
    var rows = [], cols = [];
    for (var i = -3; i <= 3; i++) rows.push(Math.max(0, o.propCagr + i));
    for (var j = -3; j <= 3; j++) cols.push(Math.max(0, o.equityCagr + j));
    heatmap($('heat'), E.sensitivity(o, rows, cols), rows, cols);
  }

  function runMonteCarlo(o) {
    var p = $('mcPanel');
    p.innerHTML = '<p class="bvi-muted">Simulating 500 return paths…</p>';
    setTimeout(function () {
      var eqVol = parseFloat($('eqVol').value) || 16, prVol = parseFloat($('prVol').value) || 8;
      var mc = E.monteCarlo(o, 500, eqVol, prVol, 20260823);
      var det = E.simulate(o);
      p.innerHTML =
        '<div class="bvi-mc-head"><div class="bvi-mc-prob"><span>' + Math.round(mc.aWinProb * 100) + '%</span>' +
        '<p>of simulated paths where <strong>buying</strong> ends ahead</p></div>' +
        '<div class="bvi-mc-prob alt"><span>' + Math.round((1 - mc.aWinProb) * 100) + '%</span>' +
        '<p>of paths where <strong>renting + investing</strong> ends ahead</p></div></div>' +
        '<div class="bvi-tablewrap"><table class="bvi-table"><caption class="bvi-cap">Final net worth across 500 simulated return paths</caption><thead><tr>' +
        '<th scope="col">Outcome</th><th scope="col">Bad case (10th pct)</th><th scope="col">Median</th><th scope="col">Good case (90th pct)</th><th scope="col">Single-line estimate</th></tr></thead><tbody>' +
        '<tr><th scope="row">Buys the flat</th><td>' + f(mc.a.p10) + '</td><td>' + f(mc.a.p50) + '</td><td>' + f(mc.a.p90) + '</td><td>' + f(det.aNet) + '</td></tr>' +
        '<tr><th scope="row">Rents + invests</th><td>' + f(mc.b.p10) + '</td><td>' + f(mc.b.p50) + '</td><td>' + f(mc.b.p90) + '</td><td>' + f(det.bNet) + '</td></tr>' +
        '</tbody></table></div><div id="mcHist" class="bvi-chartbox"></div>' +
        '<p class="bvi-muted">The median sits below the single-line estimate on both sides. That gap is volatility drag — it is real, and a smooth CAGR line hides it. ' +
        'Notice too which asset protects the downside and which one owns the upside; they are usually not the same one.</p>';
      histogram($('mcHist'), mc);
    }, 20);
  }

  function renderTables(o, s) {
    var h = '<thead><tr><th scope="col">Year</th><th scope="col">Age</th><th scope="col">Flat worth</th><th scope="col">Loan left</th>' +
      '<th scope="col">Buyer net worth</th><th scope="col">Investor portfolio</th><th scope="col">Rent/mo</th>' +
      '<th scope="col">Paid that year</th><th scope="col">Ahead</th></tr></thead><tbody>';
    for (var i = 0; i < s.yearly.length; i++) {
      var y = s.yearly[i], an = s.series.aNet[i + 1], bn = s.series.bNet[i + 1];
      var lead = an - bn;
      h += '<tr><td>' + y.year + '</td><td>' + Math.round(y.age) + '</td><td>' + f(y.prop) + '</td><td>' + f(y.loan) + '</td>' +
        '<td>' + f(an) + '</td><td>' + f(bn) + '</td><td>' + f(y.rent) + '</td><td>' + f(y.agg.budget) + '</td>' +
        '<td class="' + (lead >= 0 ? 'lead-a' : 'lead-b') + '">' + (lead >= 0 ? 'Buyer ' : 'Investor ') + f(Math.abs(lead)) + '</td></tr>';
    }
    $('yearTable').innerHTML = h + '</tbody>';
  }

  function renderBreakdown(o, s) {
    var isLet = o.mode === 'letout';
    var items = [
      ['Down payment', s.down], ['Stamp duty, registration, other', s.buyFriction],
      ['Total interest paid to the bank', s.cum.interest], ['Principal repaid', s.cum.principal],
      ['Society maintenance', s.cum.maint], ['Municipal property tax', s.cum.propTax],
      ['Major repairs', s.cum.repair],
      [isLet ? 'Rent received' : 'Rent paid by the investor', isLet ? s.cum.rentReceived : s.cum.rentPaid],
      ['Income-tax benefit claimed', s.cum.taxBenefit], ['Tax paid on rental income', s.cum.rentTax],
      ['Capital-gains tax on the flat', s.propGainTax], ['Capital-gains tax on the fund', s.bEqTax],
      ['Brokerage on sale', s.sellCost]
    ];
    var h = '<thead><tr><th scope="col">Over the full ' + o.years + ' years</th><th scope="col">Amount</th></tr></thead><tbody>';
    items.forEach(function (it) { if (Math.abs(it[1]) > 0.5) h += '<tr><th scope="row">' + it[0] + '</th><td>' + f(adj(it[1])) + '</td></tr>'; });
    h += '<tr class="bvi-tr-total"><th scope="row">Cash committed by each person</th><td>' + f(adj(s.totalCommitted)) + '</td></tr>';
    $('breakTable').innerHTML = h + '</tbody>';
  }

  function renderWarnings(o, s) {
    var w = [];
    if (s.negAmortWarn) w.push(['bad', 'At this rate and tenure the EMI does not cover the interest. The loan would never amortise — raise the tenure or lower the rate.']);
    if (o.loanTenure > o.years) w.push(['warn', 'Your loan runs ' + (o.loanTenure - o.years) + ' years past your horizon, so ' + f(s.outstanding) + ' of principal is settled out of the sale proceeds.']);
    if (s.finalRentYield < o.rentYieldPct * 0.6) w.push(['warn', 'Rent growth of ' + o.rentGrowthPct + '% lags price growth of ' + o.propCagr + '%, so the yield drifts from ' + o.rentYieldPct + '% down to ' + s.finalRentYield.toFixed(2) + '%. Rents and prices rarely diverge that far for that long — consider raising rent growth or lowering appreciation.']);
    if (s.finalRentYield > o.rentYieldPct * 1.8) w.push(['warn', 'The implied yield climbs to ' + s.finalRentYield.toFixed(2) + '% by year ' + o.years + '. That is a very high yield for Indian residential property.']);
    if (o.regime === 'old' && o.mode === 'self' && o.sec80cHeadroom >= 150000) w.push(['warn', 'You are claiming the full ₹1.5 L of 80C against home-loan principal. If EPF, insurance or ELSS already use part of that limit, reduce the headroom or you will overstate the benefit of buying.']);
    if (o.useSec54) w.push(['warn', 'Sec 54 rollover is on, so no capital-gains tax is charged on the flat. Remember the proceeds are then locked into another property — that is not the same as money in your hand.']);
    if (o.propCagr > 12) w.push(['warn', 'A ' + o.propCagr + '% long-run property CAGR is well above what Indian residential prices have delivered over most 20-year windows.']);
    if (o.expenseRatio < 0.3) w.push(['warn', 'An expense ratio under 0.3% is optimistic for an actively managed fund. Index funds get close; regular plans are 1.5–2.2%.']);
    $('warnings').innerHTML = w.map(function (x) { return '<li class="w-' + x[0] + '">' + x[1] + '</li>'; }).join('');
    $('warnBox').hidden = w.length === 0;
  }

  function renderNarrative(o, s) {
    var isLet = o.mode === 'letout', aWin = s.gap > 0;
    var bp = E.solveBreakeven(o, 'property');
    var h = '<p>On these assumptions ' + (aWin ? '<strong>buying wins</strong>' : '<strong>renting and investing wins</strong>') +
      ' by ' + f(Math.abs(s.gap)) + ' over ' + o.years + ' years — ' + f(Math.abs(s.gap) / s.deflator) + ' in today’s money.</p>';
    h += '<p>Both people commit ' + f(s.totalCommitted) + ' in total, starting with the same ' + f(s.cash0) +
      ' on day one. ' + (isLet
        ? 'Because the flat is let out, both of them pay rent for their own home, so that cost cancels and what is really being compared is the EMI-and-costs bill net of rent received.'
        : 'Person A lives in the flat and pays the EMI; Person B rents an equivalent home and invests whatever A is paying above that rent. When the loan closes, the flow reverses and A starts investing the rent they no longer have to pay.') + '</p>';
    h += '<p>Of the ' + f(s.cum.emi) + ' handed to the bank, ' + f(s.cum.interest) + ' is interest — ' +
      Math.round(s.cum.interest / (s.cum.emi || 1) * 100) + '% of every EMI rupee. Stamp duty and registration alone cost ' + f(s.buyFriction) +
      ' up front, which is money Person B gets to compound from day one.</p>';
    if (bp.note === 'ok' && bp.rate !== null) {
      h += '<p>For buying to break even, the flat would need to appreciate at <strong>' + bp.rate.toFixed(2) + '% a year</strong> instead of ' + o.propCagr + '%. ' +
        'Whether that is realistic for your city, over your horizon, is the actual question — not anything this calculator can answer for you.</p>';
    }
    $('narrative').innerHTML = h;
  }

  // ── exports ───────────────────────────────────────────────────────────────
  function exportCsv() {
    if (!last) return;
    var o = last.o, s = last.s;
    var lines = [['Vatayan Labs — Buy vs Invest'], ['Generated', new Date().toISOString().slice(0, 10)], []];
    lines.push(['Assumptions']);
    Object.keys(o).forEach(function (k) { lines.push([k, o[k]]); });
    lines.push([], ['Year', 'Age', 'Flat value', 'Loan outstanding', 'Buyer net worth', 'Investor net worth', 'Monthly rent', 'Cash paid that year', 'Buyer lead']);
    for (var i = 0; i < s.yearly.length; i++) {
      var y = s.yearly[i];
      lines.push([y.year, Math.round(y.age), Math.round(y.prop), Math.round(y.loan),
        Math.round(s.series.aNet[i + 1]), Math.round(s.series.bNet[i + 1]),
        Math.round(y.rent), Math.round(y.agg.budget), Math.round(s.series.aNet[i + 1] - s.series.bNet[i + 1])]);
    }
    lines.push([], ['Result'], ['Buyer final net worth', Math.round(s.aNet)], ['Investor final net worth', Math.round(s.bNet)],
      ['Gap', Math.round(s.gap)], ['Buyer IRR', s.aIRR], ['Investor IRR', s.bIRR]);
    var csv = lines.map(function (r) {
      return r.map(function (c) { var v = String(c); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',');
    }).join('\n');
    download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'vatayan-buy-vs-invest.csv');
  }

  function exportPng() {
    var svg = $('chart').querySelector('svg'); if (!svg) return;
    var clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    var str = new XMLSerializer().serializeToString(clone);
    var img = new Image(), scale = 2;
    img.onload = function () {
      var cv = document.createElement('canvas');
      cv.width = W * scale; cv.height = H * scale;
      var cx = cv.getContext('2d');
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
      cx.drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob(function (b) { download(b, 'vatayan-buy-vs-invest.png'); });
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 0);
  }

  function copyLink() {
    var url = location.href;
    var done = function () { var b = $('btnLink'); var t = b.textContent; b.textContent = 'Link copied'; setTimeout(function () { b.textContent = t; }, 1800); };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, done);
    else { var ta = document.createElement('textarea'); ta.value = url; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(); }
  }

  // ── tabs ──────────────────────────────────────────────────────────────────
  function initTabs() {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.bvi-tab'));
    tabs.forEach(function (t) {
      t.addEventListener('click', function () { select(t); });
      t.addEventListener('keydown', function (ev) {
        var i = tabs.indexOf(t), n = null;
        if (ev.key === 'ArrowRight') n = tabs[(i + 1) % tabs.length];
        if (ev.key === 'ArrowLeft') n = tabs[(i - 1 + tabs.length) % tabs.length];
        if (n) { ev.preventDefault(); n.focus(); select(n); }
      });
    });
    function select(t) {
      tabs.forEach(function (x) {
        var on = x === t;
        x.classList.toggle('is-on', on);
        x.setAttribute('aria-selected', on ? 'true' : 'false');
        x.tabIndex = on ? 0 : -1;
        $(x.getAttribute('aria-controls')).hidden = !on;
      });
    }
  }

  // ── boot ──────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    buildForm();
    initTabs();
    var st = fromQuery();
    if (!st) { try { var raw = localStorage.getItem('bvi.state'); if (raw) st = JSON.parse(raw); } catch (e) {} }
    if (st) writeOpts(st);

    $('btnReset').addEventListener('click', function () {
      try { localStorage.removeItem('bvi.state'); } catch (e) {}
      writeOpts(E.defaults()); run();
    });
    $('btnLink').addEventListener('click', copyLink);
    $('btnCsv').addEventListener('click', exportCsv);
    $('btnPng').addEventListener('click', exportPng);
    $('tgReal').addEventListener('change', function () { realMode = this.checked; run(); });
    $('tgPostTax').addEventListener('change', function () { postTax = this.checked; run(); });
    run();
  });
})();
