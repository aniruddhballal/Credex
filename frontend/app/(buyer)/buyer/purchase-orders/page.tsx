'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Package } from 'lucide-react'
import { TopBar } from '@/components/shared/Sidebar'
import { StatusBadge } from '@/components/ui/Badge'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState, Pagination } from '@/components/ui/Pagination'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/Table'
import { usePaginated } from '@/hooks'
import { formatCurrency, formatDeadline } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { PurchaseOrder } from '@/types'

type Filter = 'all' | 'unpaid' | 'partially_paid' | 'paid'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all',           label: 'All' },
  { value: 'unpaid',        label: 'Unpaid' },
  { value: 'partially_paid',label: 'Partial' },
  { value: 'paid',          label: 'Paid' },
]

export default function BuyerPurchaseOrdersPage() {
  const [filter, setFilter] = useState<Filter>('all')

  const params: Record<string, string> = { role: 'buyer' }
  if (filter !== 'all') params.paymentStatus = filter

  const { items: pos, loading, error, hasNext, hasPrev, onNext, onPrev } =
    usePaginated<PurchaseOrder>('/api/purchase-orders', 20, params)

  return (
    <div>
      <TopBar
        title="Purchase Orders"
        subtitle="Track all your confirmed orders and payment status."
      />

      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-6">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              'px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
              filter === f.value
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? <ErrorState message={error} /> :
       loading ? <SkeletonTable rows={6} /> :
       pos.length === 0 ? (
        <EmptyState
          icon={<Package className="w-5 h-5" />}
          title="No purchase orders yet"
          description="Accept an RFQ to create your first purchase order."
        />
       ) : (
        <>
          <Table>
            <TableHead>
              <tr>
                <Th>Supplier</Th>
                <Th>Product</Th>
                <Th>Total</Th>
                <Th>Remaining</Th>
                <Th>Payment deadline</Th>
                <Th>Payment</Th>
                <Th>Fulfilment</Th>
                <Th></Th>
              </tr>
            </TableHead>
            <TableBody>
              {pos.map((po) => {
                const supplier = typeof po.supplierId === 'object' ? po.supplierId : null
                const product  = typeof po.productId  === 'object' ? po.productId  : null
                const deadline = formatDeadline(po.paymentDeadline)
                return (
                  <TableRow key={po._id}>
                    <Td className="font-medium text-gray-900">
                      {supplier ? (supplier as any).name : '—'}
                    </Td>
                    <Td className="text-gray-500 max-w-[160px] truncate">
                      {product ? (product as any).name : '—'}
                    </Td>
                    <Td className="font-mono">{formatCurrency(po.totalPrice)}</Td>
                    <Td className="font-mono font-medium">
                      {po.paymentStatus !== 'paid'
                        ? <span className="text-amber-700">{formatCurrency(po.amountRemaining)}</span>
                        : <span className="text-emerald-600">Paid</span>
                      }
                    </Td>
                    <Td>
                      <span className={cn(
                        'text-xs font-medium',
                        deadline.urgency === 'overdue' ? 'text-red-600' :
                        deadline.urgency === 'high'    ? 'text-amber-600' :
                        'text-gray-500'
                      )}>
                        {deadline.label}
                      </span>
                    </Td>
                    <Td><StatusBadge status={po.paymentStatus} /></Td>
                    <Td><StatusBadge status={po.fulfilmentStatus} /></Td>
                    <Td>
                      <Link href={`/buyer/purchase-orders/${po._id}`}
                        className="text-xs text-indigo-600 hover:underline font-medium">
                        View →
                      </Link>
                    </Td>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <div className="mt-4">
            <Pagination hasNext={hasNext} hasPrev={hasPrev} onNext={onNext} onPrev={onPrev} />
          </div>
        </>
       )}
    </div>
  )
}