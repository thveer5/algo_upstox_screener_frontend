import { useEffect, useState } from 'react'
import { placeGtt, placeTrailingGtt } from './api'

// Drawer for setting Stop Loss / Trailing / Target on an existing holding.
// Mirrors Upstox's pro UI model: SL trigger and trailing-gap are INDEPENDENT
// (trailing is a sub-option of SL — you must enable SL to enable trailing).
//
// Routing:
//   useSL + useTrailing            -> POST /api/orders/trailing-gtt    (internal API, native trailing)
//   useSL only (no trailing)       -> POST /api/orders/gtt              (public v3, single SL)
//   useSL + useTrailing + useTarget -> trailing-gtt + separate target GTT (2 calls)
//   useTarget only                 -> POST /api/orders/gtt              (single target)
//   useSL + useTarget (no trailing) -> POST /api/orders/gtt              (OCO)

function fmt(n) {
  if (n == null || isNaN(n)) return '-'
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function GttDrawer({ open, onClose, initial }) {
  const [mode, setMode] = useState('form')
  const [qty, setQty] = useState(1)
  const [product, setProduct] = useState('D')

  const [useSL, setUseSL] = useState(false)
  const [slTrigger, setSlTrigger] = useState('')
  const [slPct, setSlPct] = useState('')

  const [useTrailing, setUseTrailing] = useState(false)
  const [trailType, setTrailType] = useState('amount')   // amount (₹) or percent (%)
  const [trailValue, setTrailValue] = useState('')

  const [useTarget, setUseTarget] = useState(false)
  const [targetTrigger, setTargetTrigger] = useState('')
  const [targetPct, setTargetPct] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!initial) return
    setMode('form')
    setQty(Math.abs(initial.row?.quantity || 1))
    setProduct(initial.row?.product || 'D')
    setUseSL(false)
    setSlTrigger('')
    setSlPct('')
    setUseTrailing(false)
    setTrailType('amount')
    setTrailValue('')
    setUseTarget(false)
    setTargetTrigger('')
    setTargetPct('')
    setResults(null)
    setError(null)
  }, [initial])

  // Disable trailing automatically when SL is unchecked
  useEffect(() => { if (!useSL) setUseTrailing(false) }, [useSL])

  if (!open || !initial) return null
  const r = initial.row
  const symbol = r.tradingsymbol || r.trading_symbol || r.symbol
  const instrument_token = r.instrument_token || r.instrument_key
  const ltp = r.last_price ?? r.ltp

  // Detect short position: positions API returns negative quantity for shorts.
  // Holdings are always long. The `initial.side` prop wins if explicitly passed.
  const isShort = initial.side
    ? initial.side === 'BUY'
    : (r.quantity != null && r.quantity < 0)
  const side = isShort ? 'BUY' : 'SELL'
  const exitQty = Math.abs(r.quantity || 1)

  // For SL: long -> "SELL if price drops below trigger" (trigger < LTP)
  //         short -> "BUY if price rises above trigger" (trigger > LTP)
  // For Target: long -> "SELL if price rises above trigger" (trigger > LTP)
  //             short -> "BUY if price drops below trigger" (trigger < LTP)
  const slDirection = isShort ? 'rises' : 'drops'
  const targetDirection = isShort ? 'drops' : 'rises'

  // ₹ <-> % sync helpers. % is "% adverse to LTP" for SL, "% favorable to LTP" for Target.
  const updateSlRupee = (val) => {
    setSlTrigger(val)
    if (val !== '' && ltp) {
      const diff = isShort ? (Number(val) - ltp) : (ltp - Number(val))
      setSlPct((diff / ltp * 100).toFixed(2))
    } else setSlPct('')
  }
  const updateSlPercent = (val) => {
    setSlPct(val)
    if (val !== '' && ltp) {
      const v = isShort ? ltp * (1 + Number(val) / 100) : ltp * (1 - Number(val) / 100)
      setSlTrigger(v.toFixed(2))
    } else setSlTrigger('')
  }
  const updateTargetRupee = (val) => {
    setTargetTrigger(val)
    if (val !== '' && ltp) {
      const diff = isShort ? (ltp - Number(val)) : (Number(val) - ltp)
      setTargetPct((diff / ltp * 100).toFixed(2))
    } else setTargetPct('')
  }
  const updateTargetPercent = (val) => {
    setTargetPct(val)
    if (val !== '' && ltp) {
      const v = isShort ? ltp * (1 - Number(val) / 100) : ltp * (1 + Number(val) / 100)
      setTargetTrigger(v.toFixed(2))
    } else setTargetTrigger('')
  }

  // Build the API requests
  const requests = []
  const trailingShortBlocked = isShort && useTrailing
  if (useSL && useTrailing && !trailingShortBlocked) {
    // Trailing GTT (internal API) — handles SL + trail in one call.
    // Note: confirmed working for LONG holdings. For SHORT positions the payload shape may differ —
    // we block until we have a captured short-trailing payload to verify.
    requests.push({
      kind: 'trailing-gtt',
      label: `Stop Loss ₹${slTrigger} + Trailing ${trailType === 'percent' ? trailValue + '%' : '₹' + trailValue}`,
      payload: {
        instrument_token,
        quantity: Number(qty),
        product,
        avg_price: r.average_price ?? ltp,
        current_ltp: ltp,
        sl_trigger: Number(slTrigger),
        trail_type: trailType,
        trail_value: Number(trailValue),
      },
    })
    // Target (if also enabled) goes as a separate public GTT call
    if (useTarget) {
      requests.push({
        kind: 'gtt-target',
        label: `Target ₹${targetTrigger}`,
        payload: {
          instrument_token, transaction_type: side, quantity: Number(qty), product,
          stoploss_trigger: null,
          target_trigger: Number(targetTrigger),
        },
      })
    }
  } else if (useSL && useTarget) {
    // OCO via public v3 GTT
    requests.push({
      kind: 'gtt-oco',
      label: `SL ₹${slTrigger} + Target ₹${targetTrigger} (OCO)`,
      payload: {
        instrument_token, transaction_type: side, quantity: Number(qty), product,
        stoploss_trigger: Number(slTrigger),
        target_trigger: Number(targetTrigger),
      },
    })
  } else if (useSL) {
    requests.push({
      kind: 'gtt-sl',
      label: `Stop Loss ₹${slTrigger}`,
      payload: {
        instrument_token, transaction_type: side, quantity: Number(qty), product,
        stoploss_trigger: Number(slTrigger),
        target_trigger: null,
      },
    })
  } else if (useTarget) {
    requests.push({
      kind: 'gtt-target',
      label: `Target ₹${targetTrigger}`,
      payload: {
        instrument_token, transaction_type: side, quantity: Number(qty), product,
        stoploss_trigger: null,
        target_trigger: Number(targetTrigger),
      },
    })
  }

  const valid = (() => {
    if (qty <= 0 || !instrument_token) return false
    if (!useSL && !useTarget) return false
    if (useSL && !(Number(slTrigger) > 0)) return false
    if (useTrailing && !(Number(trailValue) > 0)) return false
    if (useTarget && !(Number(targetTrigger) > 0)) return false
    if (trailingShortBlocked) return false
    return true
  })()

  const onReview = () => {
    setError(null)
    if (!valid) { setError('Fill all required fields with valid values.'); return }
    setMode('review')
  }

  const onPlace = async () => {
    setSubmitting(true)
    setError(null)
    const out = []
    for (const req of requests) {
      try {
        const resp = req.kind === 'trailing-gtt'
          ? await placeTrailingGtt(req.payload)
          : await placeGtt(req.payload)
        out.push({ ...req, response: resp, ok: true })
      } catch (e) {
        const msg = String(e.message || '')
        out.push({ ...req, response: msg, ok: false })
        if (msg.includes('UDAPI100050') || msg.startsWith('HTTP 401')) {
          setError('OAuth token expired. Click Login in the sidebar, then retry.')
          break
        }
      }
    }
    setResults(out)
    setMode('result')
    setSubmitting(false)
  }

  // Live preview lines
  const previewLines = []
  if (useSL && slTrigger) {
    previewLines.push(`Initial SL: ${side} if LTP ${slDirection} to ₹${fmt(slTrigger)}`)
  }
  if (useSL && useTrailing && trailValue && ltp && !trailingShortBlocked) {
    const gap = trailType === 'percent' ? `${trailValue}% (≈ ₹${fmt(ltp * trailValue / 100)})` : `₹${trailValue}`
    const direction = isShort ? 'down' : 'up'
    previewLines.push(`Trailing: SL ratchets ${direction} by ${gap} per matching LTP move`)
  }
  if (useTarget && targetTrigger) {
    previewLines.push(`Target: ${side} if LTP ${targetDirection} to ₹${fmt(targetTrigger)}`)
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className={`drawer ${side === 'SELL' ? 'sell-side' : 'buy-side'}`}>
        <header className="drawer-head">
          <div>
            <div className="drawer-side">PROTECTION · {side}</div>
            <div className="drawer-sym">{symbol}</div>
            <div className="drawer-ltp">
              LTP {fmt(ltp)}
              {r.average_price ? ` · Avg ${fmt(r.average_price)}` : ''}
              {r.quantity != null ? ` · Qty ${r.quantity}` : ''}
            </div>
          </div>
          <button className="drawer-close" onClick={onClose}>×</button>
        </header>

        {mode === 'form' && (
          <div className="drawer-body">
            <label>Quantity (max {exitQty})
              <input type="number" min="1" max={exitQty}
                value={qty} onChange={e => setQty(e.target.value)} />
            </label>

            <div className="field-group">
              <label className="chk">
                <input type="checkbox" checked={useSL} onChange={e => setUseSL(e.target.checked)} />
                Add stop loss
              </label>
              {useSL && (
                <div className="dual-input">
                  <div className="dual-cell">
                    <span className="adornment">₹</span>
                    <input type="number" step="0.05" value={slTrigger}
                      placeholder="129.55"
                      onChange={e => updateSlRupee(e.target.value)} />
                  </div>
                  <span className="dual-swap">⇄</span>
                  <div className="dual-cell">
                    <input type="number" step="0.01" value={slPct}
                      placeholder="0.50"
                      onChange={e => updateSlPercent(e.target.value)} />
                    <span className="adornment">%</span>
                  </div>
                </div>
              )}

              {useSL && (
                <div className="nested">
                  <label className="chk">
                    <input type="checkbox" checked={useTrailing} onChange={e => setUseTrailing(e.target.checked)} />
                    Trailing stop-loss
                  </label>
                  {useTrailing && (
                    <div className="trail-row">
                      <div className="seg-toggle small">
                        <button className={`seg ${trailType === 'amount' ? 'active' : ''}`} onClick={() => setTrailType('amount')}>₹</button>
                        <button className={`seg ${trailType === 'percent' ? 'active' : ''}`} onClick={() => setTrailType('percent')}>%</button>
                      </div>
                      <input type="number" step={trailType === 'percent' ? '0.1' : '0.05'}
                        value={trailValue}
                        placeholder={trailType === 'percent' ? 'e.g. 0.5' : 'e.g. 0.13'}
                        onChange={e => setTrailValue(e.target.value)} />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="field-group">
              <label className="chk">
                <input type="checkbox" checked={useTarget} onChange={e => setUseTarget(e.target.checked)} />
                Add target
              </label>
              {useTarget && (
                <div className="dual-input">
                  <div className="dual-cell">
                    <span className="adornment">₹</span>
                    <input type="number" step="0.05" value={targetTrigger}
                      placeholder="150.00"
                      onChange={e => updateTargetRupee(e.target.value)} />
                  </div>
                  <span className="dual-swap">⇄</span>
                  <div className="dual-cell">
                    <input type="number" step="0.1" value={targetPct}
                      placeholder="5.0"
                      onChange={e => updateTargetPercent(e.target.value)} />
                    <span className="adornment">%</span>
                  </div>
                </div>
              )}
            </div>

            {previewLines.length > 0 && (
              <div className="est">
                {previewLines.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            )}

            {trailingShortBlocked && (
              <div className="warn">
                Trailing SL on SHORT positions isn't supported yet — the internal API payload differs and hasn't been captured.
                Use plain Stop Loss (without Trailing) for now, or share a captured short-trailing request from the Upstox app.
              </div>
            )}

            {error && <div className="drawer-error">{error}</div>}

            <div className="drawer-actions">
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn-primary sell" onClick={onReview} disabled={!valid}>Review →</button>
            </div>
          </div>
        )}

        {mode === 'review' && (
          <div className="drawer-body">
            <div className="review-warn">
              ⚠ Live protection orders. {requests.length} API call{requests.length > 1 ? 's' : ''} will be sent.
            </div>
            {requests.map((req, i) => (
              <div key={i} className="review-card">
                <h4>{req.label}</h4>
                <pre>{JSON.stringify(req.payload, null, 2)}</pre>
              </div>
            ))}
            {error && <div className="drawer-error">{error}</div>}
            <div className="drawer-actions">
              <button className="btn-secondary" onClick={() => setMode('form')} disabled={submitting}>← Back</button>
              <button className="btn-primary sell" onClick={onPlace} disabled={submitting}>
                {submitting ? 'Placing…' : 'PLACE'}
              </button>
            </div>
          </div>
        )}

        {mode === 'result' && results && (
          <div className="drawer-body">
            {results.every(r => r.ok)
              ? <div className="success">All orders placed ✓</div>
              : <div className="drawer-error">Some orders failed — see below.</div>}
            {results.map((r, i) => (
              <div key={i} className="review-card">
                <h4>{r.label} {r.ok ? '✓' : '✗'}</h4>
                <pre>{typeof r.response === 'string' ? r.response : JSON.stringify(r.response, null, 2)}</pre>
              </div>
            ))}
            <div className="drawer-actions">
              <button className="btn-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </aside>
    </>
  )
}
