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
 *
 * Onboarding flow:
 * - After login, buyers/suppliers without a company are sent to /onboarding.
 * - /onboarding requires a valid session but does NOT require a company.
 * - All other protected routes remain role-gated as before.
 */

const ROLE_ROUTES: Record<string, string> = {
  buyer:        '/buyer',
  supplier:     '/supplier',
  underwriter:  '/underwriter',
  system_admin: '/admin',
}

// Fully public — no session required
const PUBLIC_ROUTES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
]

// Semi-public — requires a valid session but no company or role restriction
// /onboarding is here because the user is logged in but has no companyId yet
const SESSION_ONLY_ROUTES = ['/onboarding']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const role     = request.cookies.get('credex_role')?.value
  const hasToken = request.cookies.get('credex_has_session')?.value === '1'

  // ── Fully public routes ───────────────────────────────────────────────────
  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    // Already logged in → send to dashboard instead
    if (hasToken && role && ROLE_ROUTES[role]) {
      return NextResponse.redirect(new URL(`${ROLE_ROUTES[role]}/dashboard`, request.url))
    }
    return NextResponse.next()
  }

  // ── Root redirect ─────────────────────────────────────────────────────────
  if (pathname === '/') {
    if (hasToken && role && ROLE_ROUTES[role]) {
      return NextResponse.redirect(new URL(`${ROLE_ROUTES[role]}/dashboard`, request.url))
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // ── All remaining routes require a session ────────────────────────────────
  if (!hasToken || !role) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // ── Session-only routes (logged in, no role/company restriction) ──────────
  // /onboarding: user is logged in but hasn't created a company yet.
  // Allow through without any role-based redirection.
  if (SESSION_ONLY_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.next()
  }

  // ── system_admin → redirect to separate admin deployment ─────────────────
  if (role === 'system_admin') {
    const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3001'
    return NextResponse.redirect(new URL(adminUrl))
  }

  // ── Role-based route protection ───────────────────────────────────────────
  // If the path belongs to a different role's prefix, redirect to own dashboard
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