'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2, XCircle, RefreshCw, User, Building2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Breadcrumb } from '@/components/shared/Sidebar'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { ConfirmModal } from '@/components/ui/Modal'
import { ErrorState } from '@/components/ui/Pagination'
import { useFetch, useDisclosure } from '@/hooks'
import { rfqApi, createPO } from '@/lib/api-hooks'
import { useAuth } from '@/lib/auth-context'
import { formatCurrency, formatDateTime, humanize } from '@/lib/format'
import type { RFQ, NegotiationEntry } from '@/types'

const counterSchema = z.object({
  proposedPrice:               z.coerce.number().positive('Required'),
  proposedQuantity:            z.coerce.number().int().positive('Required'),
  proposedFinancingMethod:     z.string().min(1, 'Required'),
  proposedPaymentDeadlineDays: z.coerce.number().int().min(1).max(365),
  proposedPenaltyRate:         z.coerce.number().min(0).max(5),
  message:                     z.string().optional(),
})
type CounterForm = z.infer<typeof counterSchema>

const FINANCING_OPTIONS = [
  { value: 'immediate',       label: 'Immediate' },
  { value: 'deferred_30',     label: '30-day deferred' },
  { value: 'deferred_60',     label: '60-day deferred' },
  { value: 'deferred_90',     label: '90-day deferred' },
  { value: 'installment',     label: 'Installment' },
  { value: 'loan',            label: 'Loan-backed' },
  { value: 'open_to_discuss', label: 'Open to discuss' },
]

export default function RFQDetailPage() {
  const params = useParams<{ id: string }>()
  const id = Array.isArray(params.id) ? params.id[0] : params.id
  const router = useRouter()
  const { } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const [showCounterForm, setShowCounterForm] = useState(false)
  const acceptModal  = useDisclosure()
  const declineModal = useDisclosure()

  const { data: rfq, loading, error, refetch } = useFetch<RFQ>(`/api/rfqs/${id}`)

  const { register, handleSubmit, formState: { errors }, reset } = useForm<CounterForm>({
    resolver: zodResolver(counterSchema),
    values: rfq ? {
      proposedPrice:               rfq.currentPrice / 100,
      proposedQuantity:            rfq.currentQuantity ?? 0,
      proposedFinancingMethod:     rfq.currentFinancingMethod,
      proposedPaymentDeadlineDays: rfq.currentPaymentDeadlineDays,
      proposedPenaltyRate:         rfq.currentPenaltyRate,
      message:                     '',
    } : undefined,
  })

  const handleCounter = async (data: CounterForm) => {
    setSubmitting(true)
    try {
      await rfqApi.counter(id, {
        ...data,
        proposedPrice: data.proposedPrice * 100,
      })
      toast.success('Counter offer sent.')
      setShowCounterForm(false)
      reset()
      refetch()
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to send counter')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAccept = async () => {
    setSubmitting(true)
    try {
      await rfqApi.accept(id)
      // FIX 8: Create the PO from the accepted RFQ, then redirect to it
      const poRes = await createPO(id)
      const newPOId = (poRes.data as any).data._id
      toast.success('RFQ accepted — Purchase Order created!')
      router.push(`/buyer/purchase-orders/${newPOId}`)
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to accept')
    } finally {
      setSubmitting(false)
      acceptModal.close()
    }
  }

  const handleDecline = async () => {
    setSubmitting(true)
    try {
      await rfqApi.decline(id)
      toast.success('RFQ declined.')
      refetch()
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to decline')
    } finally {
      setSubmitting(false)
      declineModal.close()
    }
  }

  const canAct = rfq && (rfq.status === 'pending' || rfq.status === 'countered')

  if (loading) return <SkeletonCard />
  if (error || !rfq) return <ErrorState onRetry={refetch} />

  const supplier = typeof rfq.supplierId === 'object' ? rfq.supplierId : null
  const product  = typeof rfq.productId  === 'object' ? rfq.productId  : null

  return (
    <div>
      <Breadcrumb crumbs={[
        { label: 'RFQs', href: '/buyer/rfqs' },
        { label: `RFQ — ${supplier ? (supplier as any).name : id}` },
      ]} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Negotiation timeline */}
        <div className="xl:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Negotiation History</CardTitle>
              <StatusBadge status={rfq.status} />
            </CardHeader>

            <div className="space-y-4 mt-2">
              {(rfq.history ?? []).map((entry, i) => (
                <NegotiationCard
                  key={i}
                  entry={entry}
                  isLatest={i === (rfq.history?.length ?? 0) - 1}
                  buyerCompanyId={typeof rfq.buyerId === 'string' ? rfq.buyerId : (rfq.buyerId as any)?._id}
                />
              ))}
            </div>

            {/* Actions */}
            {canAct && (
              <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-gray-100">
                <Button
                  variant="primary"
                  size="sm"
                  iconLeft={<CheckCircle2 className="w-3.5 h-3.5" />}
                  onClick={acceptModal.open}
                >
                  Accept terms
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  iconLeft={<RefreshCw className="w-3.5 h-3.5" />}
                  onClick={() => setShowCounterForm((v) => !v)}
                >
                  Counter offer
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  iconLeft={<XCircle className="w-3.5 h-3.5" />}
                  onClick={declineModal.open}
                  className="text-red-500 hover:bg-red-50"
                >
                  Decline
                </Button>
              </div>
            )}

            {/* Counter form */}
            {showCounterForm && (
              <form
                onSubmit={handleSubmit(handleCounter)}
                className="mt-4 p-4 bg-indigo-50 rounded-xl border border-indigo-100 space-y-3 animate-fade-in"
              >
                <p className="text-sm font-medium text-indigo-900">Your counter offer</p>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Price (₹ / unit)" type="number" error={errors.proposedPrice?.message}
                    {...register('proposedPrice')} />
                  <Input label="Quantity" type="number" error={errors.proposedQuantity?.message}
                    {...register('proposedQuantity')} />
                </div>
                <Select label="Financing" options={FINANCING_OPTIONS}
                  error={errors.proposedFinancingMethod?.message}
                  {...register('proposedFinancingMethod')} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Payment terms (days)" type="number"
                    {...register('proposedPaymentDeadlineDays')} />
                  <Input label="Penalty rate (% / day)" type="number" step="0.01"
                    {...register('proposedPenaltyRate')} />
                </div>
                <Input label="Message (optional)" placeholder="Add a note…" {...register('message')} />
                <div className="flex gap-2">
                  <Button type="submit" size="sm" loading={submitting}>Send counter</Button>
                  <Button type="button" variant="ghost" size="sm"
                    onClick={() => setShowCounterForm(false)}>Cancel</Button>
                </div>
              </form>
            )}
          </Card>
        </div>

        {/* Summary sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Current Terms</CardTitle></CardHeader>
            <dl className="space-y-2.5 text-sm">
              {([
                ['Price',         formatCurrency(rfq.currentPrice) + ' / unit'],
                ['Quantity',      rfq.currentQuantity?.toLocaleString('en-IN') ?? '-'],
                ['Total value',   formatCurrency((rfq.currentPrice ?? 0) * (rfq.currentQuantity ?? 0))],
                ['Financing',     humanize(rfq.currentFinancingMethod ?? '-')],
                ['Payment terms', `${rfq.currentPaymentDeadlineDays ?? '-'} days`],
                ['Penalty rate',  `${rfq.currentPenaltyRate ?? 0}% / day`],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-2">
                  <dt className="text-gray-400">{label}</dt>
                  <dd className="font-medium text-gray-900 text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader><CardTitle>Product</CardTitle></CardHeader>
            {product && (
              <div className="text-sm">
                <p className="font-medium text-gray-900">{(product as any).name}</p>
                <p className="text-gray-400 text-xs mt-0.5">{(product as any).category}</p>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader><CardTitle>Supplier</CardTitle></CardHeader>
            {supplier && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{(supplier as any)?.name ?? '-'}</p>
                  {(supplier as any)?.city && (
                    <p className="text-xs text-gray-400">{(supplier as any)?.city ?? ''}</p>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Modals */}
      <ConfirmModal
        open={acceptModal.isOpen}
        onClose={acceptModal.close}
        onConfirm={handleAccept}
        loading={submitting}
        title="Accept these terms?"
        message={`This will create a Purchase Order for ${formatCurrency((rfq.currentPrice ?? 0) * (rfq.currentQuantity ?? 0))}. This cannot be undone.`}
        confirmLabel="Yes, accept"
      />
      <ConfirmModal
        open={declineModal.isOpen}
        onClose={declineModal.close}
        onConfirm={handleDecline}
        loading={submitting}
        title="Decline this RFQ?"
        message="The supplier will be notified. You can start a new RFQ if you change your mind."
        confirmLabel="Yes, decline"
        danger
      />
    </div>
  )
}

// ── Negotiation entry card ────────────────────────────────────────────────────

function NegotiationCard({
  entry, isLatest, buyerCompanyId
}: {
  entry: NegotiationEntry
  isLatest: boolean
  buyerCompanyId?: string
}) {
  const isMe = entry.by === buyerCompanyId

  return (
    <div className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0 mt-0.5 ${
        isMe ? 'bg-indigo-500' : 'bg-gray-400'
      }`}>
        {isMe ? <User className="w-3.5 h-3.5" /> : <Building2 className="w-3.5 h-3.5" />}
      </div>
      <div className={`flex-1 rounded-xl p-3.5 text-sm ${
        isLatest
          ? isMe ? 'bg-indigo-50 border border-indigo-100' : 'bg-emerald-50 border border-emerald-100'
          : 'bg-gray-50 border border-gray-100'
      }`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-600">
            {isMe ? 'You' : 'Supplier'}
          </span>
          <span className="text-xs text-gray-400">{formatDateTime(entry.at)}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          {([
            ['Price',    formatCurrency(entry.proposedPrice ?? 0) + '/unit'],
            ['Qty',      (entry.proposedQuantity ?? 0).toLocaleString('en-IN')],
            ['Total',    formatCurrency((entry.proposedPrice ?? 0) * (entry.proposedQuantity ?? 0))],
            ['Financing',humanize(entry.proposedFinancingMethod ?? '-')],
            ['Terms',    `${entry.proposedPaymentDeadlineDays ?? '-'}d`],
            ['Penalty',  `${entry.proposedPenaltyRate}%/d`],
          ] as [string, string][]).map(([label, value]) => (
            <div key={label}>
              <p className="text-gray-400">{label}</p>
              <p className="font-medium text-gray-800">{value}</p>
            </div>
          ))}
        </div>
        {entry.message && (
          <p className="mt-2 text-xs text-gray-600 italic border-t border-gray-200 pt-2">
            {entry.message}
          </p>
        )}
      </div>
    </div>
  )
}