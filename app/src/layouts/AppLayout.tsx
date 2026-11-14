import { Outlet } from 'react-router-dom'
import TopNav from '../components/TopNav'
import BottomNav from '../components/BottomNav'

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col antialiased">
      <TopNav />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-12">
        <Outlet />
      </main>

      {/* Mobile-only bottom navigation bar */}
      <div className="md:hidden">
        <BottomNav />
      </div>
    </div>
  )
}
