'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import api from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

const schema = z.object({ email: z.string().email('Enter a valid email') })
type FormData = z.infer<typeof schema>

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const { register, handleSubmit, formState: { errors }, getValues } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      await api.post('/api/auth/forgot-password', { email: data.email })
      setSent(true)
    } catch (err: any) {
      // Don't reveal whether email exists — always show success
      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-6 h-6 text-emerald-500" />
        </div>
        <h1 className="mt-4 text-xl font-semibold text-gray-900">Check your email</h1>
        <p className="mt-2 text-sm text-gray-500">
          If <strong>{getValues('email')}</strong> is registered, we&apos;ve sent a password reset link.
          It expires in 30 minutes.
        </p>
        <Link href="/login" className="mt-6 inline-flex items-center gap-2 text-sm text-indigo-600 hover:underline">
          <ArrowLeft className="w-4 h-4" />
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <div>
      <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft className="w-4 h-4" />
        Back to sign in
      </Link>

      <h1 className="text-2xl font-semibold text-gray-900">Reset your password</h1>
      <p className="text-sm text-gray-500 mt-1">Enter your email and we&apos;ll send you a reset link.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4">
        <Input
          label="Email"
          type="email"
          placeholder="you@company.com"
          iconLeft={<Mail className="w-4 h-4" />}
          error={errors.email?.message}
          autoComplete="email"
          required
          {...register('email')}
        />
        <Button type="submit" size="lg" loading={loading} className="w-full">
          Send reset link
        </Button>
      </form>
    </div>
  )
}