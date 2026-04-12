/**
 * lib/api.ts
 * Central Axios instance for all backend calls.
 *
 * - Attaches Authorization header from localStorage on every request
 * - On 401 from non-auth routes: attempts token refresh, retries once
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

// ── Typed response shapes ─────────────────────────────────────────────────────

/** All backend success responses are wrapped: { success: true, data: T, message?: string } */
export interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
}

/** Paginated list responses: { success: true, data: { items: T[], nextCursor, total? } } */
export interface PaginatedApiResponse<T> {
  success: boolean
  data: {
    items: T[]
    nextCursor: string | null
    total?: number
  }
  message?: string
}

export interface ApiError {
  success: false
  error: string
  code?: string
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

  console.log("TOKEN:", token)

  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

// Routes where a 401 is expected and should NOT trigger a refresh attempt
const AUTH_ROUTES = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh']

const isAuthRoute = (url?: string): boolean =>
  AUTH_ROUTES.some((route) => url?.includes(route))

// Response: handle 401 → refresh → retry (only for protected routes)
let isRefreshing = false
let refreshQueue: Array<(token: string) => void> = []

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    const is401 = error.response?.status === 401
    const isNotRetry = !original._retry
    const skipRefresh = isAuthRoute(original.url)

    // Pass auth route 401/403s straight through to the caller
    if (skipRefresh) {
      return Promise.reject(error)
    }

    if (is401 && isNotRetry) {
      original._retry = true

      if (isRefreshing) {
        return new Promise((resolve) => {
          refreshQueue.push((newToken: string) => {
            original.headers!.Authorization = `Bearer ${newToken}`
            resolve(api(original))
          })
        })
      }

      isRefreshing = true
      try {
        // Backend returns { success: true, data: { accessToken } }
        const res = await axios.post<ApiResponse<{ accessToken: string }>>(
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
