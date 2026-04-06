import { Request, Response } from 'express'
import { Types } from 'mongoose'
import User from '../models/User'
import Company from '../models/Company'
import LoanType from '../models/LoanType'
import LoanApplication from '../models/LoanApplication'
import RestorationRequest from '../models/RestorationRequest'
import Product from '../models/Product'
import PurchaseOrder from '../models/PurchaseOrder'
import AuditLog from '../models/AuditLog'
import { AuthRequest } from '../middleware/auth'

const getIp = (req: Request): string =>
  ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()) ||
  req.socket.remoteAddress ||
  'unknown'

// ─── Users ────────────────────────────────────────────────────────────────────

// GET /api/admin/users?role=buyer&search=john&lastId=...
export const listUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { role, search, isDeleted, lastId, limit = '20' } = req.query
    const pageLimit = Math.min(parseInt(limit as string), 100)
    const filter: Record<string, unknown> = {}

    if (role) filter.role = role
    if (isDeleted === 'true') filter.isDeleted = true
    else filter.isDeleted = false
    if (search) filter.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ]
    if (lastId) filter._id = { $gt: new Types.ObjectId(lastId as string) }

    const users = await User.find(filter)
      .select('-password -verificationToken -resetPasswordToken')
      .populate('companyId', 'name type isVerified')
      .sort({ _id: 1 })
      .limit(pageLimit)

    res.json({
      success: true,
      users,
      nextCursor: users.length === pageLimit ? users[users.length - 1]._id : null,
    })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// DELETE /api/admin/users/:id  (soft delete)
export const deleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { reason } = req.body
    const user = await User.findOne({ _id: req.params.id, isDeleted: false })
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' })
      return
    }

    if (user.role === 'system_admin') {
      res.status(403).json({ success: false, message: 'Cannot delete a system admin' })
      return
    }

    user.isDeleted = true
    user.deletedAt = new Date()
    user.deletedBy = new Types.ObjectId(req.user!.userId)
    user.deletionReason = reason
    await user.save()

    AuditLog.create({
      performedBy: new Types.ObjectId(req.user!.userId),
      performedByRole: req.user!.role,
      ipAddress: getIp(req),
      action: 'user.delete',
      entityType: 'User',
      entityId: user._id,
      note: reason,
      timestamp: new Date(),
    }).catch(() => { })

    res.json({ success: true, message: 'User deleted' })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// ─── Companies ────────────────────────────────────────────────────────────────

// GET /api/admin/companies?isVerified=false&type=supplier
export const listCompaniesAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { isVerified, type, lastId, limit = '20' } = req.query
    const pageLimit = Math.min(parseInt(limit as string), 100)
    const filter: Record<string, unknown> = { isDeleted: false }

    if (isVerified !== undefined) filter.isVerified = isVerified === 'true'
    if (type) filter.type = type
    if (lastId) filter._id = { $gt: new Types.ObjectId(lastId as string) }

    const companies = await Company.find(filter)
      .sort({ _id: 1 })
      .limit(pageLimit)

    res.json({
      success: true,
      companies,
      nextCursor: companies.length === pageLimit ? companies[companies.length - 1]._id : null,
    })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// PATCH /api/admin/companies/:id/verify
export const verifyCompany = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { trustBadge } = req.body
    const company = await Company.findOne({ _id: req.params.id, isDeleted: false })
    if (!company) {
      res.status(404).json({ success: false, message: 'Company not found' })
      return
    }

    company.isVerified = true
    company.verifiedAt = new Date()
    company.verifiedBy = new Types.ObjectId(req.user!.userId)
    if (trustBadge && ['none', 'silver', 'gold', 'platinum'].includes(trustBadge)) {
      company.trustBadge = trustBadge
      company.trustBadgeUpdatedAt = new Date()
    }
    await company.save()

    AuditLog.create({
      performedBy: new Types.ObjectId(req.user!.userId),
      performedByRole: req.user!.role,
      ipAddress: getIp(req),
      action: 'company.verify',
      entityType: 'Company',
      entityId: company._id,
      changes: { isVerified: { before: false, after: true }, trustBadge: { before: null, after: trustBadge } },
      timestamp: new Date(),
    }).catch(() => { })

    res.json({ success: true, company })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// ─── Loan Types ───────────────────────────────────────────────────────────────

// GET /api/admin/loan-types  (public — also used in frontend)
export const listLoanTypes = async (_req: Request, res: Response): Promise<void> => {
  try {
    const loanTypes = await LoanType.find({ isActive: true }).sort({ name: 1 })
    res.json({ success: true, loanTypes })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// POST /api/admin/loan-types
export const createLoanType = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      name, code, description,
      minAmount, maxAmount,
      minTenureMonths, maxTenureMonths,
      baseInterestRate, processingFeePercent,
    } = req.body

    if (!name || !code || !minAmount || !maxAmount || !minTenureMonths || !maxTenureMonths || !baseInterestRate) {
      res.status(400).json({ success: false, message: 'All loan type fields are required' })
      return
    }

    const loanType = await LoanType.create({
      name, code, description,
      minAmount, maxAmount,
      minTenureMonths, maxTenureMonths,
      baseInterestRate,
      processingFeePercent: processingFeePercent ?? 0,
      isActive: true,
    })

    res.status(201).json({ success: true, loanType })
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000) {
      res.status(409).json({ success: false, message: 'Loan type code already exists' })
      return
    }
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// PATCH /api/admin/loan-types/:id
export const updateLoanType = async (req: Request, res: Response): Promise<void> => {
  try {
    const loanType = await LoanType.findById(req.params.id)
    if (!loanType) {
      res.status(404).json({ success: false, message: 'Loan type not found' })
      return
    }

    const updatable = [
      'name', 'description', 'minAmount', 'maxAmount',
      'minTenureMonths', 'maxTenureMonths', 'baseInterestRate',
      'processingFeePercent', 'isActive',
    ]
    updatable.forEach((key) => {
      if (req.body[key] !== undefined) {
        (loanType as unknown as Record<string, unknown>)[key] = req.body[key]
      }
    })

    await loanType.save()
    res.json({ success: true, loanType })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// ─── Restoration Requests ─────────────────────────────────────────────────────

// POST /api/admin/restoration-requests  (any authenticated user submits)
export const createRestorationRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { entityType, entityId, reason } = req.body

    if (!entityType || !entityId || !reason) {
      res.status(400).json({ success: false, message: 'entityType, entityId and reason are required' })
      return
    }

    if (reason.length < 10) {
      res.status(400).json({ success: false, message: 'Reason must be at least 10 characters' })
      return
    }

    const request = await RestorationRequest.create({
      entityType,
      entityId: new Types.ObjectId(entityId),
      requestedBy: new Types.ObjectId(req.user!.userId),
      reason,
      status: 'pending',
    })

    res.status(201).json({ success: true, request })
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000) {
      res.status(409).json({ success: false, message: 'A pending restoration request already exists for this entity' })
      return
    }
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// GET /api/admin/restoration-requests
export const listRestorationRequests = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, lastId, limit = '20' } = req.query
    const pageLimit = Math.min(parseInt(limit as string), 50)
    const filter: Record<string, unknown> = {}

    if (status) filter.status = status
    if (lastId) filter._id = { $gt: new Types.ObjectId(lastId as string) }

    const requests = await RestorationRequest.find(filter)
      .populate('requestedBy', 'firstName lastName email role')
      .populate('reviewedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(pageLimit)

    res.json({
      success: true,
      requests,
      nextCursor: requests.length === pageLimit ? requests[requests.length - 1]._id : null,
    })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// POST /api/admin/restoration-requests/:id/approve
export const approveRestoration = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const request = await RestorationRequest.findOne({ _id: req.params.id, status: 'pending' })
    if (!request) {
      res.status(404).json({ success: false, message: 'Pending restoration request not found' })
      return
    }

    // Restore the entity
    const models: Record<string, unknown> = {
      loan_application: LoanApplication,
      user: User,
      company: Company,
      product: Product,
      purchase_order: PurchaseOrder,
    }

    const Model = models[request.entityType] as { findByIdAndUpdate: Function }
    if (Model) {
      await Model.findByIdAndUpdate(request.entityId, {
        isDeleted: false,
        $unset: { deletedAt: 1, deletedBy: 1, deletionReason: 1 },
      })
    }

    request.status = 'approved'
    request.reviewedBy = new Types.ObjectId(req.user!.userId)
    request.reviewedAt = new Date()
    request.reviewNote = req.body.note
    await request.save()

    AuditLog.create({
      performedBy: new Types.ObjectId(req.user!.userId),
      performedByRole: req.user!.role,
      ipAddress: getIp(req),
      action: `${request.entityType.split('_')[0]}.restore` as never,
      entityType: request.entityType,
      entityId: request.entityId,
      note: `Restored via restoration request ${request._id}`,
      timestamp: new Date(),
    }).catch(() => { })

    res.json({ success: true, request })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// POST /api/admin/restoration-requests/:id/reject
export const rejectRestoration = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const request = await RestorationRequest.findOne({ _id: req.params.id, status: 'pending' })
    if (!request) {
      res.status(404).json({ success: false, message: 'Pending restoration request not found' })
      return
    }

    request.status = 'rejected'
    request.reviewedBy = new Types.ObjectId(req.user!.userId)
    request.reviewedAt = new Date()
    request.reviewNote = req.body.note
    await request.save()

    res.json({ success: true, request })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// GET /api/admin/audit-logs?action=...&entityType=...&performedBy=...
export const listAuditLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const { action, entityType, performedBy, lastId, limit = '50' } = req.query
    const pageLimit = Math.min(parseInt(limit as string), 100)
    const filter: Record<string, unknown> = {}

    if (action) filter.action = action
    if (entityType) filter.entityType = entityType
    if (performedBy) filter.performedBy = new Types.ObjectId(performedBy as string)
    if (lastId) filter._id = { $lt: new Types.ObjectId(lastId as string) }

    const AuditLog = (await import('../models/AuditLog')).default
    const logs = await AuditLog.find(filter)
      .populate('performedBy', 'firstName lastName email role')
      .sort({ timestamp: -1 })
      .limit(pageLimit)

    res.json({
      success: true,
      logs,
      nextCursor: logs.length === pageLimit ? logs[logs.length - 1]._id : null,
    })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}