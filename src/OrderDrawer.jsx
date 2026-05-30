import { useEffect, useState } from 'react'
import { placeGtt, placeOrder } from './api'

// Order placement drawer.
//   Mode 'form'   -> user edits
//   Mode 'review' -> shows exactly what will be sent to Upstox, with PLACE button
//   Mode 'result' -> shows order_id + any GTT response
//
// If user enables Stop Loss or Target, we place the entry order FIRST and the
// GTT SECOND. If the entry order fails, the GTT is skipped.

const PRODUCT_LABELS = { I: 'Intraday (MIS)', D: 'Delivery (CNC)' }

function fmt(n) {
  if (n == null || isNaN(n)) return '-'
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function OrderDrawer({ open, onClose, initial }) {
  // initial = { side: 'BUY'|'SELL', row: { symbol, instrument_key, ltp, ... } }
  const [mode, setMode] = useState('form')
  const [side, setSide] = useState('BUY')
  const [qty, setQty] = useState(1)
  const [product, setProduct] = useState('D')
  const [orderType, setOrderType] = useState('MARKET')
  const [price, setPrice] = useState('')
  const [useSL, setUseSL] = useState(false)
  const [slTrigger, setSlTrigger] = useState('')
  const [useTarget, setUseTarget] = useState(false)
  const [targetTrigger, setTargetTrigger] = useState('')
  const [isAmo, setIsAmo] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  // Reset whenever a new stock is opened
  useEffect(() => {
    if (!initial) return
    setMode('form')
    setSide(initial.side || 'BUY')
    setQty(1)
    setProduct('D')
    setOrderType('MARKET')
    setPrice(initial.row?.ltp ? String(initial.row.ltp) : '')
    setUseSL(false)
    setSlTrigger('')
    setUseTarget(false)
    setTargetTrigger('')
    setIsAmo(false)
    setResult(null)
    setError(null)
  }, [initial])

  if (!open || !initial) return null
  const r = initial.row
  const isLimit = orderType === 'LIMIT'

  // GTT exit transaction is the opposite of entry
  const exitTxn = side === 'BUY' ? 'SELL' : 'BUY'

  const entryRequest = {
    instrument_token: r.instrument_key,
    transaction_type: side,
    quantity: Number(qty),
    product,
    order_type: orderType,
    price: isLimit ? Number(price) : 0,
    trigger_price: 0,
    validity: 'DAY',
    disclosed_quantity: 0,
    is_amo: isAmo,
    tag: 'algo-dashboard',
  }

  const gttRequest = (useSL || useTarget) ? {
    instrument_token: r.instrument_key,
    transaction_type: exitTxn,
    quantity: Number(qty),
    product,
    stoploss_trigger: useSL ? Number(slTrigger) : null,
    target_trigger: useTarget ? Number(targetTrigger) : null,
  } : null

  const estCost = (Number(qty) || 0) * (isLimit ? Number(price) || 0 : r.ltp || 0)
  const valid = qty > 0
    && (!isLimit || Number(price) > 0)
    && (!useSL || Number(slTrigger) > 0)
    && (!useTarget || Number(targetTrigger) > 0)
    && r.instrument_key

  const onReview = () => {
    setError(null)
    if (!valid) {
      setError('Fill all required fields with valid values.')
      return
    }
    setMode('review')
  }

  const onPlace = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const entry = await placeOrder(entryRequest)
      let gtt = null
      if (gttRequest) {
        try { gtt = await placeGtt(gttRequest) }
        catch (e) { gtt = { error: e.message } }
      }
      setResult({ entry, gtt })
      setMode('result')
    } catch (e) {
      const msg = String(e.message || '')
      if (msg.includes('UDAPI100050') || msg.includes('Invalid token') || msg.startsWith('HTTP 401')) {
        setError('Upstox OAuth token expired (resets daily at 3:30 AM IST). Click "Login" in the sidebar to re-authenticate, then try again.')
      } else if (msg.includes('UDAPI1162')) {
        setError('Upstox has discontinued AMO placement via API (UDAPI1162). The Upstox app uses internal APIs that still allow it. Two workarounds: (1) place during market hours 9:15 AM–3:30 PM IST, (2) place AMO directly in the Upstox app.')
      } else {
        setError(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className={`drawer ${side === 'BUY' ? 'buy-side' : 'sell-side'}`}>
        <header className="drawer-head">
          <div>
            <div className="drawer-side">{side}</div>
            <div className="drawer-sym">{r.symbol}</div>
            <div className="drawer-ltp">LTP {fmt(r.ltp)}</div>
          </div>
          <button className="drawer-close" onClick={onClose}>×</button>
        </header>

        {mode === 'form' && (
          <div className="drawer-body">
            <div className="seg-toggle">
              {['BUY', 'SELL'].map(s => (
                <button
                  key={s}
                  className={`seg ${side === s ? 'active' : ''} ${s.toLowerCase()}`}
                  onClick={() => setSide(s)}
                >{s}</button>
              ))}
            </div>

            <label>Quantity
              <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} />
            </label>

            <div className="seg-toggle">
              {Object.entries(PRODUCT_LABELS).map(([k, v]) => (
                <button
                  key={k}
                  className={`seg ${product === k ? 'active' : ''}`}
                  onClick={() => setProduct(k)}
                >{v}</button>
              ))}
            </div>

            <div className="seg-toggle">
              {['MARKET', 'LIMIT'].map(t => (
                <button
                  key={t}
                  className={`seg ${orderType === t ? 'active' : ''}`}
                  onClick={() => setOrderType(t)}
                >{t}</button>
              ))}
            </div>

            {isLimit && (
              <label>Limit price
                <input type="number" step="0.05" value={price} onChange={e => setPrice(e.target.value)} />
              </label>
            )}

            <div className="check-row">
              <label className="chk"><input type="checkbox" checked={useSL} onChange={e => setUseSL(e.target.checked)} /> Stop Loss (GTT)</label>
              {useSL && (
                <input type="number" step="0.05" value={slTrigger} placeholder="trigger price"
                  onChange={e => setSlTrigger(e.target.value)} />
              )}
            </div>

            <div className="check-row">
              <label className="chk"><input type="checkbox" checked={useTarget} onChange={e => setUseTarget(e.target.checked)} /> Target (GTT)</label>
              {useTarget && (
                <input type="number" step="0.05" value={targetTrigger} placeholder="trigger price"
                  onChange={e => setTargetTrigger(e.target.value)} />
              )}
            </div>

            <label className="chk amo-row">
              <input type="checkbox" checked={isAmo} onChange={e => setIsAmo(e.target.checked)} />
              After-Market Order (AMO)
              <span className="hint">use outside 9:15 AM – 3:30 PM IST · API support may be restricted</span>
            </label>

            <div className="est">
              Est. value: <b>₹ {fmt(estCost)}</b>
            </div>

            {error && <div className="drawer-error">{error}</div>}

            <div className="drawer-actions">
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button className={`btn-primary ${side.toLowerCase()}`} onClick={onReview} disabled={!valid}>
                Review →
              </button>
            </div>
          </div>
        )}

        {mode === 'review' && (
          <div className="drawer-body">
            <div className="review-warn">
              ⚠ Live order — real money. Verify the details below before placing.
            </div>

            <div className="review-card">
              <h4>Entry order</h4>
              <pre>{JSON.stringify(entryRequest, null, 2)}</pre>
            </div>

            {gttRequest && (
              <div className="review-card">
                <h4>GTT (placed after entry succeeds)</h4>
                <pre>{JSON.stringify(gttRequest, null, 2)}</pre>
              </div>
            )}

            {error && <div className="drawer-error">{error}</div>}

            <div className="drawer-actions">
              <button className="btn-secondary" onClick={() => setMode('form')} disabled={submitting}>← Back</button>
              <button className={`btn-primary ${side.toLowerCase()}`} onClick={onPlace} disabled={submitting}>
                {submitting ? 'Placing…' : `PLACE ${side} ORDER`}
              </button>
            </div>
          </div>
        )}

        {mode === 'result' && result && (
          <div className="drawer-body">
            <div className="success">Order submitted</div>
            <div className="review-card">
              <h4>Entry response</h4>
              <pre>{JSON.stringify(result.entry, null, 2)}</pre>
            </div>
            {result.gtt && (
              <div className="review-card">
                <h4>GTT response</h4>
                <pre>{JSON.stringify(result.gtt, null, 2)}</pre>
              </div>
            )}
            <div className="drawer-actions">
              <button className="btn-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </aside>
    </>
  )
}
