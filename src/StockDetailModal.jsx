import { Fragment, useEffect, useMemo, useState } from 'react'
import { fetchCandles } from './api'

function fmt(n, decimals = 2) {
  if (n == null || isNaN(n)) return '-'
  return Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '-'
  const s = n >= 0 ? '+' : ''
  return `${s}${fmt(n)}%`
}

function fmtDay(iso) {
  if (!iso) return '-'
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d)) return iso
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

// Inline "what did the model say before this day?" card, shown when a history
// row is expanded. `fc` comes from the backend per-date forecast series.
function HistForecast({ fc, date }) {
  const pct = Math.round(fc.prob_up * 100)
  const arrow = fc.direction === 'up' ? '▲' : fc.direction === 'down' ? '▼' : '◌'
  const label = fc.direction === 'up' ? 'Lean Up' : fc.direction === 'down' ? 'Lean Down' : 'Neutral'
  const outcome = fc.hit == null
    ? <span className="muted">no call (neutral)</span>
    : fc.hit
      ? <span className="pos">✓ hit — actually went {fc.actual}</span>
      : <span className="neg">✗ miss — actually went {fc.actual}</span>
  return (
    <div className={`predict-card compact dir-${fc.direction}`}>
      <div className="predict-head">
        <span className="predict-title">
          Forecast for {fmtDay(date)} <em className="hint">(as of {fmtDay(fc.as_of_date)}, {fc.sample_days}d data)</em>
        </span>
        <span className={`predict-badge dir-${fc.direction}`}>{arrow} {label}</span>
      </div>
      <div className="predict-prob">
        <b>{pct}%</b> chance up
        <span className="predict-conf">
          {' '}(95% CI {Math.round(fc.ci_low * 100)}–{Math.round(fc.ci_high * 100)}%) · {fc.confidence} confidence
        </span>
      </div>
      <div className="predict-pattern">
        Prior {fc.pattern_len} days: <b>{fc.pattern}</b>. The {fc.matches} earlier times this happened,
        the next day rose <span className="pos">{fc.ups}×</span> and fell <span className="neg">{fc.downs}×</span>.
      </div>
      <ul className="predict-signals">
        {fc.by_length.map((b) => (
          <li key={b.length}>
            <span className="sig-name">{b.pattern}</span>
            <span className={`sig-prob ${b.prob_up >= 0.5 ? 'pos' : 'neg'}`}>{Math.round(b.prob_up * 100)}% up</span>
            <span className="sig-detail">{b.ups}↑ / {b.downs}↓ · {b.matches} matches</span>
          </li>
        ))}
      </ul>
      <div className="predict-backtest">Outcome: {outcome}</div>
    </div>
  )
}

// Day-by-day price / change breakdown for one scrip. Shared by Market Watch
// and the Wishlist. `item` is a screener row (needs instrument_key, symbol,
// ltp, open/high/low, change_percent) plus `kind` ('gainers' | 'losers').
export default function StockDetailModal({ item, onClose }) {
  const [candles, setCandles] = useState(null)
  const [prediction, setPrediction] = useState(null)
  const [series, setSeries] = useState({})
  const [openDate, setOpenDate] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Show ~120 trading days of history; widen further only if the current streak
  // runs longer than that.
  const streak = (item?.kind === 'losers' ? item?.fall_streak : item?.rally_streak) || 0
  const windowDays = Math.max(streak, 120)

  useEffect(() => {
    if (!item) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setCandles(null)
    setPrediction(null)
    setSeries({})
    setOpenDate(null)
    fetchCandles({ instrumentKey: item.instrument_key, days: Math.min(windowDays, 150), ltp: item.ltp })
      .then((d) => { if (!cancelled) { setCandles(d.candles || []); setPrediction(d.prediction || null); setSeries(d.series || {}) } })
      .catch((e) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [item, windowDays])

  // Close on Escape.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // The historical day-candle API omits today's still-forming candle, so its
  // newest row is yesterday. Merge today in from the snapshot (live screener
  // LTP/high/low) so "current day" is actually today, then compute
  // day-over-day change % from prior closes.
  const merged = useMemo(() => {
    const hist = candles || []
    const istNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
    const isWeekday = istNow.getDay() >= 1 && istNow.getDay() <= 5
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const list = [...hist]
    const last = list[list.length - 1]
    const hasToday = last && last.date === todayStr
    // Only add today as a new bar on a trading weekday with a genuinely new price.
    // On weekends/holidays the LTP equals the last close — adding it would create
    // a fake flat day (e.g. a "21 Jun" Sunday row).
    if (!hasToday && isWeekday && item && last && item.ltp != null && item.ltp !== last.close) {
      list.push({
        date: todayStr,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.ltp,
        _today: true,
      })
    }
    return list.map((c, i) => {
      const p = i > 0 ? list[i - 1].close : null
      let changePct = p ? ((c.close - p) / p) * 100 : null
      // No prior close cached (e.g. not logged in) — use the snapshot's % for today.
      if (changePct == null && c._today) changePct = item?.change_percent ?? null
      return { ...c, changePct }
    })
  }, [candles, item])

  // Window (last N days incl. today), newest first.
  const dayRows = useMemo(() => merged.slice(-windowDays).reverse(), [merged, windowDays])

  // Month-by-month return within the window. Each month's return is measured
  // from the previous month's last close (so the months chain to the total
  // cumulative); the first month falls back to its own first close.
  const monthlyRows = useMemo(() => {
    const win = merged.slice(-windowDays).filter((c) => c.close != null)
    if (!win.length) return []
    const groups = []
    const byKey = {}
    for (const c of win) {
      const key = (c.date || '').slice(0, 7) // YYYY-MM
      if (!key) continue
      if (!byKey[key]) { byKey[key] = { key, rows: [] }; groups.push(byKey[key]) }
      byKey[key].rows.push(c)
    }
    let prevClose = null
    return groups.map((g) => {
      const firstC = g.rows[0]
      const lastC = g.rows[g.rows.length - 1]
      const base = prevClose != null ? prevClose : firstC.close
      const pct = base ? ((lastC.close - base) / base) * 100 : null
      prevClose = lastC.close
      const d = new Date(g.key + '-01T00:00:00')
      const label = isNaN(d) ? g.key : d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
      return { key: g.key, label, pct, days: g.rows.length, close: lastC.close }
    })
  }, [merged, windowDays])

  if (!item) return null

  const latest = merged.length ? merged[merged.length - 1] : null   // today
  const prev = merged.length > 1 ? merged[merged.length - 2] : null // previous trading day

  const todayHigh = latest?.high ?? item.high
  const todayLow = latest?.low ?? item.low

  // Cumulative move across the window (first shown close -> latest close).
  const first = dayRows.length ? dayRows[dayRows.length - 1] : null
  const cumPct = first && latest && first.close
    ? ((latest.close - first.close) / first.close) * 100
    : null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{item.symbol} <span className="seg">{item.exchange || 'EQ'}</span></h2>
            <div className="modal-sub">
              LTP ₹{fmt(item.ltp)} · Today {fmtPct(item.change_percent)}
              {streak >= 2 && (
                <span className={`streak-badge ${item.kind === 'losers' ? 'loser' : 'gainer'} streak-${Math.min(streak, 5)}`}>
                  {item.kind === 'losers' ? '↓' : '🔥'} D{streak}
                </span>
              )}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} title="Close (Esc)">×</button>
        </div>

        <div className="modal-cards">
          <div className="modal-card">
            <div className="modal-card-title">Current day{latest ? ` · ${fmtDay(latest.date)}` : ''}</div>
            <div className="kv"><span>High</span><b>₹{fmt(todayHigh)}</b></div>
            <div className="kv"><span>Low</span><b>₹{fmt(todayLow)}</b></div>
          </div>
          <div className="modal-card">
            <div className="modal-card-title">Previous day{prev ? ` · ${fmtDay(prev.date)}` : ''}</div>
            <div className="kv"><span>High</span><b>₹{fmt(prev?.high)}</b></div>
            <div className="kv"><span>Low</span><b>₹{fmt(prev?.low)}</b></div>
          </div>
        </div>

        {prediction && prediction.ok && (() => {
          const p = prediction
          const pct = Math.round(p.prob_up * 100)
          const arrow = p.direction === 'up' ? '▲' : p.direction === 'down' ? '▼' : '◌'
          const label = p.direction === 'up' ? (pct >= 65 ? 'Likely Up' : 'Lean Up')
            : p.direction === 'down' ? (pct <= 35 ? 'Likely Down' : 'Lean Down') : 'Neutral'
          return (
            <div className={`predict-card dir-${p.direction}`}>
              <div className="predict-head">
                <span className="predict-title">Pattern forecast — tomorrow</span>
                <span className={`predict-badge dir-${p.direction}`}>{arrow} {label}</span>
              </div>
              <div className="predict-prob">
                <b>{pct}%</b> chance up
                <span className="predict-conf">
                  {' '}(95% CI {Math.round(p.ci_low * 100)}–{Math.round(p.ci_high * 100)}%) · {p.confidence} confidence · {p.sample_days}d sample
                </span>
              </div>
              <div className="predict-pattern">
                Last {p.pattern_len} days: <b>{p.pattern}</b>. The {p.matches} earlier times this
                happened, the <i>next</i> day rose <span className="pos">{p.ups}×</span> and fell{' '}
                <span className="neg">{p.downs}×</span>.
              </div>
              <ul className="predict-signals">
                {p.by_length.map((b) => (
                  <li key={b.length}>
                    <span className="sig-name">{b.pattern}</span>
                    <span className={`sig-prob ${b.prob_up >= 0.5 ? 'pos' : 'neg'}`}>{Math.round(b.prob_up * 100)}% up</span>
                    <span className="sig-detail">{b.ups}↑ / {b.downs}↓ · {b.matches} matches</span>
                  </li>
                ))}
              </ul>
              {p.backtest && p.backtest.accuracy != null ? (
                <div className="predict-backtest">
                  <div>Real hit-rate (settled history): <b>{Math.round(p.backtest.accuracy * 100)}%</b> ({p.backtest.correct}/{p.backtest.calls} past calls)</div>
                  {p.backtest_live && p.backtest_live.accuracy != null && (
                    <div>With today's live candle: <b>{Math.round(p.backtest_live.accuracy * 100)}%</b> ({p.backtest_live.correct}/{p.backtest_live.calls} calls)</div>
                  )}
                </div>
              ) : (
                <div className="predict-backtest">Not enough past calls to backtest this stock.</div>
              )}
              <div className="predict-note">
                Empirical pattern frequency over {p.sample_days} days. Daily direction is near
                a coin flip — treat low-confidence calls as noise. Not financial advice.
              </div>
            </div>
          )
        })()}

        {monthlyRows.length > 1 && (
          <>
            <div className="modal-section-title">Monthly cumulative</div>
            <div className="month-chips">
              {[...monthlyRows].reverse().map((m) => (
                <div key={m.key} className={`month-chip ${m.pct == null ? '' : m.pct >= 0 ? 'pos' : 'neg'}`}>
                  <span className="month-chip-label">{m.label}</span>
                  <b>{fmtPct(m.pct)}</b>
                  <span className="month-chip-days">{m.days} trading days</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="modal-section-title">
          Last {dayRows.length || windowDays} days
          {cumPct != null && (
            <span className={cumPct >= 0 ? 'pos' : 'neg'}> · {fmtPct(cumPct)} cumulative</span>
          )}
        </div>

        {loading && <div className="empty">Loading candles…</div>}
        {error && <div className="error">{error}</div>}
        {!loading && !error && dayRows.length === 0 && (
          <div className="empty">No candle history available (needs OAuth login).</div>
        )}

        {dayRows.length > 0 && (
          <>
            <div className="hist-hint">Tip: click any day to see the pattern forecast that was actionable <i>before</i> that day — and whether it hit.</div>
            <table className="movers compact hist-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="num">Close</th>
                  <th className="num">Change %</th>
                  <th className="num">High</th>
                  <th className="num">Low</th>
                  <th className="num">Forecast</th>
                </tr>
              </thead>
              <tbody>
                {dayRows.map((d) => {
                  const cls = d.changePct == null ? '' : d.changePct >= 0 ? 'pos' : 'neg'
                  const fc = series[d.date]
                  const isOpen = openDate === d.date
                  const badge = fc
                    ? (fc.direction === 'up' ? '▲' : fc.direction === 'down' ? '▼' : '◌')
                    : '·'
                  const hitMark = fc && fc.hit != null ? (fc.hit ? '✓' : '✗') : ''
                  return (
                    <Fragment key={d.date}>
                      <tr
                        className={`hist-row${fc ? ' clickable' : ''}${isOpen ? ' open' : ''}`}
                        onClick={() => fc && setOpenDate(isOpen ? null : d.date)}
                        title={fc ? 'Show the forecast made before this day' : 'No forecast (too little prior history)'}
                      >
                        <td>{fmtDay(d.date)}</td>
                        <td className="num">₹{fmt(d.close)}</td>
                        <td className={`num ${cls}`}>{fmtPct(d.changePct)}</td>
                        <td className="num">{fmt(d.high)}</td>
                        <td className="num">{fmt(d.low)}</td>
                        <td className="num">
                          {fc ? (
                            <span className={`fc-tag dir-${fc.direction}`}>
                              {badge} {Math.round(fc.prob_up * 100)}%
                              {hitMark && <b className={fc.hit ? 'pos' : 'neg'}> {hitMark}</b>}
                            </span>
                          ) : <span className="muted">—</span>}
                        </td>
                      </tr>
                      {isOpen && fc && (
                        <tr className="hist-detail-row">
                          <td colSpan={6}>
                            <HistForecast fc={fc} date={d.date} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  )
}
