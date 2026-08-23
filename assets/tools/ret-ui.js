/* Vatayan Labs — Retirement & Life Goals, UI layer.
   Form + goal editor + SVG charts + URL state. No chart library. */
(function () {
  'use strict';
  var E = window.RET, f = E.fmtINR, fw = E.fmtWords, fg = E.fmtGrouped;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };

  var C = {
    epf: '#0891b2', nps: '#7c3aed', goal: '#1d4ed8', spend: '#dc2626',
    ok: '#059669', warn: '#d97706', bad: '#dc2626',
    grid: '#e2e8f0', faint: '#94a3b8', text: '#334155'
  };

  // ── numeric field spec ────────────────────────────────────────────────────
  var G = [
    { id: 'scenario', title: 'You', open: true, fields: [
      ['currentAge', 'Age today', '', 1, 'Everything is dated from here.'],
      ['retireAge', 'Retire at', '', 1, 'The year contributions stop and the drawdown begins.'],
      ['lastAge', 'Plan until age', '', 1, 'How long the money has to last. Planning to 85 when you live to 95 is the most expensive mistake in this whole calculation.']
    ]},
    { id: 'spend', title: 'Life after retirement', open: true, fields: [
      ['monthlySpendToday', 'Monthly spending, in today’s money', '₹', 5000, 'What that lifestyle costs at today’s prices. The tool inflates it to your retirement year and every year after.'],
      ['retireInflationPct', 'Inflation on that spending', '%', 0.25, 'Household inflation, which usually runs above headline CPI once healthcare is in the basket.'],
      ['postRetReturnPct', 'Return on the corpus in retirement', '%', 0.25, 'Lower than your accumulation return — the money is de-risked once you are living off it.'],
      ['bequestToday', 'Leave behind, in today’s money', '₹', 100000, 'Set to 0 if the corpus is meant to be fully spent.']
    ]},
    { id: 'income', title: 'Salary & EPF', open: true, fields: [
      ['basicMonthly', 'Monthly basic + DA', '₹', 5000, 'EPF is a share of basic, not of total CTC.'],
      ['salaryGrowthPct', 'Salary growth', '%', 0.5, 'Annual increment, compounding.'],
      ['epfOpening', 'EPF balance today', '₹', 50000, 'From your passbook.'],
      ['epfEmployeePct', 'Employee contribution', '%', 0.5, 'Statutory 12% of basic.'],
      ['epfEmployerPct', 'Employer contribution', '%', 0.5, 'Also 12%, but part of it is diverted to the pension scheme.'],
      ['epsDiversionPct', 'Of which diverted to EPS', '%', 0.01, '8.33% of basic goes to the pension scheme instead of your EPF balance — capped at the wage ceiling below.'],
      ['epsWageCeiling', 'EPS wage ceiling', '₹', 1000, 'The diversion is calculated on basic capped at this figure, which is why it stays small for higher salaries.'],
      ['epfRatePct', 'EPF interest rate', '%', 0.05, 'Declared annually by the EPFO.'],
      ['epsPensionMonthly', 'Expected EPS pension', '₹', 500, 'Indicative monthly pension from 58. Modest, and not inflation-linked.']
    ]},
    { id: 'nps', title: 'NPS', open: false, fields: [
      ['npsOpening', 'NPS balance today', '₹', 50000, 'Tier-I only. Tier-II is not locked and belongs in your goal pot.'],
      ['npsMonthly', 'Monthly contribution', '₹', 1000, ''],
      ['npsStepUpPct', 'Increase each year', '%', 1, ''],
      ['npsEquityPct', 'Equity allocation', '%', 5, 'Scheme E. Capped at 75% for most subscribers.'],
      ['npsGlideFromAge', 'Start de-risking at age', '', 1, 'Equity is reduced two percentage points a year from here.'],
      ['npsEquityFloorPct', 'Equity floor', '%', 5, 'The glide path stops here.'],
      ['npsEquityReturnPct', 'Equity return', '%', 0.25, ''],
      ['npsDebtReturnPct', 'Corporate + gilt return', '%', 0.25, ''],
      ['npsAnnuityPct', 'Must buy an annuity with', '%', 5, 'At least 40% of the NPS corpus has to be annuitised. That share is never a lump sum you can spend.'],
      ['annuityRatePct', 'Annuity rate', '%', 0.25, 'What the annuity pays each year on the corpus handed over.']
    ]},
    { id: 'invest', title: 'Your own investments', open: true, fields: [
      ['sipMonthly', 'Monthly SIP', '₹', 5000, 'This is the lever the tool solves for.'],
      ['sipStepUpPct', 'Step up each year', '%', 1, 'Raising the SIP with your income does more work than any return assumption.'],
      ['goalOpeningEquity', 'Equity holdings today', '₹', 50000, ''],
      ['goalOpeningDebt', 'Debt and cash today', '₹', 50000, ''],
      ['goalEquityPct', 'Equity share of new money', '%', 5, 'The rest goes to debt. Goals falling due soon should not be sitting in equity.'],
      ['equityReturnPct', 'Equity return', '%', 0.25, 'Before fees.'],
      ['debtReturnPct', 'Debt return', '%', 0.25, ''],
      ['expenseRatioPct', 'Expense ratio', '%', 0.05, 'Deducted from the equity return.']
    ]},
    { id: 'tax', title: 'Tax', open: false, fields: [
      ['marginalTaxPct', 'Marginal tax rate', '%', 1, 'Applied to annuity income and to any taxable part of the NPS lump sum.'],
      ['eqLtcgPct', 'Equity LTCG rate', '%', 0.5, 'Charged when you sell to fund a goal, and again on whatever is left at retirement.'],
      ['eqExemption', 'Equity LTCG exemption', '₹', 25000, 'Per year.'],
      ['npsLumpTaxFreePct', 'NPS lump sum tax-free', '%', 5, 'Of the total NPS corpus.']
    ]},
    { id: 'assume', title: 'Assumptions', open: false, fields: [
      ['inflationPct', 'General inflation', '%', 0.25, 'Used to restate future rupees in today’s money, and to inflate any goal set to a general rate.']
    ]}
  ];

  var ALL_NUM = []; G.forEach(function (g) { g.fields.forEach(function (fd) { ALL_NUM.push(fd[0]); }); });
  var BOOLS = ['epfEnabled', 'npsEnabled', 'npsGlide'];
  var RULES = { must: 'Must fund', defer: 'Can wait', scale: 'Can shrink' };
  var STATUS = {
    funded: ['Funded', C.ok], scaled: ['Part funded', C.warn],
    short: ['Short', C.bad], unfunded: ['Not funded', C.bad]
  };

  var state = null, timer = null;

  // ── form ──────────────────────────────────────────────────────────────────
  function buildForm() {
    var d = E.defaults(), host = $('retForm'), html = '';

    html += grp('target', 'What are you aiming at', true,
      '<div class="bvi-field"><label for="targetMode">How should the target be set?</label>' +
      '<select id="targetMode">' +
      '<option value="spend">Work it out from my retirement spending</option>' +
      '<option value="corpus">I have a corpus figure in mind</option>' +
      '</select></div>' +
      '<div class="bvi-field" id="targetCorpusField">' +
      '<label for="targetCorpus">Target corpus at retirement</label>' +
      '<div class="bvi-inwrap"><input type="number" id="targetCorpus" value="' + d.targetCorpus + '" step="1000000" inputmode="decimal" aria-describedby="a-targetCorpus h-targetCorpus">' +
      '<span class="bvi-unit" aria-hidden="true">₹</span></div>' +
      '<p class="bvi-amt" id="a-targetCorpus" aria-live="polite"></p>' +
      '<p class="bvi-help" id="h-targetCorpus">In the rupees of your retirement year, not today’s.</p></div>');

    G.forEach(function (g) {
      var inner = '';
      if (g.id === 'income') inner += check('epfEnabled', 'I have an EPF account', d.epfEnabled);
      if (g.id === 'nps') inner += check('npsEnabled', 'I contribute to NPS', d.npsEnabled);
      g.fields.forEach(function (fd) { inner += field(fd, d[fd[0]]); });
      if (g.id === 'nps') inner += check('npsGlide', 'Automatically de-risk with age', d.npsGlide);
      if (g.id === 'tax') inner += '<p class="bvi-note">Defaults reflect ' + E.TAX_AS_OF + '. Rates change with every Budget — check them before you rely on the answer.</p>';
      html += grp(g.id, g.title, g.open, inner);
    });

    host.innerHTML = html;
    host.addEventListener('click', function (ev) {
      var b = ev.target.closest('.bvi-grp-btn');
      if (b) { var gr = b.closest('.bvi-group'); b.setAttribute('aria-expanded', gr.classList.toggle('is-open') ? 'true' : 'false'); }
    });
    host.addEventListener('input', function () { updateWords(); schedule(); });
    host.addEventListener('change', function () { updateWords(); syncTargetMode(); schedule(); });
  }

  function grp(id, title, open, inner) {
    return '<div class="bvi-group' + (open ? ' is-open' : '') + '" id="grp-' + id + '">' +
      '<h3 class="bvi-grp-head"><button type="button" class="bvi-grp-btn" aria-expanded="' + (open ? 'true' : 'false') +
      '" aria-controls="body-' + id + '">' + title + '<span class="bvi-caret" aria-hidden="true"></span></button></h3>' +
      '<div class="bvi-grp-body" id="body-' + id + '">' + inner + '</div></div>';
  }
  function field(fd, val) {
    var id = fd[0], money = fd[2] === '₹';
    return '<div class="bvi-field' + (fd[2] ? ' has-unit' : '') + '">' +
      '<label for="' + id + '">' + fd[1] + '</label>' +
      '<div class="bvi-inwrap"><input type="number" id="' + id + '" value="' + val + '" step="' + fd[3] + '" inputmode="decimal" aria-describedby="' + (money ? 'a-' + id + ' ' : '') + 'h-' + id + '">' +
      (fd[2] ? '<span class="bvi-unit" aria-hidden="true">' + fd[2] + '</span>' : '') + '</div>' +
      (money ? '<p class="bvi-amt" id="a-' + id + '" aria-live="polite"></p>' : '') +
      (fd[4] ? '<p class="bvi-help" id="h-' + id + '">' + fd[4] + '</p>' : '<p class="bvi-help" id="h-' + id + '"></p>') + '</div>';
  }
  function check(id, label, on) {
    return '<div class="bvi-check"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '>' +
      '<label for="' + id + '">' + label + '</label></div>';
  }

  var MONEY_IDS = ['targetCorpus'];
  G.forEach(function (g) { g.fields.forEach(function (fd) { if (fd[2] === '₹') MONEY_IDS.push(fd[0]); }); });

  function updateWords() {
    MONEY_IDS.forEach(function (id) {
      var el = $(id), out = $('a-' + id);
      if (!el || !out) return;
      var v = parseFloat(el.value);
      out.textContent = el.value.trim() === '' || !isFinite(v) ? '' : fg(v) + '  ·  ' + fw(v);
    });
  }
  function syncTargetMode() {
    var byCorpus = $('targetMode').value === 'corpus';
    $('targetCorpusField').style.display = byCorpus ? '' : 'none';
  }

  // ── goal editor ───────────────────────────────────────────────────────────
  function renderGoals() {
    var host = $('goalList'), y0 = state.currentYear;
    if (!state.goals.length) {
      host.innerHTML = '<p class="bvi-muted">No goals yet. Add the big ones — a house, a car, each child’s education and marriage, the trip you keep postponing.</p>';
      return;
    }
    var sorted = state.goals.slice().sort(function (a, b) { return a.year - b.year || a.priority - b.priority; });
    host.innerHTML = sorted.map(function (g) {
      var future = E.fv(g.amountToday, g.inflPct, Math.max(0, g.year - y0));
      var cats = Object.keys(E.CATEGORIES).map(function (k) {
        return '<option value="' + k + '"' + (k === g.cat ? ' selected' : '') + '>' + E.CATEGORIES[k].label + '</option>';
      }).join('');
      var rules = Object.keys(RULES).map(function (k) {
        return '<option value="' + k + '"' + (k === g.rule ? ' selected' : '') + '>' + RULES[k] + '</option>';
      }).join('');
      return '<div class="goal-row" data-id="' + g.id + '">' +
        '<div class="goal-top">' +
        '<input class="goal-name" type="text" value="' + esc(g.name) + '" data-k="name" aria-label="Goal name">' +
        '<button type="button" class="goal-del" data-del="' + g.id + '" aria-label="Remove ' + esc(g.name) + '">×</button>' +
        '</div>' +
        '<div class="goal-grid">' +
        '<label>Cost today<div class="bvi-inwrap"><input type="number" value="' + g.amountToday + '" data-k="amountToday" step="50000" inputmode="decimal"><span class="bvi-unit">₹</span></div></label>' +
        '<label>Year<input type="number" value="' + g.year + '" data-k="year" step="1" inputmode="numeric"></label>' +
        '<label>Type<select data-k="cat">' + cats + '</select></label>' +
        '<label>Inflation<div class="bvi-inwrap"><input type="number" value="' + g.inflPct + '" data-k="inflPct" step="0.5" inputmode="decimal"><span class="bvi-unit">%</span></div></label>' +
        '<label>If money is short<select data-k="rule">' + rules + '</select></label>' +
        '<label>Priority<input type="number" value="' + g.priority + '" data-k="priority" min="1" max="9" step="1"></label>' +
        (g.rule === 'defer' ? '<label>Can wait up to<div class="bvi-inwrap"><input type="number" value="' + g.maxDefer + '" data-k="maxDefer" min="0" max="15" step="1"><span class="bvi-unit">yr</span></div></label>' : '') +
        (g.rule === 'scale' ? '<label>Not below<div class="bvi-inwrap"><input type="number" value="' + g.minFundPct + '" data-k="minFundPct" min="0" max="100" step="5"><span class="bvi-unit">%</span></div></label>' : '') +
        '</div>' +
        '<p class="goal-fv">' + fg(g.amountToday) + ' today &rarr; <strong>' + f(future) + '</strong> in ' + g.year +
        '<span> · ' + (g.year - y0) + ' years at ' + g.inflPct + '%</span></p>' +
        '</div>';
    }).join('');
  }

  function wireGoals() {
    var host = $('goalList');
    host.addEventListener('input', onGoalEdit);
    host.addEventListener('change', onGoalEdit);
    host.addEventListener('click', function (ev) {
      var d = ev.target.closest('[data-del]');
      if (!d) return;
      state.goals = state.goals.filter(function (g) { return g.id !== d.getAttribute('data-del'); });
      renderGoals(); run();
    });
    $('addGoal').addEventListener('click', function () {
      state.goals.push(E.goal('New goal', 'other', 500000, state.currentYear + 5, 'scale', 5, 2, 50));
      renderGoals(); run();
      var rows = host.querySelectorAll('.goal-name');
      if (rows.length) { var last = rows[rows.length - 1]; last.focus(); last.select(); }
    });
    $('addChild').addEventListener('click', function () {
      // Inline field rather than prompt(): a blocking modal is poor UX and some
      // browsers suppress it outright.
      var n = state.goals.filter(function (g) { return /^Child \d/.test(g.name); }).length / 4;
      var label = 'Child ' + (Math.floor(n) + 1);
      var age = parseInt($('childAge').value, 10);
      if (!isFinite(age) || age < 0) age = 0;
      E.childGoals(label, age, state.currentYear).forEach(function (g) { state.goals.push(g); });
      renderGoals(); run();
      $('goalList').scrollTop = $('goalList').scrollHeight;
    });
  }

  function onGoalEdit(ev) {
    var row = ev.target.closest('.goal-row'); if (!row) return;
    var k = ev.target.getAttribute('data-k'); if (!k) return;
    var g = state.goals.find(function (x) { return x.id === row.getAttribute('data-id'); }); if (!g) return;
    if (k === 'name') g.name = ev.target.value;
    else if (k === 'cat') {
      g.cat = ev.target.value;
      g.inflPct = E.CATEGORIES[g.cat].infl;      // adopt the category's default rate
      renderGoals();
    } else if (k === 'rule') { g.rule = ev.target.value; renderGoals(); }
    else {
      var v = parseFloat(ev.target.value);
      g[k] = isFinite(v) ? v : 0;
    }
    // refresh just this row's future-value line while typing
    if (k === 'amountToday' || k === 'year' || k === 'inflPct') {
      var fvEl = row.querySelector('.goal-fv');
      var future = E.fv(g.amountToday, g.inflPct, Math.max(0, g.year - state.currentYear));
      if (fvEl) fvEl.innerHTML = fg(g.amountToday) + ' today &rarr; <strong>' + f(future) + '</strong> in ' + g.year +
        '<span> · ' + (g.year - state.currentYear) + ' years at ' + g.inflPct + '%</span>';
    }
    schedule();
  }

  // ── read / write ──────────────────────────────────────────────────────────
  function readOpts() {
    var o = Object.assign(E.defaults(), state);
    ALL_NUM.concat(['targetCorpus']).forEach(function (k) {
      var el = $(k); if (!el) return;
      var v = parseFloat(el.value); o[k] = isFinite(v) ? v : 0;
    });
    BOOLS.forEach(function (k) { if ($(k)) o[k] = $(k).checked; });
    o.targetMode = $('targetMode').value;
    o.goals = state.goals;
    o.currentYear = state.currentYear;
    o.retireAge = Math.max(o.currentAge + 1, o.retireAge);
    o.lastAge = Math.max(o.retireAge, o.lastAge);
    return o;
  }
  function writeOpts(o) {
    ALL_NUM.concat(['targetCorpus']).forEach(function (k) { if ($(k) && o[k] !== undefined) $(k).value = o[k]; });
    BOOLS.forEach(function (k) { if ($(k) && o[k] !== undefined) $(k).checked = !!o[k]; });
    if (o.targetMode) $('targetMode').value = o.targetMode;
    state = { currentYear: o.currentYear, goals: o.goals.map(function (g) { return Object.assign({}, g); }) };
    syncTargetMode(); updateWords(); renderGoals();
  }

  // ── URL state ─────────────────────────────────────────────────────────────
  function toQuery(o) {
    var d = E.defaults(), parts = [];
    ALL_NUM.concat(['targetCorpus']).forEach(function (k) { if (o[k] !== d[k]) parts.push(k + '=' + o[k]); });
    BOOLS.forEach(function (k) { if (o[k] !== d[k]) parts.push(k + '=' + (o[k] ? 1 : 0)); });
    if (o.targetMode !== d.targetMode) parts.push('targetMode=' + o.targetMode);
    var gs = o.goals.map(function (g) {
      return [g.name.replace(/[~|]/g, '-'), g.cat, g.amountToday, g.year, g.rule, g.priority, g.maxDefer, g.minFundPct, g.inflPct].join('~');
    }).join('|');
    parts.push('g=' + encodeURIComponent(gs));
    return parts.join('&');
  }
  function fromQuery() {
    var q = location.search.replace(/^\?/, ''); if (!q) return null;
    var o = E.defaults(), got = false;
    q.split('&').forEach(function (kv) {
      var i = kv.indexOf('='); if (i < 0) return;
      var k = kv.slice(0, i), v = decodeURIComponent(kv.slice(i + 1));
      if (k === 'g') {
        got = true;
        o.goals = v ? v.split('|').map(function (row) {
          var p = row.split('~');
          var g = E.goal(p[0], p[1], parseFloat(p[2]), parseInt(p[3], 10), p[4], parseInt(p[5], 10), parseInt(p[6], 10), parseFloat(p[7]));
          if (p[8] !== undefined && isFinite(parseFloat(p[8]))) g.inflPct = parseFloat(p[8]);
          return g;
        }) : [];
      } else if (k === 'targetMode') { o[k] = v; got = true; }
      else if (BOOLS.indexOf(k) >= 0) { o[k] = v === '1'; got = true; }
      else if (ALL_NUM.indexOf(k) >= 0 || k === 'targetCorpus') {
        var n = parseFloat(v); if (isFinite(n)) { o[k] = n; got = true; }
      }
    });
    return got ? o : null;
  }

  // ── SVG helpers ───────────────────────────────────────────────────────────
  function el(tag, a) { var e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (var k in a) if (a[k] != null) e.setAttribute(k, a[k]); return e; }
  function ticks(min, max, n) {
    var span = max - min || 1, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var nm = raw / mag, step = mag * (nm <= 1 ? 1 : nm <= 2 ? 2 : nm <= 5 ? 5 : 10), t = [];
    for (var v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) t.push(v);
    return t;
  }
  var W = 920, H = 400, MG = { t: 20, r: 18, b: 36, l: 78 };

  function frame(host, xs, hi, ariaLabel, xLabel) {
    host.innerHTML = '';
    var iw = W - MG.l - MG.r, ih = H - MG.t - MG.b, n = xs.length;
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'bvi-svg', role: 'img', 'aria-label': ariaLabel, preserveAspectRatio: 'xMidYMid meet' });
    svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: '#fff' }));
    var X = function (i) { return MG.l + (n <= 1 ? 0 : i / (n - 1) * iw); };
    var Y = function (v) { return MG.t + ih - (v / (hi || 1)) * ih; };
    ticks(0, hi, 5).forEach(function (v) {
      svg.appendChild(el('line', { x1: MG.l, x2: W - MG.r, y1: Y(v), y2: Y(v), stroke: C.grid, 'stroke-width': 1 }));
      var t = el('text', { x: MG.l - 9, y: Y(v) + 4, 'text-anchor': 'end', fill: C.faint, 'font-size': 12, 'font-family': 'Inter, sans-serif' });
      t.textContent = f(v, v >= 1e7 ? 1 : 0); svg.appendChild(t);
    });
    var step = Math.max(1, Math.ceil(n / 12));
    for (var i = 0; i < n; i += step) {
      var tx = el('text', { x: X(i), y: H - 12, 'text-anchor': 'middle', fill: C.faint, 'font-size': 12, 'font-family': 'Inter, sans-serif' });
      tx.textContent = xLabel ? xLabel(xs[i]) : xs[i]; svg.appendChild(tx);
    }
    host.appendChild(svg);
    return { svg: svg, X: X, Y: Y, iw: iw, ih: ih, n: n };
  }

  function stackChart(host, s, o) {
    var xs = s.series.year;
    var tot = s.series.total, hi = Math.max.apply(null, tot) * 1.08;
    var fr = frame(host, xs, hi, 'Wealth building up across EPF, NPS and your own investments', function (y) { return y; });
    var bands = [
      { key: 'epf', label: 'EPF', color: C.epf },
      { key: 'nps', label: 'NPS', color: C.nps },
      { key: 'goalPot', label: 'Your investments', color: C.goal }
    ];
    var base = new Array(fr.n).fill(0);
    bands.forEach(function (b) {
      var top = base.map(function (v, i) { return v + s.series[b.key][i]; });
      var d = '';
      for (var i = 0; i < fr.n; i++) d += (i ? 'L' : 'M') + fr.X(i) + ' ' + fr.Y(top[i]);
      for (var j = fr.n - 1; j >= 0; j--) d += 'L' + fr.X(j) + ' ' + fr.Y(base[j]);
      fr.svg.appendChild(el('path', { d: d + 'Z', fill: b.color, opacity: .82, stroke: '#fff', 'stroke-width': .6 }));
      base = top;
    });
    // a tick wherever a goal takes money out
    s.plan.forEach(function (g) {
      if (!g.paid) return;
      var i = xs.indexOf(g.year); if (i < 0) return;
      fr.svg.appendChild(el('line', { x1: fr.X(i), x2: fr.X(i), y1: MG.t + fr.ih - 14, y2: MG.t + fr.ih, stroke: C.spend, 'stroke-width': 2.5 }));
    });
    var lx = MG.l + 6;
    bands.forEach(function (b) {
      fr.svg.appendChild(el('rect', { x: lx, y: MG.t + 2, width: 11, height: 11, rx: 2, fill: b.color }));
      var t = el('text', { x: lx + 16, y: MG.t + 12, fill: C.text, 'font-size': 12, 'font-weight': 600, 'font-family': 'Inter, sans-serif' });
      t.textContent = b.label; fr.svg.appendChild(t); lx += 16 + b.label.length * 7 + 18;
    });
    hover(host, fr, xs, function (i) {
      return '<strong>' + xs[i] + ' · age ' + Math.round(s.series.age[i]) + '</strong>' +
        bands.map(function (b) { return '<span><i style="background:' + b.color + '"></i>' + b.label + '<b>' + f(s.series[b.key][i]) + '</b></span>'; }).join('') +
        '<span><i style="background:#0f172a"></i>Total<b>' + f(tot[i]) + '</b></span>';
    });
  }

  function drawChart(host, s) {
    var path = s.draw.path;
    var xs = path.map(function (p) { return p.year; });
    var vals = path.map(function (p) { return p.balance; });
    var hi = Math.max.apply(null, vals) * 1.1 || 1;
    var fr = frame(host, xs, hi, 'The retirement corpus being drawn down', function (y) { return y; });
    var d = '';
    for (var i = 0; i < fr.n; i++) d += (i ? 'L' : 'M') + fr.X(i) + ' ' + fr.Y(vals[i]);
    fr.svg.appendChild(el('path', { d: d + 'L' + fr.X(fr.n - 1) + ' ' + fr.Y(0) + 'L' + fr.X(0) + ' ' + fr.Y(0) + 'Z', fill: 'rgba(29,78,216,.10)' }));
    fr.svg.appendChild(el('path', { d: d, fill: 'none', stroke: s.draw.lasts ? C.ok : C.bad, 'stroke-width': 3, 'stroke-linejoin': 'round' }));
    if (s.draw.depletedYear !== null) {
      var di = xs.findIndex(function (y) { return y >= s.draw.depletedYear; });
      if (di > 0) {
        fr.svg.appendChild(el('line', { x1: fr.X(di), x2: fr.X(di), y1: MG.t, y2: MG.t + fr.ih, stroke: C.bad, 'stroke-width': 2, 'stroke-dasharray': '5 4' }));
        var t = el('text', { x: fr.X(di) - 8, y: MG.t + 16, 'text-anchor': 'end', fill: C.bad, 'font-size': 12.5, 'font-weight': 700, 'font-family': 'Inter, sans-serif' });
        t.textContent = 'money runs out'; fr.svg.appendChild(t);
      }
    }
    hover(host, fr, xs, function (i) {
      return '<strong>' + xs[i] + '</strong>' +
        '<span><i style="background:' + C.goal + '"></i>Corpus left<b>' + f(vals[i]) + '</b></span>' +
        (path[i].spend ? '<span><i style="background:' + C.spend + '"></i>Spent that year<b>' + f(path[i].spend) + '</b></span>' : '');
    });
  }

  function hover(host, fr, xs, body) {
    var guide = el('line', { x1: 0, x2: 0, y1: MG.t, y2: MG.t + fr.ih, stroke: C.faint, 'stroke-width': 1, opacity: 0 });
    fr.svg.appendChild(guide);
    var tip = document.createElement('div'); tip.className = 'bvi-tip'; tip.hidden = true; host.appendChild(tip);
    fr.svg.addEventListener('mousemove', function (ev) {
      var r = fr.svg.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * W;
      var i = Math.max(0, Math.min(fr.n - 1, Math.round((px - MG.l) / (fr.iw || 1) * (fr.n - 1))));
      guide.setAttribute('x1', fr.X(i)); guide.setAttribute('x2', fr.X(i)); guide.setAttribute('opacity', .5);
      tip.innerHTML = body(i); tip.hidden = false;
      tip.style.left = Math.min(Math.max(fr.X(i) / W * r.width, 80), r.width - 80) + 'px';
    });
    fr.svg.addEventListener('mouseleave', function () { guide.setAttribute('opacity', 0); tip.hidden = true; });
  }

  // ── render ────────────────────────────────────────────────────────────────
  var last = null;
  function schedule() { clearTimeout(timer); timer = setTimeout(run, 200); }

  function run() {
    var o = readOpts(), s = E.simulate(o);
    last = { o: o, s: s };
    var target = o.targetMode === 'corpus' ? o.targetCorpus : s.corpusNeeded;
    var gap = s.corpus - target;

    // Both solvers re-run the whole projection dozens of times. Compute each
    // once per cycle and hand the answer to whoever needs it.
    var req = E.solveRequiredSip(o);
    var altAge = gap >= 0 ? null : E.solveRetireAge(o);

    renderVerdict(o, s, target, gap);
    renderCards(o, s, target);
    renderKpis(o, s, target, gap, req, altAge);
    stackChart($('chartWealth'), s, o);
    drawChart($('chartDraw'), s);
    renderGoalTable(o, s);
    renderFlow(o, s);
    renderNarrative(o, s, target, gap, req);
    renderWarnings(o, s, target, gap);

    try { localStorage.setItem('ret.state', JSON.stringify(o)); } catch (e) {}
    history.replaceState(null, '', location.pathname + '?' + toQuery(o));
  }

  function renderVerdict(o, s, target, gap) {
    var onTrack = gap >= 0;
    var v = $('verdict');
    v.className = 'bvi-verdict ' + (onTrack ? 'is-ok' : 'is-bad');
    v.innerHTML = '<div class="bvi-verdict-main">' +
      (onTrack
        ? 'On track — you land <strong>' + f(gap) + '</strong> ahead of what this plan needs'
        : 'Short by <strong>' + f(-gap) + '</strong> at retirement') +
      '</div><div class="bvi-verdict-sub">' +
      'Retiring in ' + s.retireYear + ' at ' + o.retireAge + ', planning to age ' + o.lastAge + '. ' +
      'Usable corpus ' + f(s.corpus) + ' against ' + f(target) + ' needed' +
      (o.targetMode === 'spend' ? ' to fund ' + f(o.monthlySpendToday) + '/month in today’s money for ' + s.yearsInRetirement + ' years' : '') +
      '. Your ' + s.goalStats.total + ' life goals take ' + f(s.cum.goalsPaid) + ' out along the way.' +
      '</div>';
  }

  function renderCards(o, s, target) {
    $('cardHave').innerHTML =
      '<div class="bvi-card-tag">What you land on</div>' +
      '<div class="bvi-big">' + f(s.corpus) + '</div>' +
      '<div class="bvi-card-sub">usable at retirement · ' + f(s.corpusToday) + ' in today’s money</div>' +
      '<dl class="bvi-dl">' +
      r('EPF (tax-free on maturity)', f(s.epf)) +
      r('NPS lump sum, after tax', f(s.npsLumpNet)) +
      r('Your investments, after LTCG', f(s.goalPotNet)) +
      '</dl><dl class="bvi-dl bvi-dl-ctx">' +
      r('NPS locked into an annuity', f(s.npsAnnuityCorpus)) +
      r('…which pays', f(s.annuityMonthlyNet) + '/mo net') +
      r('EPS pension', f(s.epsMonthly) + '/mo') +
      '</dl>';
    $('cardNeed').innerHTML =
      '<div class="bvi-card-tag">What the plan needs</div>' +
      '<div class="bvi-big">' + f(target) + '</div>' +
      '<div class="bvi-card-sub">' + (o.targetMode === 'corpus' ? 'the corpus you asked for' : 'to last from ' + s.retireYear + ' to ' + s.lastYear) + '</div>' +
      '<dl class="bvi-dl">' +
      r('First year’s spending', f(s.firstSpendMonthly) + '/mo') +
      r('Years to fund', s.yearsInRetirement) +
      r('Pension income offsets', f((s.annuityMonthlyNet + s.epsMonthly)) + '/mo') +
      '</dl><dl class="bvi-dl bvi-dl-ctx">' +
      r('In today’s money', f(target / Math.pow(1 + o.inflationPct / 100, s.yearsToRetire))) +
      r('Money lasts until', s.draw.lasts ? 'age ' + o.lastAge + ', with ' + f(s.draw.endBalance) + ' left'
        : '<span style="color:' + C.bad + '">age ' + Math.round(o.retireAge + s.draw.yearsCovered) + '</span>') +
      '</dl>';
  }
  function r(k, v) { return '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>'; }

  function renderKpis(o, s, target, gap, req, age) {
    var h = '';
    h += kpi('You invest today', f(o.sipMonthly) + '/mo', 'stepping up ' + o.sipStepUpPct + '% a year');
    h += kpi('Required to hit the target', req === null ? 'out of reach' : f(req) + '/mo', 'holding everything else fixed');
    h += kpi('The gap', req === null ? '—' : (req - o.sipMonthly > 0 ? f(req - o.sipMonthly) + '/mo more' : 'none, you are ahead'),
      req === null ? 'no monthly figure gets you there' : 'starting now');
    h += kpi('Or retire at', age === null ? (gap >= 0 ? o.retireAge + ' as planned' : 'later than 75') : age,
      gap >= 0 ? 'already sufficient' : 'same contributions, longer runway');
    h += kpi('Corpus in today’s money', f(s.corpusToday), 'at ' + o.inflationPct + '% inflation');
    h += kpi('Goals funded', s.goalStats.funded + ' of ' + s.goalStats.total,
      s.goalStats.shortfall > 1 ? f(s.goalStats.shortfall) + ' short' : 'all met in full');
    $('kpis').innerHTML = h;
  }
  function kpi(k, v, s2) { return '<div class="bvi-kpi"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="s">' + s2 + '</div></div>'; }

  function renderGoalTable(o, s) {
    var h = '<thead><tr><th scope="col">Goal</th><th scope="col">Year</th><th scope="col">Cost today</th>' +
      '<th scope="col">Inflation</th><th scope="col">Cost then</th><th scope="col">Funded</th><th scope="col">Outcome</th></tr></thead><tbody>';
    s.plan.slice().sort(function (a, b) { return a.year - b.year; }).forEach(function (g) {
      var st = STATUS[g.status] || ['—', C.faint];
      h += '<tr><th scope="row">' + esc(g.name) + '</th>' +
        '<td>' + g.year + (g.deferred ? ' <span title="deferred ' + g.deferred + ' year(s)" style="color:' + C.warn + '">↷' + g.deferred + '</span>' : '') + '</td>' +
        '<td>' + f(g.amountToday) + '</td><td>' + g.inflPct + '%</td>' +
        '<td>' + f(g.required) + '</td><td>' + f(g.paid) + '</td>' +
        '<td style="color:' + st[1] + ';font-weight:600">' + st[0] + (g.shortfall > 1 ? ' · ' + f(g.shortfall) + ' short' : '') + '</td></tr>';
    });
    $('goalTable').innerHTML = h + '</tbody>';
  }

  function renderFlow(o, s) {
    var rows = [
      ['Your SIP contributions', s.cum.sip],
      ['EPF — your share', s.cum.epfEmployee],
      ['EPF — employer share', s.cum.epfEmployer],
      ['Diverted to EPS pension', s.cum.eps],
      ['NPS contributions', s.cum.nps],
      ['Spent on life goals', -s.cum.goalsPaid],
      ['LTCG paid funding goals', -s.cum.ltcg],
      ['LTCG paid at retirement', -s.goalEqTax]
    ];
    var h = '<thead><tr><th scope="col">Between now and ' + s.retireYear + '</th><th scope="col">Amount</th></tr></thead><tbody>';
    rows.forEach(function (x) {
      if (Math.abs(x[1]) < 1) return;
      h += '<tr><th scope="row">' + x[0] + '</th><td' + (x[1] < 0 ? ' style="color:' + C.bad + '"' : '') + '>' + f(x[1]) + '</td></tr>';
    });
    h += '<tr class="bvi-tr-total"><th scope="row">Usable corpus at retirement</th><td>' + f(s.corpus) + '</td></tr>';
    $('flowTable').innerHTML = h + '</tbody>';
  }

  function renderNarrative(o, s, target, gap, req) {
    var h = '';
    h += '<p>You are ' + o.currentAge + '. On these numbers you retire in <strong>' + s.retireYear + '</strong> with a usable corpus of <strong>' + f(s.corpus) + '</strong> — which is ' + f(s.corpusToday) + ' in today’s money, and that second figure is the one worth holding on to.</p>';
    h += '<p>It comes from three places that behave completely differently. EPF contributes ' + f(s.epf) + ' and is tax-free on maturity. NPS reaches ' + f(s.nps) + ', but only ' + f(s.npsLumpNet) + ' of that is money in your hand — the remaining ' + f(s.npsAnnuityCorpus) + ' is compelled into an annuity paying ' + f(s.annuityMonthlyNet) + ' a month after tax. Your own investments end at ' + f(s.goalPotNet) + ' after capital-gains tax, and they are the only pot that pays for anything before you turn 60.</p>';
    if (s.goalStats.total) {
      h += '<p>Your ' + s.goalStats.total + ' life goals draw ' + f(s.cum.goalsPaid) + ' out of that pot along the way. ' +
        (s.goalStats.shortfall > 1
          ? '<strong>' + f(s.goalStats.shortfall) + ' of it cannot be met</strong> — ' + (s.goalStats.unfunded + s.goalStats.short) + ' goal(s) fall short' + (s.goalStats.deferred ? ' and ' + s.goalStats.deferred + ' had to be pushed to a later year, which makes them more expensive' : '') + '.'
          : 'Every one of them is met in full' + (s.goalStats.deferred ? ', though ' + s.goalStats.deferred + ' had to be deferred — and a deferred goal costs more, because it keeps inflating while it waits' : '') + '.') + '</p>';
    }
    h += '<p>' + (gap >= 0
      ? 'The plan works: you finish <strong>' + f(gap) + '</strong> clear of what it needs, and the money lasts to age ' + o.lastAge + (s.draw.endBalance > 1 ? ' with ' + f(s.draw.endBalance) + ' still there' : '') + '.'
      : 'The plan does not close. You are <strong>' + f(-gap) + '</strong> short, and on this path the money runs out at age <strong>' + Math.round(o.retireAge + s.draw.yearsCovered) + '</strong> — ' + Math.round(o.lastAge - o.retireAge - s.draw.yearsCovered) + ' years earlier than you planned for.') + '</p>';
    if (req !== null && req > o.sipMonthly) {
      h += '<p>Closing it takes <strong>' + f(req) + ' a month</strong> instead of ' + f(o.sipMonthly) + ' — ' + f(req - o.sipMonthly) + ' more, starting now. Whether that is available is the part only you know.</p>';
    }
    $('narrative').innerHTML = h;
  }

  function renderWarnings(o, s, target, gap) {
    var w = [];
    if (o.lastAge - o.retireAge > 40) w.push(['warn', 'You are planning for ' + (o.lastAge - o.retireAge) + ' years of retirement. That is a long runway and it drives the corpus hard — worth checking it is deliberate.']);
    if (o.lastAge < 85) w.push(['warn', 'Planning only to age ' + o.lastAge + ' is optimistic. Indian life expectancy at 60 is already past 80, and half of people beat the average by definition. Outliving the plan is the risk that has no fix afterwards.']);
    var soon = s.plan.filter(function (g) { return g.year - o.currentYear <= 3 && g.paid > 0; });
    if (soon.length && o.goalEquityPct > 40) w.push(['warn', soon.length + ' goal(s) fall due within three years while ' + o.goalEquityPct + '% of new money goes to equity. Money you need that soon should not be exposed to a drawdown you have no time to recover from.']);
    if (o.npsAnnuityPct < 40) w.push(['bad', 'NPS rules require at least 40% of the corpus to be annuitised. Setting it lower overstates the money you will actually be able to spend.']);
    if (o.epfEnabled && o.basicMonthly < 15000) w.push(['warn', 'Basic pay below the EPS wage ceiling means almost the entire employer contribution is diverted to the pension scheme rather than your EPF balance.']);
    if (o.postRetReturnPct > o.equityReturnPct) w.push(['warn', 'You expect a higher return after retirement than before it. Usually it is the other way round, because the corpus gets de-risked once you are living off it.']);
    if (o.retireInflationPct < o.inflationPct) w.push(['warn', 'Retirement spending is set to inflate slower than general inflation. Healthcare tends to push it the other way.']);
    if (s.goalStats.unfunded) w.push(['bad', s.goalStats.unfunded + ' goal(s) cannot be funded at all on this plan.']);
    if (o.sipStepUpPct === 0) w.push(['warn', 'A flat SIP for ' + s.yearsToRetire + ' years assumes your income never rises. Even a 5% annual step-up changes the outcome more than most return assumptions do.']);
    $('warnings').innerHTML = w.map(function (x) { return '<li class="w-' + x[0] + '">' + x[1] + '</li>'; }).join('');
    $('warnBox').hidden = !w.length;
  }

  // ── exports ───────────────────────────────────────────────────────────────
  function exportCsv() {
    if (!last) return;
    var o = last.o, s = last.s, L = [['Vatayan Labs — Retirement & Life Goals'], ['Generated', new Date().toISOString().slice(0, 10)], []];
    L.push(['Assumptions']);
    Object.keys(o).forEach(function (k) { if (k !== 'goals') L.push([k, o[k]]); });
    L.push([], ['Goals'], ['Name', 'Category', 'Cost today', 'Year', 'Inflation %', 'Rule', 'Priority', 'Cost then', 'Funded', 'Status', 'Shortfall']);
    s.plan.forEach(function (g) {
      L.push([g.name, g.cat, g.amountToday, g.year, g.inflPct, g.rule, g.priority,
        Math.round(g.required), Math.round(g.paid), g.status, Math.round(g.shortfall)]);
    });
    L.push([], ['Accumulation'], ['Year', 'Age', 'EPF', 'NPS', 'Own investments', 'Total', 'Contributed', 'Goal spend']);
    s.series.year.forEach(function (y, i) {
      L.push([y, Math.round(s.series.age[i]), Math.round(s.series.epf[i]), Math.round(s.series.nps[i]),
        Math.round(s.series.goalPot[i]), Math.round(s.series.total[i]), Math.round(s.series.contribs[i]), Math.round(s.series.goalSpend[i])]);
    });
    L.push([], ['Retirement drawdown'], ['Year', 'Corpus left', 'Spent', 'Pension income']);
    s.draw.path.forEach(function (p) { L.push([p.year, Math.round(p.balance), Math.round(p.spend), Math.round(p.income)]); });
    L.push([], ['Result'], ['Usable corpus', Math.round(s.corpus)], ['Corpus needed', Math.round(s.corpusNeeded)],
      ['Money lasts', s.draw.lasts ? 'yes' : 'no, runs out ' + s.draw.depletedYear]);
    var csv = L.map(function (row) {
      return row.map(function (c) { var v = String(c); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',');
    }).join('\n');
    var b = new Blob([csv], { type: 'text/csv;charset=utf-8' }), u = URL.createObjectURL(b), a = document.createElement('a');
    a.href = u; a.download = 'vatayan-retirement-plan.csv'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 0);
  }

  function copyLink() {
    var b = $('btnLink'), t = b.textContent, done = function () { b.textContent = 'Link copied'; setTimeout(function () { b.textContent = t; }, 1800); };
    if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(done, done);
    else { var ta = document.createElement('textarea'); ta.value = location.href; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(); }
  }

  function initTabs() {
    var tabs = [].slice.call(document.querySelectorAll('.bvi-tab'));
    function sel(t) {
      tabs.forEach(function (x) {
        var on = x === t;
        x.classList.toggle('is-on', on); x.setAttribute('aria-selected', on ? 'true' : 'false');
        x.tabIndex = on ? 0 : -1; $(x.getAttribute('aria-controls')).hidden = !on;
      });
      if (last) { stackChart($('chartWealth'), last.s, last.o); drawChart($('chartDraw'), last.s); }
    }
    tabs.forEach(function (t) {
      t.addEventListener('click', function () { sel(t); });
      t.addEventListener('keydown', function (ev) {
        var i = tabs.indexOf(t), n = ev.key === 'ArrowRight' ? tabs[(i + 1) % tabs.length] : ev.key === 'ArrowLeft' ? tabs[(i - 1 + tabs.length) % tabs.length] : null;
        if (n) { ev.preventDefault(); n.focus(); sel(n); }
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    buildForm(); wireGoals(); initTabs();
    var st = fromQuery();
    if (!st) { try { var raw = localStorage.getItem('ret.state'); if (raw) st = JSON.parse(raw); } catch (e) {} }
    writeOpts(st || E.defaults());
    $('btnReset').addEventListener('click', function () {
      try { localStorage.removeItem('ret.state'); } catch (e) {}
      writeOpts(E.defaults()); run();
    });
    $('btnLink').addEventListener('click', copyLink);
    $('btnCsv').addEventListener('click', exportCsv);
    run();
  });
})();
