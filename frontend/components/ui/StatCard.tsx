import { HTMLAttributes } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatCardProps extends HTMLAttributes<HTMLDivElement> {
  label: string
  value: string | number
  sub?: string
  icon?: React.ReactNode
  iconColor?: string
  trend?: number        // percentage change e.g. +12.5 or -3.2
  loading?: boolean
}

export function StatCard({
  label, value, sub, icon, iconColor = 'bg-indigo-50 text-indigo-600',
  trend, loading, className, ...props
}: StatCardProps) {
  const trendPositive = trend !== undefined && trend > 0
  const trendNegative = trend !== undefined && trend < 0

  return (
    <div
      className={cn('bg-white rounded-xl border border-gray-200 shadow-card p-5', className)}
      {...props}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        {icon && (
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', iconColor)}>
            {icon}
          </div>
        )}
      </div>

      {loading ? (
        <div className="mt-3 space-y-2">
          <div className="h-7 w-32 bg-gray-100 rounded animate-skeleton" />
          <div className="h-4 w-20 bg-gray-100 rounded animate-skeleton" />
        </div>
      ) : (
        <div className="mt-2">
          <div className="text-2xl font-semibold text-gray-900 font-mono tabular-nums">
            {value}
          </div>
          <div className="flex items-center gap-2 mt-1">
            {trend !== undefined && (
              <span className={cn(
                'inline-flex items-center gap-0.5 text-xs font-medium',
                trendPositive ? 'text-emerald-600' : trendNegative ? 'text-red-500' : 'text-gray-400'
              )}>
                {trendPositive ? <TrendingUp className="w-3 h-3" /> :
                  trendNegative ? <TrendingDown className="w-3 h-3" /> :
                    <Minus className="w-3 h-3" />}
                {Math.abs(trend)}%
              </span>
            )}
            {sub && <span className="text-xs text-gray-400">{sub}</span>}
          </div>
        </div>
      )}
    </div>
  )
}