import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { toggleWishlist, wishlistedIds } from '../wishlist'

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

  // Mirror the persisted wishlist so the star toggles fill/empty live, and
  // stay in sync if it changes in another tab/page.
  const [wishKeys, setWishKeys] = useState(() => wishlistedIds())
  useEffect(() => {
    const sync = () => setWishKeys(wishlistedIds())
    window.addEventListener('wishlist-changed', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('wishlist-changed', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  // While searching, results are a mix of up/down stocks — derive each row's
  // "kind" from its own change so streak badges / the modal pick the right side.
  const rowKind = useCallback(
    (row) => (isSearching ? ((row.change ?? 0) >= 0 ? 'gainers' : 'losers') : tab),
    [isSearching, tab],
  )

  const onWishlist = useCallback((row) => {
    toggleWishlist(row, rowKind(row))
  }, [rowKind])

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
    const base = isSearching ? (searchRows || []) : rows
    if (!ttvSortDir) return base
    return [...base].sort((a, b) => {
      const va = a.ttv ?? 0
      const vb = b.ttv ?? 0
      return ttvSortDir === 'asc' ? va - vb : vb - va
    })
  }, [rows, searchRows, isSearching, ttvSortDir])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchMovers({ kind: tab, pageSize: 50, index })
      setRows(data.instruments || [])
      setMeta({ updatedAt: data.updatedAt, total: data.metadata?.page?.totalRecords })
    } catch (e) {
      setError(e.message)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [tab, index])

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
