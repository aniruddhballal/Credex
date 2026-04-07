'use client'

import { useAuth } from '@/lib/auth-context'
import { Sidebar } from '@/components/shared/Sidebar'
import { FullPageSpinner } from '@/components/ui/Pagination'
import {
  LayoutDashboard, ShoppingBag, FileText, Package,
  CreditCard, TrendingUp, Bell, MessageSquare, User,
} from 'lucide-react'

const navItems = [
  { label: 'Dashboard',       href: '/buyer/dashboard',       icon: <LayoutDashboard className="w-4 h-4" /> },
  { label: 'Discover',        href: '/buyer/discover',        icon: <ShoppingBag className="w-4 h-4" /> },
  { label: 'RFQs',            href: '/buyer/rfqs',            icon: <FileText className="w-4 h-4" /> },
  { label: 'Purchase Orders', href: '/buyer/purchase-orders', icon: <Package className="w-4 h-4" /> },
  { label: 'Cash Flow',       href: '/buyer/cash-flow',       icon: <TrendingUp className="w-4 h-4" /> },
  { label: 'Loans',           href: '/buyer/loans',           icon: <CreditCard className="w-4 h-4" /> },
  { label: 'Messages',        href: '/buyer/messages',        icon: <MessageSquare className="w-4 h-4" /> },
  { label: 'Notifications',   href: '/buyer/notifications',   icon: <Bell className="w-4 h-4" /> },
  { label: 'Profile',         href: '/buyer/profile',         icon: <User className="w-4 h-4" /> },
]

export default function BuyerLayout({ children }: { children: React.ReactNode }) {
  const { user, initialized, logout } = useAuth()

  if (!initialized) return <FullPageSpinner />

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        navItems={navItems}
        role="Buyer"
        userName={user ? `${user.firstName} ${user.lastName}` : ''}
        onLogout={logout}
      />
      <main className="flex-1 min-w-0 p-8">
        {children}
      </main>
    </div>
  )
}