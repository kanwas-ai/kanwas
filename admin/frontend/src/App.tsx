import { useState, useEffect, useSyncExternalStore } from 'react'
import { UserList } from './UserList'
import { UserDetail } from './UserDetailView'
import { DevTools } from './DevTools'
import { Dashboard } from './Dashboard'
import { EmbedTemplates } from './EmbedTemplates'
import { LlmDefaults } from './LlmDefaults'
import { Skills } from './Skills'
import { WorkspaceTemplates } from './WorkspaceTemplates'
import { getLogoutUrl, getRuntimeBase } from './api'

const base = getRuntimeBase().replace(/\/$/, '')

function usePath() {
  const path = useSyncExternalStore(
    (cb) => {
      window.addEventListener('popstate', cb)
      return () => window.removeEventListener('popstate', cb)
    },
    () => window.location.pathname
  )
  const relative = path.startsWith(base) ? path.slice(base.length) : path
  return relative || '/'
}

export function navigate(to: string) {
  window.history.pushState(null, '', `${base}${to}`)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function useTheme() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem('admin_theme')
    if (stored) return stored === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('admin_theme', dark ? 'dark' : 'light')
  }, [dark])

  return [dark, () => setDark((d) => !d)] as const
}

type DashboardTab = 'overview' | 'usage' | 'cost'

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <a
      href={`${base}${href}`}
      className={active ? 'active' : ''}
      onClick={(e) => {
        e.preventDefault()
        navigate(href)
      }}
    >
      {children}
    </a>
  )
}

export default function App() {
  const path = usePath()
  const [dark, toggleTheme] = useTheme()

  // Route matching
  const userMatch = path.match(/^\/users\/(.+)$/)
  const dashboardMatch = path.match(/^\/dashboard(?:\/(\w+))?$/)
  const isDashboard = path === '/' || !!dashboardMatch
  const dashboardTab: DashboardTab = (dashboardMatch?.[1] as DashboardTab) || 'overview'
  const isUsers = path === '/users' || !!userMatch
  const isTemplates = path.startsWith('/templates')
  const isLlmDefaults = path.startsWith('/llm-defaults')
  const isSkills = path.startsWith('/skills')
  const isDev = path.startsWith('/dev')
  const isEmbedTemplates = path === '/embed-templates'
  const selectedUserId = userMatch?.[1] ?? null

  let content
  if (isDev) {
    content = <DevTools />
  } else if (isSkills) {
    content = <Skills />
  } else if (isEmbedTemplates) {
    content = <EmbedTemplates />
  } else if (isLlmDefaults) {
    content = <LlmDefaults />
  } else if (isTemplates) {
    content = <WorkspaceTemplates />
  } else if (selectedUserId) {
    content = <UserDetail userId={selectedUserId} onBack={() => navigate('/users')} />
  } else if (isUsers) {
    content = <UserList onSelectUser={(id) => navigate(`/users/${id}`)} />
  } else {
    content = (
      <Dashboard
        tab={dashboardTab}
        onTabChange={(t) => navigate(`/dashboard/${t}`)}
        onNavigateUser={(id) => navigate(`/users/${id}`)}
      />
    )
  }

  return (
    <div className="layout">
      <div className="sidebar">
        <div className="logo">
          <img src={`${base}/logo.png`} alt="Kanwas" />
        </div>
        <nav>
          <NavLink href="/" active={isDashboard}>
            Dashboard
          </NavLink>

          <div className="nav-section">Manage</div>
          <NavLink href="/users" active={isUsers}>
            Users
          </NavLink>
          <NavLink href="/skills" active={isSkills}>
            Skills
          </NavLink>
          <NavLink href="/embed-templates" active={isEmbedTemplates}>
            Embed Templates
          </NavLink>
          <NavLink href="/templates" active={isTemplates}>
            Templates
          </NavLink>
          <NavLink href="/llm-defaults" active={isLlmDefaults}>
            LLM Defaults
          </NavLink>

          <div className="nav-section">Dev</div>
          <NavLink href="/dev" active={isDev}>
            Dev Tools
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <button className="theme-toggle" onClick={toggleTheme}>
            <div className={`theme-toggle-track${dark ? ' active' : ''}`}>
              <div className="theme-toggle-thumb" />
            </div>
            {dark ? 'Dark' : 'Light'}
          </button>
          <form method="POST" action={getLogoutUrl()}>
            <button type="submit">Sign out</button>
          </form>
        </div>
      </div>
      <div className="main">{content}</div>
    </div>
  )
}
