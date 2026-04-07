'use client'

import { Package, TrendingUp, AlertCircle, Star } from 'lucide-react'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { SkeletonMetricCard, SkeletonTable } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/Pagination'
import { TopBar } from '@/components/shared/Sidebar'
import { useFetch } from '@/hooks'
import { useAuth } from '@/lib/auth-context'
import { formatCurrency, formatDeadline, formatCurrencyCompact } from '@/lib/format'
import type { PurchaseOrder, CreditScore, OptimizerAlert } from '@/types'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'

interface DashboardData {
  activePOs: PurchaseOrder[]
  totalOutstanding: number
  nextDeadline: string | null
  creditScore: CreditScore | null
  optimizerAlerts: OptimizerAlert[]
}

export default function BuyerDashboard() {
  const { user } = useAuth()
  const { data, loading, error } = useFetch<DashboardData>('/api/buyer/dashboard')

  const firstName = user?.firstName ?? ''

  return (
    <div>
      <TopBar
        title={`Good morning, ${firstName} 👋`}
        subtitle="Here's what needs your attention today."
        actions={
          <Link href="/buyer/cash-flow">
            <Button variant="outline" size="sm" iconLeft={<TrendingUp className="w-3.5 h-3.5" />}>
              Open Optimizer
            </Button>
          </Link>
        }
      />

      {/* Metric cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonMetricCard key={i} />)
        ) : (
          <>
            <StatCard
              label="Total Outstanding"
              value={data ? formatCurrencyCompact(data.totalOutstanding) : '₹0'}
              sub="across active POs"
              icon={<Package className="w-4 h-4" />}
              iconColor="bg-indigo-50 text-indigo-600"
            />
            <StatCard
              label="Next Payment Due"
              value={data?.nextDeadline
                ? formatDeadline(data.nextDeadline).label
                : 'None'}
              sub={data?.nextDeadline ? 'upcoming deadline' : 'all clear'}
              icon={<AlertCircle className="w-4 h-4" />}
              iconColor={
                data?.nextDeadline
                  ? formatDeadline(data.nextDeadline).urgency === 'overdue' || formatDeadline(data.nextDeadline).urgency === 'high'
                    ? 'bg-red-50 text-red-500'
                    : 'bg-amber-50 text-amber-600'
                  : 'bg-emerald-50 text-emerald-600'
              }
            />
            <StatCard
              label="Credit Score"
              value={data?.creditScore?.score ?? '—'}
              sub={data?.creditScore?.tier ?? 'not computed yet'}
              icon={<Star className="w-4 h-4" />}
              iconColor="bg-yellow-50 text-yellow-600"
            />
            <StatCard
              label="Active POs"
              value={data?.activePOs.length ?? 0}
              sub="in progress"
              icon={<Package className="w-4 h-4" />}
              iconColor="bg-purple-50 text-purple-600"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Active POs */}
        <div className="xl:col-span-2">
          <Card padding="none">
            <CardHeader className="px-5 pt-5 pb-0">
              <CardTitle>Active Purchase Orders</CardTitle>
              <Link href="/buyer/purchase-orders" className="text-xs text-indigo-600 hover:underline">
                View all
              </Link>
            </CardHeader>

            {loading ? (
              <div className="mt-4">
                <SkeletonTable rows={4} />
              </div>
            ) : !data?.activePOs.length ? (
              <EmptyState
                title="No active purchase orders"
                description="Place an RFQ with a supplier to get started."
                action={<Link href="/buyer/discover"><Button size="sm">Browse suppliers</Button></Link>}
              />
            ) : (
              <div className="mt-3 divide-y divide-gray-50">
                {data.activePOs.slice(0, 6).map((po) => {
                  const deadline = formatDeadline(po.paymentDeadline)
                  return (
                    <Link
                      key={po._id}
                      href={`/buyer/purchase-orders/${po._id}`}
                      className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/70 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {typeof po.supplierId === 'object' ? (po.supplierId as any).name : 'Supplier'}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {typeof po.productId === 'object' ? (po.productId as any).name : 'Product'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-mono font-medium text-gray-900">
                          {formatCurrency(po.amountRemaining)}
                        </p>
                        <p className={`text-xs mt-0.5 ${deadline.urgency === 'overdue' ? 'text-red-500' :
                            deadline.urgency === 'high' ? 'text-amber-600' : 'text-gray-400'
                          }`}>
                          {deadline.label}
                        </p>
                      </div>
                      <StatusBadge status={po.paymentStatus} />
                    </Link>
                  )
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Optimizer alerts */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Payment Alerts</CardTitle>
              <Link href="/buyer/cash-flow" className="text-xs text-indigo-600 hover:underline">
                Open optimizer
              </Link>
            </CardHeader>

            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-16 bg-gray-100 rounded-lg animate-skeleton" />
                ))}
              </div>
            ) : !data?.optimizerAlerts.length ? (
              <EmptyState
                icon={<TrendingUp className="w-5 h-5" />}
                title="No urgent alerts"
                description="Your payments are on track."
              />
            ) : (
              <div className="space-y-2">
                {data.optimizerAlerts.slice(0, 5).map((alert, i) => (
                  <div
                    key={i}
                    className={`rounded-lg p-3 text-xs ${alert.urgency === 'high' ? 'bg-red-50 text-red-700' :
                        alert.urgency === 'medium' ? 'bg-amber-50 text-amber-700' :
                          'bg-gray-50 text-gray-600'
                      }`}
                  >
                    {alert.message}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}