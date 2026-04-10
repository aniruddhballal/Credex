'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import Link from 'next/link'
import api from '@/lib/api'
import { Button } from '@/components/ui/Button'

export default function VerifyEmailPage() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const token        = searchParams.get('token')

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('No verification token found in the link.')
      return
    }
    api.get(`/api/auth/verify-email?token=${token}`)
      .then(() => {
        setStatus('success')
        setTimeout(() => router.push('/login?verified=1'), 2000)
      })
      .catch((err) => {
        setStatus('error')
        setMessage(err?.response?.data?.message ?? 'Verification failed. The link may have expired.')
      })
  }, [token, router])

  return (
    <div className="text-center">
      {status === 'loading' && (
        <>
          <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mx-auto" />
          <h1 className="mt-4 text-xl font-semibold text-gray-900">Verifying your email…</h1>
        </>
      )}

      {status === 'success' && (
        <>
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-gray-900">Email verified!</h1>
          <p className="mt-2 text-sm text-gray-500">Redirecting you to sign in…</p>
        </>
      )}

      {status === 'error' && (
        <>
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto">
            <XCircle className="w-6 h-6 text-red-400" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-gray-900">Verification failed</h1>
          <p className="mt-2 text-sm text-gray-500">{message}</p>
          <Link href="/login">
            <Button variant="outline" size="sm" className="mt-6">Back to sign in</Button>
          </Link>
        </>
      )}
    </div>
  )
}