import { useEffect, useMemo, useState } from 'react'
import { fetchCandles } from './api'
import { backtestPredictor, predictNextDay } from './predict'

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

// Day-by-day price / change breakdown for one scrip. Shared by Market Watch
// and the Wishlist. `item` is a screener row (needs instrument_key, symbol,
// ltp, open/high/low, change_percent) plus `kind` ('gainers' | 'losers').
export default function StockDetailModal({ item, onClose }) {
  const [candles, setCandles] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Use a ~60 trading-day sample (better stats / backtest); widen further only
  // if the current streak runs longer than that.
  const streak = (item?.kind === 'losers' ? item?.fall_streak : item?.rally_streak) || 0
  const windowDays = Math.max(streak, 60)

  useEffect(() => {
    if (!item) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setCandles(null)
    fetchCandles({ instrumentKey: item.instrument_key, days: Math.min(windowDays, 90) })
      .then((d) => { if (!cancelled) setCandles(d.candles || []) })
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
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const list = [...hist]
    const hasToday = list.length && list[list.length - 1].date === todayStr
    if (!hasToday && item) {
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

  // Next-day statistical estimate + walk-forward backtest from fetched history.
  const pred = useMemo(() => predictNextDay(merged), [merged])
  const backtest = useMemo(() => backtestPredictor(merged), [merged])

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

        {pred.ok && (
          <div className={`predict-card dir-${pred.direction}`}>
            <div className="predict-head">
              <span className="predict-title">Tomorrow's outlook</span>
              <span className={`predict-badge dir-${pred.direction}`}>
                {pred.direction === 'up' ? '▲' : pred.direction === 'down' ? '▼' : '◌'} {pred.label}
              </span>
            </div>
            <div className="predict-prob">
              <b>{Math.round(pred.probUp * 100)}%</b> chance up
              <span className="predict-conf"> · {pred.confidence} confidence · {pred.regime} · {pred.sampleDays}d sample</span>
              {pred.atrPct != null && (
                <span className="predict-conf"> · typical move ±{pred.atrPct.toFixed(1)}%</span>
              )}
            </div>
            <ul className="predict-signals">
              {pred.signals.map((s) => (
                <li key={s.name}>
                  <span className="sig-name">{s.name}</span>
                  <span className={`sig-prob ${s.prob >= 0.5 ? 'pos' : 'neg'}`}>{Math.round(s.prob * 100)}% up</span>
                  <span className="sig-weight" title="Share of the decision (adapts to evidence & regime)">w {s.weightPct}%</span>
                  <span className="sig-detail">{s.detail}</span>
                </li>
              ))}
            </ul>
            {backtest.ok && backtest.accuracy != null && (
              <div className={`predict-backtest ${backtest.accuracy >= 0.55 ? 'acc-good' : backtest.accuracy < 0.45 ? 'acc-bad' : 'acc-mid'}`}>
                Backtest: <b>{backtest.correct}/{backtest.calls}</b> calls correct ({Math.round(backtest.accuracy * 100)}%)
                {backtest.calls < backtest.tested && ` · ${backtest.tested - backtest.calls} no-call`}
                {' '}· Brier {backtest.brier.toFixed(2)} (0.25 = coin flip)
                {' '}· always-up baseline {Math.round(backtest.majorityBaseline * 100)}%
              </div>
            )}
            <div className="predict-note">
              Statistical estimate (drift + Markov + streak + range) — not financial advice.
            </div>
          </div>
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
          <table className="movers compact">
            <thead>
              <tr>
                <th>Date</th>
                <th className="num">Close</th>
                <th className="num">Change %</th>
                <th className="num">High</th>
                <th className="num">Low</th>
              </tr>
            </thead>
            <tbody>
              {dayRows.map((d) => {
                const cls = d.changePct == null ? '' : d.changePct >= 0 ? 'pos' : 'neg'
                return (
                  <tr key={d.date}>
                    <td>{fmtDay(d.date)}</td>
                    <td className="num">₹{fmt(d.close)}</td>
                    <td className={`num ${cls}`}>{fmtPct(d.changePct)}</td>
                    <td className="num">{fmt(d.high)}</td>
                    <td className="num">{fmt(d.low)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
