import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import './App.css'
import Layout from './Layout.jsx'
import MarketWatchPage from './pages/MarketWatchPage.jsx'
import HoldingsPage from './pages/HoldingsPage.jsx'
import PositionsPage from './pages/PositionsPage.jsx'
import GttOrdersPage from './pages/GttOrdersPage.jsx'
import WishlistPage from './pages/WishlistPage.jsx'
import BuyInfoPage from './pages/BuyInfoPage.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<MarketWatchPage />} />
          <Route path="/wishlist" element={<WishlistPage />} />
          <Route path="/buy-info" element={<BuyInfoPage />} />
          <Route path="/holdings" element={<HoldingsPage />} />
          <Route path="/positions" element={<PositionsPage />} />
          <Route path="/gtt" element={<GttOrdersPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
