'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Camera, User, Building2, Star, ShieldCheck } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { TopBar } from '@/components/shared/Sidebar'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/Pagination'
import { useFetch } from '@/hooks'
import { companiesApi } from '@/lib/api-hooks'
import { useAuth } from '@/lib/auth-context'
import api from '@/lib/api'
import { scoreTierColor } from '@/lib/format'
import type { Company, CreditScore } from '@/types'

const profileSchema = z.object({
  name:        z.string().min(2, 'Company name required'),
  description: z.string().optional(),
  email:       z.string().email('Valid email required'),
  phone:       z.string().optional(),
  website:     z.string().url('Enter a valid URL').optional().or(z.literal('')),
  address:     z.string().optional(),
  city:        z.string().optional(),
  state:       z.string().optional(),
  pincode:     z.string().optional(),
  gstin:       z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN').optional().or(z.literal('')),
  pan:         z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN').optional().or(z.literal('')),
  industry:    z.string().optional(),
})
type ProfileForm = z.infer<typeof profileSchema>

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Required'),
  newPassword:     z.string().min(8, 'Min 8 characters').regex(/[A-Z]/, 'One uppercase').regex(/[0-9]/, 'One number'),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: 'Passwords do not match', path: ['confirmPassword'],
})
type PasswordForm = z.infer<typeof passwordSchema>

export default function ProfilePage() {
  const { user, refreshUser } = useAuth()
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const avatarRef = useRef<HTMLInputElement>(null)

  const { data: company, loading, error, refetch } = useFetch<Company>('/api/companies/me/profile')
  const { data: creditScore } = useFetch<CreditScore>('/api/credit-scores/me')

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    values: company ? {
      name:        company.name,
      description: company.description ?? '',
      email:       company.email,
      phone:       company.phone ?? '',
      website:     company.website ?? '',
      address:     company.address ?? '',
      city:        company.city ?? '',
      state:       company.state ?? '',
      pincode:     company.pincode ?? '',
      gstin:       company.gstin ?? '',
      pan:         company.pan ?? '',
      industry:    company.industry ?? '',
    } : undefined,
  })

  const passwordForm = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) })

  const handleProfileSave = async (data: ProfileForm) => {
    setSavingProfile(true)
    try {
      await companiesApi.updateMe(data)
      toast.success('Profile updated.')
      refetch()
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Update failed')
    } finally { setSavingProfile(false) }
  }

  const handlePasswordSave = async (data: PasswordForm) => {
    setSavingPassword(true)
    try {
      await api.post('/api/users/change-password', {
        currentPassword: data.currentPassword,
        newPassword:     data.newPassword,
      })
      toast.success('Password changed.')
      passwordForm.reset()
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Change failed')
    } finally { setSavingPassword(false) }
  }

  if (loading) return <SkeletonCard />
  if (error) return <ErrorState onRetry={refetch} />

  return (
    <div>
      <TopBar title="My Profile" subtitle="Manage your company profile and account settings." />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          {/* Company profile */}
          <Card>
            <CardHeader><CardTitle>Company Profile</CardTitle></CardHeader>
            <form onSubmit={profileForm.handleSubmit(handleProfileSave)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input label="Company name" error={profileForm.formState.errors.name?.message}
                  required {...profileForm.register('name')} />
                <Input label="Industry" placeholder="e.g. Steel Manufacturing"
                  {...profileForm.register('industry')} />
              </div>
              <Textarea label="Description" placeholder="Tell buyers about your company…"
                {...profileForm.register('description')} />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Business email" type="email"
                  error={profileForm.formState.errors.email?.message}
                  required {...profileForm.register('email')} />
                <Input label="Phone" type="tel" {...profileForm.register('phone')} />
              </div>
              <Input label="Website" type="url" placeholder="https://yourcompany.com"
                error={profileForm.formState.errors.website?.message}
                {...profileForm.register('website')} />
              <Input label="Address" {...profileForm.register('address')} />
              <div className="grid grid-cols-3 gap-4">
                <Input label="City" {...profileForm.register('city')} />
                <Input label="State" {...profileForm.register('state')} />
                <Input label="Pincode" {...profileForm.register('pincode')} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="GSTIN" placeholder="22AAAAA0000A1Z5"
                  error={profileForm.formState.errors.gstin?.message}
                  hint="15-character GST number"
                  {...profileForm.register('gstin')} />
                <Input label="PAN" placeholder="AAAPL1234C"
                  error={profileForm.formState.errors.pan?.message}
                  {...profileForm.register('pan')} />
              </div>
              <div className="flex justify-end">
                <Button type="submit" loading={savingProfile}>Save profile</Button>
              </div>
            </form>
          </Card>

          {/* Change password */}
          <Card>
            <CardHeader><CardTitle>Change Password</CardTitle></CardHeader>
            <form onSubmit={passwordForm.handleSubmit(handlePasswordSave)} className="space-y-4">
              <Input label="Current password" type="password"
                error={passwordForm.formState.errors.currentPassword?.message}
                required {...passwordForm.register('currentPassword')} />
              <Input label="New password" type="password"
                error={passwordForm.formState.errors.newPassword?.message}
                required {...passwordForm.register('newPassword')} />
              <Input label="Confirm new password" type="password"
                error={passwordForm.formState.errors.confirmPassword?.message}
                required {...passwordForm.register('confirmPassword')} />
              <div className="flex justify-end">
                <Button type="submit" loading={savingPassword}>Change password</Button>
              </div>
            </form>
          </Card>
        </div>

        {/* Sidebar: credit score + verification */}
        <div className="space-y-4">
          {/* User card */}
          <Card>
            <div className="flex flex-col items-center text-center py-2">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xl font-semibold overflow-hidden">
                  {user?.profilePicture ? (
                    <Image src={user.profilePicture} alt="" fill className="object-cover" />
                  ) : (
                    user?.firstName?.charAt(0).toUpperCase()
                  )}
                </div>
                <button onClick={() => avatarRef.current?.click()}
                  className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700">
                  <Camera className="w-3 h-3" />
                </button>
                <input ref={avatarRef} type="file" accept="image/*" className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    const fd = new FormData()
                    fd.append('image', f)
                    try {
                      await api.patch('/api/images/profile', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
                      toast.success('Profile photo updated.')
                      refreshUser()
                    } catch { toast.error('Upload failed') }
                  }} />
              </div>
              <p className="mt-3 font-semibold text-gray-900">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-gray-400 mt-0.5">{user?.email}</p>
              <Badge variant={company?.isVerified ? 'success' : 'muted'} className="mt-2">
                {company?.isVerified ? '✓ Verified' : 'Unverified'}
              </Badge>
            </div>
          </Card>

          {/* Credit score */}
          {creditScore && (
            <Card>
              <CardHeader><CardTitle>Credit Score</CardTitle></CardHeader>
              <div className="text-center">
                <div className="text-4xl font-bold font-mono text-gray-900">{creditScore.score}</div>
                <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-semibold ${scoreTierColor(creditScore.tier)}`}>
                  {creditScore.tier.charAt(0).toUpperCase() + creditScore.tier.slice(1)}
                </span>
              </div>
              {creditScore.improvementTips.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium text-gray-500">Tips to improve</p>
                  {creditScore.improvementTips.map((tip, i) => (
                    <p key={i} className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2">{tip}</p>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}