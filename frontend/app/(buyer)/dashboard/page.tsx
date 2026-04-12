'use client'

import Link from 'next/link'
import { Package, TrendingUp, AlertCircle, Star } from 'lucide-react'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { SkeletonMetricCard, SkeletonTable } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/Pagination'
import { TopBar } from '@/components/shared/Sidebar'
import { Button } from '@/components/ui/Button'
import { useFetch } from '@/hooks'
import { useAuth } from '@/lib/auth-context'
import { formatCurrency, formatDeadline, formatCurrencyCompact } from '@/lib/format'
import type { PurchaseOrder, CreditScore, OptimizerAlert } from '@/types'
import api from '@/lib/api'
import { useEffect, useState } from 'react'

interface DashboardData {
  activePOs:        PurchaseOrder[]
  totalOutstanding: number
  nextDeadline:     string | null
  creditScore:      CreditScore | null
  optimizerAlerts:  OptimizerAlert[]
}

// FIX 6: Fallback that makes individual calls when aggregate endpoint isn't ready
function useDashboard() {
  const primary = useFetch<DashboardData>('/api/buyer/dashboard')

  const [fallbackData, setFallbackData] = useState<DashboardData | null>(null)
  const [fallbackLoading, setFallbackLoading] = useState(false)

  useEffect(() => {
    if (!primary.error) return
    // Primary failed — fetch pieces individually
    setFallbackLoading(true)
    Promise.all([
      api.get('/api/purchase-orders?role=buyer&paymentStatus=unpaid,partially_paid&limit=6'),
      api.get('/api/credit-scores/me').catch(() => ({ data: { data: null } })),
    ]).then(([posRes, scoreRes]) => {
      const pos: PurchaseOrder[] = posRes.data?.data?.items ?? []
      const totalOutstanding = pos.reduce((sum, po) => sum + po.amountRemaining, 0)
      const nextDeadline = pos.length > 0
        ? pos.sort((a, b) => new Date(a.paymentDeadline).getTime() - new Date(b.paymentDeadline).getTime())[0].paymentDeadline
        : null
      setFallbackData({
        activePOs:        pos,
        totalOutstanding,
        nextDeadline,
        creditScore:      scoreRes.data?.data ?? null,
        optimizerAlerts:  [],   // not available without aggregate endpoint
      })
    }).catch(console.error)
      .finally(() => setFallbackLoading(false))
  }, [primary.error])

  if (!primary.error) return { data: primary.data, loading: primary.loading, isFallback: false }
  return { data: fallbackData, loading: fallbackLoading, isFallback: true }
}

export default function BuyerDashboard() {
  const { user } = useAuth()
  const { data, loading, isFallback } = useDashboard()
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

      {isFallback && (
        <div className="mb-4 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
          ⚠ Dashboard loading in degraded mode — waiting for <code>/api/buyer/dashboard</code> to go live
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonMetricCard key={i} />)
        ) : (
          <>
            <StatCard label="Total Outstanding"
              value={data ? formatCurrencyCompact(data.totalOutstanding) : '₹0'}
              sub="across active POs"
              icon={<Package className="w-4 h-4" />}
              iconColor="bg-indigo-500/15 text-indigo-400" />
            <StatCard label="Next Payment Due"
              value={data?.nextDeadline ? formatDeadline(data.nextDeadline).label : 'None'}
              sub={data?.nextDeadline ? 'upcoming deadline' : 'all clear'}
              icon={<AlertCircle className="w-4 h-4" />}
              iconColor={data?.nextDeadline && ['overdue','high'].includes(formatDeadline(data.nextDeadline).urgency)
                ? 'bg-red-500/15 text-red-400'
                : 'bg-emerald-500/15 text-emerald-400'} />
            <StatCard label="Credit Score"
              value={data?.creditScore?.score ?? '—'}
              sub={data?.creditScore?.tier ?? 'not computed yet'}
              icon={<Star className="w-4 h-4" />}
              iconColor="bg-amber-500/15 text-amber-400" />
            <StatCard label="Active POs"
              value={data?.activePOs.length ?? 0}
              sub="in progress"
              icon={<Package className="w-4 h-4" />}
              iconColor="bg-violet-500/15 text-violet-400" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <Card padding="none">
            <CardHeader className="px-5 pt-5 pb-0">
              <CardTitle>Active Purchase Orders</CardTitle>
              <Link href="/buyer/purchase-orders" className="text-xs text-indigo-400 hover:text-indigo-300">View all</Link>
            </CardHeader>
            {loading ? <div className="mt-4"><SkeletonTable rows={4} /></div> :
             !data?.activePOs.length ? (
              <EmptyState title="No active purchase orders"
                description="Place an RFQ with a supplier to get started."
                action={<Link href="/buyer/discover"><Button size="sm">Browse suppliers</Button></Link>} />
             ) : (
              <div className="mt-3 divide-y divide-white/5">
                {data.activePOs.slice(0, 6).map((po) => {
                  const deadline = formatDeadline(po.paymentDeadline)
                  return (
                    <Link key={po._id} href={`/buyer/purchase-orders/${po._id}`}
                      className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/3 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white/90 truncate">
                          {typeof po.supplierId === 'object' ? (po.supplierId as any).name : 'Supplier'}
                        </p>
                        <p className="text-xs text-white/35 mt-0.5">
                          {typeof po.productId === 'object' ? (po.productId as any).name : 'Product'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-mono font-medium text-white/90">
                          {formatCurrency(po.amountRemaining)}
                        </p>
                        <p className={`text-xs mt-0.5 ${
                          deadline.urgency === 'overdue' ? 'text-red-400' :
                          deadline.urgency === 'high'    ? 'text-amber-400' : 'text-white/30'
                        }`}>{deadline.label}</p>
                      </div>
                      <StatusBadge status={po.paymentStatus} />
                    </Link>
                  )
                })}
              </div>
             )}
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Payment Alerts</CardTitle>
              <Link href="/buyer/cash-flow" className="text-xs text-indigo-400 hover:text-indigo-300">Open optimizer</Link>
            </CardHeader>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-16 bg-white/6 rounded-xl animate-skeleton" />
                ))}
              </div>
            ) : !data?.optimizerAlerts.length ? (
              <EmptyState icon={<TrendingUp className="w-5 h-5" />}
                title="No urgent alerts"
                description={isFallback ? 'Run the optimizer to see alerts.' : 'Your payments are on track.'} />
            ) : (
              <div className="space-y-2">
                {data.optimizerAlerts.slice(0, 5).map((alert, i) => (
                  <div key={i} className={`rounded-xl p-3 text-xs border ${
                    alert.urgency === 'high'   ? 'bg-red-500/10 text-red-300 border-red-500/20' :
                    alert.urgency === 'medium' ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' :
                    'bg-white/5 text-white/50 border-white/8'
                  }`}>{alert.message}</div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}