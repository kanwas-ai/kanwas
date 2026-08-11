import { useState, useEffect } from 'react'
import { fetchOverview, fetchUsage, fetchCost, type OverviewData, type UsageData, type CostData } from './api'

type Tab = 'overview' | 'usage' | 'cost'

const STATUS_COLORS: Record<string, string> = {
  complete: 'badge-green',
  processing: 'badge-yellow',
  waiting: 'badge-blue',
  error: 'badge-red',
  initiated: 'badge-gray',
}

function Sparkline({ data, height = 40 }: { data: number[]; height?: number }) {
  if (data.length < 2) return null
  const max = Math.max(...data, 1)
  const w = 200
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${height - (v / max) * (height - 4)}`).join(' ')
  return (
    <svg width={w} height={height} style={{ display: 'block' }}>
      <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

function OverviewTab() {
  const [data, setData] = useState<OverviewData | null>(null)

  useEffect(() => {
    fetchOverview().then(setData).catch(console.error)
  }, [])

  if (!data) return <div className="loading">Loading...</div>

  return (
    <div>
      <div className="stat-grid">
        <StatCard label="Total Users" value={data.totals.users} />
        <StatCard label="Organizations" value={data.totals.organizations} />
        <StatCard label="Workspaces" value={data.totals.workspaces} />
      </div>

      <div className="dashboard-row">
        <div className="section">
          <h3>New Signups</h3>
          <div className="stat-grid stat-grid-3">
            <StatCard label="Today" value={data.signups.today} />
            <StatCard label="This Week" value={data.signups.thisWeek} />
            <StatCard label="This Month" value={data.signups.thisMonth} />
          </div>
          <div style={{ marginTop: 16 }}>
            <div className="stat-label" style={{ marginBottom: 8 }}>
              Last 30 days
            </div>
            <Sparkline data={data.dailySignups.map((d) => d.count)} />
          </div>
        </div>

        <div className="section">
          <h3>
            Active Users{' '}
            <span className="text-muted" style={{ fontSize: 12, fontWeight: 400 }}>
              — users who created at least one task
            </span>
          </h3>
          <div className="stat-grid stat-grid-3">
            <StatCard label="Today" value={data.activeUsers.today} />
            <StatCard label="This Week" value={data.activeUsers.thisWeek} />
            <StatCard label="This Month" value={data.activeUsers.thisMonth} />
          </div>
        </div>
      </div>
    </div>
  )
}

function UsageTab({ onNavigateUser }: { onNavigateUser: (id: string) => void }) {
  const [data, setData] = useState<UsageData | null>(null)

  useEffect(() => {
    fetchUsage().then(setData).catch(console.error)
  }, [])

  if (!data) return <div className="loading">Loading...</div>

  return (
    <div>
      <div className="stat-grid">
        <StatCard label="Tasks Today" value={data.tasks.today} />
        <StatCard label="This Week" value={data.tasks.thisWeek} />
        <StatCard label="This Month" value={data.tasks.thisMonth} />
        <StatCard label="Total" value={data.tasks.total} />
      </div>

      <div className="dashboard-row">
        <div className="section">
          <h3>Status Breakdown (30d)</h3>
          <div className="status-bars">
            {data.statusBreakdown.map((s) => {
              const total = data.statusBreakdown.reduce((sum, x) => sum + x.count, 0) || 1
              const pct = (s.count / total) * 100
              return (
                <div key={s.status} className="status-bar-row">
                  <span className={`badge ${STATUS_COLORS[s.status] || 'badge-gray'}`}>{s.status}</span>
                  <div className="status-bar-track">
                    <div className="status-bar-fill" style={{ width: `${pct}%` }} data-status={s.status} />
                  </div>
                  <span className="status-bar-count">{s.count}</span>
                </div>
              )
            })}
          </div>
          {data.errorRate > 0 && (
            <div style={{ marginTop: 12, fontSize: 13 }}>
              Error rate: <span className={data.errorRate > 5 ? 'text-danger' : ''}>{data.errorRate}%</span>
            </div>
          )}
        </div>

        <div className="section">
          <h3>Tasks per Day (30d)</h3>
          <Sparkline data={data.dailyTasks.map((d) => d.count)} height={60} />
        </div>
      </div>

      <div className="section">
        <h3>Top Users (30d)</h3>
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th style={{ textAlign: 'right' }}>Tasks</th>
            </tr>
          </thead>
          <tbody>
            {data.topUsers.map((u) => (
              <tr key={u.id} onClick={() => onNavigateUser(u.id)}>
                <td>{u.name}</td>
                <td className="text-muted">{u.email}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{u.taskCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.recentErrors.length > 0 && (
        <div className="section">
          <h3>Recent Errors</h3>
          {data.recentErrors.slice(0, 10).map((e) => (
            <div key={e.id} className="task-row">
              <span className="badge badge-red">error</span>
              <span className="title">{e.title || e.description || '(untitled)'}</span>
              <span className="text-muted" style={{ fontSize: 12 }}>
                {e.userName}
              </span>
              <span className="date">{new Date(e.createdAt).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CostTab() {
  const [data, setData] = useState<CostData | null>(null)

  useEffect(() => {
    fetchCost().then(setData).catch(console.error)
  }, [])

  if (!data) return <div className="loading">Loading...</div>

  const cents = (c: number) => `$${(c / 100).toFixed(2)}`

  return (
    <div>
      <div className="stat-grid">
        <StatCard label="Weekly Spend (all orgs)" value={cents(data.totalSpend.weeklyCents)} />
        <StatCard label="Monthly Spend (all orgs)" value={cents(data.totalSpend.monthlyCents)} />
      </div>

      <div className="section">
        <h3>Organizations</h3>
        <table>
          <thead>
            <tr>
              <th>Organization</th>
              <th style={{ textAlign: 'right' }}>Weekly</th>
              <th style={{ textAlign: 'right' }}>Limit</th>
              <th style={{ textAlign: 'right' }}>Monthly</th>
              <th style={{ textAlign: 'right' }}>Limit</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.organizations.map((org) => {
              const warn = org.weeklyPercent > 80 || org.monthlyPercent > 80
              const danger = org.weeklyPercent > 95 || org.monthlyPercent > 95
              return (
                <tr key={org.id} style={{ cursor: 'default' }}>
                  <td>{org.name}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {cents(org.weeklySpendCents)}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} className="text-muted">
                    {cents(org.weeklyLimitCents)}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {cents(org.monthlySpendCents)}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} className="text-muted">
                    {cents(org.monthlyLimitCents)}
                  </td>
                  <td>
                    {danger ? (
                      <span className="badge badge-red">at limit</span>
                    ) : warn ? (
                      <span className="badge badge-yellow">approaching</span>
                    ) : (
                      <span className="badge badge-green">ok</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {data.organizations.length === 0 && (
              <tr style={{ cursor: 'default' }}>
                <td colSpan={6} className="text-muted" style={{ textAlign: 'center', padding: 24 }}>
                  No usage data yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function Dashboard({
  tab,
  onTabChange,
  onNavigateUser,
}: {
  tab: Tab
  onTabChange: (tab: Tab) => void
  onNavigateUser: (id: string) => void
}) {
  return (
    <div>
      <div className="tab-bar">
        {(['overview', 'usage', 'cost'] as Tab[]).map((t) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => onTabChange(t)}>
            {t === 'overview' ? 'Overview' : t === 'usage' ? 'Agent Usage' : 'Cost'}
          </button>
        ))}
      </div>
      {tab === 'overview' && <OverviewTab />}
      {tab === 'usage' && <UsageTab onNavigateUser={onNavigateUser} />}
      {tab === 'cost' && <CostTab />}
    </div>
  )
}
