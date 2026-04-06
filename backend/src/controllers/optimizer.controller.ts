/**
 * controllers/optimizer.controller.ts
 *
 * Handles GET /api/optimizer/schedule
 *
 * Flow:
 *  1. Fetch all unpaid/partially_paid POs for this buyer from MongoDB
 *  2. Accept cash balance + daily inflow forecast from request body
 *  3. POST to Python service /optimize
 *  4. Return schedule to frontend
 *
 * The optimizer is read-only — it never writes to the database.
 */

import { Request, Response, NextFunction } from 'express'
import PurchaseOrder from '../models/PurchaseOrder'
import Company from '../models/Company'
import { runOptimizer, type Payable, type DailyInflow } from '../services/mlService'
import { AppError } from '../utils/errors'

export const getOptimizedSchedule = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { companyId } = req.user

    if (!companyId) {
      throw new AppError('No company linked to this account', 400, 'NO_COMPANY')
    }

    const {
      currentCash,
      dailyInflows = [],
    }: {
      currentCash: number
      dailyInflows: DailyInflow[]
    } = req.body

    if (typeof currentCash !== 'number' || currentCash < 0) {
      throw new AppError('currentCash must be a non-negative number (in paise)', 400, 'INVALID_INPUT')
    }

    // Fetch all active (unpaid / partially paid) POs where this company is the buyer
    const activePOs = await PurchaseOrder.find({
      buyerId: companyId,
      paymentStatus: { $in: ['unpaid', 'partially_paid'] },
      isDeleted: false,
    })
      .populate<{ supplierId: { name: string } }>('supplierId', 'name')
      .lean()

    const payables: Payable[] = activePOs.map((po) => ({
      purchaseOrderId: (po._id as any).toString(),
      supplierName: (po.supplierId as any)?.name ?? 'Unknown Supplier',
      amountRemaining: po.amountRemaining,
      deadline: po.paymentDeadline.toISOString().split('T')[0],
      penaltyRatePerDay: po.penaltyRate ?? 0.05,
    }))

    const result = await runOptimizer({ currentCash, dailyInflows, payables })

    res.json({
      success: true,
      data: result,
    })
  } catch (err) {
    next(err)
  }
}