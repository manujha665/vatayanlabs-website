/* Vatayan Labs — Buy vs Invest engine
   Pure simulation. No DOM. Runs in the browser and in node (for the test suite).

   Design note — the whole point of this file:
   Person A (buys) and Person B (rents + invests) are held to an IDENTICAL cash
   budget every single month. budget(m) = max(A_need, B_need); whoever needs
   less than the budget invests the remainder. Both therefore commit the same
   rupee at the same time, and only the terminal wealth differs. Any comparison
   that gives one side rental income without charging the other side rent — or
   compounds their assets on different conventions — is not a comparison.
*/
(function (root) {
  'use strict';

  // ── helpers ───────────────────────────────────────────────────────────────
  var MONTHS = 12;

  // Effective monthly rate from a TRUE annual CAGR. Used for every asset, so
  // property and equity are never on different conventions.
  function monthlyFromCagr(annualPct) {
    return Math.pow(1 + annualPct / 100, 1 / MONTHS) - 1;
  }

  function emiFor(principal, annualRatePct, years) {
    var r = annualRatePct / 100 / MONTHS, n = Math.round(years * MONTHS);
    if (!principal || !n) return 0;
    if (Math.abs(r) < 1e-12) return principal / n;
    var f = Math.pow(1 + r, n);
    return principal * r * f / (f - 1);
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // Box–Muller
  function gauss(rng) {
    var u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /* Monthly lognormal return path whose EXPECTED compounding equals the given
     CAGR exactly. mu = ln(1+g)/12 - s^2/2 so that E[1+r] = (1+g)^(1/12).
     The median path therefore sits BELOW the deterministic line — that gap is
     volatility drag, and showing it is the point of the risk tab. */
  function returnPath(months, cagrPct, volPct, rng) {
    var s = (volPct / 100) / Math.sqrt(MONTHS);
    var mu = Math.log(1 + cagrPct / 100) / MONTHS - s * s / 2;
    var out = new Float64Array(months + 1);
    for (var m = 1; m <= months; m++) out[m] = Math.exp(mu + s * gauss(rng)) - 1;
    return out;
  }

  // ── defaults ──────────────────────────────────────────────────────────────
  // Tax figures are the shipped starting points, surfaced as editable inputs in
  // the UI and stamped with TAX_AS_OF. They are not authority — verify them.
  var TAX_AS_OF = 'Union Budget 2025-26 (as of Aug 2026)';

  function defaults() {
    return {
      // horizon
      age: 32, years: 20,
      mode: 'self',                 // 'self' (A lives in it) | 'letout' (A is a landlord)

      // purchase
      price: 12000000, downPct: 20,
      stampDutyPct: 6, registrationPct: 1, otherBuyPct: 1,

      // loan
      loanRate: 8.5, loanTenure: 20, emiStepUpPct: 0, prepayAnnual: 0,

      // property economics
      propCagr: 7, rentYieldPct: 3, rentGrowthPct: 6, vacancyPct: 5,
      maintPct: 0.4, propTaxPct: 0.1, repairPct: 2, repairEvery: 8,

      // equity
      equityCagr: 12, expenseRatio: 0.6,

      // income tax
      regime: 'new',                // 'new' | 'old'
      marginalTaxPct: 30,
      sec24Cap: 200000,             // self-occupied interest deduction, old regime
      sec80cHeadroom: 150000,       // headroom LEFT for home-loan principal
      hpLossCap: 200000,            // house-property loss set-off cap, old regime

      // exit
      sellCostPct: 1,
      propGainMode: 'flat',         // 'flat' = 12.5% no indexation | 'indexed' = 20% with
      propLtcgFlatPct: 12.5, propLtcgIndexedPct: 20, ciiPct: 5,
      useSec54: false,
      eqLtcgPct: 12.5, eqExemption: 125000,

      // misc
      inflation: 5.5
    };
  }

  // ── the simulation ────────────────────────────────────────────────────────
  /* opt.eqPath / opt.propPath: optional Float64Array of monthly returns
     (index 1..months). When absent the deterministic CAGR is used. */
  function simulate(o, opt) {
    opt = opt || {};
    var months = Math.max(1, Math.round(o.years * MONTHS));
    var eqPath = opt.eqPath || null, propPath = opt.propPath || null;

    var netEquityCagr = o.equityCagr - o.expenseRatio;   // fees come out of the CAGR
    var eMr = monthlyFromCagr(netEquityCagr);
    var pMr = monthlyFromCagr(o.propCagr);

    var down = o.price * o.downPct / 100;
    var buyFrictionPct = o.stampDutyPct + o.registrationPct + o.otherBuyPct;
    var buyFriction = o.price * buyFrictionPct / 100;
    var cash0 = down + buyFriction;                       // identical for both people
    var loan = o.price - down;
    var baseEmi = emiFor(loan, o.loanRate, o.loanTenure);
    var lr = o.loanRate / 100 / MONTHS;

    // Cost base for property capital gains, item by item so each can be indexed
    // from the month it was actually incurred.
    var costItems = [{ amt: o.price + buyFriction, m: 0 }];

    // B invests the identical opening cash as a lump sum on day one. This is
    // what makes stamp duty a real cost of buying rather than a free ride.
    var outstanding = loan, aPort = 0, bPort = cash0;
    var aContrib = 0, bContrib = cash0;                  // for equity LTCG
    var propValue = o.price;
    var loanClosedMonth = null, negAmortWarn = false;

    var yrInterest = 0, yrPrincipal = 0, yrRentNet = 0, yrMunicipal = 0;
    var hpLossCarry = 0;                                 // carried-forward HP loss

    var cum = {
      emi: 0, interest: 0, principal: 0, maint: 0, propTax: 0, repair: 0,
      rentReceived: 0, rentPaid: 0, rentTax: 0, taxBenefit: 0, prepaid: 0
    };

    var series = {
      year: [0], age: [o.age], prop: [o.price], loan: [loan],
      aPort: [0], bPort: [cash0], rent: [], aNeed: [], bNeed: [], budget: [],
      aGross: [o.price - loan], bGross: [cash0],
      aContrib: [0], bContrib: [cash0],
      aNet: [], bNet: []
    };
    var monthly = { budget: new Float64Array(months + 1), aNeed: new Float64Array(months + 1), bNeed: new Float64Array(months + 1) };
    var yearly = [];
    var yAgg = null;
    function newAgg() { return { aNeed: 0, bNeed: 0, budget: 0, aInv: 0, bInv: 0, rent: 0, interest: 0, principal: 0, costs: 0, benefit: 0 }; }
    yAgg = newAgg();

    var rent0 = o.price * o.rentYieldPct / 100 / MONTHS;
    series.rent.push(rent0);

    for (var m = 1; m <= months; m++) {
      // asset values
      propValue *= (1 + (propPath ? propPath[m] : pMr));
      var eqR = eqPath ? eqPath[m] : eMr;

      var marketRent = rent0 * Math.pow(1 + o.rentGrowthPct / 100, (m - 1) / MONTHS);

      // recurring property costs (A bears these in both modes)
      var maint = propValue * (o.maintPct / 100) / MONTHS;
      var ptax = propValue * (o.propTaxPct / 100) / MONTHS;
      var repair = 0;
      if (o.repairEvery > 0 && m % Math.round(o.repairEvery * MONTHS) === 0 && m < months) {
        repair = propValue * (o.repairPct / 100);
        costItems.push({ amt: repair, m: m });           // capitalised into cost base
      }

      // loan
      var payment = 0, interest = 0, principal = 0;
      if (m <= Math.round(o.loanTenure * MONTHS) && outstanding > 1e-6) {
        interest = outstanding * lr;
        var emiThis = baseEmi * Math.pow(1 + o.emiStepUpPct / 100, Math.floor((m - 1) / MONTHS));
        principal = emiThis - interest;
        if (principal < 0) { negAmortWarn = true; principal = 0; }
        principal = Math.min(outstanding, principal);
        payment = principal + interest;
        outstanding -= principal;
        if (m % MONTHS === 0 && o.prepayAnnual > 0 && outstanding > 0) {
          var pre = Math.min(outstanding, o.prepayAnnual);
          outstanding -= pre; payment += pre; principal += pre; cum.prepaid += pre;
        }
        if (outstanding < 1e-6) { outstanding = 0; if (loanClosedMonth === null) loanClosedMonth = m; }
      }

      // rent economics
      var effRent = marketRent * (1 - Math.min(1, o.vacancyPct / 100));   // A's income when let out
      var isLet = o.mode === 'letout';

      // A's cash need before any tax effect
      var aNeed = payment + maint + ptax + repair - (isLet ? effRent : 0);
      // B rents an equivalent home in self-occupied mode. In let-out mode BOTH
      // pay rent for their own home, so it cancels and drops out of the diff.
      var bNeed = isLet ? 0 : marketRent;

      yrInterest += interest; yrPrincipal += principal;
      if (isLet) { yrRentNet += effRent; yrMunicipal += ptax; }

      // ── year-end income-tax settlement, credited/charged as cash ──────────
      var taxCash = 0;
      if (m % MONTHS === 0) {
        var rate = o.marginalTaxPct / 100;
        var old = o.regime === 'old';
        if (isLet) {
          var nav = yrRentNet - yrMunicipal;                      // net annual value
          var hpIncome = nav * 0.7 - yrInterest;                  // 30% std deduction u/s 24(a)
          if (hpIncome >= 0) {
            var offset = Math.min(hpIncome, hpLossCarry);
            hpLossCarry -= offset;
            taxCash = -(hpIncome - offset) * rate;                // tax payable
          } else {
            var loss = -hpIncome;
            // Old regime: set off against other income up to the cap, rest carries
            // forward. New regime: no set-off against other heads at all.
            var setOff = old ? Math.min(loss, o.hpLossCap) : 0;
            hpLossCarry += (loss - setOff);
            taxCash = setOff * rate;
          }
          if (old) taxCash += Math.min(yrPrincipal, o.sec80cHeadroom) * rate;   // 80C
        } else if (old) {
          var intDed = Math.min(yrInterest, o.sec24Cap);          // Sec 24(b)
          var prinDed = Math.min(yrPrincipal, o.sec80cHeadroom);  // Sec 80C
          taxCash = (intDed + prinDed) * rate;
        }
        aNeed -= taxCash;
        if (taxCash >= 0) cum.taxBenefit += taxCash; else cum.rentTax += -taxCash;
        yrInterest = 0; yrPrincipal = 0; yrRentNet = 0; yrMunicipal = 0;
      }

      // ── the symmetric budget ─────────────────────────────────────────────
      var budget = Math.max(aNeed, bNeed);
      var aInv = budget - aNeed, bInv = budget - bNeed;   // both >= 0 by construction

      aPort = aPort * (1 + eqR) + aInv; aContrib += aInv;
      bPort = bPort * (1 + eqR) + bInv; bContrib += bInv;

      cum.emi += payment; cum.interest += interest; cum.principal += principal;
      cum.maint += maint; cum.propTax += ptax; cum.repair += repair;
      if (isLet) cum.rentReceived += effRent; else cum.rentPaid += marketRent;

      monthly.budget[m] = budget; monthly.aNeed[m] = aNeed; monthly.bNeed[m] = bNeed;
      yAgg.aNeed += aNeed; yAgg.bNeed += bNeed; yAgg.budget += budget;
      yAgg.aInv += aInv; yAgg.bInv += bInv; yAgg.rent += marketRent;
      yAgg.interest += interest; yAgg.principal += principal;
      yAgg.costs += maint + ptax + repair; yAgg.benefit += taxCash;

      if (m % MONTHS === 0) {
        var y = m / MONTHS;
        series.year.push(y); series.age.push(o.age + y);
        series.prop.push(propValue); series.loan.push(outstanding);
        series.aPort.push(aPort); series.bPort.push(bPort);
        series.aContrib.push(aContrib); series.bContrib.push(bContrib);
        series.rent.push(marketRent);
        series.aGross.push(propValue - outstanding + aPort);
        series.bGross.push(bPort);
        yearly.push({ year: y, age: o.age + y, prop: propValue, loan: outstanding, aPort: aPort, bPort: bPort, rent: marketRent, agg: yAgg });
        yAgg = newAgg();
      }
    }

    // ── exit ─────────────────────────────────────────────────────────────────
    var sale = propValue;
    var sellCost = sale * o.sellCostPct / 100;
    var years = months / MONTHS;

    var costBase = 0, indexedBase = 0;
    for (var i = 0; i < costItems.length; i++) {
      costBase += costItems[i].amt;
      indexedBase += costItems[i].amt * Math.pow(1 + o.ciiPct / 100, (months - costItems[i].m) / MONTHS);
    }
    var indexed = o.propGainMode === 'indexed';
    var basis = indexed ? indexedBase : costBase;
    var propGain = Math.max(0, sale - sellCost - basis);
    var propRate = indexed ? o.propLtcgIndexedPct : o.propLtcgFlatPct;
    var propGainTax = o.useSec54 ? 0 : propGain * propRate / 100;

    function equityExitTax(port, contrib) {
      var gain = Math.max(0, port - contrib);
      return Math.max(0, gain - o.eqExemption) * o.eqLtcgPct / 100;
    }
    var aEqTax = equityExitTax(aPort, aContrib);   /* eslint-disable-line */
    var bEqTax = equityExitTax(bPort, bContrib);

    var aNet = sale - sellCost - propGainTax - outstanding + aPort - aEqTax;
    var bNet = bPort - bEqTax;

    // post-tax net worth path (notional liquidation at each year end)
    for (var k = 0; k < series.year.length; k++) {
      var yv = series.year[k];
      var sv = series.prop[k], sc = sv * o.sellCostPct / 100;
      var bs = 0;
      for (var j = 0; j < costItems.length; j++) {
        if (costItems[j].m <= yv * MONTHS) {
          bs += indexed ? costItems[j].amt * Math.pow(1 + o.ciiPct / 100, (yv * MONTHS - costItems[j].m) / MONTHS) : costItems[j].amt;
        }
      }
      var g = Math.max(0, sv - sc - bs);
      var t = o.useSec54 ? 0 : g * propRate / 100;
      // Charge the equity exit tax at EVERY year too. Taxing only the final
      // point left B's line pre-tax throughout and then dropped it by the whole
      // LTCG bill in the last step — a kink that is an artefact, not a result.
      var aEqK = equityExitTax(series.aPort[k], series.aContrib[k]);
      var bEqK = equityExitTax(series.bPort[k], series.bContrib[k]);
      series.aNet.push(sv - sc - t - series.loan[k] + series.aPort[k] - aEqK);
      series.bNet.push(series.bPort[k] - bEqK);
    }
    // the final year is the real settlement, so pin it to the exact figures
    series.aNet[series.aNet.length - 1] = aNet;
    series.bNet[series.bNet.length - 1] = bNet;

    // ── IRR on the shared budget ─────────────────────────────────────────────
    // Both people pay the identical stream, so these two numbers are directly
    // comparable in a way that terminal rupees alone are not.
    function flowsWith(terminal) {
      var f = new Array(months + 1);
      f[0] = -cash0;
      for (var t2 = 1; t2 <= months; t2++) f[t2] = -monthly.budget[t2];
      f[months] += terminal;
      return f;
    }
    var aIRR = xirrMonthly(flowsWith(aNet));
    var bIRR = xirrMonthly(flowsWith(bNet));

    var totalCommitted = cash0;
    for (var t3 = 1; t3 <= months; t3++) totalCommitted += monthly.budget[t3];

    var deflator = Math.pow(1 + o.inflation / 100, years);

    return {
      months: months, years: years,
      cash0: cash0, down: down, buyFriction: buyFriction, loan: loan, emi: baseEmi,
      loanClosedMonth: loanClosedMonth, negAmortWarn: negAmortWarn,
      finalProp: sale, sellCost: sellCost, outstanding: outstanding,
      costBase: costBase, indexedBase: indexedBase, propGain: propGain, propGainTax: propGainTax,
      aPort: aPort, bPort: bPort, aContrib: aContrib, bContrib: bContrib,
      aEqTax: aEqTax, bEqTax: bEqTax,
      aNet: aNet, bNet: bNet, gap: aNet - bNet,
      aNetReal: aNet / deflator, bNetReal: bNet / deflator, deflator: deflator,
      aIRR: aIRR, bIRR: bIRR,
      totalCommitted: totalCommitted, cum: cum,
      series: series, yearly: yearly, monthly: monthly,
      finalRentYield: (series.rent[series.rent.length - 1] * MONTHS) / sale * 100,
      hpLossCarry: hpLossCarry
    };
  }

  // annualised IRR from a monthly flow vector, by bisection
  function xirrMonthly(flows) {
    function npv(r) {
      var s = 0;
      for (var t = 0; t < flows.length; t++) s += flows[t] / Math.pow(1 + r, t);
      return s;
    }
    // Probe outward for a finite lower bracket. A fixed -0.9999 overflows to
    // Infinity once the flow vector is a few hundred periods long.
    var probes = [-0.2, -0.4, -0.6, -0.8, -0.9, -0.95, -0.98], lo = null, i;
    for (i = 0; i < probes.length; i++) {
      var v = npv(probes[i]);
      if (isFinite(v) && v > 0) { lo = probes[i]; break; }
    }
    if (lo === null) return null;
    var hi = 1, guard = 0;
    while (npv(hi) > 0 && guard++ < 60) hi *= 2;
    if (npv(hi) > 0) return null;
    for (var i = 0; i < 200; i++) {
      var mid = (lo + hi) / 2;
      if (npv(mid) > 0) lo = mid; else hi = mid;
    }
    return Math.pow(1 + (lo + hi) / 2, MONTHS) - 1;
  }

  /* Solve for the CAGR at which the two paths tie.
     which: 'property' (move property CAGR to catch B) | 'equity' (move equity CAGR to catch A) */
  function solveBreakeven(o, which) {
    var lo = -5, hi = 30;
    function delta(x) {
      var p = Object.assign({}, o);
      if (which === 'property') p.propCagr = x; else p.equityCagr = x;
      var s = simulate(p);
      return which === 'property' ? s.aNet - s.bNet : s.bNet - s.aNet;
    }
    var dlo = delta(lo), dhi = delta(hi);
    if (dlo > 0) return { rate: lo, note: 'below' };   // already ahead at the floor
    if (dhi < 0) return { rate: null, note: 'above' }; // cannot catch up by 30%
    for (var i = 0; i < 100; i++) {
      var mid = (lo + hi) / 2;
      if (delta(mid) < 0) lo = mid; else hi = mid;
    }
    return { rate: (lo + hi) / 2, note: 'ok' };
  }

  // 2-way grid: rows = property CAGR, cols = equity CAGR, cell = A_net - B_net
  function sensitivity(o, propRates, eqRates) {
    var grid = [];
    for (var i = 0; i < propRates.length; i++) {
      var row = [];
      for (var j = 0; j < eqRates.length; j++) {
        var p = Object.assign({}, o, { propCagr: propRates[i], equityCagr: eqRates[j] });
        var s = simulate(p);
        row.push({ gap: s.aNet - s.bNet, a: s.aNet, b: s.bNet });
      }
      grid.push(row);
    }
    return grid;
  }

  /* Volatility matters more than the point estimate. n paths of correlated-free
     lognormal returns for equity and property; returns the distribution of both
     outcomes and P(buying wins). */
  function monteCarlo(o, n, eqVolPct, propVolPct, seed) {
    n = n || 400;
    var rng = mulberry32(seed || 20260823);
    var months = Math.round(o.years * MONTHS);
    var aOut = new Float64Array(n), bOut = new Float64Array(n);
    var aWins = 0;
    var bandA = [], bandB = [];
    for (var i = 0; i < n; i++) {
      var s = simulate(o, {
        eqPath: returnPath(months, o.equityCagr - o.expenseRatio, eqVolPct, rng),
        propPath: returnPath(months, o.propCagr, propVolPct, rng)
      });
      aOut[i] = s.aNet; bOut[i] = s.bNet;
      if (s.aNet > s.bNet) aWins++;
      bandA.push(s.series.aNet.slice()); bandB.push(s.series.bNet.slice());
    }
    function pct(arr, q) {
      var a = Array.prototype.slice.call(arr).sort(function (x, y) { return x - y; });
      var idx = (a.length - 1) * q, lo = Math.floor(idx), hi = Math.ceil(idx);
      return a[lo] + (a[hi] - a[lo]) * (idx - lo);
    }
    function bandPct(paths, q) {
      var len = paths[0].length, out = [];
      for (var k = 0; k < len; k++) {
        var col = paths.map(function (p) { return p[k]; });
        out.push(pct(col, q));
      }
      return out;
    }
    return {
      n: n,
      a: { p10: pct(aOut, .10), p50: pct(aOut, .50), p90: pct(aOut, .90) },
      b: { p10: pct(bOut, .10), p50: pct(bOut, .50), p90: pct(bOut, .90) },
      aWinProb: aWins / n,
      bandA: { p10: bandPct(bandA, .10), p50: bandPct(bandA, .50), p90: bandPct(bandA, .90) },
      bandB: { p10: bandPct(bandB, .10), p50: bandPct(bandB, .50), p90: bandPct(bandB, .90) },
      samples: { a: Array.prototype.slice.call(aOut), b: Array.prototype.slice.call(bOut) }
    };
  }

  // ── formatting ────────────────────────────────────────────────────────────
  function fmtINR(v, dp) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    var sign = v < 0 ? '−' : '', a = Math.abs(v);
    if (a >= 1e7) return sign + '₹' + (a / 1e7).toFixed(dp === undefined ? 2 : dp) + ' Cr';
    if (a >= 1e5) return sign + '₹' + (a / 1e5).toFixed(dp === undefined ? 2 : dp) + ' L';
    return sign + '₹' + Math.round(a).toLocaleString('en-IN');
  }
  /* Spell an amount out the way an Indian reader would say it, so nobody has to
     count zeros. 25000000 -> "2.5 crore", 2500000 -> "25 lakh".
     The 0.9995 threshold buckets a value into the unit it ROUNDS to, so 99,999
     reads "1 lakh" rather than "100 thousand". */
  function fmtWords(v) {
    if (v === null || v === undefined || !isFinite(v)) return '';
    var neg = v < 0, a = Math.abs(v);
    if (a < 0.5) return 'nil';
    var units = [[1e7, 'crore'], [1e5, 'lakh'], [1e3, 'thousand']];
    function trim(n) { return String(parseFloat(n.toFixed(2))); }
    for (var i = 0; i < units.length; i++) {
      var q = a / units[i][0];
      if (q >= 0.9995) return (neg ? 'minus ' : '') + trim(q) + ' ' + units[i][1];
    }
    return (neg ? 'minus ' : '') + Math.round(a);
  }

  // Indian digit grouping: 2,50,00,000 rather than 25,000,000.
  function fmtGrouped(v) {
    if (v === null || v === undefined || !isFinite(v)) return '';
    return (v < 0 ? '−' : '') + '₹' + Math.round(Math.abs(v)).toLocaleString('en-IN');
  }

  function fmtPct(v, dp) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return (v * 100).toFixed(dp === undefined ? 2 : dp) + '%';
  }

  root.BVI = {
    TAX_AS_OF: TAX_AS_OF,
    defaults: defaults, simulate: simulate, xirrMonthly: xirrMonthly,
    solveBreakeven: solveBreakeven, sensitivity: sensitivity, monteCarlo: monteCarlo,
    emiFor: emiFor, monthlyFromCagr: monthlyFromCagr, returnPath: returnPath,
    mulberry32: mulberry32, fmtINR: fmtINR, fmtPct: fmtPct,
    fmtWords: fmtWords, fmtGrouped: fmtGrouped
  };
})(typeof module !== 'undefined' && module.exports ? module.exports : window);
