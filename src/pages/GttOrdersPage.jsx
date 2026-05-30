import { useCallback, useEffect, useState } from 'react'
import { cancelGtt, listGtt } from '../api'

function fmt(n) {
  if (n == null || isNaN(n)) return '-'
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function ruleSummary(rule) {
  const t = rule.trigger_type === 'ABOVE' ? '↗ above' : rule.trigger_type === 'BELOW' ? '↘ below' : rule.trigger_type
  return `${t} ${fmt(rule.trigger_price)}`
}

export default function GttOrdersPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showCancelled, setShowCancelled] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listGtt()
      setRows(data.upstox_response?.data || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const onCancel = async (id) => {
    if (!confirm(`Cancel GTT ${id}?`)) return
    setError(null)
    try {
      await cancelGtt(id)
      await load()
    } catch (e) { setError(`Cancel failed: ${e.message}`) }
  }

  useEffect(() => { load() }, [load])

  const visible = showCancelled
    ? rows
    : rows.filter(r => r.rules?.some(rule => rule.status !== 'CANCELLED'))

  return (
    <div className="page">
      <div className="page-head">
        <h1>GTT Orders</h1>
        <div className="page-actions">
          <label className="chk">
            <input type="checkbox" checked={showCancelled} onChange={e => setShowCancelled(e.target.checked)} />
            {' '}Show cancelled
          </label>
          <button className="refresh" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {visible.length === 0 ? (
        <div className="empty">No {showCancelled ? '' : 'active '}GTTs.</div>
      ) : (
        <table className="movers">
          <thead>
            <tr>
              <th>#</th>
              <th>Scrip</th>
              <th>Type</th>
              <th className="num">Qty</th>
              <th>Side</th>
              <th>Triggers</th>
              <th>Status</th>
              <th className="actions-th">Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((g, idx) => {
              const allCancelled = g.rules?.every(r => r.status === 'CANCELLED')
              const allTriggered = g.rules?.every(r => r.status === 'TRIGGERED' || r.status === 'COMPLETED')
              const txn = g.rules?.[0]?.transaction_type
              const status = allCancelled ? 'CANCELLED' : allTriggered ? 'DONE' : 'ACTIVE'
              return (
                <tr key={g.gtt_order_id}>
                  <td className="dim">{idx + 1}</td>
                  <td className="sym">{g.trading_symbol} <span className="seg">{g.exchange}</span></td>
                  <td>{g.type}</td>
                  <td className="num">{g.quantity}</td>
                  <td className={txn === 'SELL' ? 'neg' : 'pos'}>{txn}</td>
                  <td>{g.rules?.map(ruleSummary).join(' · ')}</td>
                  <td>
                    <span className={`status-pill status-${status.toLowerCase()}`}>{status}</span>
                  </td>
                  <td className="actions">
                    {status === 'ACTIVE' && (
                      <button className="trade-btn sell" onClick={() => onCancel(g.gtt_order_id)} title="Cancel">×</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
