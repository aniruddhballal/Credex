'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Mail, Lock, User, Phone } from 'lucide-react'
import { toast } from 'react-hot-toast'
import api from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Input'

const schema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName:  z.string().min(1, 'Last name is required'),
  email:     z.string().email('Enter a valid email'),
  phone:     z.string().regex(/^(\+91)?[6-9]\d{9}$/, 'Enter a valid Indian mobile number').optional().or(z.literal('')),
  role:      z.enum(['buyer', 'supplier']),
  password:  z.string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Z]/, 'At least one uppercase letter')
    .regex(/[0-9]/, 'At least one number'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

type FormData = z.infer<typeof schema>

const roleOptions = [
  { value: 'buyer',    label: 'Buyer — I want to source and purchase' },
  { value: 'supplier', label: 'Supplier — I want to list and sell' },
]

export default function RegisterPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      await api.post('/api/auth/register', {
        firstName: data.firstName,
        lastName:  data.lastName,
        email:     data.email,
        phone:     data.phone || undefined,
        role:      data.role,
        password:  data.password,
      })
      toast.success('Account created! Check your email to verify.')
      router.push('/login')
    } catch (err: any) {
      const message = err?.response?.data?.error ?? 'Registration failed. Please try again.'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Create your account</h1>
      <p className="text-sm text-gray-500 mt-1">Join Credex — it&apos;s free to start</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="First name"
            placeholder="Aarav"
            iconLeft={<User className="w-4 h-4" />}
            error={errors.firstName?.message}
            autoComplete="given-name"
            required
            {...register('firstName')}
          />
          <Input
            label="Last name"
            placeholder="Shah"
            error={errors.lastName?.message}
            autoComplete="family-name"
            required
            {...register('lastName')}
          />
        </div>

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

        <Input
          label="Mobile number"
          type="tel"
          placeholder="+91 98765 43210"
          iconLeft={<Phone className="w-4 h-4" />}
          hint="Indian mobile number. Optional but recommended."
          error={errors.phone?.message}
          {...register('phone')}
        />

        <Select
          label="I am a"
          options={roleOptions}
          placeholder="Select your role"
          error={errors.role?.message}
          required
          {...register('role')}
        />

        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          placeholder="Min 8 chars, 1 uppercase, 1 number"
          iconLeft={<Lock className="w-4 h-4" />}
          iconRight={
            <button type="button" onClick={() => setShowPassword((v) => !v)} className="text-gray-400 hover:text-gray-600">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          }
          error={errors.password?.message}
          autoComplete="new-password"
          required
          {...register('password')}
        />

        <Input
          label="Confirm password"
          type="password"
          placeholder="Repeat your password"
          iconLeft={<Lock className="w-4 h-4" />}
          error={errors.confirmPassword?.message}
          autoComplete="new-password"
          required
          {...register('confirmPassword')}
        />

        <p className="text-xs text-gray-400">
          By registering you agree to Credex&apos;s{' '}
          <Link href="/terms" className="text-indigo-600 hover:underline">Terms of Service</Link>
          {' '}and{' '}
          <Link href="/privacy" className="text-indigo-600 hover:underline">Privacy Policy</Link>.
        </p>

        <Button type="submit" size="lg" loading={loading} className="w-full">
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Already have an account?{' '}
        <Link href="/login" className="text-indigo-600 font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}