'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ShoppingBag } from 'lucide-react'
import { TopBar } from '@/components/shared/Sidebar'
import { StatusBadge } from '@/components/ui/Badge'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState, Pagination } from '@/components/ui/Pagination'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/Table'
import { usePaginated } from '@/hooks'
import { formatCurrency, formatDeadline } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { PurchaseOrder } from '@/types'

export default function SupplierPurchaseOrdersPage() {
  const { items: pos, loading, error, hasNext, hasPrev, onNext, onPrev } =
    usePaginated<PurchaseOrder>('/api/purchase-orders', 20, { role: 'supplier' })

  return (
    <div>
      <TopBar title="Purchase Orders" subtitle="Orders from your buyers." />

      {error ? <ErrorState message={error} /> :
       loading ? <SkeletonTable rows={6} /> :
       pos.length === 0 ? (
        <EmptyState icon={<ShoppingBag className="w-5 h-5" />} title="No orders yet"
          description="Orders appear here once buyers accept your RFQs." />
       ) : (
        <>
          <Table>
            <TableHead>
              <tr>
                <Th>Buyer</Th><Th>Product</Th><Th>Total</Th>
                <Th>Payment due</Th><Th>Payment</Th><Th>Fulfilment</Th><Th></Th>
              </tr>
            </TableHead>
            <TableBody>
              {pos.map((po) => {
                const buyer    = typeof po.buyerId   === 'object' ? po.buyerId   : null
                const product  = typeof po.productId === 'object' ? po.productId : null
                const deadline = formatDeadline(po.paymentDeadline)
                return (
                  <TableRow key={po._id}>
                    <Td className="font-medium text-gray-900">{buyer ? (buyer as any).name : '—'}</Td>
                    <Td className="text-gray-500 max-w-[140px] truncate">{product ? (product as any).name : '—'}</Td>
                    <Td className="font-mono">{formatCurrency(po.totalPrice)}</Td>
                    <Td>
                      <span className={cn('text-xs font-medium',
                        deadline.urgency === 'overdue' ? 'text-red-600' :
                        deadline.urgency === 'high'    ? 'text-amber-600' : 'text-gray-500'
                      )}>{deadline.label}</span>
                    </Td>
                    <Td><StatusBadge status={po.paymentStatus} /></Td>
                    <Td><StatusBadge status={po.fulfilmentStatus} /></Td>
                    <Td>
                      <Link href={`/supplier/purchase-orders/${po._id}`}
                        className="text-xs text-indigo-600 hover:underline font-medium">View →</Link>
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