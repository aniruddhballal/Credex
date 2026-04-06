import { Request, Response } from 'express'
import { Types } from 'mongoose'
import LoanApplication from '../models/LoanApplication'
import LoanType from '../models/LoanType'
import PurchaseOrder from '../models/PurchaseOrder'
import User from '../models/User'
import Company from '../models/Company'
import AuditLog from '../models/AuditLog'
import Notification from '../models/Notification'
import { AuthRequest } from '../middleware/auth'

const getIp = (req: Request): string =>
  ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()) ||
  req.socket.remoteAddress ||
  'unknown'

const getUserCompany = async (userId: string) => {
  const user = await User.findById(userId)
  if (!user?.companyId) return { user: null, company: null }
  const company = await Company.findOne({ _id: user.companyId, isDeleted: false })
  return { user, company }
}

// POST /api/loans
// Create a draft loan application
export const createLoanApplication = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { company } = await getUserCompany(req.user!.userId)
    if (!company) {
      res.status(403).json({ success: false, message: 'No company linked to account' })
      return
    }

    const { loanTypeId, purchaseOrderId, requestedAmount, requestedTenureMonths, purpose } = req.body

    if (!loanTypeId || !requestedAmount || !requestedTenureMonths || !purpose) {
      res.status(400).json({ success: false, message: 'loanTypeId, requestedAmount, requestedTenureMonths and purpose are required' })
      return
    }

    const loanType = await LoanType.findOne({ _id: loanTypeId, isActive: true })
    if (!loanType) {
      res.status(404).json({ success: false, message: 'Loan type not found or inactive' })
      return
    }

    if (requestedAmount < loanType.minAmount || requestedAmount > loanType.maxAmount) {
      res.status(400).json({
        success: false,
        message: `Requested amount must be between ₹${loanType.minAmount / 100} and ₹${loanType.maxAmount / 100}`,
      })
      return
    }

    if (requestedTenureMonths < loanType.minTenureMonths || requestedTenureMonths > loanType.maxTenureMonths) {
      res.status(400).json({
        success: false,
        message: `Tenure must be between ${loanType.minTenureMonths} and ${loanType.maxTenureMonths} months`,
      })
      return
    }

    // If tied to a PO, validate it belongs to this company
    if (purchaseOrderId) {
      const po = await PurchaseOrder.findOne({
        _id: purchaseOrderId,
        buyerId: company._id,
        isDeleted: false,
      })
      if (!po) {
        res.status(404).json({ success: false, message: 'Purchase order not found or not yours' })
        return
      }
    }

    const loan = await LoanApplication.create({
      companyId: company._id,
      applicantUserId: new Types.ObjectId(req.user!.userId),
      loanTypeId: new Types.ObjectId(loanTypeId),
      purchaseOrderId: purchaseOrderId ? new Types.ObjectId(purchaseOrderId) : undefined,
      requestedAmount,
      requestedTenureMonths,
      purpose,
      status: 'draft',
      statusHistory: [{
        status: 'draft',
        changedBy: new Types.ObjectId(req.user!.userId),
        changedAt: new Date(),
        note: 'Application created',
      }],
      totalRepaid: 0,
      isDeleted: false,
    })

    AuditLog.create({
      performedBy: new Types.ObjectId(req.user!.userId),
      performedByRole: req.user!.role,
      ipAddress: getIp(req),
      action: 'loan.create',
      entityType: 'LoanApplication',
      entityId: loan._id,
      timestamp: new Date(),
    }).catch(() => { })

    res.status(201).json({ success: true, loan })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// POST /api/loans/:id/submit
// Applicant submits draft for review
export const submitLoanApplication = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { company } = await getUserCompany(req.user!.userId)
    if (!company) {
      res.status(403).json({ success: false, message: 'No company linked to account' })
      return
    }

    const loan = await LoanApplication.findOne({
      _id: req.params.id,
      companyId: company._id,
      isDeleted: false,
    })

    if (!loan) {
      res.status(404).json({ success: false, message: 'Loan application not found' })
      return
    }

    if (loan.status !== 'draft') {
      res.status(400).json({ success: false, message: 'Only draft applications can be submitted' })
      return
    }

    loan.status = 'submitted'
    loan.statusHistory.push({
      status: 'submitted',
      changedBy: new Types.ObjectId(req.user!.userId),
      changedAt: new Date(),
      note: 'Submitted for review',
    })
    await loan.save()

    AuditLog.create({
      performedBy: new Types.ObjectId(req.user!.userId),
      performedByRole: req.user!.role,
      ipAddress: getIp(req),
      action: 'loan.update',
      entityType: 'LoanApplication',
      entityId: loan._id,
      changes: { status: { before: 'draft', after: 'submitted' } },
      timestamp: new Date(),
    }).catch(() => { })

    res.json({ success: true, loan })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// GET /api/loans
// Applicant sees their own; underwriter sees all submitted+
export const listLoanApplications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, lastId, limit = '20' } = req.query
    const pageLimit = Math.min(parseInt(limit as string), 50)

    const filter: Record<string, unknown> = { isDeleted: false }

    if (req.user!.role === 'underwriter' || req.user!.role === 'system_admin') {
      // Underwriters see all non-draft applications
      if (status) filter.status = status
      else filter.status = { $ne: 'draft' }

      if (req.user!.role === 'underwriter') {
        // Can filter to just their assigned ones
        if (req.query.mine === 'true') {
          filter.assignedUnderwriterId = new Types.ObjectId(req.user!.userId)
        }
      }
    } else {
      // Applicant sees their own company's loans
      const { company } = await getUserCompany(req.user!.userId)
      if (!company) {
        res.status(403).json({ success: false, message: 'No company linked to account' })
        return
      }
      filter.companyId = company._id
      if (status) filter.status = status
    }

    if (lastId) filter._id = { $lt: new Types.ObjectId(lastId as string) }

    const loans = await LoanApplication.find(filter)
      .populate('loanTypeId', 'name code baseInterestRate')
      .populate('companyId', 'name type city state')
      .populate('assignedUnderwriterId', 'firstName lastName email')
      .sort({ updatedAt: -1 })
      .limit(pageLimit)

    res.json({
      success: true,
      loans,
      nextCursor: loans.length === pageLimit ? loans[loans.length - 1]._id : null,
    })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// GET /api/loans/:id
export const getLoanApplicationById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const loan = await LoanApplication.findOne({ _id: req.params.id, isDeleted: false })
      .populate('loanTypeId', 'name code baseInterestRate processingFeePercent minAmount maxAmount')
      .populate('companyId', 'name type gstin pan city state isVerified trustBadge averageRating')
      .populate('applicantUserId', 'firstName lastName email phone')
      .populate('assignedUnderwriterId', 'firstName lastName email')
      .populate('purchaseOrderId', 'totalPrice amountRemaining paymentDeadline status')

    if (!loan) {
      res.status(404).json({ success: false, message: 'Loan application not found' })
      return
    }

    const isUnderwriter = ['underwriter', 'system_admin'].includes(req.user!.role)
    const { company } = await getUserCompany(req.user!.userId)

    const isOwner = company && loan.companyId._id?.toString() === company._id.toString()

    if (!isUnderwriter && !isOwner) {
      res.status(403).json({ success: false, message: 'Access denied' })
      return
    }

    res.json({ success: true, loan })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// PATCH /api/loans/:id/assign
// Underwriter assigns themselves
export const assignUnderwriter = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!['underwriter', 'system_admin'].includes(req.user!.role)) {
      res.status(403).json({ success: false, message: 'Only underwriters can be assigned' })
      return
    }

    const loan = await LoanApplication.findOne({ _id: req.params.id, isDeleted: false })
    if (!loan) {
      res.status(404).json({ success: false, message: 'Loan application not found' })
      return
    }

    if (!['submitted', 'under_review'].includes(loan.status)) {
      res.status(400).json({ success: false, message: 'Can only assign to submitted or under_review applications' })
      return
    }

    const before = { assignedUnderwriterId: loan.assignedUnderwriterId, status: loan.status }

    loan.assignedUnderwriterId = new Types.ObjectId(req.user!.userId)
    loan.status = 'under_review'
    loan.statusHistory.push({
      status: 'under_review',
      changedBy: new Types.ObjectId(req.user!.userId),
      changedAt: new Date(),
      note: 'Assigned to underwriter',
    })
    await loan.save()

    AuditLog.create({
      performedBy: new Types.ObjectId(req.user!.userId),
      performedByRole: req.user!.role,
      ipAddress: getIp(req),
      action: 'loan.update',
      entityType: 'LoanApplication',
      entityId: loan._id,
      changes: {
        status: { before: before.status, after: 'under_review' },
        assignedUnderwriterId: { before: before.assignedUnderwriterId, after: req.user!.userId },
      },
      timestamp: new Date(),
    }).catch(() => { })

    // Notify applicant
    const applicant = await User.findById(loan.applicantUserId)
    if (applicant) {
      Notification.create({
        userId: applicant._id,
        type: 'loan_under_review',
        title: 'Loan under review',
        message: 'Your loan application is now being reviewed by an underwriter.',
        entityType: 'loan_application',
        entityId: loan._id,
        isRead: false,
      }).catch(() => { })
    }

    res.json({ success: true, loan })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// POST /api/loans/:id/request-documents
export const requestDocuments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!['underwriter', 'system_admin'].includes(req.user!.role)) {
      res.status(403).json({ success: false, message: 'Only underwriters can request documents' })
      return
    }

    const { note } = req.body
    const loan = await LoanApplication.findOne({ _id: req.params.id, isDeleted: false })
    if (!loan) {
      res.status(404).json({ success: false, message: 'Loan application not found' })
      return
    }

    loan.status = 'documents_requested'
    loan.statusHistory.push({
      status: 'documents_requested',
      changedBy: new Types.ObjectId(req.user!.userId),
      changedAt: new Date(),
      note,
    })
    await loan.save()

    AuditLog.create({
      performedBy: new Types.ObjectId(req.user!.userId),
      performedByRole: req.user!.role,
      ipAddress: getIp(req),
      action: 'loan.update',
      entityType: 'LoanApplication',
      entityId: loan._id,
      changes: { status: { before: 'under_review', after: 'documents_requested' } },
      timestamp: new Date(),
    }).catch(() => { })

    const applicant = await User.findById(loan.applicantUserId)
    if (applicant) {
      Notification.create({
        userId: applicant._id,
        type: 'documents_requested',
        title: 'Documents required',
        message: note || 'The underwriter has requested additional documents for your loan application.',
        entityType: 'loan_application',
        entityId: loan._id,
        isRead: false,
      }).catch(() => { })
    }

    res.json({ success: true, loan })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// POST /api/loans/:id/approve
export const approveLoan = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!['underwriter', 'system_admin'].includes(req.user!.role)) {
      res.status(403).json({ success: false, message: 'Only underwriters can approve loans' })
      return
    }

    const { approvedAmount, approvedInterestRate, approvedTenureMonths, emiAmount, note } = req.body

    if (!approvedAmount || !approvedInterestRate || !approvedTenureMonths) {
      res.status(400).json({ success: false, message: 'approvedAmount, approvedInterestRate and approvedTenureMonths are required' })
      return
    }

    const loan = await LoanApplication.findOne({ _id: req.params.id, isDeleted: false })
    if (!loan) {
      res.status(404).json({ success: false, message: 'Loan application not found' })
      return
    }

    if (!['under_review', 'documents_requested'].includes(loan.status)) {
      res.status(400).json({ success: false, message: 'Only under_review or documents_requested loans can be approved' })
      return
    }

    const before = loan.status

    loan.status = 'approved'
    loan.approvedAmount = approvedAmount
    loan.approvedInterestRate = approvedInterestRate
    loan.approvedTenureMonths = approvedTenureMonths
    if (emiAmount) loan.emiAmount = emiAmount
    loan.statusHistory.push({
      status: 'approved',
      changedBy: new Types.ObjectId(req.user!.userId),
      changedAt: new Date(),
      note,
    })
    await loan.save()

    AuditLog.create({
      performedBy: new Types.ObjectId(req.user!.userId),
      performedByRole: req.user!.role,
      ipAddress: getIp(req),
      action: 'loan.approve',
      entityType: 'LoanApplication',
      entityId: loan._id,
      changes: { status: { before, after: 'approved' } },
      timestamp: new Date(),
    }).catch(() => { })

    const applicant = await User.findById(loan.applicantUserId)
    if (applicant) {
      Notification.create({
        userId: applicant._id,
        type: 'loan_approved',
        title: 'Loan approved! 🎉',
        message: `Your loan of ₹${(approvedAmount / 100).toLocaleString('en-IN')} has been approved.`,
        entityType: 'loan_application',
        entityId: loan._id,
        isRead: false,
      }).catch(() => { })
    }

    res.json({ success: true, loan })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// POST /api/loans/:id/reject
export const rejectLoan = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!['underwriter', 'system_admin'].includes(req.user!.role)) {
      res.status(403).json({ success: false, message: 'Only underwriters can reject loans' })
      return
    }

    const { reason, note } = req.body
    if (!reason) {
      res.status(400).json({ success: false, message: 'Rejection reason is required' })
      return
    }

    const loan = await LoanApplication.findOne({ _id: req.params.id, isDeleted: false })
    if (!loan) {
      res.status(404).json({ success: false, message: 'Loan application not found' })
      return
    }

    if (!['under_review', 'documents_requested', 'submitted'].includes(loan.status)) {
      res.status(400).json({ success: false, message: `Cannot reject a loan with status '${loan.status}'` })
      return
    }

    const before = loan.status
    loan.status = 'rejected'
    loan.rejectionReason = reason
    loan.statusHistory.push({
      status: 'rejected',
      changedBy: new Types.ObjectId(req.user!.userId),
      changedAt: new Date(),
      note: note || reason,
    })
    await loan.save()

    AuditLog.create({
      performedBy: new Types.ObjectId(req.user!.userId),
      performedByRole: req.user!.role,
      ipAddress: getIp(req),
      action: 'loan.reject',
      entityType: 'LoanApplication',
      entityId: loan._id,
      changes: { status: { before, after: 'rejected' } },
      note: reason,
      timestamp: new Date(),
    }).catch(() => { })

    const applicant = await User.findById(loan.applicantUserId)
    if (applicant) {
      Notification.create({
        userId: applicant._id,
        type: 'loan_rejected',
        title: 'Loan application update',
        message: `Your loan application was not approved at this time.`,
        entityType: 'loan_application',
        entityId: loan._id,
        isRead: false,
      }).catch(() => { })
    }

    res.json({ success: true, loan })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}