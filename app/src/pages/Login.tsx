import { useState, type FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ShieldCheck, LogIn, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email, password, remember)
      navigate(from, { replace: true })
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const axErr = err as { response?: { data?: { error?: string } } }
        setError(axErr.response?.data?.error || 'Invalid email or password')
      } else {
        setError('Unable to connect to authentication service')
      }
    } finally {
      setLoading(false)
    }
  }

  const fillDemo = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail)
    setPassword(demoPass)
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-slate-100 p-4">
      <div className="mx-auto w-full max-w-md rounded-3xl border-2 border-slate-900 bg-white p-6 shadow-xl sm:p-8">
        {/* Header Branding */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-700 text-white shadow-md">
            <ShieldCheck size={36} />
          </div>
          <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-900">Auto-ATC</h1>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            Automated Animal Type Classification System
          </p>
          <span className="mt-2 inline-flex items-center rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-800">
            Field Typer Portal
          </span>
        </div>

        {error && (
          <div className="mt-6 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
            <AlertCircle size={18} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="typer@auto-atc.local"
              className="w-full min-h-touch rounded-xl border-2 border-slate-300 p-3 text-sm font-bold text-slate-900 focus:border-brand-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full min-h-touch rounded-xl border-2 border-slate-300 p-3 text-sm font-bold text-slate-900 focus:border-brand-600 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Remember session
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full min-h-touch items-center justify-center gap-2 rounded-xl bg-brand-700 py-3 text-base font-bold text-white shadow-lg hover:bg-brand-800 active:bg-brand-900 disabled:opacity-60"
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <LogIn size={20} />
                <span>Sign In to Field App</span>
              </>
            )}
          </button>
        </form>

        {/* Demo Fast Login Buttons */}
        <div className="mt-6 border-t border-slate-200 pt-4">
          <p className="text-center text-xs font-bold text-slate-500 mb-2">Demo Quick-Fill:</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => fillDemo('typer@auto-atc.local', 'ChangeMe-Typer-123!')}
              className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              Typer Account
            </button>
            <button
              type="button"
              onClick={() => fillDemo('admin@auto-atc.local', 'ChangeMe-Admin-123!')}
              className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              Admin Account
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
