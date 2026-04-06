/**
 * jobs/creditScoreCron.ts
 *
 * Daily cron job — runs at 2:00 AM IST (20:30 UTC) every day.
 * Recomputes credit scores for all active companies.
 *
 * Flow per company:
 *  1. Aggregate payment history from PurchaseOrder + Payment collections
 *  2. Aggregate review scores from Review collection
 *  3. Aggregate loan repayment from LoanApplication
 *  4. POST to Python /credit-score
 *  5. Insert new CreditScore document
 *  6. Update Company.creditScoreRef to the new document's _id
 *
 * At 10,000 companies with 100ms average per company = ~16 minutes.
 * Runs at 2 AM IST so it completes well before business hours.
 * In V2: use BullMQ to parallelise across workers.
 */

import cron from 'node-cron'
import Company from '../models/Company'
import Payment from '../models/Payment'
import PurchaseOrder from '../models/PurchaseOrder'
import Review from '../models/Review'
import LoanApplication from '../models/LoanApplication'
import CreditScore from '../models/CreditScore'
import { computeCreditScore } from '../services/mlService'

// ---------------------------------------------------------------------------
// Per-company data aggregation
// ---------------------------------------------------------------------------

const aggregateCompanyData = async (companyId: string) => {
  const companyObjId = companyId

  // Total completed POs (as buyer or supplier)
  const totalPOsCompleted = await PurchaseOrder.countDocuments({
    $or: [{ buyerId: companyObjId }, { supplierId: companyObjId }],
    fulfilmentStatus: 'completed',
    isDeleted: false,
  })

  // Payment timeliness — across all POs where this company is the buyer
  const paymentStats = await Payment.aggregate([
    {
      $lookup: {
        from: 'purchaseorders',
        localField: 'purchaseOrderId',
        foreignField: '_id',
        as: 'po',
      },
    },
    { $unwind: '$po' },
    { $match: { 'po.buyerId': companyObjId } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        onTime: { $sum: { $cond: ['$wasOnTime', 1, 0] } },
      },
    },
  ])

  const onTimePaymentRate =
    paymentStats.length > 0 && paymentStats[0].total > 0
      ? paymentStats[0].onTime / paymentStats[0].total
      : 1.0  // no payment history = neutral, not penalised

  // Average review score (reviews received by this company)
  const reviewStats = await Review.aggregate([
    {
      $match: {
        $or: [
          { revieweeId: companyObjId, reviewType: 'buyer_to_supplier' },
          { revieweeId: companyObjId, reviewType: 'supplier_to_buyer' },
        ],
        isDeleted: false,
      },
    },
    {
      $group: {
        _id: null,
        avg: { $avg: '$rating' },
      },
    },
  ])

  const averageReviewScore =
    reviewStats.length > 0 ? reviewStats[0].avg : 3.0  // neutral default

  // Dispute rate — POs with a dispute flag
  const totalPOs = await PurchaseOrder.countDocuments({
    $or: [{ buyerId: companyObjId }, { supplierId: companyObjId }],
    isDeleted: false,
  })
  const disputedPOs = await PurchaseOrder.countDocuments({
    $or: [{ buyerId: companyObjId }, { supplierId: companyObjId }],
    isDeleted: false,
    isDisputed: true,
  })
  const disputeRate = totalPOs > 0 ? disputedPOs / totalPOs : 0

  // Loan repayment rate
  const loanStats = await LoanApplication.aggregate([
    { $match: { applicantCompanyId: companyObjId, status: { $in: ['disbursed', 'closed'] } } },
    {
      $group: {
        _id: null,
        totalEMIs: { $sum: '$totalEmisCount' },
        paidOnTime: { $sum: '$emisPaidOnTime' },
      },
    },
  ])

  const loanRepaymentRate =
    loanStats.length > 0 && loanStats[0].totalEMIs > 0
      ? loanStats[0].paidOnTime / loanStats[0].totalEMIs
      : 1.0  // no loans = neutral

  // First transaction date for tenure
  const firstPO = await PurchaseOrder.findOne({
    $or: [{ buyerId: companyObjId }, { supplierId: companyObjId }],
    isDeleted: false,
  })
    .sort({ createdAt: 1 })
    .lean()

  const daysSinceFirstTransaction = firstPO
    ? Math.floor(
      (Date.now() - new Date(firstPO.createdAt).getTime()) / 86_400_000
    )
    : 0

  return {
    totalPOsCompleted,
    onTimePaymentRate,
    averageReviewScore,
    disputeRate,
    loanRepaymentRate,
    daysSinceFirstTransaction,
  }
}

// ---------------------------------------------------------------------------
// Process one company
// ---------------------------------------------------------------------------

const processCompany = async (company: any): Promise<void> => {
  try {
    const companyId = company._id.toString()
    const data = await aggregateCompanyData(companyId)

    const result = await computeCreditScore({
      companyId,
      isVerified: company.isVerified,
      ...data,
    })

    // Insert new versioned CreditScore document
    const newScore = await CreditScore.create({
      companyId: company._id,
      score: result.score,
      tier: result.tier,
      breakdown: result.breakdown,
      improvementTips: result.improvementTips,
      computedAt: new Date(),
    })

    // Point Company.creditScoreRef at the new document
    await Company.findByIdAndUpdate(company._id, {
      creditScoreRef: newScore._id,
    })
  } catch (err) {
    // Don't let one company failure abort the whole batch
    console.error(`[creditScoreCron] Failed for company ${company._id}:`, err)
  }
}

// ---------------------------------------------------------------------------
// Main job
// ---------------------------------------------------------------------------

const runCreditScoreBatch = async (): Promise<void> => {
  console.log('[creditScoreCron] Starting daily credit score batch...')
  const startTime = Date.now()

  try {
    const companies = await Company.find({ isDeleted: false }).lean()
    console.log(`[creditScoreCron] Processing ${companies.length} companies`)

    // Sequential in V1 — switch to BullMQ parallel workers in V2
    for (const company of companies) {
      await processCompany(company)
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[creditScoreCron] Batch complete in ${elapsed}s`)
  } catch (err) {
    console.error('[creditScoreCron] Batch failed:', err)
  }
}

// ---------------------------------------------------------------------------
// Register cron — 2:00 AM IST = 20:30 UTC
// ---------------------------------------------------------------------------

export const registerCreditScoreCron = (): void => {
  // "30 20 * * *" = 20:30 UTC every day
  cron.schedule('30 20 * * *', runCreditScoreBatch, {
    timezone: 'UTC',
  })
  console.log('[creditScoreCron] Registered — runs daily at 02:00 IST')
}

export { runCreditScoreBatch }  // export for manual trigger via admin endpoint