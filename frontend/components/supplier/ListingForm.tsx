'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Upload, X, Package } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Input, Textarea, Select } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { productsApi } from '@/lib/api-hooks'
import type { Product } from '@/types'

const CATEGORIES = [
  'Steel & Metals', 'Textiles', 'Electronics', 'Chemicals', 'Machinery',
  'Plastics', 'Paper & Packaging', 'Logistics', 'IT Services', 'Other',
].map((c) => ({ value: c, label: c }))

const PRICE_UNITS = [
  'per_unit', 'per_kg', 'per_tonne', 'per_litre',
  'per_metre', 'per_hour', 'per_day', 'per_project',
].map((u) => ({ value: u, label: u.replace(/_/g, ' ') }))

const FINANCING = [
  { value: 'immediate',       label: 'Immediate' },
  { value: 'deferred_30',     label: '30-day deferred' },
  { value: 'deferred_60',     label: '60-day deferred' },
  { value: 'deferred_90',     label: '90-day deferred' },
  { value: 'installment',     label: 'Installment' },
  { value: 'loan',            label: 'Loan-backed' },
  { value: 'open_to_discuss', label: 'Open to discuss' },
]

const schema = z.object({
  name:                       z.string().min(2, 'Product name required'),
  description:                z.string().optional(),
  category:                   z.string().min(1, 'Select a category'),
  basePrice:                  z.coerce.number().positive('Enter a price'),
  priceUnit:                  z.string().min(1, 'Select price unit'),
  isNegotiable:               z.boolean(),
  stockQuantity:              z.coerce.number().int().min(0).optional(),
  defaultPaymentDeadlineDays: z.coerce.number().int().min(1).max(365),
  defaultPenaltyRate:         z.coerce.number().min(0).max(5),
  tags:                       z.string().optional(),   // comma-separated, parsed on submit
})
type FormData = z.infer<typeof schema>

interface ListingFormProps {
  product?: Product    // undefined = create mode
}

export default function ListingForm({ product }: ListingFormProps) {
  const router = useRouter()
  const [submitting, setSubmitting]     = useState(false)
  const [selectedFinancing, setSelectedFinancing] = useState<string[]>(
    product?.acceptedFinancingMethods ?? []
  )
  const [images, setImages]   = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>(product?.images ?? [])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: product ? {
      name:                       product.name,
      description:                product.description ?? '',
      category:                   product.category,
      basePrice:                  product.basePrice / 100,
      priceUnit:                  product.priceUnit,
      isNegotiable:               product.isNegotiable,
      stockQuantity:              product.stockQuantity,
      defaultPaymentDeadlineDays: product.defaultPaymentDeadlineDays,
      defaultPenaltyRate:         product.defaultPenaltyRate,
      tags:                       product.tags?.join(', ') ?? '',
    } : {
      defaultPaymentDeadlineDays: 30,
      defaultPenaltyRate:         0.05,
      isNegotiable:               true,
    },
  })

  const toggleFinancing = (value: string) => {
    setSelectedFinancing((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    )
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length + images.length + (product?.images.length ?? 0) > 5) {
      toast.error('Maximum 5 images per listing')
      return
    }
    setImages((prev) => [...prev, ...files])
    files.forEach((f) => {
      const reader = new FileReader()
      reader.onload = (ev) => setPreviews((prev) => [...prev, ev.target?.result as string])
      reader.readAsDataURL(f)
    })
  }

  const removePreview = (i: number) => {
    setPreviews((prev) => prev.filter((_, idx) => idx !== i))
    if (i >= (product?.images.length ?? 0)) {
      setImages((prev) => prev.filter((_, idx) => idx !== i - (product?.images.length ?? 0)))
    }
  }

  const onSubmit = async (data: FormData) => {
    if (selectedFinancing.length === 0) {
      toast.error('Select at least one financing method')
      return
    }

    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('name', data.name)
      if (data.description) formData.append('description', data.description)
      formData.append('category', data.category)
      formData.append('basePrice', String(Math.round(data.basePrice * 100)))
      formData.append('priceUnit', data.priceUnit)
      formData.append('isNegotiable', String(data.isNegotiable))
      if (data.stockQuantity !== undefined) formData.append('stockQuantity', String(data.stockQuantity))
      formData.append('defaultPaymentDeadlineDays', String(data.defaultPaymentDeadlineDays))
      formData.append('defaultPenaltyRate', String(data.defaultPenaltyRate))
      formData.append('acceptedFinancingMethods', JSON.stringify(selectedFinancing))
      if (data.tags) {
        const tags = data.tags.split(',').map((t) => t.trim()).filter(Boolean)
        formData.append('tags', JSON.stringify(tags))
      }
      images.forEach((img) => formData.append('images', img))

      if (product) {
        await productsApi.update(product._id, data as any)
      } else {
        await productsApi.create(formData)
      }

      toast.success(product ? 'Listing updated.' : 'Listing created!')
      router.push('/supplier/listings')
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to save listing')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Basic info */}
      <Card>
        <CardHeader><CardTitle>Product details</CardTitle></CardHeader>
        <div className="space-y-4">
          <Input label="Product / service name" placeholder="e.g. Cold Rolled Steel Sheets"
            error={errors.name?.message} required {...register('name')} />
          <Textarea label="Description" placeholder="Describe the product, specs, MOQ, lead times…"
            {...register('description')} />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Category" options={CATEGORIES} placeholder="Select category"
              error={errors.category?.message} required {...register('category')} />
            <Select label="Price unit" options={PRICE_UNITS} placeholder="Select unit"
              error={errors.priceUnit?.message} required {...register('priceUnit')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Base price (₹)" type="number" step="0.01"
              placeholder="e.g. 5000" hint="In rupees"
              error={errors.basePrice?.message} required {...register('basePrice')} />
            <Input label="Stock quantity" type="number"
              placeholder="Leave blank for unlimited / services"
              hint="Optional" {...register('stockQuantity')} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="isNegotiable" className="w-4 h-4 rounded border-gray-300 text-indigo-600"
              {...register('isNegotiable')} />
            <label htmlFor="isNegotiable" className="text-sm text-gray-700">Price is negotiable</label>
          </div>
          <Input label="Tags" placeholder="steel, hot-rolled, HR, sheets (comma-separated)"
            hint="Helps buyers find your listing" {...register('tags')} />
        </div>
      </Card>

      {/* Payment terms */}
      <Card>
        <CardHeader><CardTitle>Payment terms</CardTitle></CardHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Default payment deadline (days)" type="number"
              hint="Days from PO confirmation"
              error={errors.defaultPaymentDeadlineDays?.message}
              {...register('defaultPaymentDeadlineDays')} />
            <Input label="Late penalty rate (% / day)" type="number" step="0.01"
              hint="e.g. 0.05 = 0.05% per day"
              error={errors.defaultPenaltyRate?.message}
              {...register('defaultPenaltyRate')} />
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">
              Accepted financing methods <span className="text-red-500">*</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {FINANCING.map((f) => (
                <button
                  key={f.value} type="button"
                  onClick={() => toggleFinancing(f.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    selectedFinancing.includes(f.value)
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Images */}
      <Card>
        <CardHeader>
          <CardTitle>Product images</CardTitle>
          <span className="text-xs text-gray-400">{previews.length}/5</span>
        </CardHeader>

        <div className="flex flex-wrap gap-3">
          {previews.map((src, i) => (
            <div key={i} className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200 group">
              <Image src={src} alt="" fill className="object-cover" sizes="96px" />
              <button
                type="button"
                onClick={() => removePreview(i)}
                className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
          ))}

          {previews.length < 5 && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1.5 text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors"
            >
              <Upload className="w-5 h-5" />
              <span className="text-2xs">Upload</span>
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleImageSelect}
        />
        <p className="text-xs text-gray-400 mt-3">
          Up to 5 images. JPG, PNG, WebP. Hosted on Cloudinary.
        </p>
      </Card>

      {/* Submit */}
      <div className="flex gap-3 justify-end">
        <Button variant="secondary" type="button" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" loading={submitting}>
          {product ? 'Save changes' : 'Create listing'}
        </Button>
      </div>
    </form>
  )
}