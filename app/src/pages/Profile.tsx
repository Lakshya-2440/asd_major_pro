import { User, LogOut, CheckCircle, Database, Smartphone } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Profile() {
  const { user, role, logout } = useAuth()

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Top Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">User Profile</h1>
        <p className="text-xs font-semibold text-slate-600">Field Operative Session & System Status</p>
      </div>

      {/* User Info Card */}
      <div className="rounded-3xl border-2 border-slate-900 bg-white p-6 shadow-md">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
            <User size={32} />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900">{user?.name || 'Field Typer'}</h2>
            <p className="text-xs font-semibold text-slate-500">{user?.email || 'typer@auto-atc.local'}</p>
            <span className="mt-2 inline-block rounded-full bg-brand-700 px-3 py-0.5 text-xs font-bold text-white uppercase tracking-wider">
              {role || 'Typer'}
            </span>
          </div>
        </div>
      </div>

      {/* BPA Integration Card */}
      <div className="rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <Database size={18} className="text-brand-700" />
          <h3 className="text-sm font-black text-slate-900">BPA Central Registry</h3>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-600">Gateway Status</span>
          <span className="flex items-center gap-1 font-bold text-emerald-700">
            <CheckCircle size={14} />
            Connected & Syncing
          </span>
        </div>
        <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-2">
          <span className="font-semibold text-slate-600">Linear Classification Standard</span>
          <span className="font-bold text-slate-800">1 - 9 Range Bins</span>
        </div>
      </div>

      {/* App & System Status */}
      <div className="rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <Smartphone size={18} className="text-slate-700" />
          <h3 className="text-sm font-black text-slate-900">Application Info</h3>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-600">Version</span>
          <span className="font-bold text-slate-800">Auto-ATC PWA v0.2.0</span>
        </div>
        <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-2">
          <span className="font-semibold text-slate-600">Offline Capabilities</span>
          <span className="font-bold text-brand-700">Enabled (Service Worker)</span>
        </div>
      </div>

      {/* Logout Action */}
      <button
        type="button"
        onClick={logout}
        className="flex min-h-touch w-full items-center justify-center gap-2 rounded-2xl border-2 border-rose-200 bg-rose-50 py-3.5 text-sm font-extrabold text-rose-700 transition hover:bg-rose-100 active:scale-[0.99]"
      >
        <LogOut size={18} />
        <span>Sign Out from Device</span>
      </button>
    </div>
  )
}
