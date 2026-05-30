import { useCallback, useEffect, useState } from 'react'
import { fetchHoldings } from '../api'
import GttDrawer from '../GttDrawer'
import PortfolioTable from '../PortfolioTable'

function sumPnl(rows) {
  return rows.reduce((s, r) => s + (r.pnl || 0), 0)
}
function sumValue(rows) {
  return rows.reduce((s, r) => s + (r.last_price || 0) * (r.quantity || 0), 0)
}
function sumInvested(rows) {
  return rows.reduce((s, r) => s + (r.average_price || 0) * (r.quantity || 0), 0)
}

function fmt(n) {
  if (n == null || isNaN(n)) return '-'
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function HoldingsPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [gtt, setGtt] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchHoldings()
      setRows(data.holdings || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const invested = sumInvested(rows)
  const current = sumValue(rows)
  const pnl = sumPnl(rows)
  const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0

  return (
    <div className="page">
      <div className="page-head">
        <h1>Holdings</h1>
        <div className="page-actions">
          <button className="refresh" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="stats">
          <div className="stat"><label>Invested</label><div>₹ {fmt(invested)}</div></div>
          <div className="stat"><label>Current</label><div>₹ {fmt(current)}</div></div>
          <div className={`stat ${pnl >= 0 ? 'pos-bg' : 'neg-bg'}`}>
            <label>P&L</label>
            <div>₹ {fmt(pnl)} <span className="dim">({fmt(pnlPct)}%)</span></div>
          </div>
          <div className="stat"><label>Holdings</label><div>{rows.length}</div></div>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <PortfolioTable rows={rows} kind="holdings" onSetGtt={setGtt} />

      <GttDrawer open={!!gtt} initial={gtt} onClose={() => { setGtt(null); load() }} />
    </div>
  )
}
