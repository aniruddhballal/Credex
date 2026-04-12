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
import { useAuth } from '@/lib/auth-context'
import { formatCurrency, formatDeadline } from '@/lib/format'
import type { RFQ, PurchaseOrder } from '@/types'
import api from '@/lib/api'
import { useEffect, useState } from 'react'

interface SupplierDashboardData {
  activeListings:  number
  pendingRFQs:     number
  totalReceivable: number
  averageRating:   number
  incomingRFQs:    RFQ[]
  activePOs:       PurchaseOrder[]
}

function useSupplierDashboard() {
  const { initialized, user } = useAuth()

  const [data, setData] = useState<SupplierDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isFallback, setIsFallback] = useState(false)

  useEffect(() => {
    // ── Wait until auth context has finished hydrating ──────────────────────
    // Without this guard, requests fire before the access token is in
    // localStorage, every call gets 403, and the dashboard crashes.
    if (!initialized || !user) return

    let cancelled = false
    setLoading(true)

    // Try the aggregate endpoint first
    api.get('/api/supplier/dashboard')
      .then((res) => {
        if (cancelled) return
        setData(res.data?.data ?? res.data)
        setIsFallback(false)
      })
      .catch(() => {
        if (cancelled) return
        // Aggregate endpoint not live yet — fall back to individual calls
        setIsFallback(true)
        Promise.all([
          api.get('/api/rfqs?role=supplier&status=pending&limit=5'),
          api.get('/api/purchase-orders?role=supplier&paymentStatus=unpaid,partially_paid&limit=5'),
          api.get('/api/products/my/listings'),
        ]).then(([rfqRes, poRes, listingsRes]) => {
          if (cancelled) return
          const rfqs: RFQ[]          = rfqRes.data?.data?.items ?? []
          const pos: PurchaseOrder[] = poRes.data?.data?.items ?? []
          const listings             = listingsRes.data?.data?.items ?? []
          const totalReceivable      = pos.reduce((sum, po) => sum + po.amountRemaining, 0)
          setData({
            activeListings:  listings.length,
            pendingRFQs:     rfqs.length,
            totalReceivable,
            averageRating:   0,
            incomingRFQs:    rfqs,
            activePOs:       pos,
          })
        }).catch(console.error)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [initialized, user]) // ← only runs once auth is ready

  return { data, loading, isFallback }
}

export default function SupplierDashboard() {
  const { user } = useAuth()
  const { data, loading, isFallback } = useSupplierDashboard()

  return (
    <div>
      <TopBar
        title={`Welcome, ${user?.firstName ?? ''} 👋`}
        subtitle="Here's your supplier overview."
        actions={
          <Link href="/supplier/listings/new">
            <Button size="sm" iconLeft={<Plus className="w-3.5 h-3.5" />}>New listing</Button>
          </Link>
        }
      />

      {isFallback && (
        <div className="mb-4 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
          ⚠ Dashboard loading in degraded mode — waiting for <code>/api/supplier/dashboard</code> to go live
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {loading ? Array.from({ length: 4 }).map((_, i) => <SkeletonMetricCard key={i} />) : (
          <>
            <StatCard label="Active Listings" value={data?.activeListings ?? 0}
              icon={<Package className="w-4 h-4" />} iconColor="bg-indigo-500/15 text-indigo-400" />
            <StatCard label="Pending RFQs" value={data?.pendingRFQs ?? 0}
              sub="awaiting your response"
              icon={<FileText className="w-4 h-4" />} iconColor="bg-amber-500/15 text-amber-400" />
            <StatCard label="Total Receivable" value={formatCurrency(data?.totalReceivable ?? 0)}
              sub="across active POs"
              icon={<ShoppingBag className="w-4 h-4" />} iconColor="bg-emerald-500/15 text-emerald-400" />
            <StatCard label="Average Rating" value={data?.averageRating?.toFixed(1) ?? '—'}
              sub="across all reviews"
              icon={<Star className="w-4 h-4" />} iconColor="bg-yellow-500/15 text-yellow-400" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card padding="none">
          <CardHeader className="px-5 pt-5 pb-0">
            <CardTitle>Incoming RFQs</CardTitle>
            <Link href="/supplier/rfqs" className="text-xs text-indigo-400 hover:text-indigo-300">View all</Link>
          </CardHeader>
          {loading ? <div className="mt-4"><SkeletonTable rows={3} /></div> :
           !data?.incomingRFQs.length ? (
            <EmptyState icon={<FileText className="w-5 h-5" />} title="No pending RFQs" />
           ) : (
            <div className="mt-3 divide-y divide-white/5">
              {data.incomingRFQs.slice(0, 5).map((rfq) => {
                const buyer   = typeof rfq.buyerId   === 'object' ? rfq.buyerId   : null
                const product = typeof rfq.productId === 'object' ? rfq.productId : null
                return (
                  <Link key={rfq._id} href={`/supplier/rfqs/${rfq._id}`}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-white/3 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-white/90">{buyer ? (buyer as any).name : 'Buyer'}</p>
                      <p className="text-xs text-white/35">{product ? (product as any).name : '—'}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono font-medium text-white/80">
                        {formatCurrency(rfq.currentProposedPrice)}<span className="text-xs text-white/30">/u</span>
                      </span>
                      <StatusBadge status={rfq.status} />
                    </div>
                  </Link>
                )
              })}
            </div>
           )}
        </Card>

        <Card padding="none">
          <CardHeader className="px-5 pt-5 pb-0">
            <CardTitle>Active Orders</CardTitle>
            <Link href="/supplier/purchase-orders" className="text-xs text-indigo-400 hover:text-indigo-300">View all</Link>
          </CardHeader>
          {loading ? <div className="mt-4"><SkeletonTable rows={3} /></div> :
           !data?.activePOs.length ? (
            <EmptyState icon={<ShoppingBag className="w-5 h-5" />} title="No active orders" />
           ) : (
            <div className="mt-3 divide-y divide-white/5">
              {data.activePOs.slice(0, 5).map((po) => {
                const buyer    = typeof po.buyerId === 'object' ? po.buyerId : null
                const deadline = formatDeadline(po.paymentDeadline)
                return (
                  <Link key={po._id} href={`/supplier/purchase-orders/${po._id}`}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-white/3 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-white/90">{buyer ? (buyer as any).name : 'Buyer'}</p>
                      <p className="text-xs text-white/35">{deadline.label}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono text-white/80">{formatCurrency(po.totalPrice)}</span>
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