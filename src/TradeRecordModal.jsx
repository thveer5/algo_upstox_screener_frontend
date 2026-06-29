import { useEffect, useState } from 'react'
import StockSearchInput from './StockSearchInput'

export const PLATFORMS = ['Zerodha', 'Upstox', 'Dhan']

// Add/Edit modal for a Buy or Sell trade record. Persistence is handled by the
// parent via onSubmit(data, id) so the page can hit the API and reload.
export default function TradeRecordModal({ open, initial, defaultType, onClose, onSubmit }) {
  const [type, setType] = useState('buy')
  const [stock, setStock] = useState(null)
  const [qty, setQty] = useState('')
  const [dateBought, setDateBought] = useState('')
  const [dateSell, setDateSell] = useState('')
  const [buyPrice, setBuyPrice] = useState('')
  const [sellPrice, setSellPrice] = useState('')
  const [pct, setPct] = useState('')
  const [afterTaxPl, setAfterTaxPl] = useState('')
  const [platform, setPlatform] = useState('')
  const [comments, setComments] = useState('')
  const [err, setErr] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setType(initial?.type || defaultType || 'buy')
    setStock(initial
      ? { symbol: initial.symbol, instrument_key: initial.instrument_key, exchange: initial.exchange, ltp: initial.ltp }
      : null)
    setQty(initial?.qty ?? '')
    setDateBought(initial?.date_bought || '')
    setDateSell(initial?.date_sell || '')
    setBuyPrice(initial?.buy_price ?? '')
    setSellPrice(initial?.sell_price ?? '')
    setPct(initial?.pct ?? '')
    setAfterTaxPl(initial?.after_tax_pl ?? '')
    setPlatform(initial?.platform || '')
    setComments(initial?.comments || '')
    setErr(null)
    setSaving(false)
  }, [open, initial, defaultType])

  // Auto-compute % gain/loss from buy & sell price when both are valid.
  useEffect(() => {
    const b = Number(buyPrice), s = Number(sellPrice)
    if (buyPrice !== '' && sellPrice !== '' && b > 0 && !isNaN(s)) {
      setPct((((s - b) / b) * 100).toFixed(2))
    }
  }, [buyPrice, sellPrice])

  // Gross P/L hint = (sell - buy) * qty.
  const grossPl = (() => {
    const b = Number(buyPrice), s = Number(sellPrice), q = Number(qty)
    if (buyPrice === '' || sellPrice === '' || qty === '' || isNaN(b) || isNaN(s) || isNaN(q)) return null
    return (s - b) * q
  })()

  // Total invested = qty * buy price.
  const total = (() => {
    const b = Number(buyPrice), q = Number(qty)
    if (buyPrice === '' || qty === '' || isNaN(b) || isNaN(q)) return null
    return b * q
  })()

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const save = async () => {
    if (!stock?.symbol) { setErr('Pick a stock from the suggestions'); return }
    if (qty === '' || isNaN(Number(qty)) || Number(qty) <= 0) { setErr('Enter a valid quantity'); return }
    const data = {
      type,
      symbol: stock.symbol,
      instrument_key: stock.instrument_key || null,
      exchange: stock.exchange || 'NSE',
      ltp: stock.ltp ?? null,
      qty: Number(qty),
      date_bought: dateBought || null,
      date_sell: dateSell || null,
      buy_price: buyPrice === '' ? null : Number(buyPrice),
      sell_price: sellPrice === '' ? null : Number(sellPrice),
      pct: pct === '' ? null : Number(pct),
      after_tax_pl: afterTaxPl === '' ? null : Number(afterTaxPl),
      platform: platform || null,
      comments: comments.trim() || null,
    }
    setSaving(true)
    setErr(null)
    try {
      await onSubmit?.(data, initial?.id)
      onClose?.()
    } catch (e) {
      setErr(e.message || 'Save failed')
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-narrow" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{initial ? 'Edit' : 'Add'} {type === 'sell' ? 'sell' : 'buy'} record</h2>
          <button className="modal-close" onClick={onClose} title="Close (Esc)">×</button>
        </div>

        <div className="form-grid">
          <div className="form-field">
            <span>Type</span>
            <div className="seg-toggle">
              <button type="button" className={type === 'buy' ? 'active' : ''} onClick={() => setType('buy')}>Buy</button>
              <button type="button" className={type === 'sell' ? 'active' : ''} onClick={() => setType('sell')}>Sell</button>
            </div>
          </div>

          <div className="form-field">
            <span>Stock name</span>
            <StockSearchInput value={stock?.symbol || ''} onSelect={setStock} />
          </div>

          <div className="form-field">
            <span>Platform</span>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option value="">— Select broker —</option>
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div className="form-field">
            <span>No. of stocks</span>
            <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 10" />
          </div>

          <div className="form-field">
            <span>Date of bought</span>
            <input type="date" value={dateBought} onChange={(e) => setDateBought(e.target.value)} />
          </div>

          <div className="form-field">
            <span>Date of sell</span>
            <input type="date" value={dateSell} onChange={(e) => setDateSell(e.target.value)} />
          </div>

          <div className="form-row">
            <div className="form-field">
              <span>Buy price (₹)</span>
              <input type="number" step="0.01" min="0" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} placeholder="e.g. 3500" />
            </div>
            <div className="form-field">
              <span>Sell price (₹)</span>
              <input type="number" step="0.01" min="0" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} placeholder="e.g. 3700" />
            </div>
          </div>

          <div className="form-field">
            <span>Total <em className="hint">(Qty × Buy price)</em></span>
            <input
              type="text"
              readOnly
              className="readonly-field"
              value={total != null ? `₹${total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}
            />
          </div>

          <div className="form-field">
            <span>% gain / loss {buyPrice !== '' && sellPrice !== '' && <em className="hint">(auto)</em>}</span>
            <input type="number" step="0.01" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="e.g. 8.5 or -3.2" />
          </div>

          <div className="form-field">
            <span>
              After-tax profit / loss (₹)
              {grossPl != null && <em className="hint"> · gross {grossPl >= 0 ? '+' : ''}{grossPl.toLocaleString('en-IN')}</em>}
            </span>
            <input type="number" step="0.01" value={afterTaxPl} onChange={(e) => setAfterTaxPl(e.target.value)} placeholder="net after charges/taxes" />
          </div>

          <div className="form-field">
            <span>Comments</span>
            <textarea
              rows={2}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Optional notes (reason, target, etc.)"
            />
          </div>
        </div>

        {err && <div className="error">{err}</div>}

        <div className="form-actions">
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Add record'}
          </button>
          <button className="btn-sm" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
