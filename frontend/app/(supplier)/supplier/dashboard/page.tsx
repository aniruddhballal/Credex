'use client'

import Link from 'next/link'
import { Package, FileText, ShoppingBag, Star, Plus } from 'lucide-react'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { SkeletonMetricCard, SkeletonTable } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/Pagination'
import { TopBar } from '@/components/shared/Sidebar'
import { Button } from '@/components/ui/Button'
import { useFetch } from '@/hooks'
import { useAuth } from '@/lib/auth-context'
import { formatCurrency, formatDeadline } from '@/lib/format'
import type { RFQ, PurchaseOrder } from '@/types'

interface SupplierDashboardData {
  activeListings:  number
  pendingRFQs:     number
  totalReceivable: number
  averageRating:   number
  incomingRFQs:    RFQ[]
  activePOs:       PurchaseOrder[]
}

export default function SupplierDashboard() {
  const { user } = useAuth()
  const { data, loading } = useFetch<SupplierDashboardData>('/api/supplier/dashboard')

  return (
    <div>
      <TopBar
        title={`Welcome, ${user?.firstName ?? ''} 👋`}
        subtitle="Here's your supplier overview."
        actions={
          <Link href="/supplier/listings/new">
            <Button size="sm" iconLeft={<Plus className="w-3.5 h-3.5" />}>
              New listing
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonMetricCard key={i} />)
        ) : (
          <>
            <StatCard label="Active Listings" value={data?.activeListings ?? 0}
              icon={<Package className="w-4 h-4" />} iconColor="bg-indigo-50 text-indigo-600" />
            <StatCard label="Pending RFQs" value={data?.pendingRFQs ?? 0}
              sub="awaiting your response"
              icon={<FileText className="w-4 h-4" />} iconColor="bg-amber-50 text-amber-600" />
            <StatCard label="Total Receivable" value={formatCurrency(data?.totalReceivable ?? 0)}
              sub="across active POs"
              icon={<ShoppingBag className="w-4 h-4" />} iconColor="bg-emerald-50 text-emerald-600" />
            <StatCard label="Average Rating" value={data?.averageRating?.toFixed(1) ?? '—'}
              sub="across all reviews"
              icon={<Star className="w-4 h-4" />} iconColor="bg-yellow-50 text-yellow-600" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Incoming RFQs */}
        <Card padding="none">
          <CardHeader className="px-5 pt-5 pb-0">
            <CardTitle>Incoming RFQs</CardTitle>
            <Link href="/supplier/rfqs" className="text-xs text-indigo-600 hover:underline">View all</Link>
          </CardHeader>
          {loading ? <div className="mt-4"><SkeletonTable rows={3} /></div> :
           !data?.incomingRFQs.length ? (
            <EmptyState icon={<FileText className="w-5 h-5" />} title="No pending RFQs" />
           ) : (
            <div className="mt-3 divide-y divide-gray-50">
              {data.incomingRFQs.slice(0, 5).map((rfq) => {
                const buyer = typeof rfq.buyerId === 'object' ? rfq.buyerId : null
                const product = typeof rfq.productId === 'object' ? rfq.productId : null
                return (
                  <Link key={rfq._id} href={`/supplier/rfqs/${rfq._id}`}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {buyer ? (buyer as any).name : 'Buyer'}
                      </p>
                      <p className="text-xs text-gray-400">{product ? (product as any).name : '—'}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono font-medium text-gray-700">
                        {formatCurrency(rfq.currentProposedPrice)}
                        <span className="text-xs text-gray-400">/u</span>
                      </span>
                      <StatusBadge status={rfq.status} />
                    </div>
                  </Link>
                )
              })}
            </div>
           )}
        </Card>

        {/* Active POs */}
        <Card padding="none">
          <CardHeader className="px-5 pt-5 pb-0">
            <CardTitle>Active Orders</CardTitle>
            <Link href="/supplier/purchase-orders" className="text-xs text-indigo-600 hover:underline">View all</Link>
          </CardHeader>
          {loading ? <div className="mt-4"><SkeletonTable rows={3} /></div> :
           !data?.activePOs.length ? (
            <EmptyState icon={<ShoppingBag className="w-5 h-5" />} title="No active orders" />
           ) : (
            <div className="mt-3 divide-y divide-gray-50">
              {data.activePOs.slice(0, 5).map((po) => {
                const buyer = typeof po.buyerId === 'object' ? po.buyerId : null
                const deadline = formatDeadline(po.paymentDeadline)
                return (
                  <Link key={po._id} href={`/supplier/purchase-orders/${po._id}`}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {buyer ? (buyer as any).name : 'Buyer'}
                      </p>
                      <p className="text-xs text-gray-400">{deadline.label}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono font-medium text-gray-700">
                        {formatCurrency(po.totalPrice)}
                      </span>
                      <StatusBadge status={po.fulfilmentStatus} />
                    </div>
                  </Link>
                )
              })}
            </div>
           )}
        </Card>
      </div>
    </div>
  )
}