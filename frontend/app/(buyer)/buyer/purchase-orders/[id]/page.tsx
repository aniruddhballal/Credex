'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CreditCard, FileText, Star } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Breadcrumb } from '@/components/shared/Sidebar'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/Pagination'
import { useFetch, useDisclosure } from '@/hooks'
import { poApi, reviewsApi } from '@/lib/api-hooks'
import { formatCurrency, formatDate, formatDeadline, humanize } from '@/lib/format'
import type { PurchaseOrder, Payment } from '@/types'
import { cn } from '@/lib/utils'

const paymentSchema = z.object({
  amount:    z.coerce.number().positive('Enter amount'),
  method:    z.string().min(1, 'Select method'),
  reference: z.string().optional(),
})
type PaymentForm = z.infer<typeof paymentSchema>

const reviewSchema = z.object({
  rating:    z.coerce.number().min(1).max(5),
  comment:   z.string().optional(),
  reviewType: z.enum(['buyer_to_supplier', 'buyer_to_product']),
})
type ReviewForm = z.infer<typeof reviewSchema>

const PAYMENT_METHODS = [
  { value: 'upi',    label: 'UPI' },
  { value: 'neft',   label: 'NEFT' },
  { value: 'rtgs',   label: 'RTGS' },
  { value: 'imps',   label: 'IMPS' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash',   label: 'Cash' },
]

export default function PODetailPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()
  const paymentModal = useDisclosure()
  const reviewModal  = useDisclosure()
  const [submitting, setSubmitting] = useState(false)

  const { data: po, loading, error, refetch } = useFetch<PurchaseOrder>(`/api/purchase-orders/${id}`)
  const { data: payments, refetch: refetchPayments } = useFetch<Payment[]>(
    `/api/purchase-orders/${id}/payments`
  )

  const payForm = useForm<PaymentForm>({ resolver: zodResolver(paymentSchema) })
  const revForm = useForm<ReviewForm>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { rating: 5, reviewType: 'buyer_to_supplier' },
  })

  const handlePayment = async (data: PaymentForm) => {
    setSubmitting(true)
    try {
      await poApi.recordPayment(id, {
        amount:    data.amount * 100,   // rupees → paise
        method:    data.method,
        reference: data.reference,
      })
      toast.success('Payment recorded.')
      paymentModal.close()
      payForm.reset()
      refetch()
      refetchPayments()
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to record payment')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReview = async (data: ReviewForm) => {
    setSubmitting(true)
    try {
      await reviewsApi.submit({ purchaseOrderId: id, ...data })
      toast.success('Review submitted!')
      reviewModal.close()
      revForm.reset()
      refetch()
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to submit review')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <SkeletonCard />
  if (error || !po) return <ErrorState onRetry={refetch} />

  const supplier  = typeof po.supplierId === 'object' ? po.supplierId : null
  const product   = typeof po.productId  === 'object' ? po.productId  : null
  const deadline  = formatDeadline(po.paymentDeadline)
  const isComplete= po.fulfilmentStatus === 'completed' && po.paymentStatus === 'paid'
  const canPay    = po.paymentStatus !== 'paid'
  const canReview = isComplete && !po.buyerReviewed

  return (
    <div>
      <Breadcrumb crumbs={[
        { label: 'Purchase Orders', href: '/buyer/purchase-orders' },
        { label: supplier ? (supplier as any).name : id },
      ]} />

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {product ? (product as any).name : 'Purchase Order'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            From {supplier ? (supplier as any).name : '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canReview && (
            <Button variant="outline" size="sm" iconLeft={<Star className="w-3.5 h-3.5" />}
              onClick={reviewModal.open}>
              Leave review
            </Button>
          )}
          {canPay && (
            <Button size="sm" iconLeft={<CreditCard className="w-3.5 h-3.5" />}
              onClick={paymentModal.open}>
              Record payment
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: PO details */}
        <div className="xl:col-span-2 space-y-5">
          {/* Payment progress */}
          <Card>
            <CardHeader>
              <CardTitle>Payment Progress</CardTitle>
              <StatusBadge status={po.paymentStatus} />
            </CardHeader>
            <div className="mb-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                <span>{formatCurrency(po.amountPaid)} paid</span>
                <span>{formatCurrency(po.totalPrice)} total</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (po.amountPaid / po.totalPrice) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                {formatCurrency(po.amountRemaining)} remaining
              </p>
            </div>

            {/* Deadline warning */}
            {canPay && (
              <div className={cn(
                'flex items-center gap-2 p-3 rounded-lg text-xs mt-3',
                deadline.urgency === 'overdue' ? 'bg-red-50 text-red-700' :
                deadline.urgency === 'high'    ? 'bg-amber-50 text-amber-700' :
                'bg-gray-50 text-gray-600'
              )}>
                <span className="font-medium">Deadline:</span>
                <span>{formatDate(po.paymentDeadline)} ({deadline.label})</span>
                {deadline.urgency !== 'low' && (
                  <span className="ml-auto font-medium">
                    Penalty: {po.penaltyRate}% / day
                  </span>
                )}
              </div>
            )}
          </Card>

          {/* Order details */}
          <Card>
            <CardHeader><CardTitle>Order Details</CardTitle></CardHeader>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {[
                ['Quantity',        po.quantity.toLocaleString('en-IN')],
                ['Unit price',      formatCurrency(po.unitPrice)],
                ['Total value',     formatCurrency(po.totalPrice)],
                ['Financing',       humanize(po.financingMethod)],
                ['Penalty rate',    `${po.penaltyRate}% / day`],
                ['Fulfilment',      humanize(po.fulfilmentStatus)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-gray-400 text-xs">{label}</dt>
                  <dd className="font-medium text-gray-900 mt-0.5">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {/* Payment history */}
          {payments && payments.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Payment History</CardTitle></CardHeader>
              <div className="divide-y divide-gray-50">
                {payments.map((p) => (
                  <div key={p._id} className="flex items-center justify-between py-3 text-sm">
                    <div>
                      <p className="font-medium text-gray-900">{formatCurrency(p.amount)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {humanize(p.method)} {p.reference ? `· ref: ${p.reference}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">{formatDate(p.paidAt)}</p>
                      <span className={`text-2xs font-medium ${p.wasOnTime ? 'text-emerald-600' : 'text-red-500'}`}>
                        {p.wasOnTime ? 'On time' : 'Late'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Right: sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Supplier</CardTitle></CardHeader>
            {supplier && (
              <div>
                <p className="text-sm font-medium text-gray-900">{(supplier as any).name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{(supplier as any).city}</p>
              </div>
            )}
          </Card>
          <Card>
            <CardHeader><CardTitle>Product</CardTitle></CardHeader>
            {product && (
              <div>
                <p className="text-sm font-medium text-gray-900">{(product as any).name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{(product as any).category}</p>
              </div>
            )}
          </Card>
          {po.loanId && (
            <Card>
              <CardHeader><CardTitle>Loan</CardTitle></CardHeader>
              <Button variant="outline" size="sm" className="w-full"
                iconLeft={<FileText className="w-3.5 h-3.5" />}
                onClick={() => router.push(`/buyer/loans/${po.loanId}`)}>
                View loan application
              </Button>
            </Card>
          )}
        </div>
      </div>

      {/* Payment Modal */}
      <Modal open={paymentModal.isOpen} onClose={paymentModal.close}
        title="Record payment" size="sm">
        <form onSubmit={payForm.handleSubmit(handlePayment)} className="space-y-4">
          <Input label="Amount (₹)" type="number"
            hint={`Max: ${formatCurrency(po.amountRemaining)}`}
            error={payForm.formState.errors.amount?.message}
            required {...payForm.register('amount')} />
          <Select label="Payment method" options={PAYMENT_METHODS}
            placeholder="Select method"
            error={payForm.formState.errors.method?.message}
            required {...payForm.register('method')} />
          <Input label="Reference / UTR (optional)"
            placeholder="UPI ref, NEFT UTR…"
            {...payForm.register('reference')} />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" type="button" onClick={paymentModal.close}>Cancel</Button>
            <Button type="submit" loading={submitting}>Record payment</Button>
          </div>
        </form>
      </Modal>

      {/* Review Modal */}
      <Modal open={reviewModal.isOpen} onClose={reviewModal.close}
        title="Leave a review" size="sm">
        <form onSubmit={revForm.handleSubmit(handleReview)} className="space-y-4">
          <Select
            label="Review type"
            options={[
              { value: 'buyer_to_supplier', label: 'Review the supplier' },
              { value: 'buyer_to_product',  label: 'Review the product' },
            ]}
            {...revForm.register('reviewType')}
          />
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1.5">Rating</p>
            <div className="flex gap-1.5">
              {[1,2,3,4,5].map((r) => (
                <button key={r} type="button"
                  onClick={() => revForm.setValue('rating', r)}
                  className={cn(
                    'w-9 h-9 rounded-lg border text-sm font-medium transition-colors',
                    revForm.watch('rating') >= r
                      ? 'bg-amber-50 border-amber-300 text-amber-700'
                      : 'border-gray-200 text-gray-400'
                  )}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          <Input label="Comment (optional)" placeholder="Share your experience…"
            {...revForm.register('comment')} />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" type="button" onClick={reviewModal.close}>Cancel</Button>
            <Button type="submit" loading={submitting}>Submit review</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}