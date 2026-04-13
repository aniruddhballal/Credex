'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Building2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import api from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { tokenStorage } from '@/lib/api'

// ── Validation ────────────────────────────────────────────────────────────────

const schema = z.object({
  name: z.string().min(2, 'Company name is required'),
  email: z.string().email('Enter a valid business email'),
  type: z.enum(['buyer', 'supplier', 'both']),
  city: z.string().optional(),
  state: z.string().optional(),
  gstin: z.string()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN format')
    .optional()
    .or(z.literal('')),
  phone: z.string()
    .regex(/^(\+91)?[6-9]\d{9}$/, 'Invalid Indian mobile number')
    .optional()
    .or(z.literal('')),
  description: z.string().optional(),
})

type FormData = z.infer<typeof schema>

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const { user, refreshUser } = useAuth()
  const [loading, setLoading] = useState(false)

  // Determine allowed company types based on user role
  const typeOptions =
    user?.role === 'buyer' ? [{ value: 'buyer', label: 'Buyer — I purchase from suppliers' },
    { value: 'both', label: 'Both — I buy and sell' }] :
      user?.role === 'supplier' ? [{ value: 'supplier', label: 'Supplier — I list and sell' },
      { value: 'both', label: 'Both — I buy and sell' }] :
        []

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: user?.role === 'buyer' ? 'buyer' : 'supplier',
    },
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const res = await api.post('/api/companies', {
        name: data.name,
        email: data.email,
        type: data.type,
        city: data.city || undefined,
        state: data.state || undefined,
        gstin: data.gstin || undefined,
        phone: data.phone || undefined,
        description: data.description || undefined,
        country: 'India',
      })

      // Backend returns a fresh accessToken with companyId baked in.
      // Store it so all subsequent requests carry the updated JWT.
      const newToken = res.data?.data?.accessToken
      if (newToken) {
        tokenStorage.set(newToken)
      }

      // Refresh auth context so user.companyId is populated everywhere
      await refreshUser()

      toast.success(`${data.name} is all set up!`)

      // Redirect to the correct dashboard
      const dashboardRoute: Record<string, string> = {
        buyer: '/buyer/dashboard',
        supplier: '/supplier/dashboard',
      }
      router.push(dashboardRoute[user?.role ?? ''] ?? '/')

    } catch (err: any) {
      const message = err?.response?.data?.error ?? 'Failed to create company. Please try again.'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F0B1E] px-4">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-500/15 mb-4">
            <Building2 className="w-7 h-7 text-indigo-400" />
          </div>
          <h1 className="text-2xl font-semibold text-white">Set up your company</h1>
          <p className="text-sm text-white/50 mt-1">
            One last step — tell us about your business.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

          <Input
            label="Company name"
            placeholder="Acme Pvt. Ltd."
            error={errors.name?.message}
            required
            {...register('name')}
          />

          <Input
            label="Business email"
            type="email"
            placeholder="contact@acme.in"
            error={errors.email?.message}
            required
            {...register('email')}
          />

          {/* Company type — only show if multiple options available */}
          {typeOptions.length > 1 && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-white/70">Company type</label>
              <select
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                style={{ colorScheme: 'dark' }}
                {...register('type')}
              >
                {typeOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {errors.type && <p className="text-xs text-red-400">{errors.type.message}</p>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="City"
              placeholder="Mumbai"
              error={errors.city?.message}
              {...register('city')}
            />
            <Input
              label="State"
              placeholder="Maharashtra"
              error={errors.state?.message}
              {...register('state')}
            />
          </div>

          <Input
            label="GSTIN"
            placeholder="22AAAAA0000A1Z5"
            hint="Optional — you can add this later from your profile."
            error={errors.gstin?.message}
            {...register('gstin')}
          />

          <Input
            label="Business phone"
            type="tel"
            placeholder="+91 98765 43210"
            error={errors.phone?.message}
            {...register('phone')}
          />

          <Button
            type="submit"
            size="lg"
            loading={loading}
            className="w-full mt-2"
          >
            Create company &amp; continue
          </Button>

        </form>

      </div>
    </div>
  )
}