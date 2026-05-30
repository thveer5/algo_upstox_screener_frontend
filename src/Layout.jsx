import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { fetchPublicIp, getAuthStatus, getTvStatus } from './api'

const NAV = [
  { to: '/', label: 'Market Watch', icon: '📈' },
  { to: '/holdings', label: 'Holdings', icon: '💼' },
  { to: '/positions', label: 'Positions', icon: '📊' },
  { to: '/gtt', label: 'GTT Orders', icon: '🎯' },
]

function fmtDuration(sec) {
  if (sec == null) return '?'
  if (sec <= 0) return 'expired'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function Layout() {
  const { pathname } = useLocation()
  const [auth, setAuth] = useState(null)
  const [tv, setTv] = useState(null)
  const [ip, setIp] = useState(null)

  useEffect(() => {
    getAuthStatus().then(setAuth).catch(() => setAuth({ authenticated: false }))
    getTvStatus().then(setTv).catch(() => {})
    fetchPublicIp().then(setIp).catch(() => {})
  }, [])

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">⚡</span>
          <span className="brand-name">Algo Upstox</span>
        </div>
        <nav className="nav">
          {NAV.map(n => (
            <Link
              key={n.to}
              to={n.to}
              className={`nav-link ${pathname === n.to ? 'active' : ''}`}
            >
              <span className="nav-icon">{n.icon}</span>
              <span>{n.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          {ip?.ip && (
            <a
              className="ip-pill"
              href="https://account.upstox.com/developer/apps"
              target="_blank"
              rel="noreferrer"
              title="Click to open Upstox Developer Console — register this IP if orders fail with UDAPI1154"
            >
              <span className="ip-label">IP</span>
              <span className="ip-value">{ip.ip}</span>
            </a>
          )}
          <div className={`tv-pill ${tv?.has_refresh_token ? (tv.access_token_valid ? 'ok' : 'warn') : 'bad'}`}>
            <span className="dot" />
            TV: {tv?.has_refresh_token ? fmtDuration(tv.refresh_token_expires_in_sec) : '—'}
          </div>
          {auth?.authenticated
            ? <span className="auth-ok">OAuth ✓</span>
            : <a href="/auth/login" className="auth-link">Login</a>}
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
