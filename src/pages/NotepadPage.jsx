import { useCallback, useEffect, useState } from 'react'
import { createNote, deleteNote, listNotes, updateNote } from '../api'

// Available note colors (id -> background / border).
const COLORS = [
  { id: 'yellow', bg: '#fffdf5', border: '#f1e9c9' },
  { id: 'pink', bg: '#fdf2f8', border: '#fbcfe8' },
  { id: 'blue', bg: '#eff6ff', border: '#bfdbfe' },
  { id: 'green', bg: '#f0fdf4', border: '#bbf7d0' },
  { id: 'purple', bg: '#faf5ff', border: '#e9d5ff' },
  { id: 'gray', bg: '#f8fafc', border: '#e2e8f0' },
]
const colorOf = (id) => COLORS.find((c) => c.id === id) || COLORS[0]

function fmtWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function NotepadPage() {
  const [notes, setNotes] = useState([])
  const [error, setError] = useState(null)
  // Local edit buffers so typing is smooth; persist on blur.
  const [draft, setDraft] = useState({}) // id -> { title, content }

  const load = useCallback(async () => {
    setError(null)
    try {
      const d = await listNotes()
      setNotes(d.notes || [])
    } catch (e) { setError(e.message) }
  }, [])

  useEffect(() => { load() }, [load])

  const onAdd = async () => {
    setError(null)
    try {
      const n = await createNote({ title: '', content: '' })
      setNotes((prev) => [n, ...prev])
    } catch (e) { setError(`Add failed: ${e.message}`) }
  }

  const onDelete = async (note) => {
    if (!confirm('Delete this note?')) return
    setNotes((prev) => prev.filter((n) => n.id !== note.id))
    try { await deleteNote(note.id) }
    catch (e) { setError(`Delete failed: ${e.message}`); load() }
  }

  // Save a field on blur if it changed.
  const saveField = async (note, field) => {
    const d = draft[note.id]
    if (!d || d[field] === undefined || d[field] === (note[field] || '')) return
    try {
      const updated = await updateNote(note.id, { [field]: d[field] })
      setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, ...updated } : n)))
    } catch (e) { setError(`Save failed: ${e.message}`) }
  }

  const setField = (id, field, value) =>
    setDraft((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }))

  const setColor = async (note, colorId) => {
    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, color: colorId } : n)))
    try { await updateNote(note.id, { color: colorId }) }
    catch (e) { setError(`Color save failed: ${e.message}`); load() }
  }

  const valueOf = (note, field) =>
    draft[note.id]?.[field] !== undefined ? draft[note.id][field] : (note[field] || '')

  return (
    <div className="page">
      <div className="page-head">
        <h1>Notepad</h1>
        <div className="page-actions">
          <button className="btn-primary" onClick={onAdd}>+ New note</button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {notes.length === 0 ? (
        <div className="empty">No notes yet. Click <b>+ New note</b> to start.</div>
      ) : (
        <div className="notes-grid">
          {notes.map((n) => {
            const c = colorOf(n.color)
            return (
              <div className="note-card" key={n.id} style={{ background: c.bg, borderColor: c.border }}>
                <div className="note-head">
                  <input
                    className="note-title"
                    placeholder="Title"
                    value={valueOf(n, 'title')}
                    onChange={(e) => setField(n.id, 'title', e.target.value)}
                    onBlur={() => saveField(n, 'title')}
                  />
                  <button className="note-del" onClick={() => onDelete(n)} title="Delete">×</button>
                </div>
                <textarea
                  className="note-body"
                  placeholder="Write something…"
                  value={valueOf(n, 'content')}
                  onChange={(e) => setField(n.id, 'content', e.target.value)}
                  onBlur={() => saveField(n, 'content')}
                  rows={6}
                />
                <div className="note-foot">
                  <div className="note-swatches">
                    {COLORS.map((opt) => (
                      <button
                        key={opt.id}
                        className={`swatch ${(n.color || 'yellow') === opt.id ? 'active' : ''}`}
                        style={{ background: opt.bg, borderColor: opt.border }}
                        onClick={() => setColor(n, opt.id)}
                        title={opt.id}
                      />
                    ))}
                  </div>
                  <span className="note-meta">{fmtWhen(n.updated_at)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
