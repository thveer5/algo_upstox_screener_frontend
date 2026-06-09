import { classifyMarketCap, fmtCrore } from './marketCap'

function fmtNumber(n, decimals = 2) {
  if (n == null) return '-'
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function fmtCompact(n) {
  if (n == null) return '-'
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

export default function MoversTable({
  rows,
  onTrade,
  onWishlist,
  onRowClick,
  wishlistedKeys,
  kind = 'gainers',
  ttvSortDir,
  onSortTtv,
}) {
  if (!rows?.length) {
    return <div className="empty">No rows.</div>
  }
  const ttvArrow = ttvSortDir === 'desc' ? ' ▼' : ttvSortDir === 'asc' ? ' ▲' : ''
  return (
    <table className="movers">
      <thead>
        <tr>
          <th>#</th>
          <th>Scrip</th>
          <th className="num">LTP</th>
          <th className="num">Change</th>
          <th className="num">Change %</th>
          <th
            className={`num sortable ${ttvSortDir ? 'sort-active' : ''}`}
            onClick={onSortTtv}
            title="Sort by Traded Value (click to cycle desc → asc → off)"
          >
            Traded Value{ttvArrow}
          </th>
          <th className="num">Volume</th>
          <th>Day Range</th>
          <th>Market Cap</th>
          <th className="actions-th">Trade</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, idx) => {
          const positive = (r.change ?? 0) >= 0
          const colorClass = positive ? 'pos' : 'neg'
          return (
            <tr
              key={r.instrument_key || r.symbol}
              className={onRowClick ? 'clickable' : ''}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              title={onRowClick ? 'Click for day-by-day breakdown' : undefined}
            >
              <td className="dim">{idx + 1}</td>
              <td className="sym">
                {r.symbol} <span className="seg">EQ</span>
                {(() => {
                  const streak = kind === 'losers' ? r.fall_streak : r.rally_streak
                  if (!streak || streak < 2) return null
                  const isLoser = kind === 'losers'
                  const icon = isLoser
                    ? (streak >= 4 ? '❄️' : '↓')
                    : (streak >= 4 ? '🔥' : '↑')
                  return (
                    <span
                      className={`streak-badge ${isLoser ? 'loser' : 'gainer'} streak-${Math.min(streak, 5)}`}
                      title={
                        isLoser
                          ? `Falling for ${streak} consecutive trading days`
                          : `Rallying for ${streak} consecutive trading days`
                      }
                    >
                      {icon} D{streak}
                    </span>
                  )
                })()}
              </td>
              <td className="num">{fmtNumber(r.ltp)}</td>
              <td className={`num ${colorClass}`}>{fmtNumber(r.change)}</td>
              <td className={`num ${colorClass}`}>{fmtNumber(r.change_percent)}%</td>
              <td className="num">{fmtCompact(r.ttv)}</td>
              <td className="num">{fmtCompact(r.vtt)}</td>
              <td>
                {(() => {
                  const { ltp, high, low, open } = r
                  if (ltp == null || high == null || low == null) {
                    return <span className="dim">—</span>
                  }
                  const tooltip = `Today: O ₹${fmtNumber(open)} · H ₹${fmtNumber(high)} · L ₹${fmtNumber(low)} · LTP ₹${fmtNumber(ltp)}`
                  // "At" the day high/low if LTP is within 0.05% — accounts for tick precision.
                  const TOL = 0.0005
                  if (ltp >= high * (1 - TOL)) {
                    return <span className="breakout-badge up" title={tooltip}>↑ Day High</span>
                  }
                  if (ltp <= low * (1 + TOL)) {
                    return <span className="breakout-badge down" title={tooltip}>↓ Day Low</span>
                  }
                  // Otherwise show position within the day's range.
                  const range = high - low
                  const pct = range > 0 ? ((ltp - low) / range) * 100 : 50
                  return (
                    <span className="breakout-badge within" title={tooltip}>
                      {pct.toFixed(0)}% of range
                    </span>
                  )
                })()}
              </td>
              <td>
                {(() => {
                  const cap = classifyMarketCap(r.market_cap)
                  if (!cap) return <span className="dim">—</span>
                  return (
                    <span
                      className={`cap-badge cap-${cap.cls}`}
                      title={`Market cap ${fmtCrore(cap.crore)}`}
                    >
                      {cap.tier}
                    </span>
                  )
                })()}
              </td>
              <td className="actions" onClick={(e) => e.stopPropagation()}>
                {(() => {
                  const starred = wishlistedKeys?.has(r.instrument_key || r.symbol)
                  return (
                    <button
                      className={`trade-btn wish ${starred ? 'active' : ''}`}
                      onClick={() => onWishlist?.(r)}
                      title={starred ? `Remove ${r.symbol} from wishlist` : `Add ${r.symbol} to wishlist`}
                    >{starred ? '★' : '☆'}</button>
                  )
                })()}
                <button
                  className="trade-btn buy"
                  onClick={() => onTrade?.({ side: 'BUY', row: r })}
                  title={`Buy ${r.symbol}`}
                >B</button>
                <button
                  className="trade-btn sell"
                  onClick={() => onTrade?.({ side: 'SELL', row: r })}
                  title={`Sell ${r.symbol}`}
                >S</button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
