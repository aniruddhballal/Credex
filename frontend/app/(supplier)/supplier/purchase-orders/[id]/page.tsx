'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { Truck } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Breadcrumb } from '@/components/shared/Sidebar'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/Pagination'
import { useFetch } from '@/hooks'
import { poApi } from '@/lib/api-hooks'
import { formatCurrency, formatDate, formatDeadline, humanize } from '@/lib/format'
import type { PurchaseOrder, Payment } from '@/types'
import { cn } from '@/lib/utils'

const FULFILMENT_FLOW = ['pending', 'processing', 'shipped', 'delivered'] as const
type FulfilmentStatus = typeof FULFILMENT_FLOW[number]

export default function SupplierPODetailPage() {
  const { id } = useParams<{ id: string }>()
  const [updating, setUpdating] = useState(false)
  const { data: po, loading, error, refetch } = useFetch<PurchaseOrder>(`/api/purchase-orders/${id}`)
  const { data: payments } = useFetch<Payment[]>(`/api/purchase-orders/${id}/payments`)

  const handleAdvanceFulfilment = async () => {
    if (!po) return
    const currentIdx = FULFILMENT_FLOW.indexOf(po.fulfilmentStatus as FulfilmentStatus)
    if (currentIdx < 0 || currentIdx >= FULFILMENT_FLOW.length - 1) return
    const next = FULFILMENT_FLOW[currentIdx + 1]

    setUpdating(true)
    try {
      await poApi.updateFulfilment(id, next)
      toast.success(`Order marked as ${humanize(next)}.`)
      refetch()
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to update')
    } finally { setUpdating(false) }
  }

  if (loading) return <SkeletonCard />
  if (error || !po) return <ErrorState onRetry={refetch} />

  const buyer    = typeof po.buyerId   === 'object' ? po.buyerId   : null
  const product  = typeof po.productId === 'object' ? po.productId : null
  const deadline = formatDeadline(po.paymentDeadline)
  const currentFulfilIdx = FULFILMENT_FLOW.indexOf(po.fulfilmentStatus as FulfilmentStatus)
  const canAdvance = currentFulfilIdx >= 0 && currentFulfilIdx < FULFILMENT_FLOW.length - 1

  return (
    <div>
      <Breadcrumb crumbs={[
        { label: 'Purchase Orders', href: '/supplier/purchase-orders' },
        { label: buyer ? (buyer as any).name : id },
      ]} />

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {product ? (product as any).name : 'Purchase Order'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Buyer: {buyer ? (buyer as any).name : '—'}
          </p>
        </div>
        {canAdvance && (
          <Button size="sm" iconLeft={<Truck className="w-3.5 h-3.5" />}
            loading={updating} onClick={handleAdvanceFulfilment}>
            Mark as {humanize(FULFILMENT_FLOW[currentFulfilIdx + 1])}
          </Button>
        )}
      </div>

      {/* Fulfilment progress */}
      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Fulfilment Status</CardTitle>
          <StatusBadge status={po.fulfilmentStatus} />
        </CardHeader>
        <div className="flex items-center gap-0 mt-2">
          {FULFILMENT_FLOW.map((step, i) => {
            const done    = i <= currentFulfilIdx
            const current = i === currentFulfilIdx
            return (
              <div key={step} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors',
                    done
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white border-gray-200 text-gray-400'
                  )}>
                    {done && !current ? '✓' : i + 1}
                  </div>
                  <p className={cn(
                    'text-2xs mt-1.5 font-medium',
                    current ? 'text-indigo-600' : done ? 'text-gray-600' : 'text-gray-300'
                  )}>
                    {humanize(step)}
                  </p>
                </div>
                {i < FULFILMENT_FLOW.length - 1 && (
                  <div className={cn('flex-1 h-0.5 mb-4', done ? 'bg-indigo-600' : 'bg-gray-100')} />
                )}
              </div>
            )
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-5">
          {/* Payment status */}
          <Card>
            <CardHeader>
              <CardTitle>Payment Received</CardTitle>
              <StatusBadge status={po.paymentStatus} />
            </CardHeader>
            <div className="mb-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                <span>{formatCurrency(po.amountPaid)} received</span>
                <span>{formatCurrency(po.totalPrice)} total</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${Math.min(100, (po.amountPaid / po.totalPrice) * 100)}%` }} />
              </div>
              {po.amountRemaining > 0 && (
                <p className="text-xs text-gray-400 mt-1.5">
                  {formatCurrency(po.amountRemaining)} outstanding · due {deadline.label}
                </p>
              )}
            </div>
          </Card>

          {/* Order details */}
          <Card>
            <CardHeader><CardTitle>Order Details</CardTitle></CardHeader>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {[
                ['Quantity',      po.quantity.toLocaleString('en-IN')],
                ['Unit price',    formatCurrency(po.unitPrice)],
                ['Total value',   formatCurrency(po.totalPrice)],
                ['Financing',     humanize(po.financingMethod)],
                ['Payment deadline', formatDate(po.paymentDeadline)],
                ['Penalty rate',  `${po.penaltyRate}% / day`],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-gray-400">{label}</dt>
                  <dd className="font-medium text-gray-900 mt-0.5">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {/* Payment history */}
          {payments && payments.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Payment History</CardTitle></CardHeader>
              <div className="divide-y divide-gray-50">
                {payments.map((p) => (
                  <div key={p._id} className="flex items-center justify-between py-3 text-sm">
                    <div>
                      <p className="font-medium text-gray-900">{formatCurrency(p.amount)}</p>
                      <p className="text-xs text-gray-400">{humanize(p.method)}{p.reference ? ` · ${p.reference}` : ''}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">{formatDate(p.paidAt)}</p>
                      <span className={`text-2xs font-medium ${p.wasOnTime ? 'text-emerald-600' : 'text-red-500'}`}>
                        {p.wasOnTime ? 'On time' : 'Late'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Buyer</CardTitle></CardHeader>
            {buyer && (
              <div>
                <p className="text-sm font-medium text-gray-900">{(buyer as any).name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{(buyer as any).city ?? ''}</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}