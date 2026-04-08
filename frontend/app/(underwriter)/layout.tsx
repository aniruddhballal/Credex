'use client'

import { useAuth } from '@/lib/auth-context'
import { Sidebar } from '@/components/shared/Sidebar'
import { FullPageSpinner } from '@/components/ui/Pagination'
import { LayoutDashboard, FileText, User } from 'lucide-react'

const navItems = [
  { label: 'Dashboard',    href: '/underwriter/dashboard',    icon: <LayoutDashboard className="w-4 h-4" /> },
  { label: 'Applications', href: '/underwriter/applications', icon: <FileText className="w-4 h-4" /> },
  { label: 'Profile',      href: '/underwriter/profile',      icon: <User className="w-4 h-4" /> },
]

export default function UnderwriterLayout({ children }: { children: React.ReactNode }) {
  const { user, initialized, logout } = useAuth()
  if (!initialized) return <FullPageSpinner />
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar navItems={navItems} role="Underwriter"
        userName={user ? `${user.firstName} ${user.lastName}` : ''} onLogout={logout} />
      <main className="flex-1 min-w-0 p-8">{children}</main>
    </div>
  )
}