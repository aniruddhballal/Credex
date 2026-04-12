'use client'

import { createContext, useContext, useReducer, useEffect, useCallback, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import api, { tokenStorage, ApiResponse } from '@/lib/api'
import type { AuthUser } from '@/types'

// ── State ─────────────────────────────────────────────────────────────────────

interface AuthState {
  user: AuthUser | null
  loading: boolean
  initialized: boolean
}

type AuthAction =
  | { type: 'SET_USER'; payload: AuthUser }
  | { type: 'CLEAR_USER' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_INITIALIZED' }

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_USER': return { ...state, user: action.payload, loading: false }
    case 'CLEAR_USER': return { ...state, user: null, loading: false }
    case 'SET_LOADING': return { ...state, loading: action.payload }
    case 'SET_INITIALIZED': return { ...state, initialized: true }
    default: return state
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  initialized: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [state, dispatch] = useReducer(authReducer, {
    user: null,
    loading: true,
    initialized: false,
  })

  const refreshUser = useCallback(async () => {
    try {
      // Backend returns { success: true, data: { user } }
      const res = await api.get<ApiResponse<{ user: AuthUser }>>('/api/auth/me')
      dispatch({ type: 'SET_USER', payload: res.data.data.user })
    } catch {
      dispatch({ type: 'CLEAR_USER' })
      tokenStorage.clear()
    }
  }, [])

  // Hydrate on mount — check if we have a valid session
  useEffect(() => {
    const token = tokenStorage.get()
    if (token) {
      refreshUser().finally(() => dispatch({ type: 'SET_INITIALIZED' }))
    } else {
      dispatch({ type: 'CLEAR_USER' })
      dispatch({ type: 'SET_INITIALIZED' })
    }
  }, [refreshUser])

  const login = useCallback(async (email: string, password: string) => {
    // Backend returns { success: true, data: { accessToken, user } }
    const res = await api.post<ApiResponse<{ accessToken: string; user: AuthUser }>>(
      '/api/auth/login',
      { email, password }
    )
    const { accessToken, user } = res.data.data
    tokenStorage.set(accessToken)

    // Set lightweight cookies for middleware route protection
    document.cookie = `credex_role=${user.role};path=/;max-age=${7 * 24 * 60 * 60}`
    document.cookie = `credex_has_session=1;path=/;max-age=${7 * 24 * 60 * 60}`

    dispatch({ type: 'SET_USER', payload: user })

    const roleRoutes: Record<string, string> = {
      buyer: '/buyer/dashboard',
      supplier: '/supplier/dashboard',
      underwriter: '/underwriter/dashboard',
      system_admin: '/admin/dashboard',
    }
    router.push(roleRoutes[user.role] ?? '/')
  }, [router])

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout')
    } catch {
      // best-effort
    } finally {
      tokenStorage.clear()
      // Clear middleware cookies
      document.cookie = 'credex_role=;path=/;max-age=0'
      document.cookie = 'credex_has_session=;path=/;max-age=0'
      dispatch({ type: 'CLEAR_USER' })
      router.push('/login')
    }
  }, [router])

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export function useRequireAuth(role?: string) {
  const { user, initialized } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!initialized) return
    if (!user) { router.push('/login'); return }
    if (role && user.role !== role) { router.push('/login'); return }
  }, [user, initialized, role, router])

  return { user, initialized }
}