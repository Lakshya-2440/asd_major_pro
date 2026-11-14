import { Link, NavLink, useNavigate } from 'react-router-dom'
import {
  House,
  ScanLine,
  History,
  ShieldCheck,
  User,
  LogOut,
  Download,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import { useState } from 'react'

export default function TopNav() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [exporting, setExporting] = useState(false)

  const handleExportCsv = async () => {
    try {
      setExporting(true)
      const res = await api.get('/evaluations/export?format=csv', { responseType: 'blob' })
      const blob = new Blob([res.data], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `auto_atc_evaluations_${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.warn('API export failed, generating local CSV from stored evaluations:', err)
      try {
        const stored = localStorage.getItem('cached_evaluations')
        const items = stored ? JSON.parse(stored) : []
        const headers = ['Evaluation_ID', 'Tag_ID', 'Species', 'Breed', 'Overall_Score', 'Status', 'Date']
        const rows = items.map((i: any) => [
          i.id,
          i.animal?.tag_id || '',
          i.animal?.species || '',
          i.animal?.breed || '',
          i.overall_score || '',
          i.status || '',
          i.created_at || '',
        ])
        const csvContent = [headers.join(','), ...rows.map((r: any[]) => r.join(','))].join('\n')
        const blob = new Blob([csvContent], { type: 'text/csv' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `auto_atc_evaluations_local_${new Date().toISOString().slice(0, 10)}.csv`
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.URL.revokeObjectURL(url)
      } catch (inner) {
        console.error('Failed to export local CSV', inner)
      }
    } finally {
      setExporting(false)
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login?logout=true')
  }

  const navLinks = [
    { to: '/dashboard', label: 'Dashboard', icon: House },
    { to: '/animals/new', label: 'New Evaluation', icon: ScanLine },
    { to: '/evaluations', label: 'Records & History', icon: History },
  ]

  return (
    <header className="sticky top-0 z-30 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
      {/* Main Navigation Bar */}
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 py-3">
        {/* Brand identity */}
        <Link to="/dashboard" className="flex items-center gap-3 group">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-700/20 group-hover:scale-105 transition-transform">
            <ShieldCheck size={22} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-black tracking-tight text-slate-900 group-hover:text-emerald-700 transition-colors">
                Auto-ATC
              </span>
            </div>
            <p className="text-[11px] font-semibold text-slate-500 leading-none">
              Animal Type Classification
            </p>
          </div>
        </Link>

        {/* Center Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/evaluations'}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition-all ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-800 shadow-sm border border-emerald-200/70'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <Icon size={17} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Right Actions & User Menu */}
        <div className="flex items-center gap-2.5">
          {/* Export CSV Button */}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={exporting}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition shadow-sm disabled:opacity-50"
            title="Download full evaluation records in CSV format"
          >
            <Download size={14} className={exporting ? 'animate-bounce text-emerald-600' : 'text-slate-500'} />
            <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
          </button>

          {/* New Scan CTA Button */}
          <Link
            to="/animals/new"
            className="hidden md:inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white shadow-md shadow-emerald-600/25 hover:bg-emerald-500 active:scale-[0.98] transition"
          >
            <ScanLine size={15} />
            <span>New Scan</span>
          </Link>

          {/* User Profile Pill */}
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-1 pl-2.5">
            <div className="text-right">
              <p className="text-xs font-black text-slate-900 leading-tight">
                {user?.name || 'Field Typer'}
              </p>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                {user?.role || 'Guest Typer'}
              </p>
            </div>
            <Link
              to="/profile"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm border border-slate-200 hover:text-emerald-700 transition"
              title="View Typer Profile"
            >
              <User size={15} />
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-400 shadow-sm border border-slate-200 hover:text-rose-600 transition"
              title="Sign Out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
