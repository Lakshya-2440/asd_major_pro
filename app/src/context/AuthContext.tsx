import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import api from '../services/api'
import { clearSession, loadSession, saveSession } from '../services/session'
import type { Role, Session, User } from '../types/auth'

interface AuthContextValue {
  user: User | null
  token: string | null
  role: Role | null
  isAuthenticated: boolean
  login: (email: string, password: string, remember?: boolean) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  // Read storage synchronously so a page refresh doesn't flash the login screen
  const [session, setSession] = useState<Session | null>(() => loadSession())

  const login = useCallback(async (email: string, password: string, remember = false) => {
    const { data } = await api.post<Session>('/auth/login', { email, password })
    saveSession(data, remember)
    setSession(data)
  }, [])

  const logout = useCallback(() => {
    clearSession()
    setSession(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      token: session?.token ?? null,
      role: session?.user.role ?? null,
      isAuthenticated: session !== null,
      login,
      logout,
    }),
    [session, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}