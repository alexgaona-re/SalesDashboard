import React, { useState, useEffect, useCallback } from 'react'
import { fetchUsers, fetchAgentConfig, updateAgentConfig } from '../api.js'

const DEFAULT_RATE = 0.15

export default function AgentConfig() {
  const [users, setUsers] = useState([])
  const [configs, setConfigs] = useState({})
  const [editingRates, setEditingRates] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [saveStatus, setSaveStatus] = useState({})
  const [error, setError] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [usersResp, configResp] = await Promise.all([
        fetchUsers(),
        fetchAgentConfig(),
      ])
      const usersList = usersResp.users || []
      const configsMap = configResp.configs || {}
      setUsers(usersList)
      setConfigs(configsMap)

      const rates = {}
      usersList.forEach((u) => {
        const cfg = configsMap[u.id]
        const rate = cfg ? cfg.commission_rate : DEFAULT_RATE
        rates[u.id] = (rate * 100).toFixed(1)
      })
      setEditingRates(rates)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleRateChange = (userId, value) => {
    setEditingRates((prev) => ({ ...prev, [userId]: value }))
    setSaveStatus((prev) => ({ ...prev, [userId]: null }))
  }

  const handleSave = async (userId) => {
    const rateStr = editingRates[userId]
    const rate = parseFloat(rateStr) / 100
    if (isNaN(rate) || rate < 0 || rate > 1) {
      setSaveStatus((prev) => ({ ...prev, [userId]: 'invalid' }))
      return
    }

    setSaving((prev) => ({ ...prev, [userId]: true }))
    setSaveStatus((prev) => ({ ...prev, [userId]: null }))
    try {
      await updateAgentConfig(userId, rate)
      setSaveStatus((prev) => ({ ...prev, [userId]: 'saved' }))
      setConfigs((prev) => ({
        ...prev,
        [userId]: { ...prev[userId], commission_rate: rate },
      }))
      setTimeout(() => {
        setSaveStatus((prev) => ({ ...prev, [userId]: null }))
      }, 3000)
    } catch (err) {
      setSaveStatus((prev) => ({ ...prev, [userId]: 'error' }))
    } finally {
      setSaving((prev) => ({ ...prev, [userId]: false }))
    }
  }

  const isNonDefault = (userId) => {
    const rateStr = editingRates[userId]
    const rate = parseFloat(rateStr) / 100
    return !isNaN(rate) && Math.abs(rate - DEFAULT_RATE) > 0.001
  }

  if (loading) return <div className="loading-spinner">Loading agent configuration...</div>
  if (error) return <div className="error-state">Error: {error}</div>

  return (
    <div className="agent-config-container">
      <h2 className="section-title">Agent Commission Configuration</h2>
      <p className="config-description">
        Configure commission rates for each agent. The default rate is 15%. Changes take effect immediately for future calculations.
      </p>

      <div className="agent-config-list">
        {users.map((user) => {
          const userId = user.id
          const status = saveStatus[userId]
          const isSaving = saving[userId]

          return (
            <div
              key={userId}
              className={`agent-row${isNonDefault(userId) ? ' agent-row--custom' : ''}`}
            >
              <div className="agent-info">
                <span className="agent-name">
                  {user.first_name} {user.last_name}
                </span>
                <span className="agent-email">{user.email}</span>
              </div>
              <div className="agent-rate-controls">
                <div className="rate-input-wrapper">
                  <input
                    type="number"
                    className="rate-input"
                    value={editingRates[userId] || ''}
                    onChange={(e) => handleRateChange(userId, e.target.value)}
                    min="0"
                    max="100"
                    step="0.1"
                  />
                  <span className="rate-suffix">%</span>
                </div>
                <button
                  className="save-btn"
                  onClick={() => handleSave(userId)}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
                {status === 'saved' && (
                  <span className="save-status save-status--success">Saved</span>
                )}
                {status === 'error' && (
                  <span className="save-status save-status--error">Error</span>
                )}
                {status === 'invalid' && (
                  <span className="save-status save-status--error">Invalid rate</span>
                )}
                {isNonDefault(userId) && (
                  <span className="custom-rate-badge">Custom</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
