const BASE = '/api'

async function request(url, options = {}) {
  const res = await fetch(url, options)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
  return res.json()
}

export function fetchUsers() {
  return request(`${BASE}/users`)
}

export function fetchAgentConfig() {
  return request(`${BASE}/agent-config`)
}

export function updateAgentConfig(userId, commissionRate) {
  return request(`${BASE}/agent-config/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commission_rate: commissionRate }),
  })
}

export function fetchMetrics(period, userId, date) {
  const params = new URLSearchParams()
  if (period) params.set('period', period)
  if (userId) params.set('user_id', userId)
  if (date) params.set('date', date)
  return request(`${BASE}/metrics?${params.toString()}`)
}

export function fetchLeaderboard(period) {
  const params = new URLSearchParams()
  if (period) params.set('period', period)
  return request(`${BASE}/leaderboard?${params.toString()}`)
}

export function refreshData() {
  return request(`${BASE}/refresh`, { method: 'POST' })
}
