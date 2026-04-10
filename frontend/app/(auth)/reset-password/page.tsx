'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Lock, CheckCircle2, AlertCircle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import Link from 'next/link'
import api from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

const schema = z.object({
  password: z
    .string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Z]/, 'At least one uppercase letter')
    .regex(/[0-9]/, 'At least one number'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

type FormData = z.infer<typeof schema>

export default function ResetPasswordPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const token        = searchParams.get('token')

  const [loading, setLoading]   = useState(false)
  const [success, setSuccess]   = useState(false)
  const [tokenInvalid, setTokenInvalid] = useState(!token)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    if (!token) return
    setLoading(true)
    try {
      await api.post('/api/auth/reset-password', {
        token,
        newPassword: data.password,
      })
      setSuccess(true)
      setTimeout(() => router.push('/login'), 2500)
    } catch (err: any) {
      const code = err?.response?.data?.code
      if (code === 'TOKEN_EXPIRED' || code === 'INVALID_TOKEN') {
        setTokenInvalid(true)
      } else {
        toast.error(err?.response?.data?.error ?? 'Reset failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  // Token missing or invalid
  if (tokenInvalid) {
    return (
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6 text-red-400" />
        </div>
        <h1 className="mt-4 text-xl font-semibold text-gray-900">Link invalid or expired</h1>
        <p className="mt-2 text-sm text-gray-500">
          Password reset links expire after 30 minutes. Request a new one.
        </p>
        <Link
          href="/forgot-password"
          className="mt-6 inline-block text-sm font-medium text-indigo-600 hover:underline"
        >
          Request new link →
        </Link>
      </div>
    )
  }

  // Success
  if (success) {
    return (
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-6 h-6 text-emerald-500" />
        </div>
        <h1 className="mt-4 text-xl font-semibold text-gray-900">Password reset!</h1>
        <p className="mt-2 text-sm text-gray-500">
          Your password has been updated. Redirecting you to sign in…
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Set a new password</h1>
      <p className="text-sm text-gray-500 mt-1">
        Choose a strong password for your Credex account.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4">
        <Input
          label="New password"
          type="password"
          placeholder="Min 8 chars, 1 uppercase, 1 number"
          iconLeft={<Lock className="w-4 h-4" />}
          error={errors.password?.message}
          autoComplete="new-password"
          required
          {...register('password')}
        />
        <Input
          label="Confirm new password"
          type="password"
          placeholder="Repeat your password"
          iconLeft={<Lock className="w-4 h-4" />}
          error={errors.confirmPassword?.message}
          autoComplete="new-password"
          required
          {...register('confirmPassword')}
        />
        <Button type="submit" size="lg" loading={loading} className="w-full">
          Reset password
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Remembered it?{' '}
        <Link href="/login" className="text-indigo-600 font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}