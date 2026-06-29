import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import TradeRecordModal, { PLATFORMS } from '../TradeRecordModal'
import StockDetailModal from '../StockDetailModal'
import {
  addTradeLot, createTrade, deleteTrade, fetchQuotes, listTrades, removeTradeLot, searchStocks, updateTrade,
} from '../api'

const TABS = [
  { id: 'buy', label: 'Buy' },
  { id: 'sell', label: 'Sell' },
]

// Combine the initial buy + extra lots into total qty, average price, invested.
function aggregate(r) {
  const baseQty = Number(r.qty) || 0
  const lots = r.lots || []
  let qty = baseQty
  let invested = r.buy_price != null ? baseQty * Number(r.buy_price) : 0
  let pricedQty = r.buy_price != null ? baseQty : 0
  for (const l of lots) {
    const lq = Number(l.qty) || 0
    qty += lq
    if (l.price != null) { invested += lq * Number(l.price); pricedQty += lq }
  }
  return {
    qty,
    invested: pricedQty ? invested : null,
    avg: pricedQty ? invested / pricedQty : null,
    lotCount: lots.length + 1,
  }
}

// Per-lot P/L vs the current LTP.
function lotPL(qty, price, ltp) {
  if (price == null || ltp == null || isNaN(price) || isNaN(ltp)) return null
  return { rs: (ltp - price) * qty, pct: ((ltp - price) / price) * 100 }
}

function PLCells({ qty, price, ltp }) {
  const pl = lotPL(qty, price, ltp)
  if (!pl) return (<><td className="num dim">—</td><td className="num dim">—</td></>)
  const cls = pl.rs >= 0 ? 'pos' : 'neg'
  return (
    <>
      <td className={`num ${cls}`}>{pl.rs >= 0 ? '+' : '−'}₹{Math.abs(pl.rs).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
      <td className={`num ${cls}`}>{pl.pct >= 0 ? '+' : ''}{pl.pct.toFixed(2)}%</td>
    </>
  )
}

// Distinct brokers used across the initial buy + lots.
function platformsOf(r) {
  const set = new Set()
  if (r.platform) set.add(r.platform)
  for (const l of (r.lots || [])) if (l.platform) set.add(l.platform)
  return [...set]
}

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

// Small modal to append an extra buy lot (date / qty / price) to a stock.
function AddLotModal({ record, onClose, onSave }) {
  const [date, setDate] = useState(today())
  const [qty, setQty] = useState('')
  const [price, setPrice] = useState('')
  const [platform, setPlatform] = useState('')
  const [err, setErr] = useState(null)
  const [saving, setSaving] = useState(false)
  if (!record) return null
  const save = async () => {
    if (qty === '' || isNaN(Number(qty)) || Number(qty) <= 0) { setErr('Enter a valid quantity'); return }
    setSaving(true); setErr(null)
    try {
      await onSave({ date: date || null, qty: Number(qty), price: price === '' ? null : Number(price), platform: platform || null })
      onClose()
    } catch (e) { setErr(e.message || 'Failed') }
    finally { setSaving(false) }
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-narrow" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Add buy lot — {record.symbol}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="form-grid">
          <div className="form-field">
            <span>Date of bought</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="form-row">
            <div className="form-field">
              <span>No. of stocks</span>
              <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 20" />
            </div>
            <div className="form-field">
              <span>Buy price (₹)</span>
              <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 510" />
            </div>
          </div>
          <div className="form-field">
            <span>Platform</span>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option value="">— Select broker —</option>
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        {err && <div className="error">{err}</div>}
        <div className="form-actions">
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Adding…' : 'Add lot'}</button>
          <button className="btn-sm" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function BuyInfoPage() {
  const [records, setRecords] = useState([])
  const [tab, setTab] = useState('buy')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [detail, setDetail] = useState(null)
  const [lotFor, setLotFor] = useState(null)   // record we're adding a lot to
  const [expanded, setExpanded] = useState(null) // record id whose lots are shown
  const [quotes, setQuotes] = useState({})       // live LTP by symbol/instrument_key

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listTrades()
      const recs = data.records || []
      setRecords(recs)
      // Pull fresh LTPs for live P/L.
      const symbols = [...new Set(recs.map((r) => r.symbol).filter(Boolean))]
      if (symbols.length) {
        try {
          const q = await fetchQuotes(symbols)
          const map = {}
          for (const i of q.instruments || []) {
            if (i.symbol) map[i.symbol] = i.ltp
            if (i.instrument_key) map[i.instrument_key] = i.ltp
          }
          setQuotes(map)
        } catch { /* live prices optional */ }
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const ltpOf = (r) => quotes[r.instrument_key] ?? quotes[r.symbol] ?? r.ltp ?? null

  useEffect(() => { load() }, [load])

  const visible = useMemo(() => records.filter((r) => r.type === tab), [records, tab])

  // Grand totals across all visible stocks (every lot included), plus the live
  // current value from fresh LTPs.
  const { grandTotal, grandCurrent } = useMemo(() => {
    let inv = 0, cur = 0
    for (const r of visible) {
      const agg = aggregate(r)
      inv += agg.invested || 0
      const ltp = quotes[r.instrument_key] ?? quotes[r.symbol] ?? r.ltp
      if (ltp != null && agg.qty) cur += ltp * agg.qty
    }
    return { grandTotal: inv, grandCurrent: cur }
  }, [visible, quotes])
  const overallPct = grandTotal ? ((grandCurrent - grandTotal) / grandTotal) * 100 : null

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

  const onSaveLot = async (lot) => {
    await addTradeLot(lotFor.id, lot)
    await load()
  }

  const onRemoveLot = async (record, index) => {
    setError(null)
    try { await removeTradeLot(record.id, index); await load() }
    catch (e) { setError(`Remove lot failed: ${e.message}`) }
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
        <div className="grand-total">
          Invested ({visible.length} {visible.length === 1 ? 'stock' : 'stocks'}): <b>{fmtMoney(grandTotal)}</b>
          {grandCurrent > 0 && (
            <>
              {' · '}Now: <b>{fmtMoney(grandCurrent)}</b>
              {overallPct != null && (
                <span className={overallPct >= 0 ? 'pos' : 'neg'}> ({overallPct >= 0 ? '+' : ''}{overallPct.toFixed(2)}%)</span>
              )}
            </>
          )}
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
              <th>Platform</th>
              <th className="num">Qty</th>
              <th className="num">Buy ₹</th>
              <th className="num">LTP</th>
              <th className="num">Live P/L</th>
              <th className="num">Sell ₹</th>
              <th className="num">Total</th>
              <th>Date Bought</th>
              <th>Date Sell</th>
              <th className="num">Gain / Loss</th>
              <th className="actions-th">Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, idx) => {
              const agg = aggregate(r)
              const hasLots = agg.lotCount > 1
              const isOpen = expanded === r.id
              return (
                <Fragment key={r.id}>
                  <tr>
                    <td className="dim">{idx + 1}</td>
                    <td className="sym clickable" onClick={() => onShowDetail(r)} title="View historical data & outlook">
                      {r.symbol}
                    </td>
                    <td>
                      {(() => {
                        const plats = platformsOf(r)
                        if (plats.length === 0) return <span className="dim">—</span>
                        if (plats.length === 1) return <span className={`plat-badge plat-${plats[0].toLowerCase()}`}>{plats[0]}</span>
                        return <span className="plat-badge plat-mixed" title={plats.join(', ')}>Mixed ({plats.length})</span>
                      })()}
                    </td>
                    <td className="num">
                      {agg.qty}
                      {hasLots && (
                        <button
                          className="lot-toggle"
                          onClick={() => setExpanded(isOpen ? null : r.id)}
                          title="Show buy lots"
                        >{isOpen ? '▾' : '▸'} {agg.lotCount} lots</button>
                      )}
                    </td>
                    <td className="num" title={hasLots ? 'Average buy price across lots' : ''}>
                      {fmtMoney(agg.avg)}{hasLots && <span className="dim"> avg</span>}
                    </td>
                    <td className="num">{fmtMoney(ltpOf(r))}</td>
                    <td className="num">
                      {(() => {
                        const ltp = ltpOf(r)
                        if (ltp == null || agg.avg == null) return <span className="dim">—</span>
                        const pl = (ltp - agg.avg) / agg.avg * 100
                        const plRs = (ltp - agg.avg) * agg.qty
                        return (
                          <span className={pl >= 0 ? 'pos' : 'neg'} title={`${plRs >= 0 ? '+' : ''}₹${Math.abs(plRs).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}>
                            {pl >= 0 ? '+' : ''}{pl.toFixed(2)}%
                          </span>
                        )
                      })()}
                    </td>
                    <td className="num">{fmtMoney(r.sell_price)}</td>
                    <td className="num">{fmtMoney(agg.invested)}</td>
                    <td>{fmtDate(r.date_bought)}</td>
                    <td>{fmtDate(r.date_sell)}</td>
                    <td className="num">
                      {(() => {
                        // Realized P/L from sell price vs average buy; else the manual %.
                        if (r.sell_price != null && agg.avg != null) {
                          const rs = (r.sell_price - agg.avg) * agg.qty
                          const pct = ((r.sell_price - agg.avg) / agg.avg) * 100
                          const cls = rs >= 0 ? 'pos' : 'neg'
                          return (
                            <b className={cls}>
                              {rs >= 0 ? '+' : '−'}₹{Math.abs(rs).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                              <span className="gl-pct"> ({pct >= 0 ? '+' : ''}{pct.toFixed(2)}%)</span>
                            </b>
                          )
                        }
                        if (r.pct == null) return <span className="dim">—</span>
                        return <b className={r.pct >= 0 ? 'pos' : 'neg'}>{fmtPct(r.pct)}</b>
                      })()}
                    </td>
                    <td className="actions">
                      {r.type === 'buy' && (
                        <button className="trade-btn gtt" onClick={() => setLotFor(r)} title="Add another buy lot">+ Lot</button>
                      )}
                      <button
                        className="trade-btn switch"
                        onClick={() => onSwitch(r)}
                        title={`Move to ${r.type === 'buy' ? 'Sell' : 'Buy'}`}
                      >→ {r.type === 'buy' ? 'Sell' : 'Buy'}</button>
                      <button className="trade-btn gtt" onClick={() => onEdit(r)} title="Edit">Edit</button>
                      <button className="trade-btn sell" onClick={() => onDelete(r)} title="Delete">×</button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="lots-row">
                      <td></td>
                      <td colSpan={12}>
                        <div className="lots-card">
                          <div className="lots-card-title">{r.symbol} — buy lots</div>
                          <table className="lots-table">
                            <thead>
                              <tr>
                                <th>Lot</th>
                                <th>Date</th>
                                <th>Platform</th>
                                <th className="num">Qty</th>
                                <th className="num">Buy ₹</th>
                                <th className="num">LTP</th>
                                <th className="num">Amount</th>
                                <th className="num">P/L</th>
                                <th className="num">P/L %</th>
                                <th className="lots-action"></th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td><span className="lot-tag">Initial</span></td>
                                <td>{fmtDate(r.date_bought)}</td>
                                <td>{r.platform ? <span className={`plat-badge plat-${r.platform.toLowerCase()}`}>{r.platform}</span> : <span className="dim">—</span>}</td>
                                <td className="num">{r.qty}</td>
                                <td className="num">{fmtMoney(r.buy_price)}</td>
                                <td className="num">{fmtMoney(ltpOf(r))}</td>
                                <td className="num">{r.buy_price != null ? fmtMoney(r.qty * r.buy_price) : '—'}</td>
                                <PLCells qty={r.qty} price={r.buy_price} ltp={ltpOf(r)} />
                                <td className="lots-action"></td>
                              </tr>
                              {(r.lots || []).map((l, i) => (
                                <tr key={i}>
                                  <td><span className="lot-tag">Lot {i + 2}</span></td>
                                  <td>{fmtDate(l.date)}</td>
                                  <td>{l.platform ? <span className={`plat-badge plat-${l.platform.toLowerCase()}`}>{l.platform}</span> : <span className="dim">—</span>}</td>
                                  <td className="num">{l.qty}</td>
                                  <td className="num">{fmtMoney(l.price)}</td>
                                  <td className="num">{fmtMoney(ltpOf(r))}</td>
                                  <td className="num">{l.price != null ? fmtMoney(l.qty * l.price) : '—'}</td>
                                  <PLCells qty={l.qty} price={l.price} ltp={ltpOf(r)} />
                                  <td className="lots-action">
                                    <button className="lot-remove" onClick={() => onRemoveLot(r, i)} title="Remove this lot">×</button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr>
                                <td>Total</td>
                                <td></td>
                                <td></td>
                                <td className="num">{agg.qty}</td>
                                <td className="num dim">avg {fmtMoney(agg.avg)}</td>
                                <td className="num">{fmtMoney(ltpOf(r))}</td>
                                <td className="num">{fmtMoney(agg.invested)}</td>
                                <PLCells qty={agg.qty} price={agg.avg} ltp={ltpOf(r)} />
                                <td className="lots-action"></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
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
      {lotFor && <AddLotModal record={lotFor} onClose={() => setLotFor(null)} onSave={onSaveLot} />}
    </div>
  )
}
