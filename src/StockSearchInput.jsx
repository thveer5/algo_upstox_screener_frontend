import { useEffect, useRef, useState } from 'react'
import { searchStocks } from './api'

// Autocomplete text input for NSE stocks. Type "tcs" -> dropdown of matches;
// picking one calls onSelect with the full instrument row.
export default function StockSearchInput({ value, onSelect, placeholder }) {
  const [q, setQ] = useState(value || '')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => { setQ(value || '') }, [value])

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setResults([]); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    const t = setTimeout(() => {
      searchStocks({ q: term, pageSize: 8 })
        .then((d) => { if (!cancelled) { setResults(d.instruments || []); setOpen(true) } })
        .catch(() => { if (!cancelled) setResults([]) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q])

  // Close the dropdown on outside click.
  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const pick = (r) => {
    onSelect?.(r)
    setQ(r.symbol)
    setResults([])
    setOpen(false)
  }

  return (
    <div className="stock-search" ref={boxRef}>
      <input
        type="text"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => { if (results.length) setOpen(true) }}
        placeholder={placeholder || 'Type symbol e.g. TCS'}
        autoComplete="off"
      />
      {open && (loading || results.length > 0) && (
        <div className="stock-search-dropdown">
          {loading && <div className="ss-item dim">Searching…</div>}
          {results.map((r) => (
            <div
              key={r.instrument_key || r.symbol}
              className="ss-item"
              onClick={() => pick(r)}
            >
              <b>{r.symbol}</b>
              {r.ltp != null && (
                <span className="ss-ltp">₹{Number(r.ltp).toLocaleString('en-IN')}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
