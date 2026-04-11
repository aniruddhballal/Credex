import { Request, Response } from 'express'
import { Types } from 'mongoose'
import Company from '../models/Company'
import User from '../models/User'
import AuditLog from '../models/AuditLog'
import { sendSuccess, sendPaginated, sendError } from '../utils/response'
import { AuthRequest } from '../middleware/auth'

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/
const PHONE_REGEX = /^(\+91)?[6-9]\d{9}$/

const getIp = (req: Request): string =>
  ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()) ||
  req.socket.remoteAddress || 'unknown'

// POST /api/companies
export const createCompany = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId
    const userRole = req.user!.role

    if (!['buyer', 'supplier'].includes(userRole)) {
      sendError(res, 'Only buyers and suppliers can create a company', 403); return
    }

    const user = await User.findById(userId)
    if (!user || user.isDeleted) { sendError(res, 'User not found', 404); return }
    if (user.companyId) { sendError(res, 'You already have a company linked to your account', 409); return }

    const {
      name, legalName, type, description, website,
      email, phone, address, city, state, pincode,
      gstin, pan, cin, udyamNumber, industry, tags,
    } = req.body

    if (gstin && !GSTIN_REGEX.test(gstin)) { sendError(res, 'Invalid GSTIN format', 400); return }
    if (pan && !PAN_REGEX.test(pan)) { sendError(res, 'Invalid PAN format', 400); return }
    if (phone && !PHONE_REGEX.test(phone)) { sendError(res, 'Invalid Indian phone number', 400); return }

    const allowedTypes: Record<string, string[]> = { buyer: ['buyer', 'both'], supplier: ['supplier', 'both'] }
    if (!allowedTypes[userRole]?.includes(type)) {
      sendError(res, `A ${userRole} cannot create a company of type '${type}'`, 400); return
    }

    const company = await Company.create({
      name, legalName, type, description, website, email, phone,
      address, city, state, pincode, country: 'India',
      gstin, pan, cin, udyamNumber, industry, tags,
      isVerified: false, trustBadge: 'none',
      members: [{ userId: new Types.ObjectId(userId), role: 'owner', addedAt: new Date() }],
      isDeleted: false,
    })

    user.companyId = company._id as Types.ObjectId
    await user.save()

    AuditLog.create({
      performedBy: new Types.ObjectId(userId), performedByRole: userRole, ipAddress: getIp(req),
      action: 'company.create', entityType: 'Company', entityId: company._id,
      note: `Company '${company.name}' created`, timestamp: new Date(),
    }).catch(() => {})

    sendSuccess(res, { company }, undefined, 201)
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000) {
      sendError(res, 'A company with this GSTIN or PAN already exists', 409); return
    }
    sendError(res, 'Server error', 500)
  }
}

// GET /api/companies/me/profile
export const getMyCompany = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user!.userId)
    if (!user?.companyId) { sendError(res, 'No company linked to your account', 404); return }

    const company = await Company.findOne({ _id: user.companyId, isDeleted: false })
    if (!company) { sendError(res, 'Company not found', 404); return }

    sendSuccess(res, { company })
  } catch {
    sendError(res, 'Server error', 500)
  }
}

// GET /api/companies/:id
export const getCompanyById = async (req: Request, res: Response): Promise<void> => {
  try {
    const company = await Company.findOne({ _id: req.params.id, isDeleted: false })
      .select('-members -gstin -pan -cin -udyamNumber -creditScoreRef')
    if (!company) { sendError(res, 'Company not found', 404); return }
    sendSuccess(res, { company })
  } catch {
    sendError(res, 'Server error', 500)
  }
}

// PATCH /api/companies/me/profile
export const updateMyCompany = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user!.userId)
    if (!user?.companyId) { sendError(res, 'No company linked to your account', 404); return }

    const company = await Company.findOne({ _id: user.companyId, isDeleted: false })
    if (!company) { sendError(res, 'Company not found', 404); return }

    const { name, legalName, description, website, email, phone, address, city, state, pincode, gstin, pan, cin, udyamNumber, industry, tags } = req.body

    if (gstin && !GSTIN_REGEX.test(gstin)) { sendError(res, 'Invalid GSTIN format', 400); return }
    if (pan && !PAN_REGEX.test(pan)) { sendError(res, 'Invalid PAN format', 400); return }
    if (phone && !PHONE_REGEX.test(phone)) { sendError(res, 'Invalid Indian phone number', 400); return }

    const before = { name: company.name, email: company.email, city: company.city, state: company.state, gstin: company.gstin, pan: company.pan }
    const updatable = { name, legalName, description, website, email, phone, address, city, state, pincode, gstin, pan, cin, udyamNumber, industry, tags }
    Object.entries(updatable).forEach(([key, val]) => {
      if (val !== undefined) company.set(key, val)
    })
    await company.save()

    AuditLog.create({
      performedBy: new Types.ObjectId(req.user!.userId), performedByRole: req.user!.role, ipAddress: getIp(req),
      action: 'company.update', entityType: 'Company', entityId: company._id,
      changes: Object.fromEntries(Object.entries(before).map(([k, v]) => [k, { before: v, after: company.get(k) }])),
      timestamp: new Date(),
    }).catch(() => {})

    sendSuccess(res, { company })
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000) {
      sendError(res, 'A company with this GSTIN or PAN already exists', 409); return
    }
    sendError(res, 'Server error', 500)
  }
}

// GET /api/companies
export const listCompanies = async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, city, state, isVerified, search, lastId, cursor, limit = '20' } = req.query
    const filter: Record<string, unknown> = { isDeleted: false }

    if (type) filter.type = { $in: [type, 'both'] }
    if (city) filter.city = city
    if (state) filter.state = state
    if (isVerified === 'true') filter.isVerified = true
    if (search) filter.$text = { $search: search as string }

    const resolvedCursor = (lastId ?? cursor) as string | undefined
    if (resolvedCursor) filter._id = { $gt: new Types.ObjectId(resolvedCursor) }

    const pageLimit = Math.min(parseInt(limit as string), 50)
    const companies = await Company.find(filter)
      .select('name type description logo city state isVerified trustBadge averageRating totalReviews industry tags')
      .sort({ _id: 1 })
      .limit(pageLimit)

    sendPaginated(res, companies, companies.length === pageLimit ? companies[companies.length - 1]._id.toString() : null)
  } catch {
    sendError(res, 'Server error', 500)
  }
}