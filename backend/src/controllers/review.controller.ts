import { Request, Response } from 'express'
import { Types } from 'mongoose'
import Review from '../models/Review'
import PurchaseOrder from '../models/PurchaseOrder'
import Company from '../models/Company'
import Product from '../models/Product'
import AuditLog from '../models/AuditLog'
import Notification from '../models/Notification'
import { sendSuccess, sendPaginated, sendError } from '../utils/response'
import { AuthRequest } from '../middleware/auth'
import { requireUserCompany, CompanyRequiredError } from '../utils/company'

const getIp = (req: Request): string =>
  ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()) ||
  req.socket.remoteAddress || 'unknown'

const updateCompanyRating = async (companyId: Types.ObjectId, newRating: number) => {
  const company = await Company.findById(companyId)
  if (!company) return
  const oldCount = company.totalReviews
  company.averageRating = (company.averageRating * oldCount + newRating) / (oldCount + 1)
  company.totalReviews = oldCount + 1
  await company.save()
}

const updateProductRating = async (productId: Types.ObjectId, newRating: number) => {
  const product = await Product.findById(productId)
  if (!product) return
  const oldCount = product.totalReviews
  product.averageRating = (product.averageRating * oldCount + newRating) / (oldCount + 1)
  product.totalReviews = oldCount + 1
  await product.save()
}

// POST /api/reviews
export const submitReview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const company = await requireUserCompany(req.user!.userId)

    const { purchaseOrderId, reviewType, rating, comment } = req.body
    if (!purchaseOrderId || !reviewType || !rating) { sendError(res, 'purchaseOrderId, reviewType and rating are required', 400); return }
    if (rating < 1 || rating > 5) { sendError(res, 'Rating must be between 1 and 5', 400); return }

    const po = await PurchaseOrder.findOne({ _id: purchaseOrderId, isDeleted: false })
    if (!po) { sendError(res, 'Purchase order not found', 404); return }

    if (po.fulfilmentStatus !== 'completed' || po.paymentStatus !== 'paid') {
      sendError(res, 'Reviews can only be submitted after the PO is fully completed and paid', 400); return
    }

    const isBuyer = po.buyerId.toString() === company._id.toString()
    const isSupplier = po.supplierId.toString() === company._id.toString()

    if ((reviewType === 'buyer_to_supplier' || reviewType === 'buyer_to_product') && !isBuyer) {
      sendError(res, 'Only the buyer can submit this review type', 403); return
    }
    if (reviewType === 'supplier_to_buyer' && !isSupplier) {
      sendError(res, 'Only the supplier can submit this review type', 403); return
    }

    let targetCompanyId: Types.ObjectId | undefined
    let targetProductId: Types.ObjectId | undefined
    if (reviewType === 'buyer_to_supplier') targetCompanyId = po.supplierId
    if (reviewType === 'supplier_to_buyer') targetCompanyId = po.buyerId
    if (reviewType === 'buyer_to_product') targetProductId = po.productId

    const review = await Review.create({
      purchaseOrderId: po._id, reviewerId: new Types.ObjectId(req.user!.userId),
      reviewerCompanyId: company._id, targetCompanyId, targetProductId,
      reviewType, rating, comment, isDeleted: false,
    })

    if (targetCompanyId) updateCompanyRating(targetCompanyId, rating).catch(() => {})
    if (targetProductId) updateProductRating(targetProductId, rating).catch(() => {})

    if (isBuyer) po.buyerReviewed = true
    else po.supplierReviewed = true
    await po.save()

    AuditLog.create({ performedBy: new Types.ObjectId(req.user!.userId), performedByRole: req.user!.role, ipAddress: getIp(req), action: 'review.create', entityType: 'Review', entityId: review._id, timestamp: new Date() }).catch(() => {})

    if (targetCompanyId) {
      const targetCompany = await Company.findById(targetCompanyId)
      const owner = targetCompany?.members.find((m) => m.role === 'owner')
      if (owner) {
        Notification.create({ userId: owner.userId, type: 'review_received', title: 'New review received', message: `${company.name} left you a ${rating}-star review.`, entityType: 'review', entityId: review._id, isRead: false }).catch(() => {})
      }
    }

    sendSuccess(res, { review }, undefined, 201)
  } catch (err: unknown) {
    if (err instanceof CompanyRequiredError) {
      sendError(res, err.message, err.statusCode)
      return
    }

    if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000) {
      sendError(res, 'You have already submitted this review', 409)
      return
    }

    sendError(res, 'Server error', 500)
  }
}

// GET /api/reviews — FIX 10: accept companyId or targetCompanyId
export const listReviews = async (req: Request, res: Response): Promise<void> => {
  try {
    const { targetCompanyId, companyId, targetProductId, reviewType, lastId, cursor, limit = '20' } = req.query
    const resolvedCompanyId = targetCompanyId ?? companyId  // FIX 10
    const pageLimit = Math.min(parseInt(limit as string), 50)
    const filter: Record<string, unknown> = { isDeleted: false }

    if (resolvedCompanyId) filter.targetCompanyId = new Types.ObjectId(resolvedCompanyId as string)
    if (targetProductId) filter.targetProductId = new Types.ObjectId(targetProductId as string)
    if (reviewType) filter.reviewType = reviewType

    const resolvedCursor = (lastId ?? cursor) as string | undefined
    if (resolvedCursor) filter._id = { $lt: new Types.ObjectId(resolvedCursor) }

    const reviews = await Review.find(filter)
      .populate('reviewerCompanyId', 'name logo isVerified')
      .populate('reviewerId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(pageLimit)

    sendPaginated(res, reviews, reviews.length === pageLimit ? reviews[reviews.length - 1]._id.toString() : null)
  } catch (err) {
    if (err instanceof CompanyRequiredError) {
      sendError(res, err.message, err.statusCode)
      return
    }

    sendError(res, 'Server error', 500)
  }
}
