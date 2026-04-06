import { Request, Response } from 'express'
import { Types } from 'mongoose'
import Review from '../models/Review'
import PurchaseOrder from '../models/PurchaseOrder'
import Company from '../models/Company'
import Product from '../models/Product'
import User from '../models/User'
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

// Recompute running average: newAvg = (oldAvg * oldCount + newRating) / (oldCount + 1)
const updateCompanyRating = async (companyId: Types.ObjectId, newRating: number) => {
  const company = await Company.findById(companyId)
  if (!company) return
  const oldCount = company.totalReviews
  const oldAvg = company.averageRating
  company.averageRating = (oldAvg * oldCount + newRating) / (oldCount + 1)
  company.totalReviews = oldCount + 1
  await company.save()
}

const updateProductRating = async (productId: Types.ObjectId, newRating: number) => {
  const product = await Product.findById(productId)
  if (!product) return
  const oldCount = product.totalReviews
  const oldAvg = product.averageRating
  product.averageRating = (oldAvg * oldCount + newRating) / (oldCount + 1)
  product.totalReviews = oldCount + 1
  await product.save()
}

// POST /api/reviews
export const submitReview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { company } = await getUserCompany(req.user!.userId)
    if (!company) {
      res.status(403).json({ success: false, message: 'No company linked to account' })
      return
    }

    const { purchaseOrderId, reviewType, rating, comment } = req.body

    if (!purchaseOrderId || !reviewType || !rating) {
      res.status(400).json({ success: false, message: 'purchaseOrderId, reviewType and rating are required' })
      return
    }

    if (rating < 1 || rating > 5) {
      res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' })
      return
    }

    const po = await PurchaseOrder.findOne({ _id: purchaseOrderId, isDeleted: false })
    if (!po) {
      res.status(404).json({ success: false, message: 'Purchase order not found' })
      return
    }

    // Reviews only unlock when PO is fully completed and paid
    if (po.fulfilmentStatus !== 'completed' || po.paymentStatus !== 'paid') {
      res.status(400).json({
        success: false,
        message: 'Reviews can only be submitted after the PO is fully completed and paid',
      })
      return
    }

    const isBuyer = po.buyerId.toString() === company._id.toString()
    const isSupplier = po.supplierId.toString() === company._id.toString()

    // Validate reviewer role matches review type
    if (reviewType === 'buyer_to_supplier' || reviewType === 'buyer_to_product') {
      if (!isBuyer) {
        res.status(403).json({ success: false, message: 'Only the buyer can submit this review type' })
        return
      }
    }
    if (reviewType === 'supplier_to_buyer') {
      if (!isSupplier) {
        res.status(403).json({ success: false, message: 'Only the supplier can submit this review type' })
        return
      }
    }

    // Check not already reviewed
    const alreadyReviewed = await Review.findOne({ purchaseOrderId: po._id, reviewType, isDeleted: false })
    if (alreadyReviewed) {
      res.status(409).json({ success: false, message: 'You have already submitted this review' })
      return
    }

    // Set targets
    let targetCompanyId: Types.ObjectId | undefined
    let targetProductId: Types.ObjectId | undefined

    if (reviewType === 'buyer_to_supplier') targetCompanyId = po.supplierId
    if (reviewType === 'supplier_to_buyer') targetCompanyId = po.buyerId
    if (reviewType === 'buyer_to_product') targetProductId = po.productId

    const review = await Review.create({
      purchaseOrderId: po._id,
      reviewerId: new Types.ObjectId(req.user!.userId),
      reviewerCompanyId: company._id,
      targetCompanyId,
      targetProductId,
      reviewType,
      rating,
      comment,
      isDeleted: false,
    })

    // Update aggregate ratings
    if (targetCompanyId) updateCompanyRating(targetCompanyId, rating).catch(() => { })
    if (targetProductId) updateProductRating(targetProductId, rating).catch(() => { })

    // Mark review flags on PO
    if (isBuyer) {
      po.buyerReviewed = true
    } else {
      po.supplierReviewed = true
    }
    await po.save()

    AuditLog.create({
      performedBy: new Types.ObjectId(req.user!.userId),
      performedByRole: req.user!.role,
      ipAddress: getIp(req),
      action: 'review.create',
      entityType: 'Review',
      entityId: review._id,
      timestamp: new Date(),
    }).catch(() => { })

    // Notify the reviewed party
    const notifyCompanyId = targetCompanyId
    if (notifyCompanyId) {
      const targetCompany = await Company.findById(notifyCompanyId)
      const owner = targetCompany?.members.find((m) => m.role === 'owner')
      if (owner) {
        Notification.create({
          userId: owner.userId,
          type: 'review_received',
          title: 'New review received',
          message: `${company.name} left you a ${rating}-star review.`,
          entityType: 'review',
          entityId: review._id,
          isRead: false,
        }).catch(() => { })
      }
    }

    res.status(201).json({ success: true, review })
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000) {
      res.status(409).json({ success: false, message: 'You have already submitted this review' })
      return
    }
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// GET /api/reviews?targetCompanyId=...&targetProductId=...&reviewType=...
export const listReviews = async (req: Request, res: Response): Promise<void> => {
  try {
    const { targetCompanyId, targetProductId, reviewType, lastId, limit = '20' } = req.query
    const pageLimit = Math.min(parseInt(limit as string), 50)

    const filter: Record<string, unknown> = { isDeleted: false }

    if (targetCompanyId) filter.targetCompanyId = new Types.ObjectId(targetCompanyId as string)
    if (targetProductId) filter.targetProductId = new Types.ObjectId(targetProductId as string)
    if (reviewType) filter.reviewType = reviewType
    if (lastId) filter._id = { $lt: new Types.ObjectId(lastId as string) }

    const reviews = await Review.find(filter)
      .populate('reviewerCompanyId', 'name logo isVerified')
      .populate('reviewerId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(pageLimit)

    res.json({
      success: true,
      reviews,
      nextCursor: reviews.length === pageLimit ? reviews[reviews.length - 1]._id : null,
    })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}