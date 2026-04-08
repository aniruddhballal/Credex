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
import { useFetch } from '@/hooks'
import { loansApi } from '@/lib/api-hooks'
import { formatCurrency } from '@/lib/format'
import type { PurchaseOrder } from '@/types'

const STEPS = ['Select PO', 'Loan details', 'Review & submit']

const step1Schema = z.object({
  purchaseOrderId: z.string().min(1, 'Select a purchase order'),
})
const step2Schema = z.object({
  loanTypeId:    z.string().min(1, 'Select a loan type'),
  requestedAmount: z.coerce.number().positive('Enter amount'),
  tenureMonths:  z.coerce.number().int().min(1).max(360),
  purpose:       z.string().min(10, 'Describe the purpose (min 10 chars)'),
})

type Step1 = z.infer<typeof step1Schema>
type Step2 = z.infer<typeof step2Schema>

const LOAN_TYPES = [
  { value: 'working_capital', label: 'Working Capital Loan' },
  { value: 'equipment',       label: 'Equipment Finance' },
  { value: 'invoice',         label: 'Invoice Discounting' },
  { value: 'term_loan',       label: 'Term Loan' },
]

export default function LoanApplyPage() {
  const router   = useRouter()
  const [step, setStep]         = useState(0)
  const [step1Data, setStep1Data] = useState<Step1 | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { data: posData } = useFetch<{ items: PurchaseOrder[] }>(
    '/api/purchase-orders?paymentStatus=unpaid,partially_paid&role=buyer'
  )
  const pos = posData?.items ?? []

  const form1 = useForm<Step1>({ resolver: zodResolver(step1Schema) })
  const form2 = useForm<Step2>({ resolver: zodResolver(step2Schema), defaultValues: { tenureMonths: 12 } })

  const selectedPO = pos.find((p) => p._id === step1Data?.purchaseOrderId)

  const onStep1 = (data: Step1) => { setStep1Data(data); setStep(1) }

  const onSubmit = async (data: Step2) => {
    if (!step1Data) return
    setSubmitting(true)
    try {
      const loan = await loansApi.create({
        purchaseOrderId: step1Data.purchaseOrderId,
        loanTypeId:      data.loanTypeId,
        requestedAmount: data.requestedAmount * 100,
        tenureMonths:    data.tenureMonths,
        purpose:         data.purpose,
      })
      // Auto-submit draft
      await loansApi.submit((loan.data as any).data._id)
      toast.success('Loan application submitted! You\'ll hear from an underwriter soon.')
      router.push('/buyer/loans')
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Submission failed')
    } finally { setSubmitting(false) }
  }

  return (
    <div>
      <Breadcrumb crumbs={[{ label: 'Loans', href: '/buyer/loans' }, { label: 'Apply' }]} />
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Apply for a loan</h1>

      {/* Step indicator */}
      <div className="flex items-center gap-0 mb-8 w-full max-w-lg">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center flex-1">
            <div className="flex flex-col items-center shrink-0">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors ${
                i < step  ? 'bg-indigo-600 border-indigo-600 text-white' :
                i === step ? 'bg-white border-indigo-600 text-indigo-600' :
                'bg-white border-gray-200 text-gray-400'
              }`}>
                {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
              </div>
              <p className={`text-xs mt-1.5 font-medium ${i === step ? 'text-indigo-600' : i < step ? 'text-gray-600' : 'text-gray-300'}`}>{s}</p>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mb-4 ${i < step ? 'bg-indigo-600' : 'bg-gray-100'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 0: Select PO */}
      {step === 0 && (
        <Card className="max-w-lg">
          <CardHeader><CardTitle>Which purchase order do you need financing for?</CardTitle></CardHeader>
          <form onSubmit={form1.handleSubmit(onStep1)} className="space-y-4">
            {pos.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">
                No eligible purchase orders. You need an active, unpaid PO to apply.
              </p>
            ) : (
              <div className="space-y-2">
                {pos.map((po) => {
                  const supplier = typeof po.supplierId === 'object' ? po.supplierId : null
                  const isSelected = form1.watch('purchaseOrderId') === po._id
                  return (
                    <label key={po._id}
                      className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-colors ${
                        isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
                      }`}>
                      <div className="flex items-center gap-3">
                        <input type="radio" value={po._id}
                          {...form1.register('purchaseOrderId')}
                          className="text-indigo-600" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {supplier ? (supplier as any).name : 'Supplier'}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {formatCurrency(po.amountRemaining)} outstanding
                          </p>
                        </div>
                      </div>
                      <span className="text-sm font-mono font-semibold text-gray-700">
                        {formatCurrency(po.totalPrice)}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
            {form1.formState.errors.purchaseOrderId && (
              <p className="text-xs text-red-500">{form1.formState.errors.purchaseOrderId.message}</p>
            )}
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={pos.length === 0}>Next →</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Step 1: Loan details */}
      {step === 1 && (
        <Card className="max-w-lg">
          <CardHeader><CardTitle>Loan details</CardTitle></CardHeader>
          {selectedPO && (
            <div className="mb-4 p-3 bg-indigo-50 rounded-lg text-xs text-indigo-700">
              Financing PO worth {formatCurrency(selectedPO.totalPrice)} · {formatCurrency(selectedPO.amountRemaining)} outstanding
            </div>
          )}
          <form onSubmit={form2.handleSubmit((d) => { setStep(2) })} className="space-y-4">
            <Select label="Loan type" options={LOAN_TYPES} placeholder="Select type"
              error={form2.formState.errors.loanTypeId?.message}
              required {...form2.register('loanTypeId')} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Amount required (₹)" type="number"
                hint={selectedPO ? `Max: ${formatCurrency(selectedPO.amountRemaining)}` : undefined}
                error={form2.formState.errors.requestedAmount?.message}
                required {...form2.register('requestedAmount')} />
              <Input label="Tenure (months)" type="number"
                error={form2.formState.errors.tenureMonths?.message}
                required {...form2.register('tenureMonths')} />
            </div>
            <Textarea label="Purpose" placeholder="Explain how you'll use the funds and how you plan to repay…"
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
              ['Loan type',    LOAN_TYPES.find(t => t.value === form2.getValues('loanTypeId'))?.label ?? '—'],
              ['Amount',       formatCurrency(form2.getValues('requestedAmount') * 100)],
              ['Tenure',       `${form2.getValues('tenureMonths')} months`],
              ['Linked PO',    selectedPO ? formatCurrency(selectedPO.totalPrice) : '—'],
              ['Purpose',      form2.getValues('purpose')],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3">
                <dt className="text-gray-400 shrink-0">{label}</dt>
                <dd className="font-medium text-gray-900 text-right">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-gray-400 p-3 bg-gray-50 rounded-lg">
            After submission, an underwriter will review your application and may request additional KYC documents.
            You'll receive email notifications at each stage.
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