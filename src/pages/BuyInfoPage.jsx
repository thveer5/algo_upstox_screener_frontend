import { useCallback, useEffect, useMemo, useState } from 'react'
import TradeRecordModal from '../TradeRecordModal'
import StockDetailModal from '../StockDetailModal'
import { createTrade, deleteTrade, listTrades, searchStocks, updateTrade } from '../api'

const TABS = [
  { id: 'buy', label: 'Buy' },
  { id: 'sell', label: 'Sell' },
]

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d)) return iso
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '—'
  return `${n >= 0 ? '+' : ''}${Number(n).toFixed(2)}%`
}

function fmtMoney(n) {
  if (n == null || isNaN(n)) return '—'
  return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtSigned(n) {
  if (n == null || isNaN(n)) return '—'
  return `${n >= 0 ? '+' : ''}₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

const today = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD, local

export default function BuyInfoPage() {
  const [records, setRecords] = useState([])
  const [tab, setTab] = useState('buy')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [detail, setDetail] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listTrades()
      setRecords(data.records || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const visible = useMemo(() => records.filter((r) => r.type === tab), [records, tab])

  const onAdd = () => { setEditing(null); setShowForm(true) }
  const onEdit = (r) => { setEditing(r); setShowForm(true) }

  // Open the same historical-data modal used in Market Watch. Fetch a fresh
  // live snapshot (high/low/change/streaks) so the modal is fully populated;
  // fall back to the stored record if the lookup fails.
  const onShowDetail = async (r) => {
    let item = {
      symbol: r.symbol,
      instrument_key: r.instrument_key,
      exchange: r.exchange,
      ltp: r.ltp ?? r.buy_price,
    }
    try {
      const d = await searchStocks({ q: r.symbol, pageSize: 10 })
      const list = d.instruments || []
      const match = list.find((i) => i.instrument_key === r.instrument_key)
        || list.find((i) => i.symbol === r.symbol)
      if (match) item = match
    } catch {}
    item.kind = (item.change ?? 0) >= 0 ? 'gainers' : 'losers'
    setDetail(item)
  }

  const onSubmit = async (data, id) => {
    if (id) await updateTrade(id, data)
    else await createTrade(data)
    await load()
  }

  const onDelete = async (r) => {
    if (!confirm(`Delete the ${r.type} record for ${r.symbol}?`)) return
    setError(null)
    try { await deleteTrade(r.id); await load() }
    catch (e) { setError(`Delete failed: ${e.message}`) }
  }

  // Switch a record between buy <-> sell; it moves to the other tab. Stamp the
  // relevant date with today's date if it's still empty.
  const onSwitch = async (r) => {
    const next = r.type === 'buy' ? 'sell' : 'buy'
    const patch = { type: next }
    if (next === 'sell' && !r.date_sell) patch.date_sell = today()
    if (next === 'buy' && !r.date_bought) patch.date_bought = today()
    setError(null)
    try { await updateTrade(r.id, patch); await load() }
    catch (e) { setError(`Switch failed: ${e.message}`) }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Buy Info</h1>
        <div className="page-actions">
          <button className="refresh" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button className="btn-primary" onClick={onAdd}>+ Add {tab === 'sell' ? 'Sell' : 'Buy'}</button>
        </div>
      </div>

      <div className="toolbar">
        <div className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >{t.label}</button>
          ))}
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {visible.length === 0 ? (
        <div className="empty">
          No {tab} records yet. Click <b>+ Add {tab === 'sell' ? 'Sell' : 'Buy'}</b> to create one.
        </div>
      ) : (
        <table className="movers">
          <thead>
            <tr>
              <th>#</th>
              <th>Scrip</th>
              <th className="num">Qty</th>
              <th className="num">Buy ₹</th>
              <th className="num">Sell ₹</th>
              <th>Date Bought</th>
              <th>Date Sell</th>
              <th className="num">Gain / Loss</th>
              <th className="num">After-tax P/L</th>
              <th>Comments</th>
              <th className="actions-th">Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, idx) => (
              <tr key={r.id}>
                <td className="dim">{idx + 1}</td>
                <td className="sym clickable" onClick={() => onShowDetail(r)} title="View historical data & outlook">
                  {r.symbol}
                </td>
                <td className="num">{r.qty}</td>
                <td className="num">{fmtMoney(r.buy_price)}</td>
                <td className="num">{fmtMoney(r.sell_price)}</td>
                <td>{fmtDate(r.date_bought)}</td>
                <td>{fmtDate(r.date_sell)}</td>
                <td className={`num ${r.pct == null ? '' : r.pct >= 0 ? 'pos' : 'neg'}`}>{fmtPct(r.pct)}</td>
                <td className={`num ${r.after_tax_pl == null ? '' : r.after_tax_pl >= 0 ? 'pos' : 'neg'}`}>{fmtSigned(r.after_tax_pl)}</td>
                <td className="comments-cell" title={r.comments || ''}>{r.comments || '—'}</td>
                <td className="actions">
                  <button
                    className="trade-btn switch"
                    onClick={() => onSwitch(r)}
                    title={`Move to ${r.type === 'buy' ? 'Sell' : 'Buy'}`}
                  >→ {r.type === 'buy' ? 'Sell' : 'Buy'}</button>
                  <button className="trade-btn gtt" onClick={() => onEdit(r)} title="Edit">Edit</button>
                  <button className="trade-btn sell" onClick={() => onDelete(r)} title="Delete">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {records.length > 0 && (
        <div className="meta">{visible.length} {tab} record{visible.length === 1 ? '' : 's'} · {records.length} total</div>
      )}

      <TradeRecordModal
        open={showForm}
        initial={editing}
        defaultType={tab}
        onClose={() => setShowForm(false)}
        onSubmit={onSubmit}
      />
      <StockDetailModal item={detail} onClose={() => setDetail(null)} />
    </div>
  )
}
