import React from 'react'

export default function MetricCard({ label, value, subtitle, highlighted, large }) {
  const classNames = [
    'metric-card',
    highlighted ? 'metric-card--highlighted' : '',
    large ? 'metric-card--large' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classNames}>
      <div className={`metric-value${highlighted ? ' metric-value--green' : ''}`}>
        {value ?? '--'}
      </div>
      <div className="metric-label">{label}</div>
      {subtitle && <div className="metric-sub">{subtitle}</div>}
    </div>
  )
}
