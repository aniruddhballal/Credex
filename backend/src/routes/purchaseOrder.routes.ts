import { Router } from 'express'
import {
  createPurchaseOrder,
  getPurchaseOrderById,
  listPurchaseOrders,
  updateFulfilmentStatus,
  cancelPurchaseOrder,
} from '../controllers/purchaseOrder.controller'
import {
  recordPayment,
  getPaymentsForPO,
} from '../controllers/payment.controller'
import { authenticate } from '../middleware/auth'
import { sanitiseBody } from '../middleware/sanitise'

const router = Router()

router.use(authenticate)

router.get('/', listPurchaseOrders)
router.get('/:id', getPurchaseOrderById)
router.post('/', sanitiseBody, createPurchaseOrder)
router.patch('/:id/fulfilment', sanitiseBody, updateFulfilmentStatus)
router.post('/:id/cancel', sanitiseBody, cancelPurchaseOrder)

// Payment sub-routes
router.post('/:id/payments', sanitiseBody, recordPayment)
router.get('/:id/payments', getPaymentsForPO)

export default router