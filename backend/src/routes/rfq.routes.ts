import { Router } from 'express'
import {
  createRFQ,
  counterRFQ,
  acceptRFQ,
  declineRFQ,
  getRFQById,
  listRFQs,
} from '../controllers/rfq.controller'
import { authenticate } from '../middleware/auth'
import { sanitiseBody } from '../middleware/sanitise'

const router = Router()

router.use(authenticate)

router.get('/', listRFQs)
router.get('/:id', getRFQById)
router.post('/', sanitiseBody, createRFQ)
router.post('/:id/counter', sanitiseBody, counterRFQ)
router.post('/:id/accept', acceptRFQ)
router.post('/:id/decline', declineRFQ)

export default router