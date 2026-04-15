import { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  dot?: boolean
}

const variants: Record<BadgeVariant, string> = {
  default: 'bg-indigo-50 text-indigo-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-600',
  info: 'bg-blue-50 text-blue-700',
  muted: 'bg-gray-100 text-gray-600',
}

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-indigo-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-blue-500',
  muted: 'bg-gray-400',
}

export function Badge({ variant = 'default', dot = false, className, children, ...props }: BadgeProps) {
  return (
    <span
      className= {
    cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
      variants[variant],
      className
    )
  }
  {...props }
    >
    { dot && <span className={ cn('w-1.5 h-1.5 rounded-full shrink-0', dotColors[variant]) } />
}
{ children }
</span>
  )
}

// Status badge — maps domain statuses to variants
const statusMap: Record<string, BadgeVariant> = {
  // PO payment
  unpaid: 'warning',
  partially_paid: 'info',
  paid: 'success',
  // PO fulfilment
  pending: 'muted',
  processing: 'info',
  shipped: 'info',
  delivered: 'success',
  completed: 'success',
  // RFQ
  countered: 'warning',
  accepted: 'success',
  declined: 'danger',
  expired: 'muted',
  // Loan
  draft: 'muted',
  submitted: 'info',
  under_review: 'warning',
  approved: 'success',
  rejected: 'danger',
  documents_requested: 'warning',
  disbursed: 'success',
  closed: 'muted',
  // Risk
  low: 'success',
  medium: 'warning',
  high: 'danger',
  very_high: 'danger',
}

interface StatusBadgeProps {
  status: string
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  if (!status) return <Badge variant="muted" dot className={className}>Unknown</Badge>
  const variant = statusMap[status] ?? 'muted'
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return <Badge variant={variant} dot className={className}>{label}</Badge>
}