import { useCallback, useEffect, useState } from 'react'
import {
  bootstrapTvSession,
  fetchIndices,
  fetchMovers,
  refreshTvSession,
} from '../api'
import MoversTable from '../MoversTable'
import OrderDrawer from '../OrderDrawer'

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
          <select value={index} onChange={e => setIndex(e.target.value)}>
            {indices.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <button className="refresh" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <MoversTable rows={rows} onTrade={setOrder} />

      {meta && (
        <div className="meta">
          {meta.total ? `${rows.length} of ${meta.total} rows` : `${rows.length} rows`}
          {meta.updatedAt && ` · updated ${new Date(meta.updatedAt).toLocaleTimeString()}`}
        </div>
      )}

      <OrderDrawer open={!!order} initial={order} onClose={() => setOrder(null)} />
    </div>
  )
}
