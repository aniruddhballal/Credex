/**
 * lib/api.ts
 * Central Axios instance for all backend calls.
 *
 * - Attaches Authorization header from localStorage on every request
 * - On 401 SESSION_EXPIRED: attempts token refresh, retries once
 * - On second 401: clears auth and redirects to /login
 */

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

// ── Token storage (client-side only) ─────────────────────────────────────────

export const tokenStorage = {
  get: (): string | null => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('credex_access_token')
  },
  set: (token: string) => localStorage.setItem('credex_access_token', token),
  clear: () => localStorage.removeItem('credex_access_token'),
}

// ── Client ────────────────────────────────────────────────────────────────────

const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,   // send httpOnly refresh token cookie
  headers: { 'Content-Type': 'application/json' },
})

// Request: attach access token
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStorage.get()
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response: handle 401 → refresh → retry
let isRefreshing = false
let refreshQueue: Array<(token: string) => void> = []

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<{ code?: string }>) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    const isAuthError = error.response?.status === 401
    const isExpired = error.response?.data?.code === 'SESSION_EXPIRED'
    const isNotRetry = !original._retry

    if (isAuthError && isExpired && isNotRetry) {
      original._retry = true

      if (isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve) => {
          refreshQueue.push((newToken: string) => {
            original.headers!.Authorization = `Bearer ${newToken}`
            resolve(api(original))
          })
        })
      }

      isRefreshing = true
      try {
        const res = await axios.post<{ data: { accessToken: string } }>(
          `${BASE_URL}/api/auth/refresh`,
          {},
          { withCredentials: true }
        )
        const newToken = res.data.data.accessToken
        tokenStorage.set(newToken)
        refreshQueue.forEach((cb) => cb(newToken))
        refreshQueue = []
        original.headers!.Authorization = `Bearer ${newToken}`
        return api(original)
      } catch {
        tokenStorage.clear()
        refreshQueue = []
        if (typeof window !== 'undefined') {
          window.location.href = '/login?expired=1'
        }
        return Promise.reject(error)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

export default api

// ── Typed response helper ─────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
}

export interface ApiError {
  success: false
  error: string
  code?: string
  details?: unknown
}

/** Extract data from the Credex envelope, or throw a readable error */
export async function apiCall<T>(promise: Promise<{ data: ApiResponse<T> }>): Promise<T> {
  const res = await promise
  return res.data.data
}