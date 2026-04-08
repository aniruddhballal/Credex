'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FileText } from 'lucide-react'
import { TopBar } from '@/components/shared/Sidebar'
import { StatusBadge } from '@/components/ui/Badge'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState, Pagination } from '@/components/ui/Pagination'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/Table'
import { usePaginated } from '@/hooks'
import { formatCurrency, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { LoanApplication } from '@/types'

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'submitted', label: 'New' },
  { value: 'under_review', label: 'In review' },
  { value: 'documents_requested', label: 'Awaiting docs' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

export default function UnderwriterApplicationsPage() {
  const [tab, setTab] = useState('all')
  const params: Record<string, string> = {}
  if (tab !== 'all') params.status = tab

  const { items: apps, loading, error, hasNext, hasPrev, onNext, onPrev } =
    usePaginated<LoanApplication>('/api/underwriter/queue', 20, params)

  return (
    <div>
      <TopBar title="Loan Applications" subtitle="All applications across the platform." />

      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-6 flex-wrap">
        {STATUS_TABS.map((t) => (
          <button key={t.value} onClick={() => setTab(t.value)}
            className={cn(
              'px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
              tab === t.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}>
            {t.label}
          </button>
        ))}
      </div>

      {error ? <ErrorState message={error} /> :
        loading ? <SkeletonTable rows={8} /> :
          apps.length === 0 ? (
            <EmptyState icon={<FileText className="w-5 h-5" />}
              title="No applications" description="Applications matching this filter will appear here." />
          ) : (
            <>
              <Table>
                <TableHead>
                  <tr>
                    <Th>Applicant</Th><Th>Amount</Th><Th>Tenure</Th>
                    <Th>Risk score</Th><Th>Status</Th><Th>Submitted</Th><Th></Th>
                  </tr>
                </TableHead>
                <TableBody>
                  {apps.map((app) => {
                    const company = (app as any).company
                    const risk = app.creditRiskScore
                    return (
                      <TableRow key={app._id}>
                        <Td className="font-medium text-gray-900">
                          {company?.name ?? `#${app._id.slice(-6).toUpperCase()}`}
                        </Td>
                        <Td className="font-mono">{formatCurrency(app.requestedAmount)}</Td>
                        <Td>{app.tenureMonths}m</Td>
                        <Td>
                          {risk !== undefined ? (
                            <span className={`text-xs font-semibold ${risk < 0.25 ? 'text-emerald-600' :
                                risk < 0.5 ? 'text-amber-600' : 'text-red-600'
                              }`}>{(risk * 100).toFixed(0)}/100</span>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </Td>
                        <Td><StatusBadge status={app.status} /></Td>
                        <Td className="text-xs text-gray-400">{formatRelative(app.createdAt)}</Td>
                        <Td>
                          <Link href={`/underwriter/applications/${app._id}`}
                            className="text-xs text-indigo-600 hover:underline font-medium">Review →</Link>
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