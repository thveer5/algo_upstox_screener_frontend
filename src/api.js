// Thin wrapper around the FastAPI backend.
// In dev: VITE_API_BASE unset -> empty string -> paths are same-origin and Vite proxies to localhost:8000.
// In prod: set VITE_API_BASE=https://api.your-host.com -> requests go cross-origin (CORS handled by backend).
const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

const url = (path) => API_BASE + path

// Cross-origin calls need credentials:'include' so the OAuth/session cookies flow.
const credOpts = API_BASE ? { credentials: 'include' } : {}

async function jsonOrThrow(resp) {
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`HTTP ${resp.status}: ${text}`)
  }
  return resp.json()
}

async function get(path) {
  return jsonOrThrow(await fetch(url(path), credOpts))
}

async function post(path, body) {
  return jsonOrThrow(await fetch(url(path), {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    ...credOpts,
  }))
}

async function del(path) {
  return jsonOrThrow(await fetch(url(path), { method: 'DELETE', ...credOpts }))
}

async function patch(path, body) {
  return jsonOrThrow(await fetch(url(path), {
    method: 'PATCH',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    ...credOpts,
  }))
}

async function put(path, body) {
  return jsonOrThrow(await fetch(url(path), {
    method: 'PUT',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    ...credOpts,
  }))
}

export async function getAuthStatus() {
  return get('/auth/status')
}

export async function fetchMovers({ kind = 'gainers', pageSize = 50, index = null, changeMin = null, changeMax = null, caps = [] } = {}) {
  const params = new URLSearchParams({ kind, page_size: String(pageSize) })
  if (index && index !== 'all') params.set('index', index)
  if (changeMin != null && changeMin !== '') params.set('change_min', String(changeMin))
  if (changeMax != null && changeMax !== '') params.set('change_max', String(changeMax))
  if (caps && caps.length) params.set('caps', caps.join(','))
  return get(`/api/screener/movers?${params.toString()}`)
}

export async function fetchIndices() {
  return get('/api/indices')
}

export async function searchStocks({ q, pageSize = 25 } = {}) {
  const params = new URLSearchParams({ q, page_size: String(pageSize) })
  return get(`/api/screener/search?${params.toString()}`)
}

export async function fetchQuotes(symbols = []) {
  const params = new URLSearchParams({ symbols: symbols.join(',') })
  return get(`/api/screener/quotes?${params.toString()}`)
}

// ----- Wishlist (SQLite-backed) -----
export async function listWishlist() {
  return get('/api/wishlist')
}

export async function addWishlistItem(item) {
  return post('/api/wishlist', item)
}

export async function removeWishlistItem(key) {
  return del(`/api/wishlist/${encodeURIComponent(key)}`)
}

export async function replaceWishlistItems(items) {
  return put('/api/wishlist', { items })
}

export async function fetchCandles({ instrumentKey, days = 10, ltp = null } = {}) {
  const params = new URLSearchParams({ instrument_key: instrumentKey, days: String(days) })
  if (ltp != null) params.set('ltp', String(ltp))
  return get(`/api/screener/candles?${params.toString()}`)
}

export async function getTvStatus() {
  return get('/auth/tv/status')
}

export async function refreshTvSession() {
  return post('/auth/tv/refresh')
}

export async function bootstrapTvSession({ cookie, refresh_token }) {
  return post('/auth/tv/bootstrap', { cookie, refresh_token })
}

export async function placeOrder(body) {
  return post('/api/orders/place', body)
}

export async function placeGtt(body) {
  return post('/api/orders/gtt', body)
}

export async function listGtt() {
  return get('/api/orders/gtt')
}

export async function cancelGtt(gttOrderId) {
  return del(`/api/orders/gtt/${encodeURIComponent(gttOrderId)}`)
}

export async function fetchHoldings() {
  return get('/api/portfolio/holdings')
}

export async function fetchPositions() {
  return get('/api/portfolio/positions')
}

export async function placeTrailingGtt(body) {
  return post('/api/orders/trailing-gtt', body)
}

export async function fetchPublicIp() {
  return get('/api/system/ip')
}

// ----- Buy/Sell trade records (SQLite-backed) -----
export async function listTrades() {
  return get('/api/trades')
}

export async function createTrade(body) {
  return post('/api/trades', body)
}

export async function updateTrade(id, body) {
  return patch(`/api/trades/${id}`, body)
}

export async function deleteTrade(id) {
  return del(`/api/trades/${id}`)
}

export async function addTradeLot(id, lot) {
  return post(`/api/trades/${id}/lot`, lot)
}

export async function removeTradeLot(id, index) {
  return del(`/api/trades/${id}/lot/${index}`)
}

// ----- Stock board cards (Plan / Buy / Sell) -----
export async function listCards() {
  return get('/api/cards')
}

export async function createCard(body) {
  return post('/api/cards', body)
}

export async function updateCard(id, body) {
  return patch(`/api/cards/${id}`, body)
}

export async function deleteCard(id) {
  return del(`/api/cards/${id}`)
}

// ----- Notepad -----
export async function listNotes() {
  return get('/api/notes')
}

export async function createNote(body) {
  return post('/api/notes', body)
}

export async function updateNote(id, body) {
  return patch(`/api/notes/${id}`, body)
}

export async function deleteNote(id) {
  return del(`/api/notes/${id}`)
}
