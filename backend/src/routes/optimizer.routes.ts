import { Router, Request, Response } from 'express'
import { Types } from 'mongoose'
import axios from 'axios'
import PurchaseOrder from '../models/PurchaseOrder'
import { authenticate, requireRole } from '../middleware/auth'
import { sendSuccess, sendError } from '../utils/response'
import { AuthRequest } from '../middleware/auth'

const router = Router()

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000'

// POST /api/optimizer/schedule
router.post(
  '/schedule',
  authenticate,
  requireRole('buyer', 'system_admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { currentCash, dailyInflows } = req.body
      const companyId = req.user!.companyId

      if (!companyId) {
        sendError(res, 'No company linked to account', 403)
        return
      }

      if (currentCash === undefined) {
        sendError(res, 'currentCash is required', 400)
        return
      }

      // Fetch all unpaid/partially_paid POs for this buyer
      const pos = await PurchaseOrder.find({
        buyerId: new Types.ObjectId(companyId),
        paymentStatus: { $in: ['unpaid', 'partially_paid'] },
        status: { $ne: 'cancelled' },
        isDeleted: false,
      }).populate('supplierId', 'name')

      const payables = pos.map((po) => ({
        purchaseOrderId: po._id.toString(),
        supplierName: (po.supplierId as unknown as { name: string }).name,
        amountRemaining: po.amountRemaining,
        deadline: po.paymentDeadline.toISOString(),
        penaltyRatePerDay: po.penaltyRate,
      }))

      // Call Python ML service
      const mlResponse = await axios.post(
        `${ML_SERVICE_URL}/optimize`,
        {
          currentCash,
          dailyInflows: dailyInflows || [],
          payables,
        },
        { timeout: 30000 }
      )

      sendSuccess(res, mlResponse.data)
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        console.error('[optimizer] ML service error:', err.message)
        sendError(res, 'Optimizer service unavailable. Please try again later.', 503)
      } else {
        console.error('[optimizer] Unexpected error:', err)
        sendError(res, 'Server error', 500)
      }
    }
  }
)

export default router