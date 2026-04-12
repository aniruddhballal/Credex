import { Request, Response } from 'express'
import { Types } from 'mongoose'
import CreditScore from '../models/CreditScore'
import Company from '../models/Company'
import PurchaseOrder from '../models/PurchaseOrder'
import Review from '../models/Review'
import User from '../models/User'
import { AuthRequest } from '../middleware/auth'
import { sendSuccess, sendError } from '../utils/response'

const getUserCompany = async (userId: string) => {
  const user = await User.findById(userId)
  if (!user?.companyId) return { user: null, company: null }
  const company = await Company.findOne({ _id: user.companyId, isDeleted: false })
  return { user, company }
}

/**
 * Simple in-process credit score computation (V1)
 * Python ML service will replace this in V2
 * Score range: 300–900
 */
const computeScore = async (companyId: Types.ObjectId) => {
  // 1. Payment history — % of POs paid on time
  const allPOs = await PurchaseOrder.find({ buyerId: companyId, isDeleted: false, paymentStatus: { $in: ['paid', 'overdue'] } })
  const paidOnTime = allPOs.filter((po) => {
    if (po.paymentStatus !== 'paid') return false
    return po.updatedAt <= po.paymentDeadline
  })
  const paymentHistoryScore = allPOs.length > 0
    ? (paidOnTime.length / allPOs.length) * 100
    : 50 // neutral if no history

  // 2. Outstanding debt — unpaid/overdue POs as % of total
  const activePOs = await PurchaseOrder.find({ buyerId: companyId, isDeleted: false, paymentStatus: { $ne: 'paid' }, status: { $ne: 'cancelled' } })
  const totalOutstanding = activePOs.reduce((sum, po) => sum + po.amountRemaining, 0)
  // Penalise if outstanding > 10L paise (₹1,00,000)
  const outstandingScore = Math.max(0, 100 - (totalOutstanding / 1000000) * 20)

  // 3. Trade activity — number of completed POs (capped at 20)
  const completedPOs = await PurchaseOrder.countDocuments({ buyerId: companyId, status: 'completed', isDeleted: false })
  const tradeActivityScore = Math.min(completedPOs * 5, 100)

  // 4. Reviews — average rating from counterparties
  const reviews = await Review.find({ targetCompanyId: companyId, isDeleted: false })
  const reviewScore = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 20
    : 50

  // 5. Credit utilisation — placeholder (no credit facility in V1)
  const creditUtilization = 70 // neutral default

  // Weighted composite → map to 300–900
  const raw =
    paymentHistoryScore * 0.35 +
    outstandingScore * 0.25 +
    tradeActivityScore * 0.20 +
    reviewScore * 0.15 +
    creditUtilization * 0.05

  const score = Math.round(300 + (raw / 100) * 600)

  return {
    score,
    breakdown: {
      paymentHistory: Math.round(paymentHistoryScore),
      outstandingDebt: Math.round(outstandingScore),
      tradeActivity: Math.round(tradeActivityScore),
      reviews: Math.round(reviewScore),
      creditUtilization: Math.round(creditUtilization),
    },
  }
}

// GET /api/credit-scores/me
export const getMyScore = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { company } = await getUserCompany(req.user!.userId)
    if (!company) {
      res.status(404).json({ success: false, message: 'No company linked to account' })
      return
    }

    const latest = await CreditScore.findOne({ companyId: company._id }).sort({ computedAt: -1 })

    res.json({ success: true, creditScore: latest ?? null })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// GET /api/credit-scores/me/history
export const getMyScoreHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { company } = await getUserCompany(req.user!.userId)
    if (!company) {
      res.status(404).json({ success: false, message: 'No company linked to account' })
      return
    }

    const history = await CreditScore.find({ companyId: company._id })
      .sort({ computedAt: -1 })
      .limit(30) // last 30 data points

    res.json({ success: true, history })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// GET /api/credit-scores/company/:companyId  (underwriter/admin only)
export const getScoreByCompany = async (req: Request, res: Response): Promise<void> => {
  try {
    const latest = await CreditScore.findOne({ companyId: req.params.companyId }).sort({ computedAt: -1 })
    res.json({ success: true, creditScore: latest ?? null })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// POST /api/credit-scores/me/compute
// Trigger a fresh compute for own company
export const computeMyScore = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { company } = await getUserCompany(req.user!.userId)
    if (!company) {
      res.status(404).json({ success: false, message: 'No company linked to account' })
      return
    }

    const { score, breakdown } = await computeScore(company._id as Types.ObjectId)

    const creditScore = await CreditScore.create({
      companyId: company._id,
      score,
      breakdown,
      computedAt: new Date(),
      computedBy: 'system',
    })

    // Update company.creditScoreRef to latest
    company.creditScoreRef = creditScore._id as Types.ObjectId
    await company.save()

    res.json({ success: true, creditScore })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// POST /api/credit-scores/company/:companyId/compute  (admin only)
export const computeScoreForCompany = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const company = await Company.findOne({ _id: req.params.companyId, isDeleted: false })
    if (!company) {
      res.status(404).json({ success: false, message: 'Company not found' })
      return
    }

    const { score, breakdown } = await computeScore(company._id as Types.ObjectId)

    const creditScore = await CreditScore.create({
      companyId: company._id,
      score,
      breakdown,
      computedAt: new Date(),
      computedBy: 'manual',
      note: `Manually triggered by admin ${req.user!.userId}`,
    })

    company.creditScoreRef = creditScore._id as Types.ObjectId
    await company.save()

    res.json({ success: true, creditScore })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}