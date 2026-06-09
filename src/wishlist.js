// Wishlist persisted in localStorage. Source of truth shared across pages.
// A "wishlist-changed" window event fires on every mutation so any mounted
// component (the Market Watch stars, the Wishlist page) can re-read and stay
// in sync without a backend or shared React context.
const KEY = 'mw_wishlist'

const idOf = (row) => row.instrument_key || row.symbol

export function getWishlist() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || []
  } catch {
    return []
  }
}

function save(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {}
  window.dispatchEvent(new Event('wishlist-changed'))
}

export function isWishlisted(row) {
  const id = idOf(row)
  return getWishlist().some((w) => idOf(w) === id)
}

export function addToWishlist(row, kind) {
  const list = getWishlist()
  const id = idOf(row)
  if (list.some((w) => idOf(w) === id)) return list
  // Snapshot all the row's fields plus the band the user found it in and the
  // moment it was added.
  const entry = { ...row, kind, added_at: new Date().toISOString() }
  const updated = [entry, ...list]
  save(updated)
  return updated
}

export function removeFromWishlist(row) {
  const id = idOf(row)
  const updated = getWishlist().filter((w) => idOf(w) !== id)
  save(updated)
  return updated
}

export function toggleWishlist(row, kind) {
  if (isWishlisted(row)) return removeFromWishlist(row)
  return addToWishlist(row, kind)
}

// Set of ids currently wishlisted — handy for rendering filled/empty stars.
export function wishlistedIds() {
  return new Set(getWishlist().map(idOf))
}

export { idOf }
