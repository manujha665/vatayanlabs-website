/* Vatayan Labs — Retirement & Life Goals engine
   Pure simulation. No DOM. Runs in the browser and in node (for the test suite).

   The shape of the problem:
     Two pots, because that is what the law actually does.
       LOCKED  — EPF + NPS. Cannot pay for a car. NPS only opens at 60, and
                 only 60% of it comes out; the rest must buy an annuity.
       GOAL    — SIPs and savings. Funds life goals as they fall due; whatever
                 survives to the retirement date joins the retirement corpus.
     Every goal is entered in TODAY's money with a target year, and inflated at
     its own rate — education does not inflate like a holiday.
     When the goal pot is short, each goal's own rule decides what gives:
     must-fund, defer, or scale down.
     After the retirement year the corpus is drawn down against real spending
     until the stated last year, so "is 20 crore enough" is answerable.
*/
(function (root) {
  'use strict';

  var M = 12;
  function mFromA(annualPct) { return Math.pow(1 + annualPct / 100, 1 / M) - 1; }
  function fv(amount, ratePct, years) { return amount * Math.pow(1 + ratePct / 100, years); }

  var TAX_AS_OF = 'Union Budget 2025-26 (as of Aug 2026)';

  /* Category inflation defaults. These differ a lot in India and the gap is
     where most plans quietly break: education compounding at 10% for eighteen
     years is roughly double the same number at 6%. */
  var CATEGORIES = {
    education:  { label: 'Education',        infl: 10 },
    marriage:   { label: 'Marriage',         infl: 7 },
    house:      { label: 'House / property', infl: 6 },
    vehicle:    { label: 'Vehicle',          infl: 5 },
    medical:    { label: 'Medical',          infl: 10 },
    travel:     { label: 'Travel',           infl: 6 },
    other:      { label: 'Other',            infl: 6 }
  };

  function defaults() {
    return {
      currentYear: 2026, currentAge: 32, retireAge: 58, lastAge: 88,

      // salary — drives EPF, which is a share of basic
      basicMonthly: 120000, salaryGrowthPct: 8,

      // EPF
      epfEnabled: true, epfOpening: 900000,
      epfEmployeePct: 12, epfEmployerPct: 12,
      epsWageCeiling: 15000, epsDiversionPct: 8.33, epfRatePct: 8.25,
      epsPensionMonthly: 7500,          // payable from 58, indicative

      // NPS tier-I
      npsEnabled: true, npsOpening: 400000, npsMonthly: 12000, npsStepUpPct: 8,
      npsEquityPct: 65, npsGlide: true, npsGlideFromAge: 50, npsEquityFloorPct: 25,
      npsEquityReturnPct: 12, npsDebtReturnPct: 7.5,
      npsAnnuityPct: 40, annuityRatePct: 6,

      // goal pot
      sipMonthly: 70000, sipStepUpPct: 8,
      goalOpeningEquity: 1800000, goalOpeningDebt: 600000,
      goalEquityPct: 70, equityReturnPct: 12, debtReturnPct: 6.5, expenseRatioPct: 0.6,

      // retirement spending
      monthlySpendToday: 150000, retireInflationPct: 6,
      postRetReturnPct: 8, bequestToday: 0,

      // target
      targetMode: 'spend',              // 'spend' -> derive the corpus | 'corpus' -> you state it
      targetCorpus: 200000000,

      // tax
      marginalTaxPct: 30, eqLtcgPct: 12.5, eqExemption: 125000,
      npsLumpTaxFreePct: 60,

      inflationPct: 6,
      goals: sampleGoals(2026)
    };
  }

  function sampleGoals(y) {
    return [
      goal('Home down payment', 'house',     4000000, y + 4,  'defer', 2, 3),
      goal('Car',               'vehicle',   1200000, y + 3,  'defer', 5, 3),
      goal('Child 1 schooling', 'education',  400000, y + 6,  'must',  1, 0),
      goal('Child 1 graduation','education', 2500000, y + 16, 'must',  1, 0),
      goal('Child 1 post-grad', 'education', 4000000, y + 20, 'scale', 2, 0, 60),
      goal('Child 1 marriage',  'marriage',  3000000, y + 26, 'scale', 4, 0, 50),
      goal('Australia trip',    'travel',     500000, y + 6,  'scale', 6, 3, 50)
    ];
  }

  var _gid = 0;
  function goal(name, cat, amountToday, year, rule, priority, maxDefer, minFundPct) {
    return {
      id: 'g' + (++_gid), name: name, cat: cat,
      amountToday: amountToday, year: year,
      inflPct: (CATEGORIES[cat] || CATEGORIES.other).infl,
      rule: rule || 'scale', priority: priority || 5,
      maxDefer: maxDefer === undefined ? 2 : maxDefer,
      minFundPct: minFundPct === undefined ? 60 : minFundPct,
      recurEvery: 0, recurTimes: 1
    };
  }

  /* Expand a "child" into the four goals that actually arrive, at the years
     they arrive, given the child's age now. */
  function childGoals(label, childAge, currentYear, scale) {
    scale = scale || 1;
    var y = function (atAge) { return currentYear + Math.max(0, atAge - childAge); };
    return [
      goal(label + ' schooling',  'education',  400000 * scale, y(childAge + 1), 'must',  1, 0),
      goal(label + ' graduation', 'education', 2500000 * scale, y(18),           'must',  1, 0),
      goal(label + ' post-grad',  'education', 4000000 * scale, y(22),           'scale', 2, 1, 60),
      goal(label + ' marriage',   'marriage',  3000000 * scale, y(28),           'scale', 4, 3, 50)
    ];
  }

  // ── the simulation ────────────────────────────────────────────────────────
  function simulate(o) {
    var yearsToRetire = Math.max(0, o.retireAge - o.currentAge);
    var retireYear = o.currentYear + yearsToRetire;
    var lastYear = o.currentYear + Math.max(yearsToRetire, o.lastAge - o.currentAge);
    var months = Math.round(yearsToRetire * M);

    var eqR = mFromA(o.equityReturnPct - o.expenseRatioPct);
    var dbR = mFromA(o.debtReturnPct);
    var epfR = mFromA(o.epfRatePct);

    var basic = o.basicMonthly;
    var epf = o.epfEnabled ? o.epfOpening : 0;
    var nps = o.npsEnabled ? o.npsOpening : 0;
    var eq = o.goalOpeningEquity, debt = o.goalOpeningDebt;
    var eqContrib = o.goalOpeningEquity;         // cost base for LTCG
    var sip = o.sipMonthly, npsC = o.npsMonthly;

    var cum = { epfEmployee: 0, epfEmployer: 0, eps: 0, nps: 0, sip: 0, ltcg: 0, goalsPaid: 0 };

    // working copy of the goals, sorted so ties resolve by priority then rule
    var plan = o.goals.map(function (g) {
      return {
        ref: g, id: g.id, name: g.name, cat: g.cat, rule: g.rule,
        priority: g.priority, inflPct: g.inflPct, amountToday: g.amountToday,
        origYear: g.year, year: g.year, maxDefer: g.maxDefer || 0,
        minFundPct: g.minFundPct === undefined ? 60 : g.minFundPct,
        deferred: 0, paid: 0, required: 0, status: 'pending', shortfall: 0
      };
    }).sort(function (a, b) {
      if (a.year !== b.year) return a.year - b.year;
      if (a.priority !== b.priority) return a.priority - b.priority;
      var w = { must: 0, defer: 1, scale: 2 };
      return w[a.rule] - w[b.rule];
    });

    var series = { year: [], age: [], epf: [], nps: [], goalPot: [], total: [], contribs: [], goalSpend: [] };
    var events = [];
    var exemptionLeft = o.eqExemption;

    /* Withdraw a NET amount from the goal pot: debt first (you would not sell
       equity to pay for something due next month), then equity, grossing up for
       the capital-gains tax the sale triggers. Returns what it could actually
       raise. */
    function withdraw(net) {
      var got = 0;
      var fromDebt = Math.min(debt, net);
      debt -= fromDebt; got += fromDebt;
      var still = net - got;
      if (still > 1e-6 && eq > 1e-6) {
        var gainFrac = Math.max(0, eq - eqContrib) / eq;
        var effRate = gainFrac * (o.eqLtcgPct / 100);
        // gross up, but the annual exemption shelters the first slice of gain
        var gross = still / Math.max(1e-9, 1 - effRate);
        var shelter = Math.min(exemptionLeft, gross * gainFrac);
        var tax = Math.max(0, gross * gainFrac - shelter) * (o.eqLtcgPct / 100);
        gross = still + tax;
        if (gross > eq) { gross = eq; tax = Math.max(0, gross * gainFrac - shelter) * (o.eqLtcgPct / 100); }
        var basisOut = gross * (eqContrib / Math.max(1e-9, eq));
        eq -= gross; eqContrib -= basisOut;
        exemptionLeft = Math.max(0, exemptionLeft - gross * gainFrac);
        cum.ltcg += tax;
        got += Math.max(0, gross - tax);
      }
      if (eq < 0) eq = 0;
      if (debt < 0) debt = 0;
      return got;
    }

    function npsEquityShareAt(age) {
      if (!o.npsGlide || age <= o.npsGlideFromAge) return o.npsEquityPct / 100;
      var down = (age - o.npsGlideFromAge) * 2;   // 2 percentage points a year
      return Math.max(o.npsEquityFloorPct, o.npsEquityPct - down) / 100;
    }

    series.year.push(o.currentYear); series.age.push(o.currentAge);
    series.epf.push(epf); series.nps.push(nps);
    series.goalPot.push(eq + debt); series.total.push(epf + nps + eq + debt);
    series.contribs.push(0); series.goalSpend.push(0);

    var yearContrib = 0, yearGoalSpend = 0;

    // ── accumulation ────────────────────────────────────────────────────────
    for (var m = 1; m <= months; m++) {
      var age = o.currentAge + m / M;

      // EPF: employee 12% of basic; employer 12% less the EPS diversion, which
      // is 8.33% of basic but capped at the statutory wage ceiling.
      if (o.epfEnabled) {
        var emp = basic * o.epfEmployeePct / 100;
        var erGross = basic * o.epfEmployerPct / 100;
        var eps = Math.min(basic, o.epsWageCeiling) * o.epsDiversionPct / 100;
        var er = Math.max(0, erGross - eps);
        epf = epf * (1 + epfR) + emp + er;
        cum.epfEmployee += emp; cum.epfEmployer += er; cum.eps += eps;
        yearContrib += emp + er;
      }

      if (o.npsEnabled) {
        var share = npsEquityShareAt(age);
        var npsR = mFromA(o.npsEquityReturnPct) * share + mFromA(o.npsDebtReturnPct) * (1 - share);
        nps = nps * (1 + npsR) + npsC;
        cum.nps += npsC; yearContrib += npsC;
      }

      var split = o.goalEquityPct / 100;
      eq = eq * (1 + eqR) + sip * split;
      debt = debt * (1 + dbR) + sip * (1 - split);
      eqContrib += sip * split;
      cum.sip += sip; yearContrib += sip;

      if (m % M === 0) {
        var year = o.currentYear + m / M;
        exemptionLeft = o.eqExemption;

        // goals falling due this year, in the order the sort established
        for (var i = 0; i < plan.length; i++) {
          var g = plan[i];
          if (g.status !== 'pending' || g.year !== year) continue;
          var need = fv(g.amountToday, g.inflPct, g.year - o.currentYear);
          g.required = need;
          var available = debt + eq;

          if (available >= need - 1e-6) {
            g.paid = withdraw(need); g.status = 'funded';
          } else if (g.rule === 'defer' && g.deferred < g.maxDefer) {
            g.deferred++; g.year = year + 1;
            events.push({ year: year, goal: g.name, type: 'deferred', to: g.year });
            continue;
          } else if (g.rule === 'scale') {
            var minNeed = need * g.minFundPct / 100;
            if (available >= minNeed) {
              g.paid = withdraw(available); g.status = 'scaled';
              g.shortfall = need - g.paid;
              events.push({ year: year, goal: g.name, type: 'scaled', pct: g.paid / need * 100 });
            } else {
              g.status = 'unfunded'; g.shortfall = need;
              events.push({ year: year, goal: g.name, type: 'unfunded' });
            }
          } else {
            // must-fund, or a defer goal that ran out of road: take what there is
            g.paid = withdraw(available);
            g.shortfall = need - g.paid;
            g.status = g.paid > 1e-6 ? 'short' : 'unfunded';
            events.push({ year: year, goal: g.name, type: 'short', shortfall: g.shortfall });
          }
          cum.goalsPaid += g.paid; yearGoalSpend += g.paid;
        }

        basic *= Math.pow(1 + o.salaryGrowthPct / 100, 1);
        sip *= (1 + o.sipStepUpPct / 100);
        npsC *= (1 + o.npsStepUpPct / 100);

        series.year.push(year); series.age.push(o.currentAge + m / M);
        series.epf.push(epf); series.nps.push(nps);
        series.goalPot.push(eq + debt); series.total.push(epf + nps + eq + debt);
        series.contribs.push(yearContrib); series.goalSpend.push(yearGoalSpend);
        yearContrib = 0; yearGoalSpend = 0;
      }
    }

    // ── what is actually available at retirement ────────────────────────────
    var npsLump = nps * (1 - o.npsAnnuityPct / 100);
    var npsAnnuityCorpus = nps * (o.npsAnnuityPct / 100);
    var npsLumpTaxable = Math.max(0, npsLump - nps * (o.npsLumpTaxFreePct / 100));
    var npsLumpNet = npsLump - npsLumpTaxable * (o.marginalTaxPct / 100);

    // liquidating the goal pot at retirement realises the remaining gains
    var goalGain = Math.max(0, eq - eqContrib);
    var goalEqTax = Math.max(0, goalGain - o.eqExemption) * (o.eqLtcgPct / 100);
    var goalPotNet = eq + debt - goalEqTax;

    var corpus = epf + npsLumpNet + goalPotNet;   // EPF is exempt on maturity
    var annuityMonthlyGross = npsAnnuityCorpus * (o.annuityRatePct / 100) / M;
    var annuityMonthlyNet = annuityMonthlyGross * (1 - o.marginalTaxPct / 100);
    var epsMonthly = o.epfEnabled ? o.epsPensionMonthly : 0;

    // ── decumulation ────────────────────────────────────────────────────────
    var draw = decumulate(o, corpus, annuityMonthlyNet, epsMonthly, retireYear, lastYear);

    // corpus needed to make the retirement years work
    var corpusNeeded = solveCorpusNeeded(o, annuityMonthlyNet, epsMonthly, retireYear, lastYear);

    var goalStats = plan.reduce(function (a, g) {
      a.total++; if (g.status === 'funded') a.funded++;
      else if (g.status === 'scaled') a.scaled++;
      else if (g.status === 'short') a.short++;
      else if (g.status === 'unfunded') a.unfunded++;
      a.shortfall += g.shortfall; a.paid += g.paid;
      if (g.deferred) a.deferred++;
      return a;
    }, { total: 0, funded: 0, scaled: 0, short: 0, unfunded: 0, deferred: 0, shortfall: 0, paid: 0 });

    return {
      retireYear: retireYear, lastYear: lastYear, yearsToRetire: yearsToRetire,
      yearsInRetirement: lastYear - retireYear,
      epf: epf, nps: nps, npsLump: npsLump, npsLumpNet: npsLumpNet,
      npsAnnuityCorpus: npsAnnuityCorpus,
      annuityMonthlyGross: annuityMonthlyGross, annuityMonthlyNet: annuityMonthlyNet,
      epsMonthly: epsMonthly,
      goalPotEq: eq, goalPotDebt: debt, goalEqTax: goalEqTax, goalPotNet: goalPotNet,
      corpus: corpus, corpusToday: corpus / Math.pow(1 + o.inflationPct / 100, yearsToRetire),
      corpusNeeded: corpusNeeded,
      target: o.targetMode === 'corpus' ? o.targetCorpus : corpusNeeded,
      surplus: corpus - (o.targetMode === 'corpus' ? o.targetCorpus : corpusNeeded),
      draw: draw, plan: plan, goalStats: goalStats, events: events,
      cum: cum, series: series,
      firstSpendMonthly: fv(o.monthlySpendToday, o.retireInflationPct, yearsToRetire)
    };
  }

  /* Spend down the corpus from the retirement year to the stated last year.
     Real spending rises with inflation; the annuity and EPS pension are level
     in nominal terms, which is exactly why they matter less every year. */
  function decumulate(o, corpus, annuityNet, epsMonthly, retireYear, lastYear) {
    var years = Math.max(0, lastYear - retireYear);
    var r = mFromA(o.postRetReturnPct);
    var infl = o.retireInflationPct / 100;
    var bal = corpus, depletedYear = null;
    var path = [{ year: retireYear, balance: bal, spend: 0, income: 0 }];
    var totalSpend = 0, totalIncome = 0;
    var yearsToRet = retireYear - o.currentYear;

    for (var y = 0; y < years; y++) {
      var ySpend = 0, yIncome = 0;
      for (var k = 0; k < M; k++) {
        var spend = fv(o.monthlySpendToday, o.retireInflationPct, yearsToRet + y + k / M);
        var income = annuityNet + epsMonthly;
        var net = spend - income;
        bal = bal * (1 + r) - net;
        ySpend += spend; yIncome += income;
        if (bal <= 0 && depletedYear === null) { depletedYear = retireYear + y + k / M; bal = 0; }
        if (bal <= 0) bal = 0;
      }
      totalSpend += ySpend; totalIncome += yIncome;
      path.push({ year: retireYear + y + 1, balance: bal, spend: ySpend, income: yIncome });
    }
    var bequestNeeded = fv(o.bequestToday, o.inflationPct, lastYear - o.currentYear);
    return {
      path: path, endBalance: bal, depletedYear: depletedYear,
      lasts: depletedYear === null, totalSpend: totalSpend, totalIncome: totalIncome,
      yearsCovered: depletedYear === null ? years : depletedYear - retireYear,
      bequestNeeded: bequestNeeded,
      endBalanceToday: bal / Math.pow(1 + o.inflationPct / 100, lastYear - o.currentYear)
    };
  }

  // smallest corpus at retirement that survives to lastYear and leaves the bequest
  function solveCorpusNeeded(o, annuityNet, epsMonthly, retireYear, lastYear) {
    var bequest = fv(o.bequestToday, o.inflationPct, lastYear - o.currentYear);
    /* The drawdown floors the balance at zero, so "endBalance < bequest" can
       never fire when the bequest is zero — every failing corpus and every
       succeeding one both report zero. Depletion is the signal that survives
       the floor, so test that first. */
    function short(corpus) {
      var d = decumulate(o, corpus, annuityNet, epsMonthly, retireYear, lastYear);
      return d.depletedYear !== null || d.endBalance < bequest - 1e-6;
    }
    var lo = 0, hi = 1e6;
    for (var i = 0; i < 80 && short(hi); i++) hi *= 2;
    if (short(hi)) return null;
    for (var j = 0; j < 120; j++) {
      var mid = (lo + hi) / 2;
      if (short(mid)) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /* The inverse question: what monthly SIP gets you there?
     Everything else — EPF, NPS, the goals and their rules — is held fixed. */
  var SIP_CEILING = 1e9;   // Rs 100 crore a month. Past this the answer is not an answer.

  function solveRequiredSip(o) {
    var target = o.targetMode === 'corpus' ? o.targetCorpus : simulate(o).corpusNeeded;
    if (target === null || !isFinite(target)) return null;
    function reach(sip) {
      var p = Object.assign({}, o, { sipMonthly: sip });
      return simulate(p).corpus;
    }
    var lo = 0, hi = Math.max(100000, o.sipMonthly * 4);
    for (var i = 0; i < 40 && hi < SIP_CEILING && reach(hi) < target; i++) hi *= 2;
    if (reach(hi) < target || hi > SIP_CEILING) return null;
    if (reach(lo) >= target) return 0;
    for (var j = 0; j < 60; j++) {
      var mid = (lo + hi) / 2;
      if (reach(mid) < target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // If the required SIP is out of reach, how much longer would you have to work?
  function solveRetireAge(o, maxAge) {
    maxAge = maxAge || 75;
    var target = o.targetMode === 'corpus' ? o.targetCorpus : null;
    for (var age = o.retireAge; age <= maxAge; age++) {
      var p = Object.assign({}, o, { retireAge: age });
      var s = simulate(p);
      var t = target === null ? s.corpusNeeded : target;
      if (s.corpus >= t) return age;
    }
    return null;
  }

  // Reachable corpus at the current contribution level.
  function reachableCorpus(o) { return simulate(o).corpus; }

  function fmtINR(v, dp) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    var sign = v < 0 ? '−' : '', a = Math.abs(v);
    if (a >= 1e7) return sign + '₹' + (a / 1e7).toFixed(dp === undefined ? 2 : dp) + ' Cr';
    if (a >= 1e5) return sign + '₹' + (a / 1e5).toFixed(dp === undefined ? 2 : dp) + ' L';
    return sign + '₹' + Math.round(a).toLocaleString('en-IN');
  }
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
  function fmtGrouped(v) {
    if (v === null || v === undefined || !isFinite(v)) return '';
    return (v < 0 ? '−' : '') + '₹' + Math.round(Math.abs(v)).toLocaleString('en-IN');
  }

  root.RET = {
    TAX_AS_OF: TAX_AS_OF, CATEGORIES: CATEGORIES,
    defaults: defaults, goal: goal, childGoals: childGoals, sampleGoals: sampleGoals,
    simulate: simulate, decumulate: decumulate, solveCorpusNeeded: solveCorpusNeeded,
    solveRequiredSip: solveRequiredSip, solveRetireAge: solveRetireAge,
    reachableCorpus: reachableCorpus, fv: fv, mFromA: mFromA, SIP_CEILING: SIP_CEILING,
    fmtINR: fmtINR, fmtWords: fmtWords, fmtGrouped: fmtGrouped
  };
})(typeof module !== 'undefined' && module.exports ? module.exports : window);
