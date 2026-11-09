import type { Session, User } from '../types/auth'

export const TOKEN_KEY = 'atc_token'
export const USER_KEY = 'atc_user'

export function clearSession(): void {
  for (const store of [localStorage, sessionStorage]) {
    store.removeItem(TOKEN_KEY)
    store.removeItem(USER_KEY)
  }
}

// remember = true  -> localStorage   (survives closing the browser)
// remember = false -> sessionStorage (gone when the browser closes)
export function saveSession({ token, user }: Session, remember: boolean): void {
  clearSession()
  const store = remember ? localStorage : sessionStorage
  store.setItem(TOKEN_KEY, token)
  store.setItem(USER_KEY, JSON.stringify(user))
}

export function loadSession(): Session | null {
  for (const store of [localStorage, sessionStorage]) {
    const token = store.getItem(TOKEN_KEY)
    const rawUser = store.getItem(USER_KEY)
    if (token && rawUser) {
      try {
        return { token, user: JSON.parse(rawUser) as User }
      } catch {
        // corrupted data: treat as logged out
      }
    }
  }
  return null
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY)
}