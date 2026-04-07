import { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  height?: string | number
  width?: string | number
  rounded?: 'sm' | 'md' | 'lg' | 'full'
}

const roundeds = {
  sm:   'rounded',
  md:   'rounded-lg',
  lg:   'rounded-xl',
  full: 'rounded-full',
}

export function Skeleton({ height, width, rounded = 'md', className, style, ...props }: SkeletonProps) {
  return (
    <div
      className={cn('bg-gray-100 animate-skeleton', roundeds[rounded], className)}
      style={{ height, width, ...style }}
      {...props}
    />
  )
}

// ── Prebuilt skeleton layouts ─────────────────────────────────────────────────

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton height={40} width={40} rounded="full" />
        <div className="flex-1 space-y-2">
          <Skeleton height={14} width="60%" />
          <Skeleton height={12} width="40%" />
        </div>
      </div>
      <Skeleton height={12} />
      <Skeleton height={12} width="80%" />
      <div className="flex gap-2 pt-1">
        <Skeleton height={24} width={60} rounded="full" />
        <Skeleton height={24} width={80} rounded="full" />
      </div>
    </div>
  )
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 py-3 px-5">
      <Skeleton height={14} width="20%" />
      <Skeleton height={14} width="30%" />
      <Skeleton height={14} width="15%" />
      <Skeleton height={24} width={70} rounded="full" className="ml-auto" />
    </div>
  )
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex gap-4">
        {[35, 25, 20, 15].map((w, i) => (
          <Skeleton key={i} height={12} width={`${w}%`} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="border-b border-gray-50 last:border-0">
          <SkeletonRow />
        </div>
      ))}
    </div>
  )
}

export function SkeletonMetricCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <Skeleton height={12} width="50%" className="mb-3" />
      <Skeleton height={28} width="70%" className="mb-2" />
      <Skeleton height={11} width="40%" />
    </div>
  )
}