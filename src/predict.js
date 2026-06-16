// Statistical next-day direction estimate from daily candles.
//
// IMPORTANT: ~30 daily points is a small sample. This is an explainable
// heuristic — NOT financial advice and not a reliable forecast. Treat the
// probability as a rough lean, not a promise.
//
// Four signals each yield a probability that tomorrow closes up:
//   1. Drift  — daily returns ~ N(mu, sigma); P(next return > 0) = Phi(mu/sigma)
//   2. Markov — first-order P(up | last day's direction), Laplace-smoothed
//   3. Streak — empirical continuation rate for runs of the current length
//   4. Range  — stochastic %K from highs/lows (overbought -> down, oversold -> up)
//
// The blend is NOT fixed. Each signal's influence is scaled by:
//   * evidence   — weak-evidence signals are shrunk toward 0.5 (no swing on noise)
//   * regime     — lag-1 autocorrelation boosts momentum signals when trending,
//                  and the contrarian range signal when mean-reverting.

function mean(a) {
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0
}
function std(a) {
  if (a.length < 2) return 0
  const m = mean(a)
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1))
}
// Abramowitz-Stegun erf approximation.
function erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x))
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return x >= 0 ? y : -y
}
function normCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2))
}
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))
// Pull a probability toward 0.5 in proportion to (1 - reliability).
const shrink = (p, reliability) => 0.5 + (p - 0.5) * reliability

export function predictNextDay(candles) {
  const rows = (candles || []).filter((c) => c && c.close != null)
  const closes = rows.map((c) => c.close)
  if (closes.length < 8) {
    return { ok: false, reason: 'Not enough history (need ~8+ days).' }
  }

  // Daily simple returns.
  const rets = []
  for (let i = 1; i < closes.length; i++) {
    rets.push((closes[i] - closes[i - 1]) / closes[i - 1])
  }
  const n = rets.length

  // --- 1) Drift -------------------------------------------------------------
  const mu = mean(rets)
  const sg = std(rets)
  const pDrift = sg > 0 ? normCdf(mu / sg) : 0.5
  const relDrift = n / (n + 8)

  // --- 2) First-order Markov on up/down sign --------------------------------
  const dirs = rets.map((r) => (r > 0 ? 1 : r < 0 ? -1 : 0))
  let uu = 0, ud = 0, du = 0, dd = 0
  for (let i = 1; i < dirs.length; i++) {
    const p = dirs[i - 1], c = dirs[i]
    if (p > 0 && c > 0) uu++
    else if (p > 0 && c < 0) ud++
    else if (p < 0 && c > 0) du++
    else if (p < 0 && c < 0) dd++
  }
  const last = dirs[dirs.length - 1]
  let pMarkov = 0.5
  let nMarkovObs = 0
  if (last > 0) { pMarkov = (uu + 1) / (uu + ud + 2); nMarkovObs = uu + ud }
  else if (last < 0) { pMarkov = (du + 1) / (du + dd + 2); nMarkovObs = du + dd }
  const relMarkov = nMarkovObs / (nMarkovObs + 4)

  // --- 3) Streak continuation -----------------------------------------------
  const s = last
  let k = s === 0 ? 0 : 1
  for (let i = dirs.length - 2; i >= 0 && s !== 0; i--) {
    if (dirs[i] === s) k++
    else break
  }
  let cont = 0, tot = 0, run = 0, prev = 0
  for (let i = 0; i < dirs.length; i++) {
    const d = dirs[i]
    if (d === prev && d !== 0) run++
    else run = 1
    prev = d
    if (s !== 0 && d === s && run >= k && i + 1 < dirs.length) {
      tot++
      if (dirs[i + 1] === s) cont++
    }
  }
  const pCont = (cont + 1) / (tot + 2)
  let pStreak = 0.5
  if (s > 0) pStreak = pCont
  else if (s < 0) pStreak = 1 - pCont
  const relStreak = tot / (tot + 3)

  // --- 4) Range / stochastic %K (uses highs/lows) ---------------------------
  const win = Math.min(14, rows.length)
  const recent = rows.slice(-win)
  const hi = Math.max(...recent.map((c) => c.high ?? c.close))
  const lo = Math.min(...recent.map((c) => c.low ?? c.close))
  const lastClose = closes[closes.length - 1]
  const kPct = hi > lo ? (lastClose - lo) / (hi - lo) : 0.5
  // Overbought (kPct high) -> expect pullback; oversold -> expect bounce.
  const pRange = clamp(0.5 + (0.5 - kPct) * 0.6, 0.05, 0.95)
  const relRange = win / (win + 6)

  // --- Regime: lag-1 autocorrelation of returns -----------------------------
  let rho = 0
  if (n >= 4 && sg > 0) {
    let num = 0, den = 0
    for (let i = 0; i < rets.length; i++) den += (rets[i] - mu) ** 2
    for (let i = 1; i < rets.length; i++) num += (rets[i] - mu) * (rets[i - 1] - mu)
    rho = den > 0 ? num / den : 0
  }
  const trend = clamp(rho, 0, 0.5)      // > 0: momentum persists
  const revert = clamp(-rho, 0, 0.5)    // > 0: mean-reverting
  const regime = rho > 0.1 ? 'trending' : rho < -0.1 ? 'mean-reverting' : 'mixed'

  // --- Adaptive weights = base importance x regime boost --------------------
  // Markov is self-adapting (it already reflects whichever regime the data
  // shows), so it gets no regime boost.
  const parts = [
    { name: 'Drift',  prob: pDrift,  rel: relDrift,  base: 0.30, boost: 1 + trend * 0.8 },
    { name: 'Pattern', prob: pMarkov, rel: relMarkov, base: 0.22, boost: 1 },
    { name: 'Streak', prob: pStreak, rel: relStreak, base: 0.26, boost: 1 + trend * 1.0 },
    { name: 'Range',  prob: pRange,  rel: relRange,  base: 0.22, boost: 1 + revert * 1.0 },
  ]
  const weights = parts.map((p) => p.base * p.boost)
  const wSum = weights.reduce((s2, w) => s2 + w, 0)

  // Blend shrunk probabilities by normalized weight.
  let probUp = 0
  parts.forEach((p, i) => { probUp += (weights[i] / wSum) * shrink(p.prob, p.rel) })
  probUp = clamp(probUp, 0.02, 0.98)

  // Expected daily move from Average True Range (highs/lows).
  const trs = []
  for (let i = 1; i < rows.length; i++) {
    const h = rows[i].high, l = rows[i].low, pc = rows[i - 1].close
    if (h == null || l == null || pc == null) continue
    trs.push((Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)) / pc) * 100)
  }
  const atrPct = trs.length ? mean(trs) : null

  // Direction + label.
  let direction = 'neutral', label = 'Neutral'
  if (probUp >= 0.62) { direction = 'up'; label = 'Likely Up' }
  else if (probUp >= 0.545) { direction = 'up'; label = 'Lean Up' }
  else if (probUp <= 0.38) { direction = 'down'; label = 'Likely Down' }
  else if (probUp <= 0.455) { direction = 'down'; label = 'Lean Down' }

  // Confidence from edge size + overall evidence + sample.
  const edge = Math.abs(probUp - 0.5)
  const evidence = mean([relDrift, relMarkov, relStreak, relRange])
  let confidence = 'low'
  if (edge >= 0.10 && evidence >= 0.6 && n >= 18) confidence = 'high'
  else if (edge >= 0.05 && evidence >= 0.4 && n >= 12) confidence = 'medium'

  const details = {
    Drift: `avg ${(mu * 100).toFixed(2)}%/day ± ${(sg * 100).toFixed(2)}%`,
    Pattern: last > 0 ? 'after an up day' : last < 0 ? 'after a down day' : 'flat day',
    Streak: tot > 0
      ? `${s > 0 ? 'up' : 'down'} run of ${k}: continued ${cont}/${tot}`
      : `run of ${k}: no prior sample`,
    Range: `${Math.round(kPct * 100)}% of ${win}d range`,
  }

  return {
    ok: true,
    probUp,
    direction,
    label,
    confidence,
    sampleDays: n,
    atrPct,
    regime,
    signals: parts.map((p, i) => ({
      name: p.name,
      prob: p.prob,
      detail: details[p.name],
      weightPct: Math.round((weights[i] / wSum) * 100),
    })),
  }
}

// Walk-forward backtest: for each past day with enough prior history, predict
// using ONLY data up to that day (no look-ahead), then check the next day's
// actual move. Scores how well the model has done on THIS stock's recent days.
export function backtestPredictor(candles) {
  const rows = (candles || []).filter((c) => c && c.close != null)
  const n = rows.length
  const MIN = 10 // need at least this many prior days before we trust a call
  if (n < MIN + 2) return { ok: false, reason: 'Need more history to backtest.' }

  let tested = 0, calls = 0, correct = 0, brier = 0, ups = 0
  for (let t = MIN - 1; t <= n - 2; t++) {
    const p = predictNextDay(rows.slice(0, t + 1))
    if (!p.ok) continue
    const actualUp = rows[t + 1].close > rows[t].close
    tested++
    brier += (p.probUp - (actualUp ? 1 : 0)) ** 2
    if (actualUp) ups++
    if (p.direction === 'up' || p.direction === 'down') {
      calls++
      if ((p.direction === 'up') === actualUp) correct++
    }
  }
  if (!tested) return { ok: false, reason: 'No testable days.' }

  const baseRate = ups / tested
  return {
    ok: true,
    tested,
    calls,
    correct,
    accuracy: calls ? correct / calls : null, // on non-neutral calls only
    brier: brier / tested,                    // 0.25 = always guessing 50/50
    baseRate,
    majorityBaseline: Math.max(baseRate, 1 - baseRate),
  }
}
