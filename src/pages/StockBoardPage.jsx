import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createCard, deleteCard, listCards, updateCard } from '../api'
import { fetchWishlist } from '../wishlist'

const COLUMNS = [
  { id: 'plan', label: 'Plan', hint: 'Ideas from your wishlist', cls: 'col-plan' },
  { id: 'buy', label: 'Buy', hint: 'Decided to buy', cls: 'col-buy' },
  { id: 'sell', label: 'Sell', hint: 'Marked to sell', cls: 'col-sell' },
]

function fmtMoney(n) {
  if (n == null || isNaN(n)) return null
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

// Small autocomplete that picks from the user's wishlist by symbol.
function WishlistPicker({ onPick }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [wl, setWl] = useState([])
  const ref = useRef(null)

  useEffect(() => { fetchWishlist().then(setWl) }, [])

  const results = useMemo(() => {
    const term = q.trim().toLowerCase()
    return term ? wl.filter((w) => (w.symbol || '').toLowerCase().includes(term)) : wl
  }, [q, wl])

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <div className="wl-picker" ref={ref}>
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="+ Add from wishlist…"
      />
      {open && (
        <div className="wl-dropdown">
          {results.length === 0 && <div className="ss-item dim">No wishlist matches</div>}
          {results.map((w) => (
            <div
              key={w.instrument_key || w.symbol}
              className="ss-item"
              onClick={() => { onPick(w); setQ(''); setOpen(false) }}
            >
              <b>{w.symbol}</b>
              {w.ltp != null && <span className="ss-ltp">{fmtMoney(w.ltp)}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function StockBoardPage() {
  const [cards, setCards] = useState([])
  const [error, setError] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [overCol, setOverCol] = useState(null)
  const [overCardId, setOverCardId] = useState(null)
  // Local note edits keyed by card id (so typing is smooth, save on blur).
  const [noteDraft, setNoteDraft] = useState({})

  const load = useCallback(async () => {
    setError(null)
    try {
      const data = await listCards()
      setCards(data.cards || [])
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const byCol = useMemo(() => {
    const g = { plan: [], buy: [], sell: [] }
    for (const c of cards) (g[c.status] || g.plan).push(c)
    // Order each column top->bottom by position.
    for (const k of Object.keys(g)) g[k].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    return g
  }, [cards])

  const onAdd = async (w) => {
    setError(null)
    try {
      await createCard({
        status: 'plan',
        symbol: w.symbol,
        instrument_key: w.instrument_key || null,
        exchange: w.exchange || 'NSE',
        ltp: w.ltp ?? null,
      })
      await load()
    } catch (e) { setError(`Add failed: ${e.message}`) }
  }

  const applyMove = async (id, status, position) => {
    // Optimistic update, then persist.
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, status, position } : c)))
    try { await updateCard(id, { status, position }) }
    catch (e) { setError(`Move failed: ${e.message}`); load() }
  }

  // Drop on the column background -> move to the BOTTOM of that column.
  const onDrop = async (status) => {
    setOverCol(null)
    setOverCardId(null)
    const id = dragId
    setDragId(null)
    if (id == null) return
    const others = byCol[status].filter((c) => c.id !== id)
    const maxPos = others.length ? Math.max(...others.map((c) => c.position ?? 0)) : 0
    await applyMove(id, status, maxPos + 1)
  }

  // Drop ON a card -> insert the dragged card ABOVE that card.
  const onDropOnCard = async (target, e) => {
    e.stopPropagation()
    setOverCol(null)
    setOverCardId(null)
    const id = dragId
    setDragId(null)
    if (id == null || id === target.id) return
    const list = byCol[target.status].filter((c) => c.id !== id) // exclude dragged
    const tIdx = list.findIndex((c) => c.id === target.id)
    const prev = list[tIdx - 1]
    const tPos = target.position ?? 0
    const newPos = prev ? ((prev.position ?? 0) + tPos) / 2 : tPos - 1
    await applyMove(id, target.status, newPos)
  }

  const onDelete = async (card) => {
    setCards((prev) => prev.filter((c) => c.id !== card.id))
    try { await deleteCard(card.id) }
    catch (e) { setError(`Delete failed: ${e.message}`); load() }
  }

  const saveNote = async (card) => {
    const note = noteDraft[card.id]
    if (note === undefined || note === (card.note || '')) return
    try { await updateCard(card.id, { note }) ; await load() }
    catch (e) { setError(`Note save failed: ${e.message}`) }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Stock Board</h1>
        <div className="page-actions">
          <button className="refresh" onClick={load}>Refresh</button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="board">
        {COLUMNS.map((col) => {
          const list = byCol[col.id] || []
          return (
            <div
              key={col.id}
              className={`board-col ${col.cls} ${overCol === col.id ? 'drag-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setOverCol(col.id) }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOverCol(null) }}
              onDrop={() => onDrop(col.id)}
            >
              <div className="board-col-head">
                <span className="board-col-title">{col.label}</span>
                <span className="board-col-count">{list.length}</span>
              </div>
              <div className="board-col-hint">{col.hint}</div>

              {col.id === 'plan' && <WishlistPicker onPick={onAdd} />}

              <div className="board-cards">
                {list.length === 0 && (
                  <div className="board-empty">Drag cards here{col.id === 'plan' ? ' or add from wishlist' : ''}</div>
                )}
                {list.map((c) => (
                  <div
                    key={c.id}
                    className={`board-card ${dragId === c.id ? 'dragging' : ''} ${overCardId === c.id ? 'drop-above' : ''}`}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDragId(c.id) }}
                    onDragEnd={() => { setDragId(null); setOverCardId(null) }}
                    onDragOver={(e) => {
                      if (dragId == null || dragId === c.id) return
                      e.preventDefault()
                      e.stopPropagation()
                      setOverCardId(c.id)
                      setOverCol(null)
                    }}
                    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOverCardId(null) }}
                    onDrop={(e) => onDropOnCard(c, e)}
                  >
                    <div className="board-card-head">
                      <span className="board-card-sym">{c.symbol}</span>
                      <div className="board-card-right">
                        {fmtMoney(c.ltp) && <span className="board-card-ltp">{fmtMoney(c.ltp)}</span>}
                        <button className="board-card-x" onClick={() => onDelete(c)} title="Remove">×</button>
                      </div>
                    </div>
                    <textarea
                      className="board-card-note"
                      placeholder="Add a note…"
                      value={noteDraft[c.id] ?? c.note ?? ''}
                      onChange={(e) => setNoteDraft((d) => ({ ...d, [c.id]: e.target.value }))}
                      onBlur={() => saveNote(c)}
                      rows={2}
                    />
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
