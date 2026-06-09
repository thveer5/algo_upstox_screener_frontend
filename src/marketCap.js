// Classify a stock by market capitalisation into the usual Indian bands.
//
// The screener may return `market_cap` either in absolute rupees or in
// ₹ crore depending on the field. We normalise to crore: any value large
// enough to be raw rupees (> 1e7, i.e. > 1 crore rupees) is divided by 1e7.
// No NSE-listed liquid stock has a market cap below ₹1 crore, so this
// heuristic is unambiguous in practice.
//
// Bands (₹ crore) follow the common informal Indian classification:
//   Large Cap : ≥ 20,000
//   Mid Cap   : 5,000 – 20,000
//   Small Cap : 500 – 5,000
//   Micro Cap : < 500
export function classifyMarketCap(raw) {
  if (raw == null || isNaN(raw)) return null
  let cr = Number(raw)
  if (cr > 1e7) cr = cr / 1e7 // raw rupees -> crore
  if (cr >= 20000) return { tier: 'Large Cap', cls: 'large', crore: cr }
  if (cr >= 5000) return { tier: 'Mid Cap', cls: 'mid', crore: cr }
  if (cr >= 500) return { tier: 'Small Cap', cls: 'small', crore: cr }
  return { tier: 'Micro Cap', cls: 'micro', crore: cr }
}

// "₹12,345 Cr" style label for a normalised crore value.
export function fmtCrore(cr) {
  if (cr == null || isNaN(cr)) return '-'
  return `₹${Number(cr).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`
}
