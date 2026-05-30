import { useCallback, useEffect, useState } from 'react'
import { fetchPositions } from '../api'
import GttDrawer from '../GttDrawer'
import PortfolioTable from '../PortfolioTable'

export default function PositionsPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [gtt, setGtt] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchPositions()
      setRows(data.positions || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="page">
      <div className="page-head">
        <h1>Positions</h1>
        <div className="page-actions">
          <button className="refresh" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <PortfolioTable rows={rows} kind="positions" onSetGtt={setGtt} />

      <GttDrawer open={!!gtt} initial={gtt} onClose={() => { setGtt(null); load() }} />
    </div>
  )
}
