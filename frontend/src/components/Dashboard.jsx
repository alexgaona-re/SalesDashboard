import React, { useState, useEffect, useCallback } from 'react'
import { fetchMetrics, fetchUsers } from '../api.js'
import MetricCard from './MetricCard.jsx'

const PERIODS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'ytd', label: 'YTD' },
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

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export default function Dashboard() {
  const [period, setPeriod] = useState('monthly')
  const [selectedAgent, setSelectedAgent] = useState('all')
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [metrics, setMetrics] = useState(null)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const userId = selectedAgent === 'all' ? undefined : selectedAgent
      const [metricsData, usersResp] = await Promise.all([
        fetchMetrics(period, userId, selectedDate),
        users.length === 0 ? fetchUsers() : Promise.resolve({ users }),
      ])
      setMetrics(metricsData)
      if (usersResp && usersResp.users) {
        setUsers(usersResp.users)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [period, selectedAgent, selectedDate])

  useEffect(() => {
    loadData()
  }, [loadData])

  const act = metrics?.activity || {}
  const conv = metrics?.conversion || {}
  const eq = metrics?.equity_revenue || {}
  const comm = metrics?.commission || {}
  const per = metrics?.period || {}
  const bd = act.made_contact_breakdown || {}

  return (
    <div className="dashboard-container">
      {/* Controls */}
      <div className="controls-row">
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

        <div className="agent-selector">
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
          >
            <option value="all">All Agents</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.first_name} {u.last_name}
              </option>
            ))}
          </select>
        </div>

        <div className="date-selector">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>
      </div>

      {per.label && (
        <div className="date-range-display">
          {per.label} ({per.start} to {per.end})
        </div>
      )}

      {loading && <div className="loading-spinner">Loading metrics...</div>}
      {error && <div className="error-state">Error: {error}</div>}

      {!loading && !error && metrics && (
        <>
          {/* Activity Metrics */}
          <section className="metrics-section">
            <h2 className="section-title">Activity Metrics</h2>
            <div className="metrics-grid">
              <MetricCard
                label="Total Calls Made"
                value={formatNumber(act.total_calls)}
              />
              <MetricCard
                label="SMS / Voicemails Sent"
                value={formatNumber(act.sms_vm_sent)}
              />
              <MetricCard
                label="Emails Sent"
                value={formatNumber(act.emails_sent)}
              />
              <MetricCard
                label="Offers Made"
                value={formatNumber(act.offers_made)}
              />
              <MetricCard
                label="Offers Accepted"
                value={formatNumber(act.offer_accepted)}
              />
              <MetricCard
                label="Total Talk Time"
                value={formatDuration(act.total_talk_time_seconds)}
              />
              <MetricCard
                label="Made Contact (Total)"
                value={formatNumber(act.made_contact_total)}
                subtitle={`MC: ${formatNumber(bd.made_contact)} | NI: ${formatNumber(bd.not_interested)} | OM: ${formatNumber(bd.offer_made)} | OA: ${formatNumber(bd.offer_accepted)}`}
              />
            </div>
          </section>

          {/* Conversion Rates */}
          <section className="metrics-section">
            <h2 className="section-title">Conversion Rates</h2>
            <div className="metrics-grid">
              <MetricCard
                label="Contact Rate"
                value={formatPct(conv.contact_rate_pct)}
              />
              <MetricCard
                label="Calls to Offer"
                value={formatPct(conv.calls_to_offer_pct)}
              />
              <MetricCard
                label="SMS/VM to Offer"
                value={formatPct(conv.sms_to_offer_pct)}
              />
              <MetricCard
                label="All Outbound to Offer"
                value={formatPct(conv.all_outbound_to_offer_pct)}
              />
              <MetricCard
                label="Offer Acceptance Rate"
                value={formatPct(conv.offer_acceptance_rate_pct)}
              />
              <MetricCard
                label="Avg Talk Time to Deed Signed"
                value={conv.avg_talk_time_deed_signed_seconds > 0 ? `${(conv.avg_talk_time_deed_signed_seconds / 60).toFixed(1)} min` : '--'}
              />
              <MetricCard
                label="Calls per Signed Deed"
                value={conv.calls_per_signed_deed > 0 ? formatNumber(conv.calls_per_signed_deed) : '--'}
              />
            </div>
          </section>

          {/* Equity & Revenue */}
          <section className="metrics-section">
            <h2 className="section-title">Equity & Revenue</h2>
            <div className="metrics-grid">
              <MetricCard
                label="Average Equity per Deal"
                value={formatCurrency(eq.avg_equity_per_deal)}
              />
              <MetricCard
                label="Total Equity Acquired"
                value={formatCurrency(eq.total_equity)}
              />
              <MetricCard
                label="Revenue per Call"
                value={formatCurrency(eq.revenue_per_call)}
              />
              <MetricCard
                label="Revenue per Offer Made"
                value={formatCurrency(eq.revenue_per_offer)}
              />
            </div>
          </section>

          {/* Commission & Projections */}
          <section className="metrics-section">
            <h2 className="section-title">Commission & Projections</h2>
            <div className="metrics-grid">
              <MetricCard
                label="Commission MTD"
                value={formatCurrency(comm.commission_mtd)}
                highlighted
              />
              <MetricCard
                label="Est. Monthly Revenue"
                value={formatCurrency(comm.est_monthly_revenue)}
                highlighted
              />
              <MetricCard
                label="Est. Monthly Commission"
                value={formatCurrency(comm.est_monthly_commission)}
                highlighted
              />
              <MetricCard
                label="Effective Hourly Rate"
                value={formatCurrency(comm.effective_hourly_rate)}
                highlighted
              />
            </div>
          </section>

          {/* Deeds Signed */}
          <section className="metrics-section">
            <h2 className="section-title">Deeds Signed</h2>
            <div className="metrics-grid metrics-grid--single">
              <MetricCard
                label="Deeds Signed"
                value={formatNumber(metrics.deeds_signed)}
                large
              />
            </div>
          </section>
        </>
      )}
    </div>
  )
}
