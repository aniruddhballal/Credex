'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2, XCircle, FileText, ExternalLink, AlertCircle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Breadcrumb } from '@/components/shared/Sidebar'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { StatusBadge, Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/Pagination'
import { useFetch, useDisclosure } from '@/hooks'
import { underwriterApi } from '@/lib/api-hooks'
import { formatCurrency, formatDate, humanize } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { LoanApplication } from '@/types'

const approveSchema = z.object({
  approvedAmount: z.coerce.number().positive('Required'),
  interestRate:   z.coerce.number().min(0).max(100),
  note:           z.string().optional(),
})
const rejectSchema  = z.object({ reason: z.string().min(10, 'Provide a reason (min 10 chars)') })
const docsSchema    = z.object({ note: z.string().min(5, 'Describe what documents are needed') })

export default function UnderwriterApplicationPage() {
  const { id } = useParams<{ id: string }>()
  const [submitting, setSubmitting]     = useState(false)
  const [docUrl, setDocUrl]             = useState<{ url: string; name: string } | null>(null)
  const approveModal = useDisclosure()
  const rejectModal  = useDisclosure()
  const docsModal    = useDisclosure()

  const { data: app, loading, error, refetch } =
    useFetch<LoanApplication & { documents?: any[]; company?: any; po?: any }>
    (`/api/underwriter/applications/${id}`)

  const approveForm = useForm({ resolver: zodResolver(approveSchema) })
  const rejectForm  = useForm({ resolver: zodResolver(rejectSchema) })
  const docsForm    = useForm({ resolver: zodResolver(docsSchema) })

  const handleApprove = async (data: any) => {
    setSubmitting(true)
    try {
      await underwriterApi.approve(id, {
        approvedAmount: data.approvedAmount * 100,
        interestRate:   data.interestRate,
        note:           data.note,
      })
      toast.success('Loan approved!')
      approveModal.close()
      refetch()
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to approve')
    } finally { setSubmitting(false) }
  }

  const handleReject = async (data: any) => {
    setSubmitting(true)
    try {
      await underwriterApi.reject(id, data.reason)
      toast.success('Application rejected.')
      rejectModal.close()
      refetch()
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to reject')
    } finally { setSubmitting(false) }
  }

  const handleRequestDocs = async (data: any) => {
    setSubmitting(true)
    try {
      await underwriterApi.requestDocs(id, data.note)
      toast.success('Document request sent to applicant.')
      docsModal.close()
      refetch()
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to request docs')
    } finally { setSubmitting(false) }
  }

  const openDocument = async (documentId: string, name: string) => {
    try {
      const res = await underwriterApi.getDocumentUrl(documentId)
      setDocUrl({ url: res.data.data.url, name })
    } catch {
      toast.error('Could not load document')
    }
  }

  if (loading) return <SkeletonCard />
  if (error || !app) return <ErrorState onRetry={refetch} />

  const isActionable = ['submitted', 'under_review', 'documents_requested'].includes(app.status)
  const riskScore = app.creditRiskScore

  return (
    <div>
      <Breadcrumb crumbs={[
        { label: 'Applications', href: '/underwriter/applications' },
        { label: `Application #${id.slice(-6).toUpperCase()}` },
      ]} />

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Loan Application</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {app.company?.name ?? 'Applicant'} · Submitted {formatDate(app.createdAt)}
          </p>
        </div>
        {isActionable && (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" iconLeft={<FileText className="w-3.5 h-3.5" />}
              onClick={docsModal.open}>Request docs</Button>
            <Button variant="danger" size="sm" iconLeft={<XCircle className="w-3.5 h-3.5" />}
              onClick={rejectModal.open}>Reject</Button>
            <Button size="sm" iconLeft={<CheckCircle2 className="w-3.5 h-3.5" />}
              onClick={approveModal.open}>Approve</Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-5">
          {/* Risk score */}
          {riskScore !== undefined && (
            <div className={cn(
              'flex items-start gap-3 p-4 rounded-xl border',
              riskScore < 0.25 ? 'bg-emerald-50 border-emerald-100' :
              riskScore < 0.5  ? 'bg-amber-50 border-amber-100' :
              'bg-red-50 border-red-100'
            )}>
              <AlertCircle className={cn(
                'w-5 h-5 mt-0.5 shrink-0',
                riskScore < 0.25 ? 'text-emerald-500' :
                riskScore < 0.5  ? 'text-amber-500' :
                'text-red-500'
              )} />
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  Credit Risk Score: {(riskScore * 100).toFixed(0)}/100
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    ({riskScore < 0.25 ? 'Low risk' : riskScore < 0.5 ? 'Medium risk' : riskScore < 0.75 ? 'High risk' : 'Very high risk'})
                  </span>
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  AI-generated risk assessment. Use as a decision aid, not the final word.
                </p>
              </div>
            </div>
          )}

          {/* Loan details */}
          <Card>
            <CardHeader><CardTitle>Loan Details</CardTitle><StatusBadge status={app.status} /></CardHeader>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {[
                ['Requested amount', formatCurrency(app.requestedAmount)],
                ['Tenure',           `${app.tenureMonths} months`],
                ['Purpose',          app.purpose],
                ['Linked PO',        app.po ? formatCurrency(app.po.totalPrice) : '—'],
                ...(app.approvedAmount ? [
                  ['Approved amount', formatCurrency(app.approvedAmount)],
                  ['Interest rate',   `${app.interestRate}% p.a.`],
                ] : []),
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-gray-400">{label}</dt>
                  <dd className="font-medium text-gray-900 mt-0.5">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {/* Documents */}
          {app.documents && app.documents.length > 0 && (
            <Card>
              <CardHeader><CardTitle>KYC Documents</CardTitle></CardHeader>
              <div className="space-y-2">
                {app.documents.map((doc: any) => (
                  <div key={doc._id}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors">
                    <div className="flex items-center gap-2.5">
                      <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-gray-800">{doc.fileName}</p>
                        <p className="text-xs text-gray-400">{doc.documentType} · {(doc.fileSize / 1024).toFixed(0)} KB</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={doc.verificationStatus ?? 'pending'} />
                      <Button variant="ghost" size="sm"
                        iconLeft={<ExternalLink className="w-3.5 h-3.5" />}
                        onClick={() => openDocument(doc._id, doc.fileName)}>
                        View
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-2xs text-gray-400 mt-3">
                Document links expire in 15 minutes and are not cached.
              </p>
            </Card>
          )}
        </div>

        {/* Applicant sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Applicant</CardTitle></CardHeader>
            {app.company && (
              <dl className="space-y-2 text-sm">
                {[
                  ['Company',      app.company.name],
                  ['Type',         humanize(app.company.type)],
                  ['City',         app.company.city ?? '—'],
                  ['GSTIN',        app.company.gstin ?? 'Not provided'],
                  ['PAN',          app.company.pan ?? 'Not provided'],
                  ['Verified',     app.company.isVerified ? 'Yes ✓' : 'No'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between">
                    <dt className="text-gray-400">{label}</dt>
                    <dd className="font-medium text-gray-900">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>
        </div>
      </div>

      {/* Document viewer */}
      {docUrl && (
        <Modal open title={docUrl.name} onClose={() => setDocUrl(null)} size="xl">
          <iframe src={docUrl.url} className="w-full h-[70vh] rounded-lg border border-gray-200" />
        </Modal>
      )}

      {/* Approve modal */}
      <Modal open={approveModal.isOpen} onClose={approveModal.close}
        title="Approve loan application" size="sm">
        <form onSubmit={approveForm.handleSubmit(handleApprove)} className="space-y-4">
          <Input label="Approved amount (₹)" type="number"
            hint={`Requested: ${formatCurrency(app.requestedAmount)}`}
            error={approveForm.formState.errors.approvedAmount?.message}
            required {...approveForm.register('approvedAmount')} />
          <Input label="Interest rate (% p.a.)" type="number" step="0.1"
            error={approveForm.formState.errors.interestRate?.message}
            required {...approveForm.register('interestRate')} />
          <Input label="Note (optional)" placeholder="Any conditions or remarks…"
            {...approveForm.register('note')} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={approveModal.close}>Cancel</Button>
            <Button type="submit" loading={submitting}>Approve</Button>
          </div>
        </form>
      </Modal>

      {/* Reject modal */}
      <Modal open={rejectModal.isOpen} onClose={rejectModal.close}
        title="Reject application" size="sm">
        <form onSubmit={rejectForm.handleSubmit(handleReject)} className="space-y-4">
          <Input label="Reason for rejection" placeholder="Explain why this application is being rejected…"
            error={rejectForm.formState.errors.reason?.message}
            required {...rejectForm.register('reason')} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={rejectModal.close}>Cancel</Button>
            <Button variant="danger" type="submit" loading={submitting}>Reject</Button>
          </div>
        </form>
      </Modal>

      {/* Request docs modal */}
      <Modal open={docsModal.isOpen} onClose={docsModal.close}
        title="Request additional documents" size="sm">
        <form onSubmit={docsForm.handleSubmit(handleRequestDocs)} className="space-y-4">
          <Input label="What documents are needed?" placeholder="e.g. Last 6 months bank statements, GST returns for FY24…"
            error={docsForm.formState.errors.note?.message}
            required {...docsForm.register('note')} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={docsModal.close}>Cancel</Button>
            <Button type="submit" loading={submitting}>Send request</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}