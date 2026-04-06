import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge Tailwind classes safely — use everywhere instead of string concatenation */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}