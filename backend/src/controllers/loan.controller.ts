import { Request, Response } from 'express'
import { Types } from 'mongoose'
import LoanApplication from '../models/LoanApplication'
import LoanType from '../models/LoanType'
import PurchaseOrder from '../models/PurchaseOrder'
import DocumentModel from '../models/Document'
import User from '../models/User'
import Company from '../models/Company'
import AuditLog from '../models/AuditLog'
import Notification from '../models/Notification'
import { sendSuccess, sendPaginated, sendError } from '../utils/response'
import { AuthRequest } from '../middleware/auth'
import { getUserCompany, requireUserCompany, CompanyRequiredError } from '../utils/company'

const getIp = (req: Request): string =>
  ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()) ||
  req.socket.remoteAddress || 'unknown'

// POST /api/loans — FIX 8: accept tenureMonths or requestedTenureMonths
export const createLoanApplication = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const company = await requireUserCompany(req.user!.userId)

    const { loanTypeId, purchaseOrderId, requestedAmount, requestedTenureMonths, tenureMonths, purpose } = req.body
    const resolvedTenure = requestedTenureMonths ?? tenureMonths  // FIX 8

    if (!loanTypeId || !requestedAmount || !resolvedTenure || !purpose) {
      sendError(res, 'loanTypeId, requestedAmount, tenureMonths and purpose are required', 400); return
    }

    const loanType = await LoanType.findOne({ _id: loanTypeId, isActive: true })
    if (!loanType) { sendError(res, 'Loan type not found or inactive', 404); return }

    if (requestedAmount < loanType.minAmount || requestedAmount > loanType.maxAmount) {
      sendError(res, `Requested amount must be between ₹${loanType.minAmount / 100} and ₹${loanType.maxAmount / 100}`, 400); return
    }
    if (resolvedTenure < loanType.minTenureMonths || resolvedTenure > loanType.maxTenureMonths) {
      sendError(res, `Tenure must be between ${loanType.minTenureMonths} and ${loanType.maxTenureMonths} months`, 400); return
    }

    if (purchaseOrderId) {
      const po = await PurchaseOrder.findOne({ _id: purchaseOrderId, buyerId: company._id, isDeleted: false })
      if (!po) { sendError(res, 'Purchase order not found or not yours', 404); return }
    }

    const loan = await LoanApplication.create({
      companyId: company._id,
      applicantUserId: new Types.ObjectId(req.user!.userId),
      loanTypeId: new Types.ObjectId(loanTypeId),
      purchaseOrderId: purchaseOrderId ? new Types.ObjectId(purchaseOrderId) : undefined,
      requestedAmount, requestedTenureMonths: resolvedTenure, purpose,
      status: 'draft',
      statusHistory: [{ status: 'draft', changedBy: new Types.ObjectId(req.user!.userId), changedAt: new Date(), note: 'Application created' }],
      totalRepaid: 0, isDeleted: false,
    })

    AuditLog.create({ performedBy: new Types.ObjectId(req.user!.userId), performedByRole: req.user!.role, ipAddress: getIp(req), action: 'loan.create', entityType: 'LoanApplication', entityId: loan._id, timestamp: new Date() }).catch(() => {})

    sendSuccess(res, { loan }, undefined, 201)
  } catch (err) {
    if (err instanceof CompanyRequiredError) { sendError(res, err.message, err.statusCode); return }
    sendError(res, 'Server error', 500)
  }
}

// POST /api/loans/:id/submit
export const submitLoanApplication = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const company = await requireUserCompany(req.user!.userId)

    const loan = await LoanApplication.findOne({ _id: req.params.id, companyId: company._id, isDeleted: false })
    if (!loan) { sendError(res, 'Loan application not found', 404); return }
    if (loan.status !== 'draft') { sendError(res, 'Only draft applications can be submitted', 400); return }

    loan.status = 'submitted'
    loan.statusHistory.push({ status: 'submitted', changedBy: new Types.ObjectId(req.user!.userId), changedAt: new Date(), note: 'Submitted for review' })
    await loan.save()

    AuditLog.create({ performedBy: new Types.ObjectId(req.user!.userId), performedByRole: req.user!.role, ipAddress: getIp(req), action: 'loan.update', entityType: 'LoanApplication', entityId: loan._id, changes: { status: { before: 'draft', after: 'submitted' } }, timestamp: new Date() }).catch(() => {})

    sendSuccess(res, { loan })
  } catch (err) {
    if (err instanceof CompanyRequiredError) { sendError(res, err.message, err.statusCode); return }
    sendError(res, 'Server error', 500)
  }
}

// GET /api/loans
export const listLoanApplications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, lastId, cursor, limit = '20' } = req.query
    const pageLimit = Math.min(parseInt(limit as string), 50)
    const filter: Record<string, unknown> = { isDeleted: false }

    if (['underwriter', 'system_admin'].includes(req.user!.role)) {
      if (status) filter.status = status
      else filter.status = { $ne: 'draft' }
      if (req.user!.role === 'underwriter' && req.query.mine === 'true') {
        filter.assignedUnderwriterId = new Types.ObjectId(req.user!.userId)
      }
    } else {
      const company = await requireUserCompany(req.user!.userId)
      filter.companyId = company._id
      if (status) filter.status = status
    }

    const resolvedCursor = (lastId ?? cursor) as string | undefined
    if (resolvedCursor) filter._id = { $lt: new Types.ObjectId(resolvedCursor) }

    const loans = await LoanApplication.find(filter)
      .populate('loanTypeId', 'name code baseInterestRate')
      .populate('companyId', 'name type city state')
      .populate('assignedUnderwriterId', 'firstName lastName email')
      .sort({ updatedAt: -1 })
      .limit(pageLimit)

    sendPaginated(res, loans, loans.length === pageLimit ? loans[loans.length - 1]._id.toString() : null)
  } catch (err) {
    if (err instanceof CompanyRequiredError) { sendError(res, err.message, err.statusCode); return }
    sendError(res, 'Server error', 500)
  }
}

// GET /api/loans/:id — FIX 14: include documents[]
export const getLoanApplicationById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const loan = await LoanApplication.findOne({ _id: req.params.id, isDeleted: false })
      .populate('loanTypeId', 'name code baseInterestRate processingFeePercent minAmount maxAmount')
      .populate('companyId', 'name type gstin pan city state isVerified trustBadge averageRating')
      .populate('applicantUserId', 'firstName lastName email phone')
      .populate('assignedUnderwriterId', 'firstName lastName email')
      .populate('purchaseOrderId', 'totalPrice amountRemaining paymentDeadline status')

    if (!loan) { sendError(res, 'Loan application not found', 404); return }

    const isUnderwriter = ['underwriter', 'system_admin'].includes(req.user!.role)
    const { company } = await getUserCompany(req.user!.userId)
    const isOwner = company && loan.companyId._id?.toString() === company._id.toString()

    if (!isUnderwriter && !isOwner) { sendError(res, 'Access denied', 403); return }

    // FIX 14 — fetch and attach documents
    const documents = await DocumentModel.find({ loanApplicationId: loan._id, isDeleted: false })
      .select('-s3Key -s3Bucket')

    sendSuccess(res, { loan: { ...loan.toObject(), documents } })
  } catch {
    sendError(res, 'Server error', 500)
  }
}

// PATCH /api/loans/:id/assign
export const assignUnderwriter = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!['underwriter', 'system_admin'].includes(req.user!.role)) { sendError(res, 'Only underwriters can be assigned', 403); return }

    const loan = await LoanApplication.findOne({ _id: req.params.id, isDeleted: false })
    if (!loan) { sendError(res, 'Loan application not found', 404); return }
    if (!['submitted', 'under_review'].includes(loan.status)) { sendError(res, 'Can only assign to submitted or under_review applications', 400); return }

    const before = { assignedUnderwriterId: loan.assignedUnderwriterId, status: loan.status }
    loan.assignedUnderwriterId = new Types.ObjectId(req.user!.userId)
    loan.status = 'under_review'
    loan.statusHistory.push({ status: 'under_review', changedBy: new Types.ObjectId(req.user!.userId), changedAt: new Date(), note: 'Assigned to underwriter' })
    await loan.save()

    AuditLog.create({ performedBy: new Types.ObjectId(req.user!.userId), performedByRole: req.user!.role, ipAddress: getIp(req), action: 'loan.update', entityType: 'LoanApplication', entityId: loan._id, changes: { status: { before: before.status, after: 'under_review' } }, timestamp: new Date() }).catch(() => {})

    const applicant = await User.findById(loan.applicantUserId)
    if (applicant) {
      Notification.create({ userId: applicant._id, type: 'loan_under_review', title: 'Loan under review', message: 'Your loan application is now being reviewed by an underwriter.', entityType: 'loan_application', entityId: loan._id, isRead: false }).catch(() => {})
    }

    sendSuccess(res, { loan })
  } catch {
    sendError(res, 'Server error', 500)
  }
}

// POST /api/loans/:id/request-documents
export const requestDocuments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!['underwriter', 'system_admin'].includes(req.user!.role)) { sendError(res, 'Only underwriters can request documents', 403); return }

    const { note } = req.body
    const loan = await LoanApplication.findOne({ _id: req.params.id, isDeleted: false })
    if (!loan) { sendError(res, 'Loan application not found', 404); return }

    loan.status = 'documents_requested'
    loan.statusHistory.push({ status: 'documents_requested', changedBy: new Types.ObjectId(req.user!.userId), changedAt: new Date(), note })
    await loan.save()

    AuditLog.create({ performedBy: new Types.ObjectId(req.user!.userId), performedByRole: req.user!.role, ipAddress: getIp(req), action: 'loan.update', entityType: 'LoanApplication', entityId: loan._id, changes: { status: { before: 'under_review', after: 'documents_requested' } }, timestamp: new Date() }).catch(() => {})

    const applicant = await User.findById(loan.applicantUserId)
    if (applicant) {
      Notification.create({ userId: applicant._id, type: 'documents_requested', title: 'Documents required', message: note || 'The underwriter has requested additional documents.', entityType: 'loan_application', entityId: loan._id, isRead: false }).catch(() => {})
    }

    sendSuccess(res, { loan })
  } catch {
    sendError(res, 'Server error', 500)
  }
}

// POST /api/loans/:id/approve — FIX 5: accept interestRate or approvedInterestRate
export const approveLoan = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!['underwriter', 'system_admin'].includes(req.user!.role)) { sendError(res, 'Only underwriters can approve loans', 403); return }

    const { approvedAmount, approvedInterestRate, interestRate, approvedTenureMonths, emiAmount, note } = req.body
    const resolvedInterestRate = approvedInterestRate ?? interestRate  // FIX 5

    if (!approvedAmount || !resolvedInterestRate) {
      sendError(res, 'approvedAmount and interestRate are required', 400); return
    }

    const loan = await LoanApplication.findOne({ _id: req.params.id, isDeleted: false })
    if (!loan) { sendError(res, 'Loan application not found', 404); return }
    if (!['under_review', 'documents_requested'].includes(loan.status)) { sendError(res, 'Only under_review or documents_requested loans can be approved', 400); return }

    const before = loan.status
    loan.status = 'approved'
    loan.approvedAmount = approvedAmount
    loan.approvedInterestRate = resolvedInterestRate
    loan.approvedTenureMonths = approvedTenureMonths ?? loan.requestedTenureMonths  // FIX 5 fallback
    if (emiAmount) loan.emiAmount = emiAmount
    loan.statusHistory.push({ status: 'approved', changedBy: new Types.ObjectId(req.user!.userId), changedAt: new Date(), note })
    await loan.save()

    AuditLog.create({ performedBy: new Types.ObjectId(req.user!.userId), performedByRole: req.user!.role, ipAddress: getIp(req), action: 'loan.approve', entityType: 'LoanApplication', entityId: loan._id, changes: { status: { before, after: 'approved' } }, timestamp: new Date() }).catch(() => {})

    const applicant = await User.findById(loan.applicantUserId)
    if (applicant) {
      Notification.create({ userId: applicant._id, type: 'loan_approved', title: 'Loan approved! 🎉', message: `Your loan of ₹${(approvedAmount / 100).toLocaleString('en-IN')} has been approved.`, entityType: 'loan_application', entityId: loan._id, isRead: false }).catch(() => {})
    }

    sendSuccess(res, { loan })
  } catch {
    sendError(res, 'Server error', 500)
  }
}

// POST /api/loans/:id/reject
export const rejectLoan = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!['underwriter', 'system_admin'].includes(req.user!.role)) { sendError(res, 'Only underwriters can reject loans', 403); return }

    const { reason, note } = req.body
    if (!reason) { sendError(res, 'Rejection reason is required', 400); return }

    const loan = await LoanApplication.findOne({ _id: req.params.id, isDeleted: false })
    if (!loan) { sendError(res, 'Loan application not found', 404); return }
    if (!['under_review', 'documents_requested', 'submitted'].includes(loan.status)) { sendError(res, `Cannot reject a loan with status '${loan.status}'`, 400); return }

    const before = loan.status
    loan.status = 'rejected'
    loan.rejectionReason = reason
    loan.statusHistory.push({ status: 'rejected', changedBy: new Types.ObjectId(req.user!.userId), changedAt: new Date(), note: note || reason })
    await loan.save()

    AuditLog.create({ performedBy: new Types.ObjectId(req.user!.userId), performedByRole: req.user!.role, ipAddress: getIp(req), action: 'loan.reject', entityType: 'LoanApplication', entityId: loan._id, changes: { status: { before, after: 'rejected' } }, note: reason, timestamp: new Date() }).catch(() => {})

    const applicant = await User.findById(loan.applicantUserId)
    if (applicant) {
      Notification.create({ userId: applicant._id, type: 'loan_rejected', title: 'Loan application update', message: 'Your loan application was not approved at this time.', entityType: 'loan_application', entityId: loan._id, isRead: false }).catch(() => {})
    }

    sendSuccess(res, { loan })
  } catch {
    sendError(res, 'Server error', 500)
  }
}