// Wishlist backed by the SQLite DB (shared across browsers/devices), replacing
// the old localStorage store. All functions are async (they hit the API).
//
// A "wishlist-changed" window event still fires on every mutation so a mounted
// page (Market Watch stars, the Wishlist page) can re-fetch and stay in sync.
import {
  addWishlistItem,
  listWishlist,
  removeWishlistItem,
  replaceWishlistItems,
} from './api'

const idOf = (row) => row.instrument_key || row.symbol

function notify() {
  window.dispatchEvent(new Event('wishlist-changed'))
}

export async function fetchWishlist() {
  try {
    const d = await listWishlist()
    return d.items || []
  } catch {
    return []
  }
}

export async function addToWishlist(row, kind) {
  const item = { ...row, kind, added_at: new Date().toISOString() }
  await addWishlistItem(item)
  notify()
}

export async function removeFromWishlist(rowOrKey) {
  const key = typeof rowOrKey === 'string' ? rowOrKey : idOf(rowOrKey)
  await removeWishlistItem(key)
  notify()
}

// Overwrite the whole wishlist (used by refresh-all / clear).
export async function replaceWishlist(items) {
  await replaceWishlistItems(items)
  notify()
}

// Set of ids from a list of items — handy for filled/empty stars.
export function idsOf(items) {
  return new Set((items || []).map(idOf))
}

export { idOf }
