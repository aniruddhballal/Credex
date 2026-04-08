'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FileText, Clock, RefreshCw, CheckCircle2, XCircle } from 'lucide-react'
import { TopBar } from '@/components/shared/Sidebar'
import { StatusBadge } from '@/components/ui/Badge'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState, Pagination } from '@/components/ui/Pagination'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/Table'
import { usePaginated } from '@/hooks'
import { formatCurrency, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { RFQ } from '@/types'

const TABS = [
  { value: 'all',       label: 'All',       icon: <FileText className="w-3.5 h-3.5" /> },
  { value: 'pending',   label: 'Pending',   icon: <Clock className="w-3.5 h-3.5" /> },
  { value: 'countered', label: 'Countered', icon: <RefreshCw className="w-3.5 h-3.5" /> },
  { value: 'accepted',  label: 'Accepted',  icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  { value: 'declined',  label: 'Declined',  icon: <XCircle className="w-3.5 h-3.5" /> },
]

export default function SupplierRFQsPage() {
  const [tab, setTab] = useState('all')
  const params: Record<string, string> = { role: 'supplier' }
  if (tab !== 'all') params.status = tab

  const { items: rfqs, loading, error, hasNext, hasPrev, onNext, onPrev } =
    usePaginated<RFQ>('/api/rfqs', 20, params)

  return (
    <div>
      <TopBar title="Incoming RFQs" subtitle="Manage quotation requests from buyers." />

      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-6">
        {TABS.map((t) => (
          <button key={t.value} onClick={() => setTab(t.value)}
            className={cn(
              'flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
              tab === t.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {error ? <ErrorState message={error} /> :
       loading ? <SkeletonTable rows={6} /> :
       rfqs.length === 0 ? (
        <EmptyState icon={<FileText className="w-5 h-5" />} title="No RFQs"
          description="When buyers send you RFQs, they'll appear here." />
       ) : (
        <>
          <Table>
            <TableHead>
              <tr>
                <Th>Buyer</Th><Th>Product</Th><Th>Price</Th>
                <Th>Qty</Th><Th>Status</Th><Th>Received</Th><Th></Th>
              </tr>
            </TableHead>
            <TableBody>
              {rfqs.map((rfq) => {
                const buyer   = typeof rfq.buyerId   === 'object' ? rfq.buyerId   : null
                const product = typeof rfq.productId === 'object' ? rfq.productId : null
                return (
                  <TableRow key={rfq._id}>
                    <Td className="font-medium text-gray-900">
                      {buyer ? (buyer as any).name : '—'}
                    </Td>
                    <Td className="text-gray-500 max-w-[140px] truncate">
                      {product ? (product as any).name : '—'}
                    </Td>
                    <Td className="font-mono">{formatCurrency(rfq.currentProposedPrice)}<span className="text-xs text-gray-400">/u</span></Td>
                    <Td>{rfq.currentProposedQuantity.toLocaleString('en-IN')}</Td>
                    <Td><StatusBadge status={rfq.status} /></Td>
                    <Td className="text-xs text-gray-400">{formatRelative(rfq.createdAt)}</Td>
                    <Td>
                      <Link href={`/supplier/rfqs/${rfq._id}`}
                        className="text-xs text-indigo-600 hover:underline font-medium">
                        {rfq.status === 'pending' ? 'Respond →' : 'View →'}
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