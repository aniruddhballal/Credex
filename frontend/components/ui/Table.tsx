import { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Base table wrappers ───────────────────────────────────────────────────────

export function Table({ className, children, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className={cn('w-full text-sm', className)} {...props}>
        {children}
      </table>
    </div>
  )
}

export function TableHead({ className, children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={cn('border-b border-gray-100', className)} {...props}>
      {children}
    </thead>
  )
}

export function TableBody({ className, children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={cn('divide-y divide-gray-50', className)} {...props}>
      {children}
    </tbody>
  )
}

export function TableRow({ className, children, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn('hover:bg-gray-50/50 transition-colors', className)} {...props}>
      {children}
    </tr>
  )
}

// ── Th with optional sort ─────────────────────────────────────────────────────

type SortDirection = 'asc' | 'desc' | null

interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  sortable?: boolean
  sortDirection?: SortDirection
  onSort?: () => void
}

export function Th({ sortable, sortDirection, onSort, className, children, ...props }: ThProps) {
  return (
    <th
      className={cn(
        'px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap',
        sortable && 'cursor-pointer select-none hover:text-gray-700',
        className
      )}
      onClick={sortable ? onSort : undefined}
      {...props}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortable && (
          sortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> :
            sortDirection === 'desc' ? <ChevronDown className="w-3.5 h-3.5" /> :
              <ChevronsUpDown className="w-3.5 h-3.5 text-gray-300" />
        )}
      </span>
    </th>
  )
}

export function Td({ className, children, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('px-5 py-3.5 text-gray-700 whitespace-nowrap', className)} {...props}>
      {children}
    </td>
  )
}

// ── Table footer / summary row ────────────────────────────────────────────────

export function TableFooter({ className, children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tfoot className={cn('border-t border-gray-100 bg-gray-50/50', className)} {...props}>
      {children}
    </tfoot>
  )
}