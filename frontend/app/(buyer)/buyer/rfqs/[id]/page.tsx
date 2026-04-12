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
import { cn } from '@/lib/utils'

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

export default function SupplierRFQDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()
  const { user } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const [showCounter, setShowCounter] = useState(false)
  const acceptModal  = useDisclosure()
  const declineModal = useDisclosure()

  const { data: rfq, loading, error, refetch } = useFetch<RFQ>(`/api/rfqs/${id}`)

  const { register, handleSubmit, formState: { errors }, reset } = useForm<CounterForm>({
    resolver: zodResolver(counterSchema),
    values: rfq ? {
      proposedPrice:               rfq.currentProposedPrice / 100,
      proposedQuantity:            rfq.currentProposedQuantity,
      proposedFinancingMethod:     rfq.currentProposedFinancingMethod,
      proposedPaymentDeadlineDays: rfq.currentProposedPaymentDeadlineDays,
      proposedPenaltyRate:         rfq.currentProposedPenaltyRate,
      message: '',
    } : undefined,
  })

  const handleCounter = async (data: CounterForm) => {
    setSubmitting(true)
    try {
      await rfqApi.counter(id, { ...data, proposedPrice: data.proposedPrice * 100 })
      toast.success('Counter offer sent to buyer.')
      setShowCounter(false)
      reset()
      refetch()
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed')
    } finally { setSubmitting(false) }
  }

  const handleAccept = async () => {
    setSubmitting(true)
    try {
      await rfqApi.accept(id)

      // create PO and redirect to it
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
      toast.error(err?.response?.data?.error ?? 'Failed')
    } finally { setSubmitting(false); declineModal.close() }
  }

  if (loading) return <SkeletonCard />
  if (error || !rfq) return <ErrorState onRetry={refetch} />

  const buyer   = typeof rfq.buyerId   === 'object' ? rfq.buyerId   : null
  const product = typeof rfq.productId === 'object' ? rfq.productId : null
  const canAct  = rfq.status === 'pending' || rfq.status === 'countered'
  const supplierCompanyId = user?.companyId

  return (
    <div>
      <Breadcrumb crumbs={[{ label: 'RFQs', href: '/supplier/rfqs' }, { label: buyer ? (buyer as any).name : id }]} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Negotiation — {buyer ? (buyer as any).name : 'Buyer'}</CardTitle>
              <StatusBadge status={rfq.status} />
            </CardHeader>

            <div className="space-y-4 mt-2">
              {rfq.negotiationHistory.map((entry, i) => {
                const isMe = entry.proposedBy === supplierCompanyId
                return (
                  <div key={i} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0 mt-0.5 ${isMe ? 'bg-indigo-500' : 'bg-gray-400'}`}>
                      {isMe ? <Building2 className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                    </div>
                    <div className={cn(
                      'flex-1 rounded-xl p-3.5 text-sm border',
                      i === rfq.negotiationHistory.length - 1
                        ? isMe ? 'bg-indigo-50 border-indigo-100' : 'bg-emerald-50 border-emerald-100'
                        : 'bg-gray-50 border-gray-100'
                    )}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-gray-600">{isMe ? 'You' : 'Buyer'}</span>
                        <span className="text-xs text-gray-400">{formatDateTime(entry.timestamp)}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        {[
                          ['Price',    formatCurrency(entry.proposedPrice) + '/u'],
                          ['Qty',      entry.proposedQuantity.toLocaleString('en-IN')],
                          ['Total',    formatCurrency(entry.proposedPrice * entry.proposedQuantity)],
                          ['Financing',humanize(entry.proposedFinancingMethod)],
                          ['Terms',    `${entry.proposedPaymentDeadlineDays}d`],
                          ['Penalty',  `${entry.proposedPenaltyRate}%/d`],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <p className="text-gray-400">{label}</p>
                            <p className="font-medium text-gray-800">{value}</p>
                          </div>
                        ))}
                      </div>
                      {entry.message && (
                        <p className="mt-2 text-xs text-gray-600 italic border-t border-gray-200 pt-2">{entry.message}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {canAct && (
              <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-gray-100">
                <Button size="sm" iconLeft={<CheckCircle2 className="w-3.5 h-3.5" />} onClick={acceptModal.open}>
                  Accept terms
                </Button>
                <Button variant="outline" size="sm" iconLeft={<RefreshCw className="w-3.5 h-3.5" />}
                  onClick={() => setShowCounter((v) => !v)}>
                  Counter
                </Button>
                <Button variant="ghost" size="sm" iconLeft={<XCircle className="w-3.5 h-3.5" />}
                  onClick={declineModal.open} className="text-red-500 hover:bg-red-50">
                  Decline
                </Button>
              </div>
            )}

            {showCounter && (
              <form onSubmit={handleSubmit(handleCounter)}
                className="mt-4 p-4 bg-indigo-50 rounded-xl border border-indigo-100 space-y-3 animate-fade-in">
                <p className="text-sm font-medium text-indigo-900">Your counter offer</p>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Price (₹ / unit)" type="number" error={errors.proposedPrice?.message} {...register('proposedPrice')} />
                  <Input label="Quantity" type="number" error={errors.proposedQuantity?.message} {...register('proposedQuantity')} />
                </div>
                <Select label="Financing" options={FINANCING_OPTIONS} error={errors.proposedFinancingMethod?.message} {...register('proposedFinancingMethod')} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Payment terms (days)" type="number" {...register('proposedPaymentDeadlineDays')} />
                  <Input label="Penalty (% / day)" type="number" step="0.01" {...register('proposedPenaltyRate')} />
                </div>
                <Input label="Message (optional)" {...register('message')} />
                <div className="flex gap-2">
                  <Button type="submit" size="sm" loading={submitting}>Send counter</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowCounter(false)}>Cancel</Button>
                </div>
              </form>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Current Terms</CardTitle></CardHeader>
            <dl className="space-y-2.5 text-sm">
              {[
                ['Price',         formatCurrency(rfq.currentProposedPrice) + ' / unit'],
                ['Qty',           rfq.currentProposedQuantity.toLocaleString('en-IN')],
                ['Total',         formatCurrency(rfq.currentProposedPrice * rfq.currentProposedQuantity)],
                ['Financing',     humanize(rfq.currentProposedFinancingMethod)],
                ['Terms',         `${rfq.currentProposedPaymentDeadlineDays} days`],
                ['Penalty',       `${rfq.currentProposedPenaltyRate}% / day`],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-2">
                  <dt className="text-gray-400">{label}</dt>
                  <dd className="font-medium text-gray-900 text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card>
            <CardHeader><CardTitle>Product</CardTitle></CardHeader>
            {product && <p className="text-sm font-medium text-gray-900">{(product as any).name}</p>}
          </Card>
        </div>
      </div>

      <ConfirmModal open={acceptModal.isOpen} onClose={acceptModal.close} onConfirm={handleAccept}
        loading={submitting} title="Accept these terms?"
        message={`Creates a PO for ${formatCurrency(rfq.currentProposedPrice * rfq.currentProposedQuantity)}.`}
        confirmLabel="Accept" />
      <ConfirmModal open={declineModal.isOpen} onClose={declineModal.close} onConfirm={handleDecline}
        loading={submitting} title="Decline this RFQ?"
        message="The buyer will be notified." confirmLabel="Decline" danger />
    </div>
  )
}