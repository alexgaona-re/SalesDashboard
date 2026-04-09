import React, { useState, useEffect, useCallback } from 'react'
import { fetchLeaderboard } from '../api.js'

const PERIODS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'ytd', label: 'YTD' },
]

const COLUMNS = [
  { key: 'rank', label: '#', sortable: false },
  { key: 'name', label: 'Agent Name', sortable: true },
  { key: 'commission_mtd', label: 'Commission MTD', sortable: true },
  { key: 'talk_time_seconds', label: 'Talk Time', sortable: true },
  { key: 'offers_made', label: 'Offers Made', sortable: true },
  { key: 'contact_rate_pct', label: 'Contact Rate %', sortable: true },
  { key: 'total_calls', label: 'Total Calls', sortable: true },
  { key: 'sms_vm_sent', label: 'SMS/VM Sent', sortable: true },
]

function formatCurrency(n) {
  if (n == null || isNaN(n)) return '$0.00'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function formatDuration(seconds) {
  if (seconds == null || isNaN(seconds)) return '0h 0m'
  const totalMinutes = Math.floor(seconds / 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${h}h ${m}m`
}

function formatPct(n) {
  if (n == null || isNaN(n)) return '0.0%'
  return `${Number(n).toFixed(1)}%`
}

function formatNumber(n) {
  if (n == null || isNaN(n)) return '0'
  return new Intl.NumberFormat('en-US').format(n)
}

export default function Leaderboard() {
  const [period, setPeriod] = useState('monthly')
  const [agents, setAgents] = useState([])
  const [sortField, setSortField] = useState('commission_mtd')
  const [sortDir, setSortDir] = useState('desc')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchLeaderboard(period)
      setAgents(Array.isArray(data) ? data : data.agents || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const sortedAgents = [...agents].sort((a, b) => {
    let aVal = a[sortField]
    let bVal = b[sortField]

    if (sortField === 'name') {
      aVal = (aVal || '').toLowerCase()
      bVal = (bVal || '').toLowerCase()
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    }

    aVal = Number(aVal) || 0
    bVal = Number(bVal) || 0
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal
  })

  const formatValue = (col, value) => {
    switch (col) {
      case 'commission_mtd':
        return formatCurrency(value)
      case 'talk_time_seconds':
        return formatDuration(value)
      case 'contact_rate_pct':
        return formatPct(value)
      case 'total_calls':
      case 'offers_made':
      case 'sms_vm_sent':
        return formatNumber(value)
      default:
        return value ?? '--'
    }
  }

  return (
    <div className="leaderboard-container">
      <h2 className="section-title">Agent Leaderboard</h2>

      <div className="period-selector">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            className={`period-btn${period === p.key ? ' active' : ''}`}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading && <div className="loading-spinner">Loading leaderboard...</div>}
      {error && <div className="error-state">Error: {error}</div>}

      {!loading && !error && (
        <div className="table-wrapper">
          <table className="leaderboard-table">
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={col.sortable ? 'sortable' : ''}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    {col.label}
                    {col.sortable && sortField === col.key && (
                      <span className="sort-indicator">
                        {sortDir === 'asc' ? ' \u25B2' : ' \u25BC'}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedAgents.map((agent, idx) => (
                <tr
                  key={agent.user_id || idx}
                  className={idx === 0 ? 'top-performer' : ''}
                >
                  <td className="rank-cell">{idx + 1}</td>
                  <td>{agent.name || '--'}</td>
                  <td>{formatValue('commission_mtd', agent.commission_mtd)}</td>
                  <td>{formatValue('talk_time_seconds', agent.talk_time_seconds)}</td>
                  <td>{formatValue('offers_made', agent.offers_made)}</td>
                  <td>{formatValue('contact_rate_pct', agent.contact_rate_pct)}</td>
                  <td>{formatValue('total_calls', agent.total_calls)}</td>
                  <td>{formatValue('sms_vm_sent', agent.sms_vm_sent)}</td>
                </tr>
              ))}
              {sortedAgents.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} className="empty-row">
                    No leaderboard data available for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
