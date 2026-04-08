'use client'

import Link from 'next/link'
import { FileText, Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { TopBar } from '@/components/shared/Sidebar'
import { StatCard } from '@/components/ui/StatCard'
import { StatusBadge } from '@/components/ui/Badge'
import { SkeletonTable, SkeletonMetricCard } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/Pagination'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/Table'
import { useFetch } from '@/hooks'
import { formatCurrency, formatRelative } from '@/lib/format'
import type { LoanApplication } from '@/types'

interface UWDashboard {
  queueCount:    number
  approvedToday: number
  rejectedToday: number
  pendingDocs:   number
  queue:         LoanApplication[]
}

export default function UnderwriterDashboard() {
  const { data, loading, error, refetch } = useFetch<UWDashboard>('/api/underwriter/dashboard')

  return (
    <div>
      <TopBar title="Underwriter Dashboard" subtitle="Review and action loan applications in your queue." />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {loading ? Array.from({ length: 4 }).map((_, i) => <SkeletonMetricCard key={i} />) : (
          <>
            <StatCard label="In Queue" value={data?.queueCount ?? 0}
              sub="awaiting review" icon={<Clock className="w-4 h-4" />}
              iconColor="bg-amber-50 text-amber-600" />
            <StatCard label="Approved Today" value={data?.approvedToday ?? 0}
              icon={<CheckCircle2 className="w-4 h-4" />}
              iconColor="bg-emerald-50 text-emerald-600" />
            <StatCard label="Rejected Today" value={data?.rejectedToday ?? 0}
              icon={<XCircle className="w-4 h-4" />}
              iconColor="bg-red-50 text-red-500" />
            <StatCard label="Awaiting Docs" value={data?.pendingDocs ?? 0}
              icon={<AlertCircle className="w-4 h-4" />}
              iconColor="bg-indigo-50 text-indigo-600" />
          </>
        )}
      </div>

      <h2 className="text-sm font-semibold text-gray-900 mb-3">Your Queue</h2>

      {error ? <ErrorState message={error} onRetry={refetch} /> :
       loading ? <SkeletonTable rows={6} /> :
       !data?.queue.length ? (
        <EmptyState icon={<FileText className="w-5 h-5" />}
          title="Queue is clear" description="No applications assigned to you right now." />
       ) : (
        <Table>
          <TableHead>
            <tr>
              <Th>Applicant</Th>
              <Th>Amount</Th>
              <Th>Risk score</Th>
              <Th>Status</Th>
              <Th>Submitted</Th>
              <Th></Th>
            </tr>
          </TableHead>
          <TableBody>
            {data.queue.map((app) => {
              const company = (app as any).company
              const risk    = app.creditRiskScore
              return (
                <TableRow key={app._id}>
                  <Td className="font-medium text-gray-900">
                    {company?.name ?? `Application #${app._id.slice(-6).toUpperCase()}`}
                  </Td>
                  <Td className="font-mono">{formatCurrency(app.requestedAmount)}</Td>
                  <Td>
                    {risk !== undefined ? (
                      <span className={`text-xs font-semibold ${
                        risk < 0.25 ? 'text-emerald-600' :
                        risk < 0.5  ? 'text-amber-600'   : 'text-red-600'
                      }`}>
                        {(risk * 100).toFixed(0)}/100
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </Td>
                  <Td><StatusBadge status={app.status} /></Td>
                  <Td className="text-xs text-gray-400">{formatRelative(app.createdAt)}</Td>
                  <Td>
                    <Link href={`/underwriter/applications/${app._id}`}
                      className="text-xs text-indigo-600 hover:underline font-medium">
                      Review →
                    </Link>
                  </Td>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
       )}
    </div>
  )
}