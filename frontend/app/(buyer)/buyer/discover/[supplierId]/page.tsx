'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Star, ShieldCheck, MapPin, ArrowLeft, Send,
  ChevronLeft, ChevronRight, Package,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Breadcrumb } from '@/components/shared/Sidebar'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/Pagination'
import { useFetch, useDisclosure } from '@/hooks'
import { rfqApi } from '@/lib/api-hooks'
import { formatCurrency, formatRelative } from '@/lib/format'
import type { Product } from '@/types'

const rfqSchema = z.object({
  proposedPrice:              z.coerce.number().positive('Enter a price'),
  proposedQuantity:           z.coerce.number().int().positive('Enter quantity'),
  proposedFinancingMethod:    z.string().min(1, 'Select financing method'),
  proposedPaymentDeadlineDays: z.coerce.number().int().min(1).max(365),
  proposedPenaltyRate:        z.coerce.number().min(0).max(5),
  message:                    z.string().optional(),
})
type RFQForm = z.infer<typeof rfqSchema>

const FINANCING_OPTIONS = [
  { value: 'immediate',    label: 'Immediate payment' },
  { value: 'deferred_30',  label: '30 days deferred' },
  { value: 'deferred_60',  label: '60 days deferred' },
  { value: 'deferred_90',  label: '90 days deferred' },
  { value: 'installment',  label: 'Installment' },
  { value: 'loan',         label: 'Loan-backed' },
  { value: 'open_to_discuss', label: 'Open to discuss' },
]

export default function ProductDetailPage() {
  const { supplierId: productId } = useParams<{ supplierId: string }>()
  const router = useRouter()
  const rfqModal = useDisclosure()
  const [activeImage, setActiveImage] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  const { data: product, loading, error } = useFetch<Product>(`/api/products/${productId}`)

  const { register, handleSubmit, formState: { errors }, reset } = useForm<RFQForm>({
    resolver: zodResolver(rfqSchema),
    defaultValues: {
      proposedPaymentDeadlineDays: product?.defaultPaymentDeadlineDays ?? 30,
      proposedPenaltyRate: product?.defaultPenaltyRate ?? 0.05,
    },
  })

  const onSubmitRFQ = async (data: RFQForm) => {
    if (!product) return
    setSubmitting(true)
    try {
      await rfqApi.create({
        productId: product._id,
        supplierId: typeof product.supplierId === 'string'
          ? product.supplierId
          : (product.supplierId as any)._id,
        proposedPrice: data.proposedPrice * 100,       // rupees → paise
        proposedQuantity: data.proposedQuantity,
        proposedFinancingMethod: data.proposedFinancingMethod,
        proposedPaymentDeadlineDays: data.proposedPaymentDeadlineDays,
        proposedPenaltyRate: data.proposedPenaltyRate,
        message: data.message,
      })
      toast.success('RFQ sent! The supplier will respond shortly.')
      rfqModal.close()
      reset()
      router.push('/buyer/rfqs')
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to send RFQ')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <SkeletonCard /><SkeletonCard />
    </div>
  )
  if (error || !product) return <ErrorState onRetry={() => router.refresh()} />

  const supplier = typeof product.supplierId === 'object' ? product.supplierId : null

  return (
    <div>
      <Breadcrumb crumbs={[
        { label: 'Discover', href: '/buyer/discover' },
        { label: product.name },
      ]} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left — images */}
        <div>
          <div className="relative rounded-xl overflow-hidden bg-gray-100 aspect-[4/3]">
            {product.images[activeImage] ? (
              <Image
                src={product.images[activeImage]}
                alt={product.name}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300">
                <Package className="w-16 h-16" />
              </div>
            )}
            {product.images.length > 1 && (
              <>
                <button
                  onClick={() => setActiveImage((i) => Math.max(0, i - 1))}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 flex items-center justify-center shadow-sm hover:bg-white"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setActiveImage((i) => Math.min(product.images.length - 1, i + 1))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 flex items-center justify-center shadow-sm hover:bg-white"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
          {product.images.length > 1 && (
            <div className="flex gap-2 mt-3">
              {product.images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImage(i)}
                  className={`w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${
                    i === activeImage ? 'border-indigo-500' : 'border-transparent'
                  }`}
                >
                  <Image src={img} alt="" width={64} height={64} className="object-cover w-full h-full" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right — details */}
        <div>
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">{product.name}</h1>
              {supplier && (
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-sm text-gray-500">{(supplier as any).name}</span>
                  {(supplier as any).isVerified && (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                      <ShieldCheck className="w-3.5 h-3.5" /> Verified
                    </span>
                  )}
                  {(supplier as any).city && (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                      <MapPin className="w-3 h-3" />{(supplier as any).city}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              <span className="text-sm font-medium text-gray-700">{product.averageRating.toFixed(1)}</span>
              <span className="text-xs text-gray-400">({product.totalReviews})</span>
            </div>
          </div>

          {/* Price */}
          <div className="mt-5 p-4 bg-gray-50 rounded-xl">
            <p className="text-2xl font-semibold text-gray-900 font-mono">
              {formatCurrency(product.basePrice)}
              <span className="text-sm font-normal text-gray-400 ml-1">/ {product.priceUnit}</span>
            </p>
            {product.isNegotiable && (
              <p className="text-xs text-indigo-600 mt-1">Price is negotiable</p>
            )}
          </div>

          {/* Description */}
          {product.description && (
            <p className="mt-5 text-sm text-gray-600 leading-relaxed">{product.description}</p>
          )}

          {/* Financing + penalty */}
          <div className="mt-5 space-y-3">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                Accepted financing
              </p>
              <div className="flex flex-wrap gap-1.5">
                {product.acceptedFinancingMethods.map((m) => (
                  <Badge key={m} variant="default" className="text-xs">
                    {m.replace(/_/g, ' ')}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-gray-400 mb-0.5">Default payment terms</p>
                <p className="font-medium">{product.defaultPaymentDeadlineDays} days</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-gray-400 mb-0.5">Late penalty rate</p>
                <p className="font-medium">{product.defaultPenaltyRate}% / day</p>
              </div>
            </div>
          </div>

          {/* Tags */}
          {product.tags && product.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4">
              {product.tags.map((tag) => (
                <Badge key={tag} variant="muted" className="text-xs">{tag}</Badge>
              ))}
            </div>
          )}

          {/* CTA */}
          <div className="mt-6">
            <Button
              size="lg"
              className="w-full"
              iconLeft={<Send className="w-4 h-4" />}
              onClick={rfqModal.open}
              disabled={!product.isAvailable}
            >
              {product.isAvailable ? 'Send RFQ' : 'Currently unavailable'}
            </Button>
          </div>
        </div>
      </div>

      {/* RFQ Modal */}
      <Modal
        open={rfqModal.isOpen}
        onClose={rfqModal.close}
        title="Send RFQ"
        description={`Submit your quotation request to ${supplier ? (supplier as any).name : 'this supplier'}`}
        size="lg"
      >
        <form onSubmit={handleSubmit(onSubmitRFQ)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Your price (₹ per unit)"
              type="number"
              placeholder={String(product.basePrice / 100)}
              hint="Enter in rupees"
              error={errors.proposedPrice?.message}
              required
              {...register('proposedPrice')}
            />
            <Input
              label="Quantity"
              type="number"
              placeholder="100"
              error={errors.proposedQuantity?.message}
              required
              {...register('proposedQuantity')}
            />
          </div>

          <Select
            label="Financing method"
            options={FINANCING_OPTIONS.filter(o =>
              product.acceptedFinancingMethods.includes(o.value as any) ||
              o.value === 'open_to_discuss'
            )}
            placeholder="Select financing"
            error={errors.proposedFinancingMethod?.message}
            required
            {...register('proposedFinancingMethod')}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Payment deadline (days)"
              type="number"
              hint="Days from PO confirmation"
              error={errors.proposedPaymentDeadlineDays?.message}
              {...register('proposedPaymentDeadlineDays')}
            />
            <Input
              label="Late penalty rate (% / day)"
              type="number"
              step="0.01"
              hint="e.g. 0.05 = 0.05%/day"
              error={errors.proposedPenaltyRate?.message}
              {...register('proposedPenaltyRate')}
            />
          </div>

          <Input
            label="Message to supplier (optional)"
            placeholder="Any additional details or requirements…"
            {...register('message')}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={rfqModal.close}>Cancel</Button>
            <Button type="submit" loading={submitting} iconLeft={<Send className="w-3.5 h-3.5" />}>
              Send RFQ
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}