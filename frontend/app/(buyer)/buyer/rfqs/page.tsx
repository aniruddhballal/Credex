'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FileText, Clock, CheckCircle2, XCircle, RefreshCw } from 'lucide-react'
import { TopBar } from '@/components/shared/Sidebar'
import { StatusBadge } from '@/components/ui/Badge'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState, Pagination } from '@/components/ui/Pagination'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/Table'
import { usePaginated } from '@/hooks'
import { formatCurrency, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { RFQ } from '@/types'

type StatusFilter = 'all' | 'pending' | 'countered' | 'accepted' | 'declined' | 'expired'

const STATUS_TABS: { value: StatusFilter; label: string; icon: React.ReactNode }[] = [
  { value: 'all',      label: 'All',      icon: <FileText className="w-3.5 h-3.5" /> },
  { value: 'pending',  label: 'Pending',  icon: <Clock className="w-3.5 h-3.5" /> },
  { value: 'countered',label: 'Countered',icon: <RefreshCw className="w-3.5 h-3.5" /> },
  { value: 'accepted', label: 'Accepted', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  { value: 'declined', label: 'Declined', icon: <XCircle className="w-3.5 h-3.5" /> },
]

export default function BuyerRFQsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const params: Record<string, string> = { role: 'buyer' }
  if (statusFilter !== 'all') params.status = statusFilter

  const { items: rfqs, loading, error, hasNext, hasPrev, onNext, onPrev } =
    usePaginated<RFQ>('/api/rfqs', 20, params)

  return (
    <div>
      <TopBar
        title="My RFQs"
        subtitle="Track your quotation requests and negotiations."
      />

      {/* Status tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-6">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={cn(
              'flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
              statusFilter === tab.value
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState message={error} />
      ) : loading ? (
        <SkeletonTable rows={6} />
      ) : rfqs.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-5 h-5" />}
          title="No RFQs found"
          description="Browse suppliers and send your first RFQ to get started."
          action={<Link href="/buyer/discover" className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:underline">Browse suppliers →</Link>}
        />
      ) : (
        <>
          <Table>
            <TableHead>
              <tr>
                <Th>Supplier / Product</Th>
                <Th>Proposed Price</Th>
                <Th>Quantity</Th>
                <Th>Financing</Th>
                <Th>Status</Th>
                <Th>Last updated</Th>
                <Th></Th>
              </tr>
            </TableHead>
            <TableBody>
              {rfqs.map((rfq) => {
                const supplier = typeof rfq.supplierId === 'object' ? rfq.supplierId : null
                const product  = typeof rfq.productId === 'object'  ? rfq.productId  : null
                return (
                  <TableRow key={rfq._id}>
                    <Td>
                      <div>
                        <p className="font-medium text-gray-900">
                          {supplier ? (supplier as any).name : '—'}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {product ? (product as any).name : '—'}
                        </p>
                      </div>
                    </Td>
                    <Td className="font-mono">
                      {formatCurrency(rfq.currentProposedPrice)}
                      <span className="text-xs text-gray-400 ml-1">/ unit</span>
                    </Td>
                    <Td>{rfq.currentProposedQuantity?.toLocaleString('en-IN') ?? '—'}</Td>
                    <Td className="text-gray-500">
                      {rfq.currentProposedFinancingMethod?.replace(/_/g, ' ') ?? '—'}
                    </Td>
                    <Td><StatusBadge status={rfq.status} /></Td>
                    <Td className="text-gray-400 text-xs">{formatRelative(rfq.updatedAt)}</Td>
                    <Td>
                      <Link
                        href={`/buyer/rfqs/${rfq._id}`}
                        className="text-xs text-indigo-600 hover:underline font-medium"
                      >
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