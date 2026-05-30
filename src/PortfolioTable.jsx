function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return '-'
  return Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: d, maximumFractionDigits: d,
  })
}

function fmtInt(n) {
  if (n == null) return '-'
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

export default function PortfolioTable({ rows, kind, onSetGtt }) {
  if (!rows?.length) {
    return <div className="empty">No {kind}.</div>
  }
  return (
    <table className="movers">
      <thead>
        <tr>
          <th>#</th>
          <th>Scrip</th>
          <th className="num">Qty</th>
          <th className="num">Avg</th>
          <th className="num">LTP</th>
          <th className="num">P&amp;L</th>
          <th className="num">Day Chg %</th>
          <th className="actions-th">GTT</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, idx) => {
          const symbol = r.tradingsymbol || r.trading_symbol || r.symbol
          const pnl = r.pnl
          const pnlClass = pnl == null ? '' : pnl >= 0 ? 'pos' : 'neg'
          const dayChg = r.day_change_percentage
          const dayClass = dayChg == null ? '' : dayChg >= 0 ? 'pos' : 'neg'
          return (
            <tr key={r.instrument_token || symbol + idx}>
              <td className="dim">{idx + 1}</td>
              <td className="sym">{symbol} <span className="seg">{r.exchange || 'NSE'}</span></td>
              <td className="num">{fmtInt(r.quantity)}</td>
              <td className="num">{fmt(r.average_price)}</td>
              <td className="num">{fmt(r.last_price)}</td>
              <td className={`num ${pnlClass}`}>{fmt(pnl)}</td>
              <td className={`num ${dayClass}`}>{fmt(dayChg)}%</td>
              <td className="actions">
                <button
                  className="trade-btn gtt"
                  onClick={() => onSetGtt?.({ row: r })}
                  title={`Set GTT for ${symbol}`}
                >SL/T</button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
