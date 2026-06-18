import { useEffect, useMemo, useState } from 'react'
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

// Day-by-day price / change breakdown for one scrip. Shared by Market Watch
// and the Wishlist. `item` is a screener row (needs instrument_key, symbol,
// ltp, open/high/low, change_percent) plus `kind` ('gainers' | 'losers').
export default function StockDetailModal({ item, onClose }) {
  const [candles, setCandles] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Show ~90 trading days of history; widen further only if the current streak
  // runs longer than that.
  const streak = (item?.kind === 'losers' ? item?.fall_streak : item?.rally_streak) || 0
  const windowDays = Math.max(streak, 90)

  useEffect(() => {
    if (!item) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setCandles(null)
    fetchCandles({ instrumentKey: item.instrument_key, days: Math.min(windowDays, 120) })
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
