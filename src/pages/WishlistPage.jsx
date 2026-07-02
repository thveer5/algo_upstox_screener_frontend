import { useCallback, useEffect, useMemo, useState } from 'react'
import OrderDrawer from '../OrderDrawer'
import StockDetailModal from '../StockDetailModal'
import { classifyMarketCap, fmtCrore } from '../marketCap'
import { fetchQuotes } from '../api'
import { fetchWishlist, removeFromWishlist, replaceWishlist } from '../wishlist'

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

function StreakBadge({ rallyStreak, fallStreak }) {
  // Pick whichever streak the stock actually has (at most one is non-zero),
  // independent of the band it was wishlisted under.
  const fall = fallStreak || 0
  const rally = rallyStreak || 0
  const isLoser = fall >= rally
  const streak = isLoser ? fall : rally
  if (!streak || streak < 2) return null
  const icon = isLoser ? (streak >= 4 ? '❄️' : '↓') : (streak >= 4 ? '🔥' : '↑')
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
}

export default function WishlistPage() {
  const [rows, setRows] = useState([])
  const [order, setOrder] = useState(null)
  const [detail, setDetail] = useState(null)
  const [filter, setFilter] = useState('all') // all | gainers | losers
  const [query, setQuery] = useState('')
  const [caps, setCaps] = useState([]) // subset of large/mid/small/micro
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('desc')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [refreshedAt, setRefreshedAt] = useState(null)

  useEffect(() => {
    const sync = () => fetchWishlist().then(setRows)
    sync()
    window.addEventListener('wishlist-changed', sync)
    return () => window.removeEventListener('wishlist-changed', sync)
  }, [])

  const onRemove = useCallback((row) => {
    removeFromWishlist(row)
  }, [])

  const onClear = async () => {
    if (!confirm('Clear the entire wishlist?')) return
    try { await replaceWishlist([]) }
    catch (e) { setError(`Clear failed: ${e.message}`) }
  }

  // Pull fresh live data for every wishlisted scrip and merge it in, keeping
  // each item's original "added" time and band.
  const onRefresh = useCallback(async () => {
    const list = rows
    if (!list.length) return
    setRefreshing(true)
    setError(null)
    try {
      const symbols = [...new Set(list.map((w) => w.symbol).filter(Boolean))]
      const data = await fetchQuotes(symbols)
      const byKey = {}
      const bySym = {}
      for (const i of data.instruments || []) {
        if (i.instrument_key) byKey[i.instrument_key] = i
        if (i.symbol) bySym[i.symbol] = i
      }
      const updated = list.map((w) => {
        const fresh = byKey[w.instrument_key] || bySym[w.symbol]
        // Preserve identity, when-added and the band; overlay fresh quote fields.
        return fresh
          ? { ...w, ...fresh, kind: w.kind, added_at: w.added_at }
          : w
      })
      await replaceWishlist(updated)
      setRefreshedAt(new Date())
    } catch (e) {
      setError(`Refresh failed: ${e.message}`)
    } finally {
      setRefreshing(false)
    }
  }, [rows])

  // Gainer/Loser follows the LIVE change, not the band it was added under.
  const liveKind = (r) => ((r.change_percent ?? r.change ?? 0) >= 0 ? 'gainers' : 'losers')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (filter !== 'all' && liveKind(r) !== filter) return false
      if (q && !(r.symbol || '').toLowerCase().includes(q)) return false
      if (caps.length) {
        const c = classifyMarketCap(r.market_cap)
        if (!c || !caps.includes(c.cls)) return false
      }
      return true
    })
  }, [rows, filter, query, caps])

  const toggleCap = (cls) => {
    setCaps((prev) => (prev.includes(cls) ? prev.filter((c) => c !== cls) : [...prev, cls]))
    setPage(1)
  }

  // Click a header to sort by that column: 1st click desc, 2nd asc, 3rd clears
  // (back to the order items were wishlisted in).
  const toggleSort = (key) => {
    if (sortKey !== key) { setSortKey(key); setSortDir('desc') }
    else if (sortDir === 'desc') setSortDir('asc')
    else { setSortKey(null); setSortDir('desc') }
    setPage(1)
  }

  const sortVal = (r, key) => {
    switch (key) {
      case 'symbol': return (r.symbol || '').toLowerCase()
      case 'added_at': return r.added_at ? new Date(r.added_at).getTime() : null
      case 'change_percent': return r.change_percent ?? r.change ?? null
      default: return r[key] ?? null
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return visible
    const dir = sortDir === 'asc' ? 1 : -1
    return [...visible].sort((a, b) => {
      const va = sortVal(a, sortKey), vb = sortVal(b, sortKey)
      const na = va == null || va === '', nb = vb == null || vb === ''
      if (na && nb) return 0
      if (na) return 1   // missing values always sink to the bottom
      if (nb) return -1
      if (typeof va === 'string') return va.localeCompare(vb) * dir
      return (va - vb) * dir
    })
  }, [visible, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  // Keep the current page in range as the list/filter/page-size change.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const paged = useMemo(
    () => sorted.slice((page - 1) * pageSize, page * pageSize),
    [sorted, page, pageSize],
  )

  // Sortable column header — shows the active ▲/▼ indicator.
  const Th = ({ col, label, num }) => (
    <th
      className={`sortable${num ? ' num' : ''}${sortKey === col ? ' sorted' : ''}`}
      onClick={() => toggleSort(col)}
      title="Click to sort"
    >
      {label}<span className="sort-ind">{sortKey === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}</span>
    </th>
  )

  return (
    <div className="page">
      <div className="page-head">
        <h1>Wishlist</h1>
        <div className="page-actions">
          <button className="refresh" onClick={onRefresh} disabled={refreshing || !rows.length}>
            {refreshing ? 'Refreshing…' : 'Refresh prices'}
          </button>
          <button className="btn-sm" onClick={onClear} disabled={!rows.length}>
            Clear all
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

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
          <div className="wl-search">
            <input
              type="text"
              placeholder="Search scrip…"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1) }}
            />
            {query && (
              <button className="wl-search-clear" onClick={() => { setQuery(''); setPage(1) }} title="Clear">×</button>
            )}
          </div>
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

      <div className="wl-cap-filter">
        <span className="wl-cap-label">Market Cap:</span>
        {[
          { cls: 'large', label: 'Large' },
          { cls: 'mid', label: 'Mid' },
          { cls: 'small', label: 'Small' },
          { cls: 'micro', label: 'Micro' },
        ].map((c) => (
          <button
            key={c.cls}
            className={`cap-chip cap-${c.cls} ${caps.includes(c.cls) ? 'active' : ''}`}
            onClick={() => toggleCap(c.cls)}
          >{c.label}</button>
        ))}
        {caps.length > 0 && (
          <button className="cap-chip cap-clear" onClick={() => { setCaps([]); setPage(1) }}>Clear</button>
        )}
      </div>

      {visible.length === 0 ? (
        rows.length === 0 ? (
          <div className="empty">
            No wishlisted scrips yet. Add some from Market Watch using the ☆ button.
          </div>
        ) : (
          <div className="empty">
            No scrips match your search / filters.
            <div className="empty-hint">Try clearing the search, market-cap chips, or the {filter !== 'all' ? filter : ''} tab.</div>
          </div>
        )
      ) : (
        <table className="movers">
          <thead>
            <tr>
              <th>#</th>
              <Th col="symbol" label="Scrip" />
              <th>From</th>
              <Th col="ltp" label="LTP" num />
              <Th col="change" label="Change" num />
              <Th col="change_percent" label="Change %" num />
              <Th col="ttv" label="Traded Value" num />
              <Th col="vtt" label="Volume" num />
              <Th col="market_cap" label="Market Cap" />
              <Th col="hit_rate" label={<>Hit&nbsp;%</>} num />
              <Th col="added_at" label="Added" />
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
                    <StreakBadge rallyStreak={r.rally_streak} fallStreak={r.fall_streak} />
                  </td>
                  <td>
                    {(() => {
                      const lk = liveKind(r)
                      return (
                        <span className={`cap-badge ${lk === 'losers' ? 'cap-micro' : 'cap-large'}`}>
                          {lk === 'losers' ? 'Loser' : 'Gainer'}
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
                    {cap ? (
                      <span className={`cap-badge cap-${cap.cls}`} title={`Market cap ${fmtCrore(cap.crore)}`}>
                        {cap.tier}
                      </span>
                    ) : (
                      <span className="dim">—</span>
                    )}
                  </td>
                  <td className="num">
                    {r.hit_rate == null
                      ? <span className="dim">—</span>
                      : (() => {
                          const p = Math.round(r.hit_rate * 100)
                          const cls = p >= 55 ? 'pos' : p < 45 ? 'neg' : ''
                          return <span className={cls} title={`Backtest: ${p}% over ${r.hit_calls} past calls`}>{p}%</span>
                        })()}
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
          {refreshedAt && ` · prices updated ${refreshedAt.toLocaleTimeString()}`}
        </div>
      )}

      <OrderDrawer open={!!order} initial={order} onClose={() => setOrder(null)} />
      <StockDetailModal item={detail} onClose={() => setDetail(null)} />
    </div>
  )
}
