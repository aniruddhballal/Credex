import { Request, Response } from 'express'
import Company from '../models/Company'
import User from '../models/User'
import AuditLog from '../models/AuditLog'
import { AuthRequest } from '../middleware/auth'
import { Types } from 'mongoose'

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/
const PHONE_REGEX = /^(\+91)?[6-9]\d{9}$/

const getIp = (req: Request): string =>
  ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()) ||
  req.socket.remoteAddress ||
  'unknown'

// POST /api/companies
// Creates company and links it to the authenticated user
export const createCompany = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId
    const userRole = req.user!.role

    // Only buyers/suppliers can create a company
    if (!['buyer', 'supplier'].includes(userRole)) {
      res.status(403).json({ success: false, message: 'Only buyers and suppliers can create a company' })
      return
    }

    const user = await User.findById(userId)
    if (!user || user.isDeleted) {
      res.status(404).json({ success: false, message: 'User not found' })
      return
    }

    if (user.companyId) {
      res.status(409).json({ success: false, message: 'You already have a company linked to your account' })
      return
    }

    const {
      name, legalName, type, description, website,
      email, phone, address, city, state, pincode,
      gstin, pan, cin, udyamNumber, industry, tags,
    } = req.body

    // Validations
    if (gstin && !GSTIN_REGEX.test(gstin)) {
      res.status(400).json({ success: false, message: 'Invalid GSTIN format' })
      return
    }
    if (pan && !PAN_REGEX.test(pan)) {
      res.status(400).json({ success: false, message: 'Invalid PAN format' })
      return
    }
    if (phone && !PHONE_REGEX.test(phone)) {
      res.status(400).json({ success: false, message: 'Invalid Indian phone number' })
      return
    }

    // type must match role (buyer can create buyer/both, supplier can create supplier/both)
    const allowedTypes: Record<string, string[]> = {
      buyer: ['buyer', 'both'],
      supplier: ['supplier', 'both'],
    }
    if (!allowedTypes[userRole]?.includes(type)) {
      res.status(400).json({ success: false, message: `A ${userRole} cannot create a company of type '${type}'` })
      return
    }

    const company = await Company.create({
      name,
      legalName,
      type,
      description,
      website,
      email,
      phone,
      address,
      city,
      state,
      pincode,
      country: 'India',
      gstin,
      pan,
      cin,
      udyamNumber,
      industry,
      tags,
      isVerified: false,
      trustBadge: 'none',
      members: [{ userId: new Types.ObjectId(userId), role: 'owner', addedAt: new Date() }],
      isDeleted: false,
    })

    // Link company to user
    user.companyId = company._id as Types.ObjectId
    await user.save()

    AuditLog.create({
      performedBy: new Types.ObjectId(userId),
      performedByRole: userRole,
      ipAddress: getIp(req),
      action: 'company.create',
      entityType: 'Company',
      entityId: company._id,
      note: `Company '${company.name}' created`,
      timestamp: new Date(),
    }).catch(() => { })

    res.status(201).json({ success: true, company })
  } catch (err: unknown) {
    // Duplicate GSTIN or PAN
    if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000) {
      res.status(409).json({ success: false, message: 'A company with this GSTIN or PAN already exists' })
      return
    }
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// GET /api/companies/me
// Get the authenticated user's own company
export const getMyCompany = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user!.userId)
    if (!user?.companyId) {
      res.status(404).json({ success: false, message: 'No company linked to your account' })
      return
    }

    const company = await Company.findOne({ _id: user.companyId, isDeleted: false })
    if (!company) {
      res.status(404).json({ success: false, message: 'Company not found' })
      return
    }

    res.json({ success: true, company })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// GET /api/companies/:id
// Public company profile
export const getCompanyById = async (req: Request, res: Response): Promise<void> => {
  try {
    const company = await Company.findOne({ _id: req.params.id, isDeleted: false }).select(
      '-members -gstin -pan -cin -udyamNumber -creditScoreRef'
    )

    if (!company) {
      res.status(404).json({ success: false, message: 'Company not found' })
      return
    }

    res.json({ success: true, company })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// PATCH /api/companies/me
// Update own company
export const updateMyCompany = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user!.userId)
    if (!user?.companyId) {
      res.status(404).json({ success: false, message: 'No company linked to your account' })
      return
    }

    const company = await Company.findOne({ _id: user.companyId, isDeleted: false })
    if (!company) {
      res.status(404).json({ success: false, message: 'Company not found' })
      return
    }

    const {
      name, legalName, description, website, email, phone,
      address, city, state, pincode, gstin, pan, cin,
      udyamNumber, industry, tags,
    } = req.body

    if (gstin && !GSTIN_REGEX.test(gstin)) {
      res.status(400).json({ success: false, message: 'Invalid GSTIN format' })
      return
    }
    if (pan && !PAN_REGEX.test(pan)) {
      res.status(400).json({ success: false, message: 'Invalid PAN format' })
      return
    }
    if (phone && !PHONE_REGEX.test(phone)) {
      res.status(400).json({ success: false, message: 'Invalid Indian phone number' })
      return
    }

    const before = {
      name: company.name, email: company.email, city: company.city,
      state: company.state, gstin: company.gstin, pan: company.pan,
    }

    // Only update fields that were sent
    const updatable = {
      name, legalName, description, website, email, phone,
      address, city, state, pincode, gstin, pan, cin,
      udyamNumber, industry, tags,
    }
    Object.entries(updatable).forEach(([key, val]) => {
      if (val !== undefined) company.set(key, val)
    })

    await company.save()

    AuditLog.create({
      performedBy: new Types.ObjectId(req.user!.userId),
      performedByRole: req.user!.role,
      ipAddress: getIp(req),
      action: 'company.update',
      entityType: 'Company',
      entityId: company._id,
      changes: Object.fromEntries(
        Object.entries(before).map(([k, v]) => [k, { before: v, after: company.get(k) }])
      ),
      timestamp: new Date(),
    }).catch(() => { })

    res.json({ success: true, company })
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000) {
      res.status(409).json({ success: false, message: 'A company with this GSTIN or PAN already exists' })
      return
    }
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// GET /api/companies?type=supplier&city=Mumbai&search=steel&page=1&limit=20
// Public paginated listing — used for supplier discovery
export const listCompanies = async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, city, state, isVerified, search, lastId, limit = '20' } = req.query

    const filter: Record<string, unknown> = { isDeleted: false }

    if (type) filter.type = { $in: [type, 'both'] }
    if (city) filter.city = city
    if (state) filter.state = state
    if (isVerified === 'true') filter.isVerified = true
    if (search) filter.$text = { $search: search as string }

    // Cursor pagination — no skip()
    if (lastId) filter._id = { $gt: new Types.ObjectId(lastId as string) }

    const pageLimit = Math.min(parseInt(limit as string), 50)

    const companies = await Company.find(filter)
      .select('name type description logo city state isVerified trustBadge averageRating totalReviews industry tags')
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
