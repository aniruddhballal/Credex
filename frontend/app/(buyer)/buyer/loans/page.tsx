'use client'

import Link from 'next/link'
import { CreditCard, Plus } from 'lucide-react'
import { TopBar } from '@/components/shared/Sidebar'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState, Pagination } from '@/components/ui/Pagination'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/Table'
import { usePaginated } from '@/hooks'
import { formatCurrency, formatDate, formatRelative } from '@/lib/format'
import type { LoanApplication } from '@/types'

export default function BuyerLoansPage() {
  const { items: loans, loading, error, hasNext, hasPrev, onNext, onPrev } =
    usePaginated<LoanApplication>('/api/loans')

  return (
    <div>
      <TopBar
        title="Loan Applications"
        subtitle="Track your financing requests."
        actions={
          <Link href="/buyer/loans/apply">
            <Button size="sm" iconLeft={<Plus className="w-3.5 h-3.5" />}>Apply for loan</Button>
          </Link>
        }
      />

      {error ? <ErrorState message={error} /> :
       loading ? <SkeletonTable rows={5} /> :
       loans.length === 0 ? (
        <EmptyState
          icon={<CreditCard className="w-5 h-5" />}
          title="No loan applications"
          description="Finance a purchase order to unlock working capital."
          action={
            <Link href="/buyer/loans/apply">
              <Button size="sm" iconLeft={<Plus className="w-3.5 h-3.5" />}>Apply now</Button>
            </Link>
          }
        />
       ) : (
        <>
          <Table>
            <TableHead>
              <tr>
                <Th>Amount requested</Th>
                <Th>Tenure</Th>
                <Th>Purpose</Th>
                <Th>Status</Th>
                <Th>Applied</Th>
                <Th></Th>
              </tr>
            </TableHead>
            <TableBody>
              {loans.map((loan) => (
                <TableRow key={loan._id}>
                  <Td className="font-mono font-medium">{formatCurrency(loan.requestedAmount)}</Td>
                  <Td>{loan.tenureMonths} months</Td>
                  <Td className="text-gray-500 max-w-[180px] truncate">{loan.purpose}</Td>
                  <Td><StatusBadge status={loan.status} /></Td>
                  <Td className="text-xs text-gray-400">{formatRelative(loan.createdAt)}</Td>
                  <Td>
                    <Link href={`/buyer/loans/${loan._id}`}
                      className="text-xs text-indigo-600 hover:underline font-medium">View →</Link>
                  </Td>
                </TableRow>
              ))}
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