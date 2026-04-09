import React, { useState, useEffect, useCallback, useRef } from 'react'
import Header from './components/Header.jsx'
import Dashboard from './components/Dashboard.jsx'
import AgentConfig from './components/AgentConfig.jsx'
import Leaderboard from './components/Leaderboard.jsx'
import { refreshData } from './api.js'

const REFRESH_INTERVAL = 15 * 60 // 15 minutes in seconds

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [lastRefreshed, setLastRefreshed] = useState(null)
  const [refreshCountdown, setRefreshCountdown] = useState(REFRESH_INTERVAL)
  const [refreshing, setRefreshing] = useState(false)
  const countdownRef = useRef(null)

  const doRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await refreshData()
      setLastRefreshed(new Date().toLocaleTimeString())
      setRefreshCountdown(REFRESH_INTERVAL)
    } catch (err) {
      console.error('Refresh failed:', err)
    } finally {
      setRefreshing(false)
    }
  }, [])

  // Countdown timer
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setRefreshCountdown((prev) => {
        if (prev <= 1) {
          doRefresh()
          return REFRESH_INTERVAL
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(countdownRef.current)
  }, [doRefresh])

  const handleRefresh = () => {
    if (!refreshing) {
      doRefresh()
    }
  }

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />
      case 'config':
        return <AgentConfig />
      case 'leaderboard':
        return <Leaderboard />
      default:
        return <Dashboard />
    }
  }

  return (
    <div className="app">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onRefresh={handleRefresh}
        lastRefreshed={lastRefreshed}
        refreshCountdown={refreshCountdown}
      />
      <main className="main-content">{renderTab()}</main>
    </div>
  )
}
