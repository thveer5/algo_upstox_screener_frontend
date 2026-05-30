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

export async function getAuthStatus() {
  return get('/auth/status')
}

export async function fetchMovers({ kind = 'gainers', pageSize = 50, index = null } = {}) {
  const params = new URLSearchParams({ kind, page_size: String(pageSize) })
  if (index && index !== 'all') params.set('index', index)
  return get(`/api/screener/movers?${params.toString()}`)
}

export async function fetchIndices() {
  return get('/api/indices')
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
