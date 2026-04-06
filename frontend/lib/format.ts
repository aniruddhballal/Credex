/**
 * lib/format.ts
 * All display formatting utilities for Credex.
 *
 * Rules:
 * - Amounts stored in paise (integers). Always divide by 100 before display.
 * - Indian numbering system (lakhs/crores), not western (millions/billions).
 * - Dates stored as UTC, displayed in IST.
 */

import { format, formatDistanceToNow, isToday, isTomorrow, isPast } from 'date-fns'

// ── Currency ─────────────────────────────────────────────────────────────────

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const inrFormatterDecimal = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Format paise as ₹ with Indian numbering. e.g. 250000 → ₹2,500 */
export function formatCurrency(paise: number, showDecimal = false): string {
  const rupees = paise / 100
  return showDecimal ? inrFormatterDecimal.format(rupees) : inrFormatter.format(rupees)
}

/** Compact format for large amounts. e.g. 10000000 paise → ₹1L, 100000000 → ₹1Cr */
export function formatCurrencyCompact(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 1_00_00_000) return `₹${(rupees / 1_00_00_000).toFixed(1)}Cr`
  if (rupees >= 1_00_000) return `₹${(rupees / 1_00_000).toFixed(1)}L`
  if (rupees >= 1_000) return `₹${(rupees / 1_000).toFixed(1)}K`
  return `₹${rupees.toFixed(0)}`
}

/** Raw rupee number with Indian commas, no ₹ symbol */
export function formatNumber(rupees: number): string {
  return new Intl.NumberFormat('en-IN').format(rupees)
}

// ── Dates ─────────────────────────────────────────────────────────────────────

/** e.g. "14 Apr 2026" */
export function formatDate(date: string | Date): string {
  return format(new Date(date), 'd MMM yyyy')
}

/** e.g. "14 Apr 2026, 3:45 PM" */
export function formatDateTime(date: string | Date): string {
  return format(new Date(date), 'd MMM yyyy, h:mm a')
}

/** Human-relative time. e.g. "2 hours ago", "in 3 days" */
export function formatRelative(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

/** Deadline-aware label. e.g. "Today", "Tomorrow", "3 days left", "2 days overdue" */
export function formatDeadline(deadline: string | Date): { label: string; urgency: 'overdue' | 'high' | 'medium' | 'low' } {
  const d = new Date(deadline)
  if (isPast(d) && !isToday(d)) {
    const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
    return { label: `${days}d overdue`, urgency: 'overdue' }
  }
  if (isToday(d)) return { label: 'Due today', urgency: 'high' }
  if (isTomorrow(d)) return { label: 'Due tomorrow', urgency: 'high' }
  const daysLeft = Math.ceil((d.getTime() - Date.now()) / 86_400_000)
  if (daysLeft <= 7) return { label: `${daysLeft}d left`, urgency: 'medium' }
  return { label: formatDate(d), urgency: 'low' }
}

// ── Credit score ──────────────────────────────────────────────────────────────

export function scoreTierColor(tier: string): string {
  return {
    bronze: 'text-amber-700 bg-amber-50',
    silver: 'text-slate-600 bg-slate-100',
    gold: 'text-yellow-700 bg-yellow-50',
    platinum: 'text-indigo-700 bg-indigo-50',
  }[tier] ?? 'text-gray-600 bg-gray-100'
}

// ── Misc ──────────────────────────────────────────────────────────────────────

/** Truncate long strings with ellipsis */
export function truncate(str: string, maxLen = 40): string {
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str
}

/** Capitalise first letter */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/** e.g. 'buyer_to_supplier' → 'Buyer to Supplier' */
export function humanize(str: string): string {
  return str.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}