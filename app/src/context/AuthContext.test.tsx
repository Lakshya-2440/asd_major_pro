import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TOKEN_KEY, USER_KEY } from '../services/session'
import { AuthProvider, useAuth } from './AuthContext'

const { post } = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('../services/api', () => ({ default: { post } }))

const user = { id: 1, name: 'Ramesh', email: 'typer@atc.in', role: 'typer' }
const session = { token: 'jwt-123', user }

const setup = () => renderHook(() => useAuth(), { wrapper: AuthProvider })

describe('AuthContext', () => {
  beforeEach(() => {
    post.mockReset()
  })

  it('starts logged out', () => {
    const { result } = setup()
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBeNull()
    expect(result.current.token).toBeNull()
    expect(result.current.role).toBeNull()
  })

  it('login exposes user, token and role', async () => {
    post.mockResolvedValue({ data: session })
    const { result } = setup()

    await act(async () => {
      await result.current.login('typer@atc.in', 'secret123')
    })

    expect(post).toHaveBeenCalledWith('/auth/login', {
      email: 'typer@atc.in',
      password: 'secret123',
    })
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.token).toBe('jwt-123')
    expect(result.current.role).toBe('typer')
    expect(result.current.user?.name).toBe('Ramesh')
  })

  it('uses sessionStorage by default and localStorage when remember me is on', async () => {
    post.mockResolvedValue({ data: session })
    const { result } = setup()

    await act(async () => {
      await result.current.login('typer@atc.in', 'secret123')
    })
    expect(sessionStorage.getItem(TOKEN_KEY)).toBe('jwt-123')
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()

    await act(async () => {
      await result.current.login('typer@atc.in', 'secret123', true)
    })
    expect(localStorage.getItem(TOKEN_KEY)).toBe('jwt-123')
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull()
  })

  it('stays logged out when login fails', async () => {
    post.mockRejectedValue(new Error('401'))
    const { result } = setup()

    await act(async () => {
      await expect(result.current.login('typer@atc.in', 'wrong')).rejects.toThrow('401')
    })

    expect(result.current.isAuthenticated).toBe(false)
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
  })

  it('logout clears state and storage', async () => {
    post.mockResolvedValue({ data: session })
    const { result } = setup()
    await act(async () => {
      await result.current.login('typer@atc.in', 'secret123', true)
    })

    act(() => result.current.logout())

    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBeNull()
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
  })

  it('restores a saved session on mount', () => {
    localStorage.setItem(TOKEN_KEY, 'jwt-123')
    localStorage.setItem(USER_KEY, JSON.stringify(user))

    const { result } = setup()

    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.role).toBe('typer')
  })

  it('throws when useAuth is used outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useAuth())).toThrow(/AuthProvider/)
    spy.mockRestore()
  })
})