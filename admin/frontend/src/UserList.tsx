import { useState, useEffect, useRef } from 'react'
import { fetchUsers, type UserSummary } from './api'
import { formatConfigOverride } from './llmConfig'

export function UserList({ onSelectUser }: { onSelectUser: (id: string) => void }) {
  const [users, setUsers] = useState<UserSummary[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    setLoading(true)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(
      () => {
        fetchUsers(search || undefined)
          .then(setUsers)
          .catch(console.error)
          .finally(() => setLoading(false))
      },
      search ? 300 : 0
    )
  }, [search])

  return (
    <>
      <div className="search-bar">
        <input
          type="text"
          placeholder="Search by email or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Organization</th>
              <th>Role</th>
              <th>Override</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} onClick={() => onSelectUser(user.id)}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>{user.organization?.name ?? <span className="text-muted">—</span>}</td>
                <td>
                  {user.orgRole ? (
                    <span className={`badge ${user.orgRole === 'admin' ? 'badge-blue' : 'badge-gray'}`}>
                      {user.orgRole}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td>
                  {formatConfigOverride(user.config) ? (
                    <span className="badge badge-yellow">{formatConfigOverride(user.config)}</span>
                  ) : (
                    <span className="text-muted">default</span>
                  )}
                </td>
                <td className="text-muted">{new Date(user.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="text-muted" style={{ textAlign: 'center', padding: 40 }}>
                  {search ? 'No users found' : 'No users yet'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </>
  )
}
