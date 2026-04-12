import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Route protection middleware.
 * Reads the access token from localStorage is NOT possible in middleware
 * (middleware runs on edge, no DOM). Instead we use a cookie set by the
 * backend or by the frontend after login.
 *
 * Strategy:
 * - Frontend sets a lightweight `credex_role` cookie (non-httpOnly) on login
 *   so middleware can read the role without decoding the JWT.
 * - The real JWT verification still happens server-side on every API call.
 * - This cookie is cleared on logout.
 */

const ROLE_ROUTES: Record<string, string> = {
  buyer: '/buyer',
  supplier: '/supplier',
  underwriter: '/underwriter',
  system_admin: '/admin',
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const role = request.cookies.get('credex_role')?.value
  const hasToken = request.cookies.get('credex_has_session')?.value === '1'

  // Public routes — always allow
  const publicRoutes = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email']
  if (publicRoutes.some((r) => pathname.startsWith(r))) {
    // If already logged in, redirect to their dashboard
    if (hasToken && role && ROLE_ROUTES[role]) {
      return NextResponse.redirect(new URL(`${ROLE_ROUTES[role]}/dashboard`, request.url))
    }
    return NextResponse.next()
  }

  // Root — redirect to login or dashboard
  if (pathname === '/') {
    if (hasToken && role && ROLE_ROUTES[role]) {
      return NextResponse.redirect(new URL(`${ROLE_ROUTES[role]}/dashboard`, request.url))
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Protected routes — must be logged in
  if (!hasToken || !role) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Role-based route protection
  // system_admin → redirect to separate admin app
  if (role === 'system_admin') {
    const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3001'
    return NextResponse.redirect(new URL(adminUrl))
  }

  // Role-based route protection
  for (const [r, prefix] of Object.entries(ROLE_ROUTES)) {
    if (pathname.startsWith(prefix) && role !== r) {
      const dest = ROLE_ROUTES[role]
      if (dest) return NextResponse.redirect(new URL(`${dest}/dashboard`, request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}