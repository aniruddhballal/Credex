import { Request, Response } from 'express'
import { Types } from 'mongoose'
import Product from '../models/Product'
import User from '../models/User'
import Company from '../models/Company'
import AuditLog from '../models/AuditLog'
import { sendSuccess, sendPaginated, sendError } from '../utils/response'
import { AuthRequest } from '../middleware/auth'

const getIp = (req: Request): string =>
  ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()) ||
  req.socket.remoteAddress || 'unknown'

const getSupplierCompany = async (userId: string) => {
  const user = await User.findById(userId)
  if (!user?.companyId) return null
  return Company.findOne({ _id: user.companyId, type: { $in: ['supplier', 'both'] }, isDeleted: false })
}

// POST /api/products
export const createProduct = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const company = await getSupplierCompany(req.user!.userId)
    if (!company) { sendError(res, 'Only suppliers with a company can create products', 403); return }

    const { name, description, category, tags, images, basePrice, priceUnit, currency,
      isNegotiable, isAvailable, stockQuantity, acceptedFinancingMethods,
      defaultPenaltyRate, defaultPaymentDeadlineDays } = req.body

    if (!name || !category || basePrice === undefined) {
      sendError(res, 'name, category and basePrice are required', 400); return
    }
    if (basePrice < 0) { sendError(res, 'basePrice cannot be negative', 400); return }

    const product = await Product.create({
      supplierId: company._id,
      postedBy: new Types.ObjectId(req.user!.userId),
      name, description, category,
      tags: tags || [], images: images || [],
      basePrice, priceUnit: priceUnit || 'per_unit',
      currency: currency || 'INR',
      isNegotiable: isNegotiable ?? true,
      isAvailable: isAvailable ?? true,
      stockQuantity,
      acceptedFinancingMethods: acceptedFinancingMethods || ['immediate', 'open_to_discuss'],
      defaultPenaltyRate: defaultPenaltyRate ?? 0.05,
      defaultPaymentDeadlineDays: defaultPaymentDeadlineDays ?? 30,
      isDeleted: false,
    })

    AuditLog.create({
      performedBy: new Types.ObjectId(req.user!.userId), performedByRole: req.user!.role,
      ipAddress: getIp(req), action: 'product.create', entityType: 'Product', entityId: product._id,
      note: `Product '${product.name}' created`, timestamp: new Date(),
    }).catch(() => {})

    sendSuccess(res, { product }, undefined, 201)
  } catch {
    sendError(res, 'Server error', 500)
  }
}

// GET /api/products/:id
export const getProductById = async (req: Request, res: Response): Promise<void> => {
  try {
    const product = await Product.findOne({ _id: req.params.id, isDeleted: false })
      .populate('supplierId', 'name isVerified trustBadge city state averageRating logo')
      .populate('postedBy', 'firstName lastName')
    if (!product) { sendError(res, 'Product not found', 404); return }
    sendSuccess(res, { product })
  } catch {
    sendError(res, 'Server error', 500)
  }
}

// GET /api/products
export const listProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { supplierId, category, minPrice, maxPrice, isNegotiable,
      financingMethod, minRating, isVerified, search, lastId, cursor, limit = '20' } = req.query

    const filter: Record<string, unknown> = { isDeleted: false, isAvailable: true }

    if (supplierId) filter.supplierId = new Types.ObjectId(supplierId as string)
    if (category) filter.category = category
    if (isNegotiable === 'true') filter.isNegotiable = true
    if (financingMethod) filter.acceptedFinancingMethods = { $in: [financingMethod] }
    if (minRating) filter.averageRating = { $gte: parseFloat(minRating as string) }
    if (search) filter.$text = { $search: search as string }
    if (minPrice || maxPrice) {
      filter.basePrice = {
        ...(minPrice ? { $gte: parseFloat(minPrice as string) } : {}),
        ...(maxPrice ? { $lte: parseFloat(maxPrice as string) } : {}),
      }
    }

    // FIX 13 — isVerified filter (join with Company)
    if (isVerified === 'true') {
      const verifiedCompanies = await Company.find({ isVerified: true, isDeleted: false }).select('_id')
      filter.supplierId = { $in: verifiedCompanies.map(c => c._id) }
    }

    const resolvedCursor = (lastId ?? cursor) as string | undefined
    if (resolvedCursor) filter._id = { $gt: new Types.ObjectId(resolvedCursor) }

    const pageLimit = Math.min(parseInt(limit as string), 50)
    const products = await Product.find(filter)
      .select('-postedBy')
      .populate('supplierId', 'name isVerified trustBadge city state logo')
      .sort({ _id: 1 })
      .limit(pageLimit)

    sendPaginated(res, products, products.length === pageLimit ? products[products.length - 1]._id.toString() : null)
  } catch {
    sendError(res, 'Server error', 500)
  }
}

// GET /api/products/my/listings
export const getMyProducts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const company = await getSupplierCompany(req.user!.userId)
    if (!company) { sendError(res, 'No supplier company found', 403); return }

    const { lastId, cursor, limit = '20' } = req.query
    const filter: Record<string, unknown> = { supplierId: company._id, isDeleted: false }
    const resolvedCursor = (lastId ?? cursor) as string | undefined
    if (resolvedCursor) filter._id = { $gt: new Types.ObjectId(resolvedCursor) }

    const pageLimit = Math.min(parseInt(limit as string), 50)
    const products = await Product.find(filter).sort({ _id: -1 }).limit(pageLimit)

    sendPaginated(res, products, products.length === pageLimit ? products[products.length - 1]._id.toString() : null)
  } catch {
    sendError(res, 'Server error', 500)
  }
}

// PATCH /api/products/:id
export const updateProduct = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const company = await getSupplierCompany(req.user!.userId)
    if (!company) { sendError(res, 'No supplier company found', 403); return }

    const product = await Product.findOne({ _id: req.params.id, supplierId: company._id, isDeleted: false })
    if (!product) { sendError(res, 'Product not found or not yours', 404); return }

    if (req.body.basePrice !== undefined && req.body.basePrice < 0) {
      sendError(res, 'basePrice cannot be negative', 400); return
    }

    const updatable = ['name', 'description', 'category', 'tags', 'images', 'basePrice',
      'priceUnit', 'isNegotiable', 'isAvailable', 'stockQuantity',
      'acceptedFinancingMethods', 'defaultPenaltyRate', 'defaultPaymentDeadlineDays']

    const before: Record<string, unknown> = {}
    updatable.forEach((key) => {
      if (req.body[key] !== undefined) {
        before[key] = (product as unknown as Record<string, unknown>)[key];
        (product as unknown as Record<string, unknown>)[key] = req.body[key]
      }
    })
    await product.save()

    AuditLog.create({
      performedBy: new Types.ObjectId(req.user!.userId), performedByRole: req.user!.role,
      ipAddress: getIp(req), action: 'product.update', entityType: 'Product', entityId: product._id,
      changes: Object.fromEntries(Object.entries(before).map(([k, v]) => [k, { before: v, after: (product as unknown as Record<string, unknown>)[k] }])),
      timestamp: new Date(),
    }).catch(() => {})

    sendSuccess(res, { product })
  } catch {
    sendError(res, 'Server error', 500)
  }
}

// DELETE /api/products/:id
export const deleteProduct = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const company = await getSupplierCompany(req.user!.userId)
    if (!company) { sendError(res, 'No supplier company found', 403); return }

    const product = await Product.findOne({ _id: req.params.id, supplierId: company._id, isDeleted: false })
    if (!product) { sendError(res, 'Product not found or not yours', 404); return }

    product.isDeleted = true
    product.deletedAt = new Date()
    product.deletedBy = new Types.ObjectId(req.user!.userId)
    await product.save()

    AuditLog.create({
      performedBy: new Types.ObjectId(req.user!.userId), performedByRole: req.user!.role,
      ipAddress: getIp(req), action: 'product.delete', entityType: 'Product', entityId: product._id,
      note: `Product '${product.name}' soft-deleted`, timestamp: new Date(),
    }).catch(() => {})

    sendSuccess(res, null, 'Product deleted')
  } catch {
    sendError(res, 'Server error', 500)
  }
}