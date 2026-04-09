import React from 'react'

const tabs = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'config', label: 'Agent Config' },
  { key: 'leaderboard', label: 'Leaderboard' },
]

export default function Header({ activeTab, setActiveTab, onRefresh, lastRefreshed, refreshCountdown }) {
  const formatCountdown = (seconds) => {
    if (seconds == null || seconds <= 0) return '0:00'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <header className="app-header">
      <div className="header-left">
        <h1 className="app-title">PIC KPI Dashboard</h1>
        <nav className="tab-nav">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`tab-btn${activeTab === tab.key ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="refresh-controls">
        <span className="refresh-timer">
          Next refresh in {formatCountdown(refreshCountdown)}
        </span>
        <button className="refresh-btn" onClick={onRefresh}>
          Refresh Data
        </button>
        {lastRefreshed && (
          <span className="last-refreshed">
            Last: {lastRefreshed}
          </span>
        )}
      </div>
    </header>
  )
}
