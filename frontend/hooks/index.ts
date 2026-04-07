'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import api from '@/lib/api'
import type { PaginatedResponse } from '@/types'

// ── useFetch — generic data fetching with loading/error state ─────────────────

interface UseFetchResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useFetch<T>(url: string | null, deps: any[] = []): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(!!url)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetch = useCallback(async () => {
    if (!url) return
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    setLoading(true)
    setError(null)
    try {
      const res = await api.get<{ data: T }>(url, { signal: abortRef.current.signal })
      setData(res.data.data)
    } catch (err: any) {
      if (err.name !== 'CanceledError') {
        setError(err?.response?.data?.error ?? err?.message ?? 'Unknown error')
      }
    } finally {
      setLoading(false)
    }
  }, [url, ...deps]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch()
    return () => abortRef.current?.abort()
  }, [fetch])

  return { data, loading, error, refetch: fetch }
}

// ── usePaginated — cursor-based paginated list ────────────────────────────────

interface UsePaginatedResult<T> {
  items: T[]
  loading: boolean
  error: string | null
  hasNext: boolean
  hasPrev: boolean
  onNext: () => void
  onPrev: () => void
  refetch: () => void
}

export function usePaginated<T>(
  baseUrl: string,
  limit = 20,
  extraParams: Record<string, string> = {}
): UsePaginatedResult<T> {
  const [items, setItems] = useState<T[]>([])
  const [cursors, setCursors] = useState<string[]>([])   // stack of previous cursors
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  const fetchPage = useCallback(async (cursor?: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: String(limit), ...extraParams })
      if (cursor) params.set('cursor', cursor)
      const res = await api.get<{ data: PaginatedResponse<T> }>(`${baseUrl}?${params}`)
      const { items: newItems, nextCursor: nc } = res.data.data
      setItems(newItems)
      setNextCursor(nc ?? null)
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [baseUrl, limit, JSON.stringify(extraParams)]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchPage()
  }, [fetchPage])

  const onNext = useCallback(() => {
    if (!nextCursor) return
    setCursors((prev) => [...prev, items[items.length - 1] ? (items[items.length - 1] as any)._id : ''])
    setPage((p) => p + 1)
    fetchPage(nextCursor)
  }, [nextCursor, items, fetchPage])

  const onPrev = useCallback(() => {
    if (cursors.length === 0) return
    const prevCursors = [...cursors]
    const cursor = prevCursors.pop()
    setCursors(prevCursors)
    setPage((p) => p - 1)
    fetchPage(cursor)
  }, [cursors, fetchPage])

  return {
    items,
    loading,
    error,
    hasNext: !!nextCursor,
    hasPrev: page > 0,
    onNext,
    onPrev,
    refetch: () => fetchPage(),
  }
}

// ── useDebounce ───────────────────────────────────────────────────────────────

export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ── useDisclosure — open/close toggle for modals ──────────────────────────────

export function useDisclosure(initial = false) {
  const [isOpen, setIsOpen] = useState(initial)
  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen((v) => !v),
  }
}