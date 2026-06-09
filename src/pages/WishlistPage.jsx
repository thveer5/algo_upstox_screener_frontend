import { useCallback, useEffect, useMemo, useState } from 'react'
import OrderDrawer from '../OrderDrawer'
import StockDetailModal from '../StockDetailModal'
import { classifyMarketCap, fmtCrore } from '../marketCap'
import { getWishlist, removeFromWishlist } from '../wishlist'

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

function fmtDate(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (isNaN(d)) return '-'
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const PAGE_SIZES = [10, 20, 30]

function StreakBadge({ kind, rallyStreak, fallStreak }) {
  const isLoser = kind === 'losers'
  const streak = isLoser ? fallStreak : rallyStreak
  if (!streak || streak < 2) return null
  const icon = isLoser ? (streak >= 4 ? '❄️' : '↓') : (streak >= 4 ? '🔥' : '↑')
  return (
    <span
      className={`streak-badge ${isLoser ? 'loser' : 'gainer'} streak-${Math.min(streak, 5)}`}
      title={
        isLoser
          ? `Was falling for ${streak} consecutive trading days when wishlisted`
          : `Was rallying for ${streak} consecutive trading days when wishlisted`
      }
    >
      {icon} D{streak}
    </span>
  )
}

export default function WishlistPage() {
  const [rows, setRows] = useState(() => getWishlist())
  const [order, setOrder] = useState(null)
  const [detail, setDetail] = useState(null)
  const [filter, setFilter] = useState('all') // all | gainers | losers
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)

  useEffect(() => {
    const sync = () => setRows(getWishlist())
    window.addEventListener('wishlist-changed', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('wishlist-changed', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const onRemove = useCallback((row) => {
    removeFromWishlist(row)
  }, [])

  const onClear = () => {
    if (!confirm('Clear the entire wishlist?')) return
    rows.forEach((r) => removeFromWishlist(r))
  }

  const visible = useMemo(
    () => (filter === 'all' ? rows : rows.filter((r) => r.kind === filter)),
    [rows, filter],
  )

  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize))
  // Keep the current page in range as the list/filter/page-size change.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const paged = useMemo(
    () => visible.slice((page - 1) * pageSize, page * pageSize),
    [visible, page, pageSize],
  )

  return (
    <div className="page">
      <div className="page-head">
        <h1>Wishlist</h1>
        <div className="page-actions">
          <button className="btn-sm" onClick={onClear} disabled={!rows.length}>
            Clear all
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="tabs">
          {[
            { id: 'all', label: 'All' },
            { id: 'gainers', label: 'Gainers' },
            { id: 'losers', label: 'Losers' },
          ].map((t) => (
            <button
              key={t.id}
              className={`tab ${filter === t.id ? 'active' : ''}`}
              onClick={() => { setFilter(t.id); setPage(1) }}
            >{t.label}</button>
          ))}
        </div>
        <div className="filters">
          <label className="page-size">
            Rows
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
            >
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="empty">
          No wishlisted scrips{filter !== 'all' ? ` in ${filter}` : ''}. Add some from
          Market Watch using the ☆ button.
        </div>
      ) : (
        <table className="movers">
          <thead>
            <tr>
              <th>#</th>
              <th>Scrip</th>
              <th>From</th>
              <th className="num">LTP</th>
              <th className="num">Change</th>
              <th className="num">Change %</th>
              <th className="num">Traded Value</th>
              <th className="num">Volume</th>
              <th>Market Cap</th>
              <th>Added</th>
              <th className="actions-th">Action</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((r, idx) => {
              const positive = (r.change ?? 0) >= 0
              const colorClass = positive ? 'pos' : 'neg'
              const cap = classifyMarketCap(r.market_cap)
              return (
                <tr
                  key={r.instrument_key || r.symbol}
                  className="clickable"
                  onClick={() => setDetail(r)}
                  title="Click for day-by-day breakdown"
                >
                  <td className="dim">{(page - 1) * pageSize + idx + 1}</td>
                  <td className="sym">
                    {r.symbol} <span className="seg">{r.exchange || 'EQ'}</span>
                    <StreakBadge kind={r.kind} rallyStreak={r.rally_streak} fallStreak={r.fall_streak} />
                  </td>
                  <td>
                    <span className={`cap-badge ${r.kind === 'losers' ? 'cap-micro' : 'cap-large'}`}>
                      {r.kind === 'losers' ? 'Loser' : 'Gainer'}
                    </span>
                  </td>
                  <td className="num">{fmtNumber(r.ltp)}</td>
                  <td className={`num ${colorClass}`}>{fmtNumber(r.change)}</td>
                  <td className={`num ${colorClass}`}>{fmtNumber(r.change_percent)}%</td>
                  <td className="num">{fmtCompact(r.ttv)}</td>
                  <td className="num">{fmtCompact(r.vtt)}</td>
                  <td>
                    {cap ? (
                      <span className={`cap-badge cap-${cap.cls}`} title={`Market cap ${fmtCrore(cap.crore)}`}>
                        {cap.tier}
                      </span>
                    ) : (
                      <span className="dim">—</span>
                    )}
                  </td>
                  <td className="dim">{fmtDate(r.added_at)}</td>
                  <td className="actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="trade-btn buy"
                      onClick={() => setOrder({ side: 'BUY', row: r })}
                      title={`Buy ${r.symbol}`}
                    >B</button>
                    <button
                      className="trade-btn sell"
                      onClick={() => setOrder({ side: 'SELL', row: r })}
                      title={`Sell ${r.symbol}`}
                    >S</button>
                    <button
                      className="trade-btn sell"
                      onClick={() => onRemove(r)}
                      title={`Remove ${r.symbol} from wishlist`}
                    >×</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {visible.length > 0 && (
        <div className="pagination">
          <button
            className="btn-sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >‹ Prev</button>
          <span className="page-info">Page {page} of {totalPages}</span>
          <button
            className="btn-sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >Next ›</button>
        </div>
      )}

      {rows.length > 0 && (
        <div className="meta">
          Showing {paged.length} of {visible.length}
          {filter !== 'all' ? ` ${filter}` : ''} · {rows.length} total wishlisted
        </div>
      )}

      <OrderDrawer open={!!order} initial={order} onClose={() => setOrder(null)} />
      <StockDetailModal item={detail} onClose={() => setDetail(null)} />
    </div>
  )
}
