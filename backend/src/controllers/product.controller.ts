import { Request, Response } from 'express'
import { Types } from 'mongoose'
import Product from '../models/Product'
import User from '../models/User'
import Company from '../models/Company'
import AuditLog from '../models/AuditLog'
import { AuthRequest } from '../middleware/auth'

const getIp = (req: Request): string =>
  ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()) ||
  req.socket.remoteAddress ||
  'unknown'

// Ensure the user has a supplier/both company and return it
const getSupplierCompany = async (userId: string) => {
  const user = await User.findById(userId)
  if (!user?.companyId) return null
  const company = await Company.findOne({
    _id: user.companyId,
    type: { $in: ['supplier', 'both'] },
    isDeleted: false,
  })
  return company
}

// POST /api/products
export const createProduct = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const company = await getSupplierCompany(req.user!.userId)
    if (!company) {
      res.status(403).json({ success: false, message: 'Only suppliers with a company can create products' })
      return
    }

    const {
      name, description, category, tags, images,
      basePrice, priceUnit, currency, isNegotiable,
      isAvailable, stockQuantity, acceptedFinancingMethods,
      defaultPenaltyRate, defaultPaymentDeadlineDays,
    } = req.body

    if (!name || !category || basePrice === undefined) {
      res.status(400).json({ success: false, message: 'name, category and basePrice are required' })
      return
    }

    if (basePrice < 0) {
      res.status(400).json({ success: false, message: 'basePrice cannot be negative' })
      return
    }

    const product = await Product.create({
      supplierId: company._id,
      postedBy: new Types.ObjectId(req.user!.userId),
      name,
      description,
      category,
      tags: tags || [],
      images: images || [],
      basePrice,
      priceUnit: priceUnit || 'per_unit',
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
      performedBy: new Types.ObjectId(req.user!.userId),
      performedByRole: req.user!.role,
      ipAddress: getIp(req),
      action: 'product.create',
      entityType: 'Product',
      entityId: product._id,
      note: `Product '${product.name}' created`,
      timestamp: new Date(),
    }).catch(() => { })

    res.status(201).json({ success: true, product })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// GET /api/products/:id
export const getProductById = async (req: Request, res: Response): Promise<void> => {
  try {
    const product = await Product.findOne({ _id: req.params.id, isDeleted: false })
      .populate('supplierId', 'name isVerified trustBadge city state averageRating logo')
      .populate('postedBy', 'firstName lastName')

    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' })
      return
    }

    res.json({ success: true, product })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// GET /api/products
// Public listing with filters + cursor pagination
export const listProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      supplierId, category, minPrice, maxPrice,
      isNegotiable, financingMethod, minRating,
      search, lastId, limit = '20',
    } = req.query

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

    if (lastId) filter._id = { $gt: new Types.ObjectId(lastId as string) }

    const pageLimit = Math.min(parseInt(limit as string), 50)

    const products = await Product.find(filter)
      .select('-postedBy')
      .populate('supplierId', 'name isVerified trustBadge city state logo')
      .sort({ _id: 1 })
      .limit(pageLimit)

    res.json({
      success: true,
      products,
      nextCursor: products.length === pageLimit ? products[products.length - 1]._id : null,
    })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// GET /api/products/my
// All products posted by the authenticated supplier
export const getMyProducts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const company = await getSupplierCompany(req.user!.userId)
    if (!company) {
      res.status(403).json({ success: false, message: 'No supplier company found' })
      return
    }

    const { lastId, limit = '20' } = req.query
    const filter: Record<string, unknown> = { supplierId: company._id, isDeleted: false }
    if (lastId) filter._id = { $gt: new Types.ObjectId(lastId as string) }

    const pageLimit = Math.min(parseInt(limit as string), 50)

    const products = await Product.find(filter)
      .sort({ _id: -1 })
      .limit(pageLimit)

    res.json({
      success: true,
      products,
      nextCursor: products.length === pageLimit ? products[products.length - 1]._id : null,
    })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// PATCH /api/products/:id
export const updateProduct = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const company = await getSupplierCompany(req.user!.userId)
    if (!company) {
      res.status(403).json({ success: false, message: 'No supplier company found' })
      return
    }

    const product = await Product.findOne({
      _id: req.params.id,
      supplierId: company._id,
      isDeleted: false,
    })

    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found or not yours' })
      return
    }

    const updatable = [
      'name', 'description', 'category', 'tags', 'images',
      'basePrice', 'priceUnit', 'isNegotiable', 'isAvailable',
      'stockQuantity', 'acceptedFinancingMethods',
      'defaultPenaltyRate', 'defaultPaymentDeadlineDays',
    ]

    const before: Record<string, unknown> = {}
    updatable.forEach((key) => {
      if (req.body[key] !== undefined) {
        before[key] = (product as unknown as Record<string, unknown>)[key];
        (product as unknown as Record<string, unknown>)[key] = req.body[key]
      }
    })

    if (req.body.basePrice !== undefined && req.body.basePrice < 0) {
      res.status(400).json({ success: false, message: 'basePrice cannot be negative' })
      return
    }

    await product.save()

    AuditLog.create({
      performedBy: new Types.ObjectId(req.user!.userId),
      performedByRole: req.user!.role,
      ipAddress: getIp(req),
      action: 'product.update',
      entityType: 'Product',
      entityId: product._id,
      changes: Object.fromEntries(
        Object.entries(before).map(([k, v]) => [k, { before: v, after: (product as unknown as Record<string, unknown>)[k] }])
      ),
      timestamp: new Date(),
    }).catch(() => { })

    res.json({ success: true, product })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// DELETE /api/products/:id  (soft delete)
export const deleteProduct = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const company = await getSupplierCompany(req.user!.userId)
    if (!company) {
      res.status(403).json({ success: false, message: 'No supplier company found' })
      return
    }

    const product = await Product.findOne({
      _id: req.params.id,
      supplierId: company._id,
      isDeleted: false,
    })

    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found or not yours' })
      return
    }

    product.isDeleted = true
    product.deletedAt = new Date()
    product.deletedBy = new Types.ObjectId(req.user!.userId)
    await product.save()

    AuditLog.create({
      performedBy: new Types.ObjectId(req.user!.userId),
      performedByRole: req.user!.role,
      ipAddress: getIp(req),
      action: 'product.delete',
      entityType: 'Product',
      entityId: product._id,
      note: `Product '${product.name}' soft-deleted`,
      timestamp: new Date(),
    }).catch(() => { })

    res.json({ success: true, message: 'Product deleted' })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}