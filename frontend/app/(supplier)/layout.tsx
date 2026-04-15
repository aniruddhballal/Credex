'use client'

import { useAuth } from '@/lib/auth-context'
import { Sidebar } from '@/components/shared/Sidebar'
import { FullPageSpinner } from '@/components/ui/Pagination'
import {
  LayoutDashboard, Package, FileText,
  ShoppingBag, Bell, User, TrendingUp,
} from 'lucide-react'
import type { ReactNode } from 'react'

const navItems = [
  { label: 'Dashboard',       href: '/supplier/dashboard',       icon: <LayoutDashboard className="w-4 h-4" /> },
  { label: 'My Listings',     href: '/supplier/listings',        icon: <Package className="w-4 h-4" /> },
  { label: 'RFQs',            href: '/supplier/rfqs',            icon: <FileText className="w-4 h-4" /> },
  { label: 'Purchase Orders', href: '/supplier/purchase-orders', icon: <ShoppingBag className="w-4 h-4" /> },
  { label: 'Cash Flow', href: '/supplier/cash-flow', icon: <TrendingUp className="w-4 h-4" /> },
  { label: 'Notifications', href: '/supplier/notifications', icon: <Bell className="w-4 h-4" /> },
  { label: 'Profile', href: '/supplier/profile', icon: <User className="w-4 h-4" /> },
]

export default function SupplierLayout({ children }: { children: ReactNode }) {
  const { user, initialized, logout } = useAuth()
  if (!initialized) return <FullPageSpinner />
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        navItems={navItems}
        role="Supplier"
        userName={user ? `${user.firstName} ${user.lastName}` : ''}
        onLogout={logout}
      />
      <main className="flex-1 min-w-0 p-8">{children}</main>
    </div>
  )
}