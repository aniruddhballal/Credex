'use client'

import { useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { Upload, FileText, CheckCircle2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Breadcrumb } from '@/components/shared/Sidebar'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { StatusBadge, Badge } from '@/components/ui/Badge'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/Pagination'
import { useFetch } from '@/hooks'
import { loansApi } from '@/lib/api-hooks'
import { formatCurrency, formatDate, humanize } from '@/lib/format'
import type { LoanApplication } from '@/types'

const LOAN_STATUS_FLOW = [
  'draft', 'submitted', 'under_review', 'documents_requested',
  'under_review', 'approved', 'disbursed', 'closed',
]

const STATUS_DESCRIPTIONS: Record<string, string> = {
  draft:               'Application saved but not yet submitted.',
  submitted:           'Submitted. An underwriter will be assigned shortly.',
  under_review:        'An underwriter is reviewing your application.',
  documents_requested: 'The underwriter has requested additional documents.',
  approved:            'Congratulations — your loan has been approved!',
  rejected:            'Your application was not approved at this time.',
  disbursed:           'Funds have been disbursed.',
  closed:              'Loan fully repaid and closed.',
}

export default function LoanDetailPage() {
  const { id } = useParams<{ id: string }>()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const { data: loan, loading, error, refetch } =
    useFetch<LoanApplication & { documents?: any[] }>(`/api/loans/${id}`)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    try {
      for (const file of files) {
        const fd = new FormData()
        fd.append('document', file)
        fd.append('documentType', 'supporting')
        await loansApi.uploadDocument(id, fd)
      }
      toast.success(`${files.length} document(s) uploaded.`)
      refetch()
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (loading) return <SkeletonCard />
  if (error || !loan) return <ErrorState onRetry={refetch} />

  const needsDocs = loan.status === 'documents_requested'
  const isApproved = loan.status === 'approved' || loan.status === 'disbursed'

  return (
    <div>
      <Breadcrumb crumbs={[{ label: 'Loans', href: '/buyer/loans' }, { label: `Application #${id.slice(-6).toUpperCase()}` }]} />

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Loan Application</h1>
          <p className="text-sm text-gray-500 mt-0.5">Applied {formatDate(loan.createdAt)}</p>
        </div>
        <StatusBadge status={loan.status} />
      </div>

      {/* Status banner */}
      <div className={`p-4 rounded-xl border mb-6 ${
        needsDocs   ? 'bg-amber-50 border-amber-100' :
        isApproved  ? 'bg-emerald-50 border-emerald-100' :
        loan.status === 'rejected' ? 'bg-red-50 border-red-100' :
        'bg-indigo-50 border-indigo-100'
      }`}>
        <p className="text-sm font-medium text-gray-900">
          {STATUS_DESCRIPTIONS[loan.status] ?? 'Status unknown'}
        </p>
        {needsDocs && (
          <Button className="mt-3" size="sm" iconLeft={<Upload className="w-3.5 h-3.5" />}
            loading={uploading} onClick={() => fileInputRef.current?.click()}>
            Upload documents
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-5">
          {/* Details */}
          <Card>
            <CardHeader><CardTitle>Application Details</CardTitle></CardHeader>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {[
                ['Requested amount',  formatCurrency(loan.requestedAmount)],
                ['Tenure',            `${loan.tenureMonths} months`],
                ['Purpose',           loan.purpose],
                ...(loan.approvedAmount ? [
                  ['Approved amount', formatCurrency(loan.approvedAmount)],
                  ['Interest rate',   `${loan.interestRate}% p.a.`],
                ] : []),
                ...(loan.disbursedAt  ? [['Disbursed on', formatDate(loan.disbursedAt)]] : []),
                ...(loan.nextEmiDate  ? [['Next EMI due', formatDate(loan.nextEmiDate)]]  : []),
                ...(loan.totalRepaid > 0 ? [['Total repaid', formatCurrency(loan.totalRepaid)]] : []),
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-gray-400">{label}</dt>
                  <dd className="font-medium text-gray-900 mt-0.5">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {/* Documents */}
          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
              <Button variant="ghost" size="sm" iconLeft={<Upload className="w-3.5 h-3.5" />}
                loading={uploading} onClick={() => fileInputRef.current?.click()}>
                Upload
              </Button>
            </CardHeader>

            {!loan.documents || loan.documents.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
                <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No documents uploaded yet</p>
                <Button variant="ghost" size="sm" className="mt-2"
                  onClick={() => fileInputRef.current?.click()}>
                  Upload your first document
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {loan.documents.map((doc: any) => (
                  <div key={doc._id}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-100">
                    <div className="flex items-center gap-2.5">
                      <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-gray-800">{doc.fileName}</p>
                        <p className="text-xs text-gray-400">{(doc.fileSize / 1024).toFixed(0)} KB</p>
                      </div>
                    </div>
                    <StatusBadge status={doc.verificationStatus ?? 'pending'} />
                  </div>
                ))}
              </div>
            )}

            <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png"
              className="hidden" onChange={handleUpload} />
            <p className="text-xs text-gray-400 mt-3">
              Accepted: PDF, JPG, PNG. Documents are stored securely and only visible to assigned underwriters.
            </p>
          </Card>
        </div>

        {/* Credit risk score */}
        {loan.creditRiskScore !== undefined && (
          <div>
            <Card>
              <CardHeader><CardTitle>Credit Risk Assessment</CardTitle></CardHeader>
              <div className="text-center py-4">
                <div className={`text-4xl font-bold font-mono ${
                  loan.creditRiskScore < 0.25 ? 'text-emerald-600' :
                  loan.creditRiskScore < 0.5  ? 'text-amber-600'   :
                  'text-red-600'
                }`}>
                  {(loan.creditRiskScore * 100).toFixed(0)}
                </div>
                <p className="text-xs text-gray-400 mt-1">out of 100 (lower is better)</p>
                <Badge variant={
                  loan.creditRiskScore < 0.25 ? 'success' :
                  loan.creditRiskScore < 0.5  ? 'warning' : 'danger'
                } className="mt-3">
                  {loan.creditRiskScore < 0.25 ? 'Low risk' :
                   loan.creditRiskScore < 0.5  ? 'Medium risk' :
                   loan.creditRiskScore < 0.75 ? 'High risk' : 'Very high risk'}
                </Badge>
              </div>
              <p className="text-xs text-gray-400 text-center mt-2">
                AI-generated at time of submission.
              </p>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}