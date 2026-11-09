import { NavLink } from 'react-router-dom'
import { House, ScanLine, History, User } from 'lucide-react'

const items = [
  { to: '/dashboard', label: 'Home', icon: House },
  { to: '/animals/new', label: 'New Scan', icon: ScanLine },
  { to: '/evaluations', label: 'History', icon: History },
  { to: '/profile', label: 'Profile', icon: User },
]

export default function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-10 border-t-2 border-slate-900 bg-white pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-md">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={to === '/evaluations'}
              className={({ isActive }) =>
                `flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-sm font-bold ${
                  isActive ? 'bg-brand-700 text-white' : 'text-slate-900'
                }`
              }
            >
              <Icon size={26} aria-hidden="true" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}