'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Breadcrumb } from '@/components/shared/Sidebar'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { useFetch } from '@/hooks'
import { loansApi } from '@/lib/api-hooks'
import { formatCurrency } from '@/lib/format'
import type { PurchaseOrder, LoanType } from '@/types'

const STEPS = ['Select PO', 'Loan details', 'Review & submit']

const step2Schema = z.object({
  loanTypeId:      z.string().min(1, 'Select a loan type'),
  requestedAmount: z.coerce.number().positive('Enter amount'),
  tenureMonths:    z.coerce.number().int().min(1).max(360),
  purpose:         z.string().min(10, 'Describe the purpose (min 10 chars)'),
})
type Step2 = z.infer<typeof step2Schema>

export default function LoanApplyPage() {
  const router   = useRouter()
  const [step, setStep]                   = useState(0)
  const [selectedPOId, setSelectedPOId]   = useState<string | null>(null)
  const [submitting, setSubmitting]       = useState(false)

  // FIX 4: Fetch real loan types from backend (ObjectIds, not slugs)
  const { data: posData, loading: posLoading } =
    useFetch<{ items: PurchaseOrder[] }>('/api/purchase-orders?paymentStatus=unpaid,partially_paid&role=buyer')

  const { data: loanTypesData, loading: loanTypesLoading } =
    useFetch<{ items: LoanType[] }>('/api/admin/loan-types')

  const pos       = posData?.items ?? []
  const loanTypes = (loanTypesData?.items ?? []).map((lt) => ({
    value: lt._id,          // real MongoDB ObjectId — not a slug
    label: lt.name,
  }))

  const selectedPO = pos.find((p) => p._id === selectedPOId)

  const form2 = useForm<Step2>({
    resolver: zodResolver(step2Schema),
    defaultValues: { tenureMonths: 12 },
  })

  const onSubmit = async (data: Step2) => {
    if (!selectedPOId) return
    setSubmitting(true)
    try {
      const loan = await loansApi.create({
        purchaseOrderId: selectedPOId,
        loanTypeId:      data.loanTypeId,   // real ObjectId from fetched loan types
        requestedAmount: data.requestedAmount * 100,
        tenureMonths:    data.tenureMonths,
        purpose:         data.purpose,
      })
      await loansApi.submit((loan.data as any).data._id)
      toast.success("Loan application submitted! You'll hear from an underwriter soon.")
      router.push('/buyer/loans')
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Submission failed')
    } finally { setSubmitting(false) }
  }

  if (posLoading) return <SkeletonCard />

  return (
    <div>
      <Breadcrumb crumbs={[{ label: 'Loans', href: '/buyer/loans' }, { label: 'Apply' }]} />
      <h1 className="text-xl font-semibold text-white mb-6">Apply for a loan</h1>

      {/* Step indicator */}
      <div className="flex items-center gap-0 mb-8 w-full max-w-lg">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center flex-1">
            <div className="flex flex-col items-center shrink-0">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors ${
                i < step  ? 'bg-indigo-600 border-indigo-600 text-white' :
                i === step ? 'bg-transparent border-indigo-500 text-indigo-400' :
                'bg-transparent border-white/15 text-white/30'
              }`}>
                {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
              </div>
              <p className={`text-xs mt-1.5 font-medium ${
                i === step ? 'text-indigo-400' : i < step ? 'text-white/60' : 'text-white/20'
              }`}>{s}</p>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mb-4 ${i < step ? 'bg-indigo-600' : 'bg-white/10'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 0: Select PO */}
      {step === 0 && (
        <Card className="max-w-lg">
          <CardHeader><CardTitle>Which purchase order needs financing?</CardTitle></CardHeader>
          {pos.length === 0 ? (
            <p className="text-sm text-white/40 py-4 text-center">
              No eligible purchase orders. You need an active, unpaid PO to apply.
            </p>
          ) : (
            <div className="space-y-2">
              {pos.map((po) => {
                const supplier  = typeof po.supplierId === 'object' ? po.supplierId : null
                const isSelected = selectedPOId === po._id
                return (
                  <label key={po._id}
                    className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-colors ${
                      isSelected
                        ? 'border-indigo-500/60 bg-indigo-500/10'
                        : 'border-white/10 hover:border-white/20 bg-white/4'
                    }`}>
                    <div className="flex items-center gap-3">
                      <input type="radio" name="po" value={po._id}
                        checked={selectedPOId === po._id}
                        onChange={() => setSelectedPOId(po._id)}
                        className="text-indigo-600" />
                      <div>
                        <p className="text-sm font-medium text-white">
                          {supplier ? (supplier as any).name : 'Supplier'}
                        </p>
                        <p className="text-xs text-white/40 mt-0.5">
                          {formatCurrency(po.amountRemaining)} outstanding
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-mono font-semibold text-white/80">
                      {formatCurrency(po.totalPrice)}
                    </span>
                  </label>
                )
              })}
            </div>
          )}
          <div className="flex justify-end pt-4">
            <Button type="button" disabled={!selectedPOId || pos.length === 0}
              onClick={() => setStep(1)}>
              Next →
            </Button>
          </div>
        </Card>
      )}

      {/* Step 1: Loan details */}
      {step === 1 && (
        <Card className="max-w-lg">
          <CardHeader><CardTitle>Loan details</CardTitle></CardHeader>
          {selectedPO && (
            <div className="mb-4 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs text-indigo-300">
              Financing PO worth {formatCurrency(selectedPO.totalPrice)} · {formatCurrency(selectedPO.amountRemaining)} outstanding
            </div>
          )}
          <form onSubmit={form2.handleSubmit(() => setStep(2))} className="space-y-4">
            {loanTypesLoading ? (
              <div className="h-10 bg-white/6 rounded-xl animate-skeleton" />
            ) : (
              <Select label="Loan type" options={loanTypes} placeholder="Select type"
                error={form2.formState.errors.loanTypeId?.message}
                required {...form2.register('loanTypeId')} />
            )}
            <div className="grid grid-cols-2 gap-4">
              <Input label="Amount required (₹)" type="number"
                hint={selectedPO ? `Max: ${formatCurrency(selectedPO.amountRemaining)}` : undefined}
                error={form2.formState.errors.requestedAmount?.message}
                required {...form2.register('requestedAmount')} />
              <Input label="Tenure (months)" type="number"
                error={form2.formState.errors.tenureMonths?.message}
                required {...form2.register('tenureMonths')} />
            </div>
            <Textarea label="Purpose"
              placeholder="Explain how you'll use the funds and how you plan to repay…"
              error={form2.formState.errors.purpose?.message}
              required {...form2.register('purpose')} />
            <div className="flex justify-between pt-2">
              <Button variant="secondary" type="button" onClick={() => setStep(0)}>← Back</Button>
              <Button type="submit">Review →</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Step 2: Review & submit */}
      {step === 2 && (
        <Card className="max-w-lg">
          <CardHeader><CardTitle>Review your application</CardTitle></CardHeader>
          <dl className="space-y-3 text-sm">
            {[
              ['Loan type',    loanTypes.find(t => t.value === form2.getValues('loanTypeId'))?.label ?? '—'],
              ['Amount',       formatCurrency(form2.getValues('requestedAmount') * 100)],
              ['Tenure',       `${form2.getValues('tenureMonths')} months`],
              ['Linked PO',    selectedPO ? formatCurrency(selectedPO.totalPrice) : '—'],
              ['Purpose',      form2.getValues('purpose')],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3">
                <dt className="text-white/40 shrink-0">{label}</dt>
                <dd className="font-medium text-white text-right">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-white/35 p-3 bg-white/4 rounded-xl border border-white/8">
            After submission, an underwriter will review your application and may request
            additional KYC documents. You'll receive email notifications at each stage.
          </p>
          <div className="flex justify-between mt-5">
            <Button variant="secondary" type="button" onClick={() => setStep(1)}>← Back</Button>
            <Button loading={submitting} onClick={form2.handleSubmit(onSubmit)}>
              Submit application
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}