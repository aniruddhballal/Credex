import { Response } from 'express'
import { Types } from 'mongoose'
import PurchaseOrder from '../models/PurchaseOrder'
import RFQ from '../models/RFQ'
import Product from '../models/Product'
import Company from '../models/Company'
import LoanApplication from '../models/LoanApplication'
import CreditScore from '../models/CreditScore'
import User from '../models/User'
import { sendSuccess, sendError } from '../utils/response'
import { AuthRequest } from '../middleware/auth'

const getUserCompany = async (userId: string) => {
  const user = await User.findById(userId)
  if (!user?.companyId) return null
  return Company.findOne({ _id: user.companyId, isDeleted: false })
}

const scoreTier = (score: number): string => {
  if (score >= 750) return 'Excellent'
  if (score >= 650) return 'Good'
  if (score >= 550) return 'Fair'
  return 'Poor'
}

// GET /api/buyer/dashboard
export const getBuyerDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const company = await getUserCompany(req.user!.userId)
    if (!company) { sendError(res, 'No company linked to account', 403); return }

    const now = new Date()
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    // Active POs — not paid, not cancelled
    const activePOs = await PurchaseOrder.find({
      buyerId: company._id,
      paymentStatus: { $ne: 'paid' },
      status: { $ne: 'cancelled' },
      isDeleted: false,
    }).populate('supplierId', 'name')

    const totalOutstanding = activePOs.reduce((sum, po) => sum + po.amountRemaining, 0)

    // Nearest deadline
    const sorted = [...activePOs].sort((a, b) => a.paymentDeadline.getTime() - b.paymentDeadline.getTime())
    const next = sorted[0]
    const nextDeadline = next ? {
      purchaseOrderId: next._id,
      supplierName: (next.supplierId as unknown as { name: string }).name,
      amountRemaining: next.amountRemaining,
      paymentDeadline: next.paymentDeadline.toISOString(),
    } : null

    // Optimizer alerts — due within 7 days
    const optimizerAlerts = activePOs
      .filter(po => po.paymentDeadline <= sevenDaysFromNow)
      .map(po => {
        const daysUntil = Math.ceil((po.paymentDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        return {
          purchaseOrderId: po._id,
          supplierName: (po.supplierId as unknown as { name: string }).name,
          amountRemaining: po.amountRemaining,
          paymentDeadline: po.paymentDeadline.toISOString(),
          urgency: daysUntil <= 1 ? 'high' : daysUntil <= 3 ? 'medium' : 'low',
        }
      })
      .sort((a, b) => new Date(a.paymentDeadline).getTime() - new Date(b.paymentDeadline).getTime())

    // Credit score
    const latestScore = await CreditScore.findOne({ companyId: company._id }).sort({ computedAt: -1 })
    const creditScore = latestScore ? { score: latestScore.score, tier: scoreTier(latestScore.score) } : null

    sendSuccess(res, {
      activePOs: activePOs.length,
      totalOutstanding,
      nextDeadline,
      creditScore,
      optimizerAlerts,
    })
  } catch {
    sendError(res, 'Server error', 500)
  }
}

// GET /api/supplier/dashboard
export const getSupplierDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const company = await getUserCompany(req.user!.userId)
    if (!company) { sendError(res, 'No company linked to account', 403); return }

    const [activeListings, pendingRFQs, activePODocs, incomingRFQs] = await Promise.all([
      Product.countDocuments({ supplierId: company._id, isDeleted: false, isAvailable: true }),
      RFQ.countDocuments({ supplierId: company._id, status: 'pending', isDeleted: false }),
      PurchaseOrder.find({ supplierId: company._id, paymentStatus: { $ne: 'paid' }, status: { $ne: 'cancelled' }, isDeleted: false })
        .populate('buyerId', 'name logo').populate('productId', 'name').sort({ paymentDeadline: 1 }).limit(5),
      RFQ.find({ supplierId: company._id, status: 'pending', isDeleted: false })
        .populate('buyerId', 'name logo').populate('productId', 'name').sort({ createdAt: -1 }).limit(5),
    ])

    const totalReceivable = activePODocs.reduce((sum, po) => sum + po.amountRemaining, 0)

    sendSuccess(res, {
      activeListings,
      pendingRFQs,
      totalReceivable,
      averageRating: company.averageRating,
      incomingRFQs,
      activePOs: activePODocs,
    })
  } catch {
    sendError(res, 'Server error', 500)
  }
}

// GET /api/underwriter/dashboard
export const getUnderwriterDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000)

    const [queueCount, pendingDocs, queue, approvedToday, rejectedToday] = await Promise.all([
      LoanApplication.countDocuments({ status: 'submitted', isDeleted: false }),
      LoanApplication.countDocuments({ status: 'documents_requested', isDeleted: false }),
      LoanApplication.find({ status: { $in: ['submitted', 'under_review'] }, isDeleted: false })
        .populate('companyId', 'name type city state isVerified')
        .populate('loanTypeId', 'name code')
        .sort({ updatedAt: -1 })
        .limit(10),
      LoanApplication.countDocuments({
        status: 'approved',
        updatedAt: { $gte: today, $lt: tomorrow },
        isDeleted: false,
      }),
      LoanApplication.countDocuments({
        status: 'rejected',
        updatedAt: { $gte: today, $lt: tomorrow },
        isDeleted: false,
      }),
    ])

    sendSuccess(res, { queueCount, approvedToday, rejectedToday, pendingDocs, queue })
  } catch {
    sendError(res, 'Server error', 500)
  }
}