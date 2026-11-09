import { Outlet } from 'react-router-dom'
import BottomNav from '../components/BottomNav'

export default function AppLayout() {
  return (
    <div className="mx-auto min-h-dvh max-w-md bg-white">
      <main className="pb-24">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}