import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  bootstrapTvSession,
  fetchIndices,
  fetchMovers,
  refreshTvSession,
  searchStocks,
} from '../api'
import MoversTable from '../MoversTable'
import OrderDrawer from '../OrderDrawer'
import StockDetailModal from '../StockDetailModal'
import { addToWishlist, fetchWishlist, idsOf, removeFromWishlist } from '../wishlist'

const TABS = [
  { id: 'gainers', label: 'Gainers' },
  { id: 'losers', label: 'Losers' },
]

export default function MarketWatchPage() {
  const [tab, setTab] = useState('gainers')
  const [index, setIndex] = useState('all')
  const [indices, setIndices] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [meta, setMeta] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [showBootstrap, setShowBootstrap] = useState(false)
  const [bootstrapValue, setBootstrapValue] = useState('')
  const [order, setOrder] = useState(null)
  const [detail, setDetail] = useState(null)
  const [search, setSearch] = useState('')
  const [searchRows, setSearchRows] = useState(null) // null = not searching
  const [searchLoading, setSearchLoading] = useState(false)

  // ----- Filters (panel) -----
  const [showFilters, setShowFilters] = useState(false)
  const filterRef = useRef(null)
  const [caps, setCaps] = useState([])        // selected market-cap tiers (backend)
  const [streak, setStreak] = useState('any') // D-streak filter (client-side)

  // Change% range filter (applied to the screener query). Raw inputs are
  // debounced into the applied values that `load` actually uses.
  const [changeMinInput, setChangeMinInput] = useState('')
  const [changeMaxInput, setChangeMaxInput] = useState('')
  const [changeMin, setChangeMin] = useState('')
  const [changeMax, setChangeMax] = useState('')
  useEffect(() => {
    const t = setTimeout(() => {
      setChangeMin(changeMinInput.trim())
      setChangeMax(changeMaxInput.trim())
    }, 400)
    return () => clearTimeout(t)
  }, [changeMinInput, changeMaxInput])

  // Close the filter panel on outside click.
  useEffect(() => {
    const onDoc = (e) => { if (filterRef.current && !filterRef.current.contains(e.target)) setShowFilters(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const capsKey = caps.join(',')
  const toggleCap = (t) => setCaps((prev) => (prev.includes(t) ? prev.filter((c) => c !== t) : [...prev, t]))
  const activeFilterCount =
    (caps.length ? 1 : 0) + (changeMin || changeMax ? 1 : 0) + (streak !== 'any' ? 1 : 0)
  const clearFilters = () => {
    setCaps([]); setStreak('any')
    setChangeMinInput(''); setChangeMaxInput('')
  }

  const query = search.trim()
  const isSearching = query.length >= 2

  // Debounced full-universe symbol search (covers stocks not in the movers
  // list). Ignores the index dropdown — you're looking up a specific scrip.
  useEffect(() => {
    if (!isSearching) { setSearchRows(null); setSearchLoading(false); return }
    let cancelled = false
    setSearchLoading(true)
    const t = setTimeout(() => {
      searchStocks({ q: query })
        .then((d) => { if (!cancelled) setSearchRows(d.instruments || []) })
        .catch(() => { if (!cancelled) setSearchRows([]) })
        .finally(() => { if (!cancelled) setSearchLoading(false) })
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query, isSearching])

  // Mirror the persisted (DB-backed) wishlist so the star toggles fill/empty,
  // and re-sync whenever it changes.
  const [wishKeys, setWishKeys] = useState(new Set())
  useEffect(() => {
    const sync = () => fetchWishlist().then((items) => setWishKeys(idsOf(items)))
    sync()
    window.addEventListener('wishlist-changed', sync)
    return () => window.removeEventListener('wishlist-changed', sync)
  }, [])

  // While searching, results are a mix of up/down stocks — derive each row's
  // "kind" from its own change so streak badges / the modal pick the right side.
  const rowKind = useCallback(
    (row) => (isSearching ? ((row.change ?? 0) >= 0 ? 'gainers' : 'losers') : tab),
    [isSearching, tab],
  )

  const onWishlist = useCallback(async (row) => {
    const key = row.instrument_key || row.symbol
    const has = wishKeys.has(key)
    // Optimistic star toggle; the 'wishlist-changed' event re-syncs from the DB.
    setWishKeys((prev) => {
      const next = new Set(prev)
      if (has) next.delete(key); else next.add(key)
      return next
    })
    try {
      if (has) await removeFromWishlist(row)
      else await addToWishlist(row, rowKind(row))
    } catch {
      // Revert on failure.
      setWishKeys((prev) => {
        const next = new Set(prev)
        if (has) next.add(key); else next.delete(key)
        return next
      })
    }
  }, [wishKeys, rowKind])

  // Sort direction by Traded Value, keyed per (index, tab) and persisted to localStorage.
  // Values: 'desc' | 'asc' | undefined (undefined = backend order).
  const [ttvSortMap, setTtvSortMap] = useState(() => {
    try {
      const stored = localStorage.getItem('mw_ttv_sort')
      return stored ? JSON.parse(stored) : {}
    } catch {
      return {}
    }
  })
  const sortKey = `${index}:${tab}`
  const ttvSortDir = ttvSortMap[sortKey]

  const cycleTtvSort = useCallback(() => {
    setTtvSortMap((prev) => {
      const cur = prev[sortKey]
      const next = cur === undefined ? 'desc' : cur === 'desc' ? 'asc' : undefined
      const updated = { ...prev }
      if (next === undefined) delete updated[sortKey]
      else updated[sortKey] = next
      try { localStorage.setItem('mw_ttv_sort', JSON.stringify(updated)) } catch {}
      return updated
    })
  }, [sortKey])

  const displayRows = useMemo(() => {
    // When searching, show full-universe results from the backend; otherwise the
    // current movers list.
    let base = isSearching ? (searchRows || []) : rows
    // Streak filter is client-side (streaks aren't a screener field).
    if (streak !== 'any') {
      base = base.filter((r) => {
        const s = Math.max(r.rally_streak || 0, r.fall_streak || 0)
        if (streak === 'd1') return s === 1
        if (streak === 'd2') return s >= 2
        if (streak === 'd3') return s >= 3
        if (streak === 'd5') return s >= 5
        return true
      })
    }
    if (!ttvSortDir) return base
    return [...base].sort((a, b) => {
      const va = a.ttv ?? 0
      const vb = b.ttv ?? 0
      return ttvSortDir === 'asc' ? va - vb : vb - va
    })
  }, [rows, searchRows, isSearching, ttvSortDir, streak])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchMovers({ kind: tab, pageSize: 50, index, changeMin, changeMax, caps })
      setRows(data.instruments || [])
      setMeta({ updatedAt: data.updatedAt, total: data.metadata?.page?.totalRecords })
    } catch (e) {
      setError(e.message)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [tab, index, changeMin, changeMax, capsKey])

  const onRefreshTv = async () => {
    setRefreshing(true)
    setError(null)
    try { await refreshTvSession(); await load() }
    catch (e) { setError(`TV session refresh failed: ${e.message}`) }
    finally { setRefreshing(false) }
  }

  const onBootstrap = async () => {
    setError(null)
    try {
      const isCookie = bootstrapValue.includes(';') || bootstrapValue.includes('refresh_token=')
      await bootstrapTvSession(
        isCookie ? { cookie: bootstrapValue } : { refresh_token: bootstrapValue.trim() }
      )
      setShowBootstrap(false)
      setBootstrapValue('')
      await load()
    } catch (e) { setError(`Bootstrap failed: ${e.message}`) }
  }

  useEffect(() => { load() }, [load])
  useEffect(() => { fetchIndices().then(d => setIndices(d.indices || [])).catch(() => {}) }, [])

  // Auto-refresh every 15s; pauses when the browser tab isn't visible so we
  // don't burn screener calls when the dashboard is in the background.
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) load()
    }, 15000)
    return () => clearInterval(id)
  }, [load])

  return (
    <div className="page">
      <div className="page-head">
        <h1>Market Watch</h1>
        <div className="page-actions">
          <button className="btn-sm" onClick={onRefreshTv} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh TV'}
          </button>
          <button className="btn-sm" onClick={() => setShowBootstrap(s => !s)}>Bootstrap</button>
        </div>
      </div>

      {showBootstrap && (
        <div className="bootstrap-card">
          <p>Paste your <b>full Cookie header</b> from tv.upstox.com OR just the <b>refresh_token JWT</b>.</p>
          <textarea
            value={bootstrapValue}
            onChange={e => setBootstrapValue(e.target.value)}
            placeholder="Cookie: ...; refresh_token=eyJ...   OR  eyJ..."
            rows={4}
          />
          <div className="row">
            <button onClick={onBootstrap} disabled={!bootstrapValue.trim()}>Save</button>
            <button onClick={() => { setShowBootstrap(false); setBootstrapValue('') }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="toolbar">
        <div className="tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >{t.label}</button>
          ))}
        </div>
        <div className="filters">
          <input
            className="search-input"
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search scrip…"
          />
          <select value={index} onChange={e => setIndex(e.target.value)}>
            {indices.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>

          <div className="filter-wrap" ref={filterRef}>
            <button
              className={`btn-sm filter-btn ${activeFilterCount ? 'has-active' : ''}`}
              onClick={() => setShowFilters(s => !s)}
              title="Filters"
            >
              ⚲ Filters{activeFilterCount > 0 && <span className="filter-count">{activeFilterCount}</span>}
            </button>
            {showFilters && (
              <div className="filter-panel">
                <div className="filter-section">
                  <div className="filter-title">Market Cap</div>
                  {[
                    { id: 'large', label: 'Large Cap' },
                    { id: 'mid', label: 'Mid Cap' },
                    { id: 'small', label: 'Small Cap' },
                    { id: 'micro', label: 'Micro Cap' },
                  ].map(c => (
                    <label key={c.id} className="filter-check">
                      <input type="checkbox" checked={caps.includes(c.id)} onChange={() => toggleCap(c.id)} />
                      {c.label}
                    </label>
                  ))}
                </div>

                <div className="filter-section">
                  <div className="filter-title">Change %</div>
                  <div className="filter-range">
                    <input type="number" step="0.1" placeholder="min" value={changeMinInput} onChange={e => setChangeMinInput(e.target.value)} />
                    <span>–</span>
                    <input type="number" step="0.1" placeholder="max" value={changeMaxInput} onChange={e => setChangeMaxInput(e.target.value)} />
                  </div>
                </div>

                <div className="filter-section">
                  <div className="filter-title">Streak (consecutive days)</div>
                  <select value={streak} onChange={e => setStreak(e.target.value)}>
                    <option value="any">Any</option>
                    <option value="d1">D1 only (first day)</option>
                    <option value="d2">D2 or more</option>
                    <option value="d3">D3 or more</option>
                    <option value="d5">D5 or more</option>
                  </select>
                </div>

                <div className="filter-actions">
                  <button className="btn-sm" onClick={clearFilters} disabled={!activeFilterCount}>Clear all</button>
                  <button className="btn-primary" onClick={() => setShowFilters(false)}>Done</button>
                </div>
              </div>
            )}
          </div>

          <button className="refresh" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {isSearching && searchLoading && displayRows.length === 0 ? (
        <div className="empty">Searching “{query}”…</div>
      ) : (
        <MoversTable
          rows={displayRows}
          kind={isSearching ? 'search' : tab}
          onTrade={setOrder}
          onWishlist={onWishlist}
          onRowClick={(r) => setDetail({ ...r, kind: rowKind(r) })}
          wishlistedKeys={wishKeys}
          ttvSortDir={ttvSortDir}
          onSortTtv={cycleTtvSort}
        />
      )}

      {isSearching ? (
        <div className="meta">
          {searchLoading ? 'Searching…' : `${displayRows.length} result${displayRows.length === 1 ? '' : 's'} for "${query}" · all NSE`}
        </div>
      ) : meta && (
        <div className="meta">
          {meta.total ? `${rows.length} of ${meta.total} rows` : `${rows.length} rows`}
          {meta.updatedAt && ` · updated ${new Date(meta.updatedAt).toLocaleTimeString()}`}
        </div>
      )}

      <OrderDrawer open={!!order} initial={order} onClose={() => setOrder(null)} />
      <StockDetailModal item={detail} onClose={() => setDetail(null)} />
    </div>
  )
}
